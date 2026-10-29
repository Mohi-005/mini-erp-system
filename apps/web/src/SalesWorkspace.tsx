import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type Tenant } from '@mini-erp/shared/auth';
import type {
  Customer,
  Database,
  InventoryBalance,
  Product,
  ProductUnit,
} from '@mini-erp/shared/database-types';
import {
  InventoryService,
  MasterDataService,
} from '@mini-erp/shared/master-data-service';
import {
  compareDecimalStrings,
  multiplyDecimalStrings,
  sumDecimalStrings,
  validateSalesLineDraft,
} from '@mini-erp/shared/sales';
import './sales.css';

type Locale = 'bn' | 'en';

type DraftLine = {
  product_id: string;
  quantity: string;
  unit_price: string;
};

type Props = {
  client: SupabaseClient<Database> | null;
  tenant: Tenant;
  locale: Locale;
  displayName: string;
  email: string;
  canSwitchBusiness: boolean;
  onLogout: () => void;
  onSwitchBusiness: () => void;
  onToggleLocale: () => void;
  onOpenDemo: () => void;
  onBackToMasterData: () => void;
};

function t(locale: Locale, bn: string, en: string): string {
  return locale === 'bn' ? bn : en;
}

function displayMoney(locale: Locale, value: string): string {
  return `${locale === 'bn' ? '৳' : 'BDT'} ${value}`;
}

function friendlyError(locale: Locale): string {
  return t(
    locale,
    'ডেটাবেস থেকে তথ্য আনা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করো।',
    'Could not load business data. Check the connection and retry.',
  );
}

