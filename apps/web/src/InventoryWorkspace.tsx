import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type Tenant } from '@mini-erp/shared/auth';
import type {
  Database,
  InventoryBalance,
  InventoryMovement,
  Product,
  ProductUnit,
} from '@mini-erp/shared/database-types';
import {
  InventoryService,
  InventoryServiceError,
} from '@mini-erp/shared/master-data-service';
import './inventory.css';

type Locale = 'bn' | 'en';
type EntryMode = 'opening' | 'adjustment';
type InventoryDirection = 'IN' | 'OUT';

type PendingStockOperation = {
  operationId: string;
  mode: EntryMode;
  productId: string;
  quantity: string;
  direction: InventoryDirection;
  reason: string;
  note: string;
};

function readPendingOperation(key: string): PendingStockOperation | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<PendingStockOperation>;
    if (
      typeof record.operationId !== 'string' ||
      typeof record.productId !== 'string' ||
      typeof record.quantity !== 'string' ||
      (record.mode !== 'opening' && record.mode !== 'adjustment') ||
      (record.direction !== 'IN' && record.direction !== 'OUT') ||
      typeof record.reason !== 'string' ||
      typeof record.note !== 'string'
    )
      return null;
    return record as PendingStockOperation;
  } catch {
    return null;
  }
}

function writePendingOperation(
  key: string,
  value: PendingStockOperation | null,
): boolean {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value));
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

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

function errorText(error: unknown, locale: Locale): string {
  if (error === 'pending_operation_storage_failed')
    return t(
      locale,
      'ব্রাউজারে অনুরোধের নিরাপদ পরিচয় সংরক্ষণ করা যায়নি। তাই স্টক পরিবর্তন পাঠানো হয়নি। ব্রাউজারের storage অনুমতি পরীক্ষা করো।',
      'The request retry key could not be persisted in this browser, so no stock change was sent. Check browser storage permissions.',
    );
  if (error === 'inventory_balance_missing')
    return t(
      locale,
      'এই পণ্যের স্টক ব্যালেন্স রেকর্ড নেই। আগে ডেটাবেসের এই অসংগতি ঠিক করতে হবে; এখন স্টক পরিবর্তন করা হয়নি।',
      'This product has no inventory balance record. Repair the database inconsistency before changing stock; no change was sent.',
    );
  if (error instanceof InventoryServiceError) {
    switch (error.code) {
      case 'permission_denied':
        return t(
          locale,
          'এই কাজের জন্য তোমার অনুমতি নেই।',
          'Your account is not allowed to do this.',
        );
      case 'validation_failed':
        return t(
          locale,
          'ইনপুট যাচাই করো। পরিমাণ ও কারণ আবার দেখো।',
          'Please check the quantity and reason.',
        );
      case 'not_found':
        return t(
          locale,
          'পণ্যটি পাওয়া যায়নি। তালিকা রিফ্রেশ করো।',
          'The product was not found. Refresh the list.',
        );
      case 'opening_stock_exists':
        return t(
          locale,
          'এই পণ্যের শুরুর মজুত আগেই নথিভুক্ত হয়েছে।',
          'Opening stock has already been recorded for this product.',
        );
      case 'opening_stock_not_first':
        return t(
          locale,
          'এই পণ্যে আগে স্টকের পরিবর্তন হয়েছে। শুরুর মজুত হিসেবে আর লেখা যাবে না।',
          'This product already has stock history; opening stock cannot be added now.',
        );
      case 'insufficient_stock':
        return t(
          locale,
          'এত পরিমাণ স্টক কমানো যাবে না—বর্তমান মজুত যথেষ্ট নয়।',
          'Stock-out exceeds the current available quantity.',
        );
      case 'operation_id_conflict':
        return t(
          locale,
          'আগের অনুরোধের ফল নিশ্চিত নয়। একই অনুরোধের ফল যাচাই করো; নতুন অনুরোধ তৈরি কোরো না।',
          'The operation key was used for a different request. Verify the previous result; do not create a new request.',
        );
      case 'product_archived':
        return t(
          locale,
          'আর্কাইভ করা পণ্যের স্টক পরিবর্তন করা যাবে না।',
          'Archived products cannot be adjusted.',
        );
      case 'invalid_context':
        return t(
          locale,
          'ব্যবসার তথ্য মেলেনি। আবার লগইন করে দেখো।',
          'The active business context is invalid. Sign in again.',
        );
      default:
        return t(
          locale,
          'ডেটাবেসে কাজটি সম্পন্ন হয়নি। রিফ্রেশ করে আবার চেষ্টা করো।',
          'The database operation failed. Refresh and try again.',
        );
    }
  }
  return t(
    locale,
    'কাজটি সম্পন্ন হয়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করো।',
    'The operation did not complete. Check your connection and retry.',
  );
}