export default function SalesWorkspace({
  client,
  tenant,
  locale,
  displayName,
  email,
  canSwitchBusiness,
  onLogout,
  onSwitchBusiness,
  onToggleLocale,
  onOpenDemo,
  onBackToMasterData,
}: Props) {
  const inventoryService = useMemo(
    () => (client ? new InventoryService(client, tenant) : null),
    [client, tenant],
  );
  const masterDataService = useMemo(
    () => (client ? new MasterDataService(client, tenant) : null),
    [client, tenant],
  );

  const canCreateSale = can(tenant.member, tenant.permissions, 'sales.create');
  const canViewProducts = can(
    tenant.member,
    tenant.permissions,
    'products.view',
  );
  const canViewInventory = can(
    tenant.member,
    tenant.permissions,
    'inventory.view',
  );
  const canViewCustomers = can(
    tenant.member,
    tenant.permissions,
    'customers.view',
  );
  const canChangePrices = can(
    tenant.member,
    tenant.permissions,
    'prices.change',
  );
  const hasDraftAccess = canCreateSale && canViewProducts && canViewInventory;

  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const requestNumber = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestNumber.current;
    setLoading(true);
    setError('');

    if (!hasDraftAccess || !inventoryService || !masterDataService) {
      setProducts([]);
      setBalances([]);
      setUnits([]);
      setCustomers([]);
      setError('permission');
      setLoading(false);
      return;
    }

    try {
      const [productRows, balanceRows, unitRows, customerRows] =
        await Promise.all([
          inventoryService.listProducts(),
          inventoryService.listBalances(),
          inventoryService.listUnits(),
          canViewCustomers
            ? masterDataService.listCustomers()
            : Promise.resolve([] as Customer[]),
        ]);

      if (requestId !== requestNumber.current) return;
      setProducts(
        productRows.filter((product) => product.archived_at === null),
      );
      setBalances(balanceRows);
      setUnits(unitRows);
      setCustomers(
        customerRows.filter((customer) => customer.archived_at === null),
      );
    } catch {
      if (requestId === requestNumber.current) setError('load');
    } finally {
      if (requestId === requestNumber.current) setLoading(false);
    }
  }, [hasDraftAccess, inventoryService, masterDataService, canViewCustomers]);

  useEffect(() => {
    let active = true;

    // Keep network-driven state changes outside the effect's synchronous body.
    // The cleanup prevents a queued load from starting after unmount and
    // invalidates any request that was already in flight.
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });

    return () => {
      active = false;
      requestNumber.current += 1;
    };
  }, [loadData]);

  const activeProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
    return products.filter((product) => {
      if (!query) return true;
      const unit = unitById.get(product.unit_id);
      return [
        product.name_bn,
        product.name_en,
        product.sku,
        unit?.name_bn,
      ].some((value) => (value ?? '').toLocaleLowerCase().includes(query));
    });
  }, [products, search, units]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product] as const)),
    [products],
  );
  const balanceByProduct = useMemo(
    () =>
      new Map(
        balances.map((balance) => [balance.product_id, balance] as const),
      ),
    [balances],
  );
  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units],
  );

  const selectedProduct = selectedProductId
    ? productById.get(selectedProductId)
    : undefined;
  const selectedBalance = selectedProductId
    ? balanceByProduct.get(selectedProductId)
    : undefined;

  const lineTotals = useMemo(
    () =>
      lines.map((line) =>
        multiplyDecimalStrings(line.quantity, line.unit_price),
      ),
    [lines],
  );
  const subtotal = useMemo(
    () =>
      lineTotals.some((total) => total === null)
        ? null
        : sumDecimalStrings(lineTotals as string[]),
    [lineTotals],
  );

  const linesValid =
    lines.length > 0 &&
    lines.every((line) => {
      const validated = validateSalesLineDraft(line);
      const balance = balanceByProduct.get(line.product_id);
      return (
        validated.valid &&
        Boolean(balance) &&
        [-1, 0].includes(
          compareDecimalStrings(
            line.quantity,
            String(balance?.quantity ?? '0'),
          ) ?? 1,
        )
      );
    });
  const canReview =
    hasDraftAccess && !loading && linesValid && subtotal !== null;

  function chooseProduct(productId: string) {
    setSelectedProductId(productId);
    const product = productById.get(productId);
    setUnitPrice(product ? String(product.default_selling_price) : '');
    setError('');
  }

  function addLine() {
    if (!selectedProduct) {
      setError(
        t(locale, 'প্রথমে একটি পণ্য নির্বাচন করো।', 'Select a product first.'),
      );
      return;
    }
    const validated = validateSalesLineDraft({
      product_id: selectedProduct.id,
      quantity,
      unit_price: unitPrice,
    });
    if (!validated.valid) {
      setError(
        t(
          locale,
          'পণ্যের পরিমাণ ও বিক্রয়মূল্য যাচাই করো। পরিমাণ শূন্যের বেশি হতে হবে।',
          'Check the quantity and selling price. Quantity must be greater than zero.',
        ),
      );
      return;
    }

    const balance = balanceByProduct.get(selectedProduct.id);
    if (!balance) {
      setError(
        t(
          locale,
          'এই পণ্যের স্টক রেকর্ড পাওয়া যায়নি।',
          'No stock record was found for this product.',
        ),
      );
      return;
    }

    const existing = lines.find(
      (line) => line.product_id === selectedProduct.id,
    );
    const combinedQuantity = existing
      ? sumDecimalStrings([existing.quantity, validated.value.quantity])
      : validated.value.quantity;
    if (
      !combinedQuantity ||
      compareDecimalStrings(combinedQuantity, String(balance.quantity)) === 1
    ) {
      setError(
        t(
          locale,
          'বর্তমান মজুতের চেয়ে বেশি পণ্য যোগ করা যাবে না।',
          'The draft quantity cannot exceed current stock.',
        ),
      );
      return;
    }

    if (existing) {
      setLines((current) =>
        current.map((line) =>
          line.product_id === existing.product_id
            ? {
                ...line,
                quantity: combinedQuantity,
                unit_price: validated.value.unit_price,
              }
            : line,
        ),
      );
    } else {
      setLines((current) => [...current, validated.value]);
    }
    setSelectedProductId('');
    setQuantity('1');
    setUnitPrice('');
    setSearch('');
    setError('');
  }

  function updateLine(
    productId: string,
    field: 'quantity' | 'unit_price',
    value: string,
  ) {
    setLines((current) =>
      current.map((line) =>
        line.product_id === productId ? { ...line, [field]: value } : line,
      ),
    );
    setError('');
  }

  function clearDraft() {
    setLines([]);
    setCustomerId('');
    setReviewing(false);
    setError('');
  }

  function startReview() {
    if (!canReview) {
      setError(
        t(
          locale,
          'পরিমাণ ও মজুত যাচাই করে তারপর রিভিউ করো।',
          'Check quantities and stock before review.',
        ),
      );
      return;
    }
    setError('');
    setReviewing(true);
  }

  return (
    <div className="app-layout md-layout sales-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">হ</span>
          <strong>Mini ERP</strong>
        </div>
        <div className="shop-identity">
          <strong>{tenant.business.name}</strong>
          <small>
            {t(locale, 'সংযুক্ত লাইভ ডেটাবেস', 'Connected live database')}
          </small>
          <small>BDT · Asia/Dhaka</small>
        </div>
        <p className="navlabel">{t(locale, 'বিক্রয়', 'SALES')}</p>
        <nav
          className="nav md-nav"
          aria-label={t(locale, 'বিক্রয় নেভিগেশন', 'Sales navigation')}
        >
          <button
            type="button"
            className="md-nav-button"
            aria-current={!reviewing ? 'page' : undefined}
            onClick={() => setReviewing(false)}
          >
            <span className="nav-icon" aria-hidden="true">
              🧾
            </span>
            {t(locale, 'বিক্রির খসড়া', 'Sale draft')}
          </button>
          <button
            type="button"
            className="md-nav-button"
            aria-current={reviewing ? 'page' : undefined}
            disabled={!canReview}
            onClick={startReview}
          >
            <span className="nav-icon" aria-hidden="true">
              ✓
            </span>
            {t(locale, 'রিভিউ', 'Review')}
          </button>
          <button
            type="button"
            className="md-nav-button"
            onClick={onBackToMasterData}
          >
            <span className="nav-icon" aria-hidden="true">
              ←
            </span>
            {t(locale, 'মাস্টার ডেটা', 'Master data')}
          </button>
        </nav>
        <footer className="md-sidebar-footer">
          <span className="avatar" aria-hidden="true">
            {(displayName || email || tenant.business.name).slice(0, 1)}
          </span>
          <div className="md-user">
            <strong>{displayName || email || tenant.business.name}</strong>
            <small>
              {tenant.member.role === 'OWNER'
                ? t(locale, 'মালিক', 'OWNER')
                : t(locale, 'স্টাফ', 'STAFF')}
            </small>
            <button
              className="button md-small-button"
              type="button"
              onClick={onLogout}
            >
              {t(locale, 'লগ আউট', 'Log out')}
            </button>
          </div>
        </footer>
      </aside>

      <div className="workspace">
        <header className="topbar md-topbar">
          <div className="crumb">
            <small>{tenant.business.name}</small>
            <h1>
              {t(
                locale,
                reviewing ? 'বিক্রির রিভিউ' : 'নতুন বিক্রি',
                reviewing ? 'Review sale' : 'New sale',
              )}
            </h1>
          </div>
          <div className="md-top-actions">
            <button
              type="button"
              className="button"
              onClick={() => void loadData()}
              disabled={loading}
            >
              {t(locale, 'রিফ্রেশ', 'Refresh')}
            </button>
            <button type="button" className="button" onClick={onToggleLocale}>
              {locale === 'bn' ? 'English' : 'বাংলা'}
            </button>
            <button type="button" className="button" onClick={onOpenDemo}>
              {t(locale, 'ডেমো প্রিভিউ', 'Demo preview')}
            </button>
            {canSwitchBusiness && (
              <button
                type="button"
                className="button"
                onClick={onSwitchBusiness}
              >
                {t(locale, 'ব্যবসা বদলাও', 'Switch business')}
              </button>
            )}
          </div>
        </header>

        <main className="md-content sales-content">
          <section className="md-intro">
            <h2>
              {t(locale, 'বিক্রির খসড়া তৈরি করো', 'Prepare a sale draft')}
            </h2>
            <p>
              {t(
                locale,
                'পণ্য নির্বাচন করে পরিমাণ যোগ করো। বর্তমান মজুতের সঙ্গে খসড়াটি যাচাই করা হবে।',
                'Choose products and quantities. The draft is checked against current stock.',
              )}
            </p>
            <p className="md-muted">
              {t(
                locale,
                'গুরুত্বপূর্ণ: এটি এখন শুধু খসড়া ও রিভিউ। এখনো বিক্রি সংরক্ষণ, টাকা/বাকি পোস্টিং বা স্টক কমানো হবে না।',
                'Important: this is draft and review only. It does not save a sale, post payment/due, or reduce stock.',
              )}
            </p>
          </section>

          {error && (
            <div className="md-alert" role="alert">
              {error === 'permission'
                ? t(
                    locale,
                    'বিক্রির খসড়ার জন্য sales.create, products.view এবং inventory.view অনুমতি প্রয়োজন।',
                    'Draft access requires sales.create, products.view and inventory.view.',
                  )
                : error === 'load'
                  ? friendlyError(locale)
                  : error}
            </div>
          )}

          {loading ? (
            <section className="panel sales-panel">
              <p role="status">
                {t(locale, 'তথ্য লোড হচ্ছে…', 'Loading business data…')}
              </p>
            </section>
          ) : !hasDraftAccess ? (
            <section className="panel sales-panel">
              <h2>{t(locale, 'অনুমতি প্রয়োজন', 'Permission required')}</h2>
              <p>
                {t(
                  locale,
                  'এই পাতার জন্য প্রয়োজনীয় অনুমতি নেই। ব্যবসার মালিকের সঙ্গে যোগাযোগ করো।',
                  'You do not have the required permission for this page. Contact the business owner.',
                )}
              </p>
            </section>
          ) : error === 'load' ? (
            <section className="panel sales-panel">
              <button
                type="button"
                className="button"
                onClick={() => void loadData()}
              >
                {t(locale, 'আবার চেষ্টা করো', 'Retry')}
              </button>
            </section>
          ) : (
            <div className="sales-grid">
              {!reviewing && (
                <section className="panel sales-panel">
                  <div className="sales-panel-heading">
                    <div>
                      <h2>{t(locale, 'পণ্য যোগ করো', 'Add products')}</h2>
                      <p>
                        {t(
                          locale,
                          'পণ্যের নাম, SKU অথবা ইউনিট দিয়ে খুঁজো।',
                          'Search by product name, SKU or unit.',
                        )}
                      </p>
                    </div>
                    <span className="sales-count">{activeProducts.length}</span>
                  </div>
                  <label className="md-field">
                    <span>{t(locale, 'পণ্য খুঁজো', 'Search products')}</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t(
                        locale,
                        'পণ্যের নাম বা SKU',
                        'Product name or SKU',
                      )}
                    />
                  </label>
                  <div className="sales-form-grid">
                    <label className="md-field sales-wide">
                      <span>
                        {t(locale, 'পণ্য নির্বাচন', 'Select product')}
                      </span>
                      <select
                        value={selectedProductId}
                        onChange={(event) => chooseProduct(event.target.value)}
                      >
                        <option value="">
                          {t(locale, 'পণ্য বেছে নাও', 'Choose product')}
                        </option>
                        {activeProducts.map((product) => {
                          const balance = balanceByProduct.get(product.id);
                          const unit = unitById.get(product.unit_id);
                          return (
                            <option key={product.id} value={product.id}>
                              {product.name_bn}
                              {product.sku ? ` · ${product.sku}` : ''} ·{' '}
                              {t(locale, 'মজুত', 'Stock')}:{' '}
                              {balance ? String(balance.quantity) : '—'}{' '}
                              {unit?.name_bn ?? ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {selectedProduct && (
                      <div className="sales-selected-product">
                        <strong>{selectedProduct.name_bn}</strong>
                        <span>
                          {unitById.get(selectedProduct.unit_id)?.name_bn ??
                            '—'}{' '}
                          · {t(locale, 'বর্তমান মজুত', 'On hand')}:{' '}
                          {selectedBalance
                            ? String(selectedBalance.quantity)
                            : '—'}
                        </span>
                      </div>
                    )}
                    <label className="md-field">
                      <span>{t(locale, 'পরিমাণ', 'Quantity')}</span>
                      <input
                        inputMode="decimal"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder="1"
                      />
                    </label>
                    <label className="md-field">
                      <span>
                        {t(
                          locale,
                          'একক বিক্রয়মূল্য (BDT)',
                          'Unit selling price (BDT)',
                        )}
                      </span>
                      <input
                        inputMode="decimal"
                        value={unitPrice}
                        onChange={(event) => setUnitPrice(event.target.value)}
                        readOnly={!canChangePrices}
                        aria-describedby="sales-price-note"
                      />
                      <small id="sales-price-note">
                        {canChangePrices
                          ? t(
                              locale,
                              'এই অনুমতিতে খসড়ার মূল্য পরিবর্তন করা যায়।',
                              'Your permission allows editing the draft price.',
                            )
                          : t(
                              locale,
                              'পণ্যের ডিফল্ট বিক্রয়মূল্য ব্যবহার হবে।',
                              'Uses the product default selling price.',
                            )}
                      </small>
                    </label>
                  </div>
                  <div className="sales-actions">
                    <button
                      type="button"
                      className="button auth-primary"
                      onClick={addLine}
                      disabled={!selectedProduct || !selectedBalance}
                    >
                      {t(locale, 'তালিকায় যোগ করো', 'Add to list')}
                    </button>
                  </div>
                  {!products.length && (
                    <p className="sales-muted">
                      {t(
                        locale,
                        'কোনো সক্রিয় পণ্য পাওয়া যায়নি। আগে পণ্য তৈরি করো এবং স্টক রেকর্ড নিশ্চিত করো।',
                        'No active products found. Create products and verify their stock records first.',
                      )}
                    </p>
                  )}
                </section>
              )}

              <section className="panel sales-panel">
                <div className="sales-panel-heading">
                  <div>
                    <h2>
                      {t(
                        locale,
                        reviewing ? 'রিভিউ তালিকা' : 'বিক্রির তালিকা',
                        reviewing ? 'Review lines' : 'Sale lines',
                      )}
                    </h2>
                    <p>
                      {t(
                        locale,
                        'এই তালিকাটি ব্রাউজারের খসড়া; এখনো ডেটাবেসে সংরক্ষিত নয়।',
                        'These lines are a browser draft and are not stored in the database.',
                      )}
                    </p>
                  </div>
                  <span className="sales-count">{lines.length}</span>
                </div>
                {!reviewing && canViewCustomers && (
                  <label className="md-field">
                    <span>
                      {t(locale, 'কাস্টমার (ঐচ্ছিক)', 'Customer (optional)')}
                    </span>
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="">
                        {t(
                          locale,
                          'নির্বাচিত নয় / Walk-in',
                          'Not selected / Walk-in',
                        )}
                      </option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                          {customer.phone ? ` · ${customer.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!lines.length ? (
                  <div className="sales-empty">
                    <strong>
                      {t(
                        locale,
                        'এখনো পণ্য যোগ করা হয়নি',
                        'No products added yet',
                      )}
                    </strong>
                    <p>
                      {t(
                        locale,
                        'বাম পাশের ফর্ম থেকে পণ্য যোগ করো।',
                        'Add a product using the form above.',
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="sales-table-wrap">
                    <table className="sales-table">
                      <thead>
                        <tr>
                          <th>{t(locale, 'পণ্য', 'Product')}</th>
                          <th>{t(locale, 'পরিমাণ', 'Qty')}</th>
                          <th>{t(locale, 'একক মূল্য', 'Unit price')}</th>
                          <th>
                            {t(
                              locale,
                              'মোট (প্রাথমিক)',
                              'Line total (preview)',
                            )}
                          </th>
                          {!reviewing && <th>{t(locale, 'কাজ', 'Action')}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const product = productById.get(line.product_id);
                          const balance = balanceByProduct.get(line.product_id);
                          const total = lineTotals[index];
                          const validated = validateSalesLineDraft(line);
                          const stockExceeded =
                            compareDecimalStrings(
                              line.quantity,
                              String(balance?.quantity ?? '0'),
                            ) === 1;
                          return (
                            <tr key={line.product_id}>
                              <td>
                                <strong>
                                  {product?.name_bn ?? line.product_id}
                                </strong>
                                <small>
                                  {unitById.get(product?.unit_id ?? '')
                                    ?.name_bn ?? ''}
                                </small>
                              </td>
                              <td>
                                {reviewing ? (
                                  line.quantity
                                ) : (
                                  <input
                                    aria-label={t(locale, 'পরিমাণ', 'Quantity')}
                                    inputMode="decimal"
                                    value={line.quantity}
                                    onChange={(event) =>
                                      updateLine(
                                        line.product_id,
                                        'quantity',
                                        event.target.value,
                                      )
                                    }
                                  />
                                )}
                                {stockExceeded && (
                                  <small className="sales-error-text">
                                    {t(locale, 'মজুতের বেশি', 'Exceeds stock')}
                                  </small>
                                )}
                                {!validated.valid && (
                                  <small className="sales-error-text">
                                    {t(
                                      locale,
                                      'ইনপুট যাচাই প্রয়োজন',
                                      'Validation required',
                                    )}
                                  </small>
                                )}
                              </td>
                              <td>
                                {reviewing ? (
                                  line.unit_price
                                ) : (
                                  <input
                                    aria-label={t(
                                      locale,
                                      'একক বিক্রয়মূল্য',
                                      'Unit price',
                                    )}
                                    inputMode="decimal"
                                    value={line.unit_price}
                                    readOnly={!canChangePrices}
                                    onChange={(event) =>
                                      updateLine(
                                        line.product_id,
                                        'unit_price',
                                        event.target.value,
                                      )
                                    }
                                  />
                                )}
                              </td>
                              <td>
                                {total === null
                                  ? '—'
                                  : displayMoney(locale, total)}
                              </td>
                              {!reviewing && (
                                <td>
                                  <button
                                    type="button"
                                    className="button md-small-button"
                                    onClick={() =>
                                      setLines((current) =>
                                        current.filter(
                                          (row) =>
                                            row.product_id !== line.product_id,
                                        ),
                                      )
                                    }
                                  >
                                    {t(locale, 'বাদ দাও', 'Remove')}
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="sales-subtotal">
                  <span>
                    {t(
                      locale,
                      'সর্বমোট (রাউন্ডিংয়ের আগে)',
                      'Subtotal (before final rounding)',
                    )}
                  </span>
                  <strong>
                    {subtotal === null ? '—' : displayMoney(locale, subtotal)}
                  </strong>
                </div>
                <p className="sales-muted">
                  {t(
                    locale,
                    'এটি কেবল প্রাথমিক হিসাব। চূড়ান্ত টাকা, ছাড়, পরিশোধ/বাকি, invoice এবং stock posting সার্ভারের Sales Engine চালু হলে নির্ধারিত নিয়মে হিসাব হবে।',
                    'This is only a preliminary calculation. Final money rounding, discounts, payment/due, invoice and stock posting will be handled by the server Sales Engine after its policies are finalized.',
                  )}
                </p>
                <div className="sales-actions">
                  {reviewing ? (
                    <button
                      type="button"
                      className="button"
                      onClick={() => setReviewing(false)}
                    >
                      {t(locale, 'এডিটে ফিরে যাও', 'Back to edit')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button auth-primary"
                      onClick={startReview}
                      disabled={!canReview}
                    >
                      {t(locale, 'বিক্রি রিভিউ করো', 'Review sale')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button"
                    onClick={clearDraft}
                    disabled={!lines.length}
                  >
                    {t(locale, 'খসড়া মুছে ফেলো', 'Clear draft')}
                  </button>
                </div>
                {reviewing && (
                  <div className="sales-notice" role="status">
                    <strong>
                      {t(
                        locale,
                        'এখনো Save / Confirm চালু হয়নি',
                        'Save / Confirm is not enabled yet',
                      )}
                    </strong>
                    <p>
                      {t(
                        locale,
                        'এই ধাপে কোনো বিক্রির রেকর্ড, পেমেন্ট, বকেয়া বা স্টক পরিবর্তন করা হয়নি। পরবর্তী ধাপে database transaction ও security tests যোগ করার পরই সংরক্ষণ চালু হবে।',
                        'No sale, payment, due or stock record was changed in this step. Saving will be enabled only after the database transaction and security tests are implemented.',
                      )}
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