function movementLabel(
  type: InventoryMovement['movement_type'],
  locale: Locale,
) {
  const labels: Record<InventoryMovement['movement_type'], [string, string]> = {
    opening: ['শুরুর মজুত', 'Opening stock'],
    adjustment_in: ['স্টক যোগ', 'Stock adjustment in'],
    adjustment_out: ['স্টক কমানো', 'Stock adjustment out'],
    purchase: ['কেনাকাটা', 'Purchase'],
    sale: ['বিক্রি', 'Sale'],
    purchase_return: ['কেনাকাটা ফেরত', 'Purchase return'],
    sale_return: ['বিক্রি ফেরত', 'Sale return'],
    reversal: ['সংশোধনী', 'Reversal'],
  };
  return labels[type][locale === 'bn' ? 0 : 1];
}

function quantityText(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    maximumFractionDigits: 12,
  }).format(value);
}

function dateText(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

export default function InventoryWorkspace({
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
  const service = useMemo(
    () => (client ? new InventoryService(client, tenant) : null),
    [client, tenant],
  );
  const canViewInventory = can(
    tenant.member,
    tenant.permissions,
    'inventory.view',
  );
  const canAdjustInventory = can(
    tenant.member,
    tenant.permissions,
    'inventory.adjust',
  );
  const canViewProducts = can(
    tenant.member,
    tenant.permissions,
    'products.view',
  );

  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const pendingStorageKey = `mini-erp:inventory-pending:${tenant.business.id}:${tenant.member.user_id}`;
  const [pendingOperation, setPendingOperation] =
    useState<PendingStockOperation | null>(() =>
      readPendingOperation(pendingStorageKey),
    );
  const [mode, setMode] = useState<EntryMode>(
    () => pendingOperation?.mode ?? 'adjustment',
  );
  const [productId, setProductId] = useState(
    () => pendingOperation?.productId ?? '',
  );
  const [quantity, setQuantity] = useState(
    () => pendingOperation?.quantity ?? '',
  );
  const [direction, setDirection] = useState<InventoryDirection>(
    () => pendingOperation?.direction ?? 'IN',
  );
  const [reason, setReason] = useState(() => pendingOperation?.reason ?? '');
  const [note, setNote] = useState(() => pendingOperation?.note ?? '');
  const loadingKey = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++loadingKey.current;
    setLoading(true);
    setError(null);

    if (!service || !canViewInventory) {
      if (requestId === loadingKey.current) setLoading(false);
      return;
    }
    try {
      // Inventory permissions govern quantities/history independently from the
      // product catalog. Without products.view, show product IDs only.
      const [balanceRows, movementRows] = await Promise.all([
        service.listBalances(),
        service.listMovements(200),
      ]);
      let productRows: Product[] = [];
      let unitRows: ProductUnit[] = [];
      if (canViewProducts) {
        [productRows, unitRows] = await Promise.all([
          service.listProducts(),
          service.listUnits(),
        ]);
      }
      if (requestId !== loadingKey.current) return;
      setBalances(balanceRows);
      setProducts(productRows);
      setUnits(unitRows);
      setMovements(movementRows);
    } catch (caught: unknown) {
      if (requestId === loadingKey.current) setError(caught);
    } finally {
      if (requestId === loadingKey.current) setLoading(false);
    }
  }, [service, canViewInventory, canViewProducts]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
      loadingKey.current += 1;
    };
  }, [loadData]);

  const balanceByProduct = useMemo(
    () =>
      new Map(
        balances.map((balance) => [balance.product_id, balance] as const),
      ),
    [balances],
  );
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product] as const)),
    [products],
  );
  const unitById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit] as const)),
    [units],
  );

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
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
  }, [products, search, unitById]);

  const visibleBalances = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return balances.filter(
      (balance) =>
        !query || balance.product_id.toLocaleLowerCase().includes(query),
    );
  }, [balances, search]);

  const openingCandidates = useMemo(
    () =>
      visibleProducts.filter((product) => {
        const balance = balanceByProduct.get(product.id);
        return (
          product.archived_at === null &&
          balance?.first_movement_at === null &&
          balance?.quantity === 0
        );
      }),
    [visibleProducts, balanceByProduct],
  );

  const missingBalanceProducts = products.filter(
    (product) => !balanceByProduct.has(product.id),
  );
  const submittedWithUncertainResult = Boolean(pendingOperation);
  const selectedProduct = productById.get(productId);

  function selectMode(next: EntryMode) {
    if (pendingOperation) return;
    setMode(next);
    setProductId('');
    setQuantity('');
    setReason('');
    setNote('');
    setError(null);
    setSuccess('');
  }

  function clearOperation() {
    writePendingOperation(pendingStorageKey, null);
    setPendingOperation(null);
  }

  function handleOperationError(caught: unknown) {
    // Explicit business-rule/validation failures are known to have rolled back.
    // Network/unknown failures and key conflicts keep the exact request for safe retry.
    if (
      caught instanceof InventoryServiceError &&
      caught.code !== 'database_error' &&
      caught.code !== 'operation_id_conflict'
    ) {
      clearOperation();
    }
    setError(caught);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !canAdjustInventory || saving || pendingOperation) return;
    if (!productId) {
      setError(t(locale, 'একটি পণ্য নির্বাচন করো।', 'Select a product.'));
      return;
    }
    if (!balanceByProduct.has(productId)) {
      setError('inventory_balance_missing');
      return;
    }

    const operation: PendingStockOperation = {
      operationId: crypto.randomUUID(),
      mode,
      productId,
      quantity,
      direction,
      reason,
      note,
    };
    // Persist the request identity and exact payload before making a write.
    // If local persistence is unavailable, fail closed instead of posting a
    // transaction whose retry identity would be lost after a reload.
    if (!writePendingOperation(pendingStorageKey, operation)) {
      setError('pending_operation_storage_failed');
      return;
    }
    setPendingOperation(operation);
    setSaving(true);
    setError(null);
    setSuccess('');

    try {
      if (operation.mode === 'opening') {
        await service.recordOpeningStock({
          product_id: operation.productId,
          quantity: operation.quantity,
          note: operation.note,
          operation_id: operation.operationId,
        });
      } else {
        await service.adjustStock({
          product_id: operation.productId,
          direction: operation.direction,
          quantity: operation.quantity,
          reason: operation.reason,
          operation_id: operation.operationId,
        });
      }
      setSuccess(
        t(
          locale,
          'স্টকের রেকর্ড সংরক্ষণ হয়েছে।',
          'The stock record was saved.',
        ),
      );
      clearOperation();
      setQuantity('');
      setReason('');
      setNote('');
      setProductId('');
      await loadData();
    } catch (caught: unknown) {
      handleOperationError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function verifyOrRetry() {
    if (!pendingOperation || !service || saving) return;
    const operation = pendingOperation;
    setSaving(true);
    setError(null);
    try {
      // The database RPC has durable idempotency. Sending the exact same
      // operation again either returns the original movement or safely creates it.
      if (operation.mode === 'opening') {
        await service.recordOpeningStock({
          product_id: operation.productId,
          quantity: operation.quantity,
          note: operation.note,
          operation_id: operation.operationId,
        });
      } else {
        await service.adjustStock({
          product_id: operation.productId,
          direction: operation.direction,
          quantity: operation.quantity,
          reason: operation.reason,
          operation_id: operation.operationId,
        });
      }
      setSuccess(
        t(
          locale,
          'স্টকের রেকর্ড সংরক্ষণ হয়েছে।',
          'The stock record was saved.',
        ),
      );
      clearOperation();
      setQuantity('');
      setReason('');
      setNote('');
      setProductId('');
      await loadData();
    } catch (caught: unknown) {
      // Keep an uncertain operation if a permission was revoked while the
      // earlier request may already have committed. The Owner can restore the
      // grant, after which the exact same idempotency key can be checked again.
      if (
        caught instanceof InventoryServiceError &&
        caught.code === 'permission_denied'
      ) {
        setError(caught);
      } else {
        handleOperationError(caught);
      }
    } finally {
      setSaving(false);
    }
  }

  const getProductName = (id: string) => {
    const product = productById.get(id);
    return product?.name_bn ?? id;
  };

  const adjustmentDisabled =
    !canAdjustInventory || loading || saving || submittedWithUncertainResult;

  return (
    <div className="app-layout inv-layout">
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
        <p className="navlabel">{t(locale, 'মজুত', 'INVENTORY')}</p>
        <nav
          className="nav inv-nav"
          aria-label={t(locale, 'মজুত নেভিগেশন', 'Inventory navigation')}
        >
          <button type="button" className="inv-nav-active" aria-current="page">
            <span className="nav-icon" aria-hidden="true">
              ▦
            </span>
            {t(locale, 'স্টক ও ইতিহাস', 'Stock & history')}
          </button>
          <button type="button" onClick={onBackToMasterData}>
            <span className="nav-icon" aria-hidden="true">
              ▣
            </span>
            {t(locale, 'মাস্টার ডেটা', 'Master data')}
          </button>
        </nav>
        <footer className="inv-sidebar-footer">
          <span className="avatar" aria-hidden="true">
            {(displayName || email || tenant.business.name).slice(0, 1)}
          </span>
          <div className="inv-user">
            <strong>{displayName || email || tenant.business.name}</strong>
            <small>
              {tenant.member.role === 'OWNER'
                ? t(locale, 'মালিক', 'Owner')
                : 'Staff'}
            </small>
            <button
              className="button inv-small-button"
              type="button"
              onClick={onLogout}
            >
              {t(locale, 'লগ আউট', 'Log out')}
            </button>
          </div>
        </footer>
      </aside>

      <div className="workspace">
        <header className="topbar inv-topbar">
          <div className="crumb">
            <small>{tenant.business.name}</small>
            <h1>
              {t(locale, 'স্টক ও মজুতের ইতিহাস', 'Stock & movement history')}
            </h1>
          </div>
          <div className="inv-top-actions">
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
            <button
              type="button"
              className="button"
              onClick={onBackToMasterData}
              disabled={Boolean(pendingOperation)}
            >
              {t(locale, 'ফিরে যাও', 'Back')}
            </button>
          </div>
        </header>

        <main className="inv-content">
          <section className="inv-intro">
            <h2>{tenant.business.name}</h2>
            <p>
              {t(
                locale,
                'প্রতিটি স্টক পরিবর্তন তারিখ, কারণ ও আগের পরের পরিমাণসহ লেজারে সংরক্ষিত হয়। সরাসরি ব্যালেন্স লিখে পরিবর্তন করা হয় না।',
                'Every stock change is stored with its date, reason and resulting balance. Balances are not directly overwritten by the client.',
              )}
            </p>
            <p className="inv-muted">
              {t(
                locale,
                'এই ধাপে শুধু শুরুর মজুত ও কারণসহ স্টক সমন্বয় আছে। কেনাকাটা/বিক্রি, স্টকের মূল্য ও লাভ-লোকসানের হিসাব পরবর্তী ধাপে যুক্ত হবে।',
                'This stage supports opening stock and reasoned adjustments only. Purchase/sales posting, stock valuation and profit accounting come in later phases.',
              )}
            </p>
          </section>

          {error !== null && (
            <div className="inv-alert" role="alert">
              {errorText(error, locale)}
            </div>
          )}
          {canViewInventory && !canViewProducts && (
            <div className="inv-alert" role="status">
              {t(
                locale,
                'পণ্যের নাম, SKU ও একক গোপন থাকবে; স্টক ও ইতিহাস পণ্যের ID দিয়ে দেখানো হচ্ছে। নামসহ কাজ করতে মালিকের কাছে products.view অনুমতি চাও।',
                'Product names, SKUs and units are hidden; stock and history are shown by product ID. Ask the business Owner for products.view to use product labels and the product-selection form.',
              )}
            </div>
          )}
          {pendingOperation && error === null && (
            <div className="inv-alert" role="status">
              {t(
                locale,
                'আগের একটি স্টক অনুরোধ অসম্পূর্ণ অবস্থায় পাওয়া গেছে। একই operation ID ও একই তথ্য দিয়ে ফল যাচাই/পুনরায় চেষ্টা করো।',
                'A pending stock request from a previous session was recovered. Use the same operation ID and exact payload to verify/retry it.',
              )}
            </div>
          )}
          {success && (
            <div className="inv-success" role="status">
              {success}
            </div>
          )}
          {missingBalanceProducts.length > 0 && !loading && (
            <div className="inv-alert" role="alert">
              {t(
                locale,
                'ডেটা সামঞ্জস্যের সমস্যা: কিছু পণ্যের stock balance তৈরি হয়নি। ওই পণ্যে স্টক পরিবর্তন কোরো না; সমস্যাটি ঠিক করতে হবে।',
                'Data consistency issue: one or more products have no balance row. Do not change their stock until this is repaired.',
              )}
            </div>
          )}

          {!canViewInventory ? (
            <section className="panel">
              <h2>{t(locale, 'অনুমতি প্রয়োজন', 'Access required')}</h2>
              <p>
                {t(
                  locale,
                  'এই পেজ দেখতে inventory.view permission প্রয়োজন।',
                  'The inventory.view permission is required to open this page.',
                )}
              </p>
            </section>
          ) : (
            <>
              <section className="panel inv-panel">
                <div className="inv-panel-heading">
                  <div>
                    <h2>{t(locale, 'বর্তমান মজুত', 'Current stock')}</h2>
                    <p className="inv-muted">
                      {t(
                        locale,
                        'প্রতিটি পণ্যের পরিমাণ আলাদা এককে দেখানো হয়; কেজি, পিস ও লিটারের পরিমাণ একসঙ্গে যোগ করা হয় না।',
                        'Each product quantity is shown in its own unit. Kilograms, pieces and litres are never summed together.',
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void loadData()}
                    disabled={loading || saving}
                  >
                    {t(locale, 'রিফ্রেশ', 'Refresh')}
                  </button>
                </div>
                <label className="inv-search">
                  <span>{t(locale, 'পণ্য খুঁজুন', 'Find a product')}</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={
                      canViewProducts
                        ? t(locale, 'পণ্যের নাম বা SKU', 'Product name or SKU')
                        : t(locale, 'পণ্যের ID', 'Product ID')
                    }
                  />
                </label>
                {loading ? (
                  <p className="inv-empty" role="status">
                    {t(locale, 'ডেটা লোড হচ্ছে…', 'Loading inventory…')}
                  </p>
                ) : (
                  <div className="inv-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t(locale, 'পণ্য', 'Product')}</th>
                          <th>{t(locale, 'বর্তমান মজুত', 'On hand')}</th>
                          <th>{t(locale, 'ন্যূনতম স্টক', 'Minimum')}</th>
                          <th>{t(locale, 'অবস্থা', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {canViewProducts
                          ? visibleProducts.map((product) => {
                              const balance = balanceByProduct.get(product.id);
                              const unit = unitById.get(product.unit_id);
                              const low =
                                balance &&
                                product.minimum_stock !== null &&
                                balance.quantity < product.minimum_stock;
                              return (
                                <tr key={product.id}>
                                  <td>
                                    <strong>{product.name_bn}</strong>
                                    {product.name_en && (
                                      <small>{product.name_en}</small>
                                    )}
                                    {product.sku && (
                                      <small>SKU: {product.sku}</small>
                                    )}
                                  </td>
                                  <td>
                                    {balance
                                      ? `${quantityText(balance.quantity, locale)} ${unit?.name_bn ?? ''}`
                                      : '—'}
                                  </td>
                                  <td>
                                    {product.minimum_stock === null
                                      ? '—'
                                      : `${quantityText(product.minimum_stock, locale)} ${unit?.name_bn ?? ''}`}
                                  </td>
                                  <td>
                                    {!balance ? (
                                      t(locale, 'সমস্যা', 'Missing balance')
                                    ) : product.archived_at ? (
                                      t(locale, 'আর্কাইভড', 'Archived')
                                    ) : low ? (
                                      <span className="inv-low-stock">
                                        {t(locale, 'স্টক কম', 'Low stock')}
                                      </span>
                                    ) : (
                                      t(locale, 'সক্রিয়', 'Active')
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          : visibleBalances.map((balance) => (
                              <tr key={balance.product_id}>
                                <td>
                                  <strong>{balance.product_id}</strong>
                                </td>
                                <td>
                                  {quantityText(balance.quantity, locale)}
                                </td>
                                <td>—</td>
                                <td>
                                  {t(
                                    locale,
                                    'পণ্যের বিস্তারিত সীমিত',
                                    'Product details restricted',
                                  )}
                                </td>
                              </tr>
                            ))}
                        {canViewProducts && !visibleProducts.length && (
                          <tr>
                            <td colSpan={4}>
                              <p className="inv-empty">
                                {t(
                                  locale,
                                  'কোনো পণ্য পাওয়া যায়নি।',
                                  'No products found.',
                                )}
                              </p>
                            </td>
                          </tr>
                        )}
                        {!canViewProducts && !visibleBalances.length && (
                          <tr>
                            <td colSpan={4}>
                              <p className="inv-empty">
                                {t(
                                  locale,
                                  'কোনো স্টক পাওয়া যায়নি।',
                                  'No stock balances found.',
                                )}
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel inv-panel">
                <div className="inv-panel-heading">
                  <div>
                    <h2>{t(locale, 'স্টকের রেকর্ড', 'Stock operation')}</h2>
                    <p className="inv-muted">
                      {t(
                        locale,
                        'শুরুর মজুত একবারই দেওয়া যায়। পরের পরিবর্তনগুলো কারণসহ সমন্বয় হিসেবে লিখবে।',
                        'Opening stock can be recorded once. Later changes must be entered as reasoned adjustments.',
                      )}
                    </p>
                  </div>
                </div>
                {!canAdjustInventory && !pendingOperation ? (
                  <p className="inv-muted">
                    {t(
                      locale,
                      'স্টক পরিবর্তন করতে inventory.adjust অনুমতি প্রয়োজন।',
                      'The inventory.adjust permission is required to change stock.',
                    )}
                  </p>
                ) : !canViewProducts && !pendingOperation ? (
                  <p className="inv-muted">
                    {t(
                      locale,
                      'পণ্য নিরাপদে নির্বাচন করতে products.view অনুমতি প্রয়োজন।',
                      'The products.view permission is required to select a product safely.',
                    )}
                  </p>
                ) : (
                  <>
                    <div
                      className="inv-mode-tabs"
                      role="group"
                      aria-label={t(locale, 'রেকর্ডের ধরন', 'Operation type')}
                    >
                      <button
                        type="button"
                        className={mode === 'opening' ? 'is-selected' : ''}
                        onClick={() => selectMode('opening')}
                        disabled={saving || submittedWithUncertainResult}
                      >
                        {t(locale, 'শুরুর মজুত', 'Opening stock')}
                      </button>
                      <button
                        type="button"
                        className={mode === 'adjustment' ? 'is-selected' : ''}
                        onClick={() => selectMode('adjustment')}
                        disabled={saving || submittedWithUncertainResult}
                      >
                        {t(locale, 'স্টক সমন্বয়', 'Stock adjustment')}
                      </button>
                    </div>
                    <form className="inv-form" onSubmit={submit}>
                      <label className="inv-field">
                        <span>
                          {t(locale, 'পণ্য নির্বাচন', 'Select product')}
                        </span>
                        <select
                          value={productId}
                          onChange={(event) => setProductId(event.target.value)}
                          required
                          disabled={saving || submittedWithUncertainResult}
                        >
                          <option value="">
                            {t(locale, 'পণ্য নির্বাচন করো', 'Choose a product')}
                          </option>
                          {(() => {
                            const candidates =
                              mode === 'opening'
                                ? [...openingCandidates]
                                : visibleProducts.filter(
                                    (product) =>
                                      product.archived_at === null &&
                                      balanceByProduct.has(product.id),
                                  );
                            const pendingProduct = pendingOperation
                              ? productById.get(pendingOperation.productId)
                              : undefined;
                            if (
                              pendingProduct &&
                              !candidates.some(
                                (product) => product.id === pendingProduct.id,
                              )
                            )
                              candidates.unshift(pendingProduct);
                            return candidates;
                          })().map((product) => {
                            const balance = balanceByProduct.get(product.id);
                            const unit = unitById.get(product.unit_id);
                            return (
                              <option key={product.id} value={product.id}>
                                {product.name_bn} ·{' '}
                                {balance
                                  ? quantityText(balance.quantity, locale)
                                  : '—'}{' '}
                                {unit?.name_bn ?? ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {mode === 'adjustment' && (
                        <label className="inv-field">
                          <span>
                            {t(locale, 'স্টক পরিবর্তনের ধরন', 'Direction')}
                          </span>
                          <select
                            value={direction}
                            onChange={(event) =>
                              setDirection(
                                event.target.value as InventoryDirection,
                              )
                            }
                            disabled={saving || submittedWithUncertainResult}
                          >
                            <option value="IN">
                              {t(locale, 'স্টক যোগ হবে', 'Stock in')}
                            </option>
                            <option value="OUT">
                              {t(locale, 'স্টক কমবে', 'Stock out')}
                            </option>
                          </select>
                        </label>
                      )}
                      <label className="inv-field">
                        <span>
                          {mode === 'opening'
                            ? t(locale, 'শুরুর পরিমাণ', 'Opening quantity')
                            : t(locale, 'পরিমাণ', 'Quantity')}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                          required
                          placeholder={t(locale, 'যেমন: ১০.৫', 'e.g. 10.5')}
                          disabled={saving || submittedWithUncertainResult}
                        />
                      </label>
                      {mode === 'opening' ? (
                        <label className="inv-field inv-field-wide">
                          <span>
                            {t(locale, 'নোট (ঐচ্ছিক)', 'Note (optional)')}
                          </span>
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={500}
                            disabled={saving || submittedWithUncertainResult}
                          />
                        </label>
                      ) : (
                        <label className="inv-field inv-field-wide">
                          <span>
                            {t(
                              locale,
                              'কেন স্টক পরিবর্তন হচ্ছে? (বাধ্যতামূলক)',
                              'Why is stock changing? (required)',
                            )}
                          </span>
                          <textarea
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            rows={2}
                            maxLength={500}
                            required
                            disabled={saving || submittedWithUncertainResult}
                            placeholder={t(
                              locale,
                              'যেমন: হাতে গুনে ২ পিস বেশি পাওয়া গেছে',
                              'e.g. Physical count found two extra pieces',
                            )}
                          />
                        </label>
                      )}
                      {selectedProduct && (
                        <p className="inv-form-hint">
                          {t(locale, 'বর্তমান মজুত', 'Current stock')}:{' '}
                          {quantityText(
                            balanceByProduct.get(selectedProduct.id)
                              ?.quantity ?? 0,
                            locale,
                          )}{' '}
                          {unitById.get(selectedProduct.unit_id)?.name_bn ?? ''}
                        </p>
                      )}
                      {submittedWithUncertainResult ? (
                        <div className="inv-retry-note">
                          <p>
                            {t(
                              locale,
                              'এই অনুরোধের ফল এখনো নিশ্চিত নয়। একই অনুরোধ যাচাই বা পুনরায় পাঠালে একই operation ID ব্যবহার হবে।',
                              'The outcome is uncertain. Checking or retrying will reuse the exact same operation ID.',
                            )}
                          </p>
                          <button
                            type="button"
                            className="button auth-primary"
                            onClick={() => void verifyOrRetry()}
                            disabled={saving}
                          >
                            {saving
                              ? t(locale, 'যাচাই হচ্ছে…', 'Checking…')
                              : t(
                                  locale,
                                  'ফল যাচাই / একই অনুরোধ পুনরায় চেষ্টা',
                                  'Verify result / retry same operation',
                                )}
                          </button>
                        </div>
                      ) : (
                        <div className="inv-form-actions">
                          <button
                            type="submit"
                            className="button auth-primary"
                            disabled={
                              adjustmentDisabled ||
                              !selectedProduct ||
                              !balanceByProduct.has(selectedProduct.id) ||
                              (mode === 'opening' &&
                                selectedProduct.archived_at !== null)
                            }
                          >
                            {saving
                              ? t(locale, 'সংরক্ষণ হচ্ছে…', 'Saving…')
                              : t(
                                  locale,
                                  'নিশ্চিত করে সংরক্ষণ',
                                  'Confirm and save',
                                )}
                          </button>
                          <button
                            type="button"
                            className="button"
                            onClick={() => {
                              setProductId('');
                              setQuantity('');
                              setReason('');
                              setNote('');
                              setError(null);
                              setSuccess('');
                              clearOperation();
                            }}
                            disabled={saving}
                          >
                            {t(locale, 'ফর্ম পরিষ্কার', 'Clear form')}
                          </button>
                        </div>
                      )}
                    </form>
                  </>
                )}
              </section>

              <section className="panel inv-panel">
                <div className="inv-panel-heading">
                  <div>
                    <h2>
                      {t(locale, 'স্টক পরিবর্তনের ইতিহাস', 'Movement history')}
                    </h2>
                    <p className="inv-muted">
                      {t(
                        locale,
                        'সর্বশেষ ২০০টি মুভমেন্ট দেখানো হচ্ছে। এটি পূর্ণাঙ্গ হিসাবের রিপোর্ট নয়।',
                        'Showing the latest 200 movements. This is not yet the full reporting module.',
                      )}
                    </p>
                  </div>
                </div>
                {loading ? (
                  <p className="inv-empty">
                    {t(locale, 'ইতিহাস লোড হচ্ছে…', 'Loading history…')}
                  </p>
                ) : (
                  <div className="inv-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t(locale, 'তারিখ', 'Date')}</th>
                          <th>{t(locale, 'পণ্য', 'Product')}</th>
                          <th>{t(locale, 'ধরন', 'Type')}</th>
                          <th>{t(locale, 'পরিবর্তন', 'Change')}</th>
                          <th>{t(locale, 'শেষ মজুত', 'Balance after')}</th>
                          <th>{t(locale, 'কারণ / নোট', 'Reason / note')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((movement) => {
                          const product = productById.get(movement.product_id);
                          const unit = product
                            ? unitById.get(product.unit_id)
                            : undefined;
                          const delta = movement.quantity_delta;
                          return (
                            <tr key={movement.id}>
                              <td>{dateText(movement.created_at, locale)}</td>
                              <td>{getProductName(movement.product_id)}</td>
                              <td>
                                {movementLabel(movement.movement_type, locale)}
                              </td>
                              <td
                                className={
                                  delta < 0 ? 'inv-negative' : 'inv-positive'
                                }
                              >
                                {delta > 0 ? '+' : ''}
                                {quantityText(delta, locale)}{' '}
                                {unit?.name_bn ?? ''}
                              </td>
                              <td>
                                {quantityText(movement.quantity_after, locale)}{' '}
                                {unit?.name_bn ?? ''}
                              </td>
                              <td>{movement.reason || '—'}</td>
                            </tr>
                          );
                        })}
                        {!movements.length && (
                          <tr>
                            <td colSpan={6}>
                              <p className="inv-empty">
                                {t(
                                  locale,
                                  'এখনো কোনো স্টক মুভমেন্ট নেই।',
                                  'No stock movements yet.',
                                )}
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
