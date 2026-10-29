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
  Customer,
  Database,
  Product,
  ProductCategory,
  ProductPurchaseReference,
  ProductUnit,
  Supplier,
} from '@mini-erp/shared/database-types';
import {
  MasterDataService,
  MasterDataServiceError,
} from '@mini-erp/shared/master-data-service';
import type { ValidationIssue } from '@mini-erp/shared/master-data';
import './master-data.css';
import OperationsPanels, { type MainModule } from './OperationsPanels';

type Locale = 'bn' | 'en';

type MainSectionId = Exclude<MainModule, 'stock'> | 'products';
const mainSectionIds: MainSectionId[] = [
  'home',
  'shops',
  'sales',
  'purchases',
  'products',
  'dues',
  'expenses',
  'estimator',
  'reports',
  'transactions',
  'settings',
];

type SectionId =
  | 'products'
  | 'categories'
  | 'units'
  | 'customers'
  | 'suppliers'
  | 'purchase-prices';

type EditorKind =
  'product' | 'category' | 'unit' | 'customer' | 'supplier' | 'purchase-price';

type ArchiveKind = 'product' | 'category' | 'unit' | 'customer' | 'supplier';

type MasterRow =
  | Product
  | ProductCategory
  | ProductUnit
  | Customer
  | Supplier
  | ProductPurchaseReference;

type Draft = Record<string, string>;

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
  onOpenInventory: () => void;
  onOpenSales: () => void;
  onSettingsSaved: () => void;
};

type Tab = {
  id: SectionId;
  title: string;
  icon: string;
};

const emptyDraft = (): Draft => ({
  name_bn: '',
  name_en: '',
  name: '',
  phone: '',
  address: '',
  notes: '',
  sku: '',
  category_id: '',
  unit_id: '',
  preferred_supplier_id: '',
  default_selling_price: '',
  minimum_stock: '',
  product_id: '',
  reference_purchase_price: '',
});

function text(locale: Locale, bn: string, en: string): string {
  return locale === 'bn' ? bn : en;
}

function draftFrom(kind: EditorKind, row?: MasterRow): Draft {
  const draft = emptyDraft();

  if (!row) return draft;

  if (kind === 'category') {
    const item = row as ProductCategory;

    return {
      ...draft,
      name_bn: item.name_bn,
      name_en: item.name_en ?? '',
    };
  }

  if (kind === 'unit') {
    const item = row as ProductUnit;

    return {
      ...draft,
      name_bn: item.name_bn,
      name_en: item.name_en ?? '',
    };
  }

  if (kind === 'product') {
    const item = row as Product;

    return {
      ...draft,
      name_bn: item.name_bn,
      name_en: item.name_en ?? '',
      sku: item.sku ?? '',
      category_id: item.category_id ?? '',
      unit_id: item.unit_id,
      preferred_supplier_id: item.preferred_supplier_id ?? '',
      default_selling_price: String(item.default_selling_price),
      minimum_stock:
        item.minimum_stock === null ? '' : String(item.minimum_stock),
    };
  }

  if (kind === 'customer' || kind === 'supplier') {
    const item = row as Customer | Supplier;

    return {
      ...draft,
      name: item.name,
      phone: item.phone ?? '',
      address: item.address ?? '',
      notes: item.notes ?? '',
    };
  }

  const item = row as ProductPurchaseReference;

  return {
    ...draft,
    product_id: item.product_id,
    reference_purchase_price: String(item.reference_purchase_price),
  };
}

function errorMessage(error: unknown, locale: Locale): string {
  if (error instanceof MasterDataServiceError) {
    if (error.code === 'permission_denied') {
      return text(
        locale,
        'এই কাজের অনুমতি তোমার অ্যাকাউন্টে নেই।',
        'Your account does not have permission for this action.',
      );
    }

    if (error.code === 'validation_failed') {
      const messages: string[] = [];

      for (const [field, issue] of Object.entries(error.fieldErrors ?? {})) {
        const issueLabel: Record<ValidationIssue, string> = {
          required: text(locale, 'প্রয়োজনীয়', 'Required'),
          too_long: text(locale, 'অনেক বড়', 'Too long'),
          invalid_uuid: text(
            locale,
            'সঠিক রেফারেন্স নির্বাচন করো',
            'Choose a valid reference',
          ),
          invalid_decimal: text(
            locale,
            'সঠিক সংখ্যা লিখো',
            'Enter a valid non-negative decimal',
          ),
        };

        messages.push(`${field}: ${issueLabel[issue]}`);
      }

      return messages.length
        ? `${text(locale, 'ইনপুট যাচাই করো', 'Please check the input')}: ${messages.join('; ')}`
        : text(
            locale,
            'প্রদত্ত তথ্যগুলো যাচাই করো।',
            'Please check the supplied values.',
          );
    }

    if (error.code === 'not_found') {
      return text(
        locale,
        'রেকর্ডটি পাওয়া যায়নি; তালিকা রিফ্রেশ করে দেখো।',
        'The record was not found. Refresh and try again.',
      );
    }

    if (error.code === 'invalid_context') {
      return text(
        locale,
        'নির্বাচিত ব্যবসার তথ্য যাচাই করা যায়নি। আবার প্রবেশ করো।',
        'The selected business context is invalid. Sign in again.',
      );
    }

    return text(
      locale,
      `ডেটাবেস অপারেশন ব্যর্থ হয়েছে। ত্রুটি কোড: ${error.databaseCode ?? 'unknown'}`,
      `The database operation failed. Error code: ${error.databaseCode ?? 'unknown'}`,
    );
  }

  return text(
    locale,
    'কাজটি সম্পন্ন হয়নি। অনুমতি, সংযোগ এবং ইনপুট পরীক্ষা করে আবার চেষ্টা করো।',
    'The operation failed. Check your connection, permissions and input, then try again.',
  );
}

function InputField({
  label,
  value,
  onChange,
  required = false,
  placeholder,
  inputMode = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'decimal' | 'tel';
}) {
  return (
    <label className="md-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="md-field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
      />
    </label>
  );
}

export default function MasterDataWorkspace({
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
  onSettingsSaved,
}: Props) {
  const service = useMemo(
    () => (client ? new MasterDataService(client, tenant) : null),
    [client, tenant],
  );

  const canViewProducts = can(
    tenant.member,
    tenant.permissions,
    'products.view',
  );

  const canManageProducts = can(
    tenant.member,
    tenant.permissions,
    'products.manage',
  );

  const canViewCustomers = can(
    tenant.member,
    tenant.permissions,
    'customers.view',
  );

  const canManageCustomers = can(
    tenant.member,
    tenant.permissions,
    'customers.manage',
  );

  const canViewSuppliers = can(
    tenant.member,
    tenant.permissions,
    'suppliers.view',
  );

  const canManageSuppliers = can(
    tenant.member,
    tenant.permissions,
    'suppliers.manage',
  );

  const canReadCosts = can(tenant.member, tenant.permissions, 'costs.read');
  const canViewInventory = can(
    tenant.member,
    tenant.permissions,
    'inventory.view',
  );

  const canWritePurchaseReferences = canManageProducts && canReadCosts;

  const tabs: Tab[] = [];

  if (canViewProducts) {
    tabs.push(
      {
        id: 'products',
        title: text(locale, 'পণ্য', 'Products'),
        icon: '▣',
      },
      {
        id: 'categories',
        title: text(locale, 'ক্যাটাগরি', 'Categories'),
        icon: '▤',
      },
      {
        id: 'units',
        title: text(locale, 'একক', 'Units'),
        icon: '◫',
      },
    );
  }

  if (canViewCustomers) {
    tabs.push({
      id: 'customers',
      title: text(locale, 'কাস্টমার', 'Customers'),
      icon: '♙',
    });
  }

  if (canViewSuppliers) {
    tabs.push({
      id: 'suppliers',
      title: text(locale, 'সাপ্লায়ার', 'Suppliers'),
      icon: '♧',
    });
  }

  if (canViewProducts && canReadCosts) {
    tabs.push({
      id: 'purchase-prices',
      title: text(locale, 'রেফারেন্স ক্রয়মূল্য', 'Purchase references'),
      icon: '৳',
    });
  }

  const section: SectionId = 'products';
  const [mainSection, setMainSection] = useState<MainSectionId>('home');
  const [showStock, setShowStock] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{
    kind: EditorKind;
    id?: string;
  } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseReferences, setPurchaseReferences] = useState<
    ProductPurchaseReference[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const requestNumber = useRef(0);

  const activeSection: SectionId = tabs.some((tab) => tab.id === section)
    ? section
    : (tabs[0]?.id ?? 'products');

  const loadData = useCallback(async () => {
    const request = ++requestNumber.current;

    setLoading(true);
    setError(null);

    if (!service) {
      setError(new Error('missing_client'));
      setLoading(false);
      return;
    }

    try {
      const [
        productRows,
        categoryRows,
        unitRows,
        customerRows,
        supplierRows,
        referenceRows,
      ] = await Promise.all([
        canViewProducts
          ? service.listProducts(true)
          : Promise.resolve([] as Product[]),

        canViewProducts
          ? service.listCategories(true)
          : Promise.resolve([] as ProductCategory[]),

        canViewProducts
          ? service.listUnits(true)
          : Promise.resolve([] as ProductUnit[]),

        canViewCustomers
          ? service.listCustomers(true)
          : Promise.resolve([] as Customer[]),

        canViewSuppliers
          ? service.listSuppliers(true)
          : Promise.resolve([] as Supplier[]),

        canViewProducts && canReadCosts
          ? service.listPurchaseReferences()
          : Promise.resolve([] as ProductPurchaseReference[]),
      ]);

      if (request !== requestNumber.current) {
        return;
      }

      setProducts(productRows);
      setCategories(categoryRows);
      setUnits(unitRows);
      setCustomers(customerRows);
      setSuppliers(supplierRows);
      setPurchaseReferences(referenceRows);
    } catch (caught: unknown) {
      if (request === requestNumber.current) {
        setError(caught);
      }
    } finally {
      if (request === requestNumber.current) {
        setLoading(false);
      }
    }
  }, [
    service,
    canViewProducts,
    canViewCustomers,
    canViewSuppliers,
    canReadCosts,
  ]);

  useEffect(() => {
    let active = true;

    // Start data loading in a microtask so the effect itself does not trigger
    // synchronous state updates. Cleanup invalidates both the queued load and
    // any request already in flight when the workspace unmounts or changes.
    void Promise.resolve().then(() => {
      if (active) void loadData();
    });

    return () => {
      active = false;
      requestNumber.current += 1;
    };
  }, [loadData]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
        style: 'currency',
        currency: 'BDT',
        maximumFractionDigits: 2,
      }),
    [locale],
  );

  const isVisibleArchiveState = (row: { archived_at: string | null }) =>
    showArchived ? row.archived_at !== null : row.archived_at === null;

  const searchMatches = (...values: (string | null | undefined)[]) => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) return true;

    return values.some((value) =>
      (value ?? '').toLocaleLowerCase().includes(query),
    );
  };

  const visibleProducts = products
    .filter(isVisibleArchiveState)
    .filter((row) =>
      searchMatches(
        row.name_bn,
        row.name_en,
        row.sku,
        categories.find((item) => item.id === row.category_id)?.name_bn,
      ),
    );

  const visibleCategories = categories
    .filter(isVisibleArchiveState)
    .filter((row) => searchMatches(row.name_bn, row.name_en));

  const visibleUnits = units
    .filter(isVisibleArchiveState)
    .filter((row) => searchMatches(row.name_bn, row.name_en, row.code));

  const visibleCustomers = customers
    .filter(isVisibleArchiveState)
    .filter((row) => searchMatches(row.name, row.phone, row.address));

  const visibleSuppliers = suppliers
    .filter(isVisibleArchiveState)
    .filter((row) => searchMatches(row.name, row.phone, row.address));

  const visiblePurchaseReferences = purchaseReferences.filter((row) => {
    const product = products.find((item) => item.id === row.product_id);

    return searchMatches(product?.name_bn, product?.name_en, product?.sku);
  });

  const sectionTitle =
    tabs.find((tab) => tab.id === activeSection)?.title ??
    text(locale, 'মাস্টার ডেটা', 'Master data');

  const mainTitles: Record<MainSectionId, string> = {
    home: text(locale, 'হোম', 'Home'),
    shops: text(locale, 'দোকানদারের তালিকা', 'Shop Directory'),
    sales: text(locale, 'বিক্রি', 'Sales'),
    purchases: text(locale, 'কেনাকাটা', 'Purchases'),
    products: text(locale, 'পণ্য ও স্টক', 'Products & Stock'),
    dues: text(locale, 'ক্রেতার বাকি', 'Customer Dues'),
    expenses: text(locale, 'খরচ', 'Expenses'),
    estimator: text(locale, 'লাভের হিসাব', 'Profit Estimator'),
    reports: text(locale, 'রিপোর্ট', 'Reports'),
    transactions: text(locale, 'ইনভয়েস ও লেনদেন', 'Invoices & Transactions'),
    settings: text(locale, 'সেটিংস', 'Settings'),
  };
  const mainMenu: { id: MainSectionId; icon: string }[] = [
    { id: 'home', icon: '⌂' },
    { id: 'shops', icon: '▦' },
    { id: 'sales', icon: '৳' },
    { id: 'purchases', icon: '＋' },
    { id: 'products', icon: '▣' },
    { id: 'dues', icon: '◷' },
    { id: 'expenses', icon: '↘' },
    { id: 'estimator', icon: '∑' },
    { id: 'reports', icon: '▥' },
    { id: 'transactions', icon: '▤' },
    { id: 'settings', icon: '⚙' },
  ];
  const mainSectionTitle = mainTitles[mainSection];

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const requested = (event as CustomEvent<string>).detail;
      if (requested === 'stock') {
        setMainSection('products');
        setShowStock(true);
      } else if (
        requested &&
        mainSectionIds.includes(requested as MainSectionId)
      ) {
        const next = requested as MainSectionId;
        setMainSection(next);
        if (next === 'products') setShowStock(false);
      }
      setSearch('');
      setEditor(null);
      setError(null);
    };
    window.addEventListener('mini-erp-navigate', onNavigate);
    return () => window.removeEventListener('mini-erp-navigate', onNavigate);
  }, [locale]);

  const canAdd = (() => {
    switch (activeSection) {
      case 'products':
      case 'categories':
      case 'units':
        return canManageProducts;

      case 'customers':
        return canManageCustomers;

      case 'suppliers':
        return canManageSuppliers;

      case 'purchase-prices':
        return canWritePurchaseReferences;
    }
  })();

  function startNew(kind: EditorKind) {
    setError(null);
    setDraft(draftFrom(kind));
    setEditor({ kind });
  }

  function startEdit(kind: EditorKind, row: MasterRow) {
    setError(null);

    const id =
      kind === 'purchase-price'
        ? (row as ProductPurchaseReference).product_id
        : 'id' in row
          ? row.id
          : undefined;

    setDraft(draftFrom(kind, row));
    setEditor({ kind, id });
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!service || !editor) return;

    setMutating(true);
    setError(null);

    try {
      switch (editor.kind) {
        case 'category':
          await service.saveCategory(
            {
              name_bn: draft.name_bn,
              name_en: draft.name_en,
            },
            editor.id,
          );
          break;

        case 'unit':
          await service.saveUnit(
            {
              name_bn: draft.name_bn,
              name_en: draft.name_en,
            },
            editor.id,
          );
          break;

        case 'customer':
          await service.saveCustomer(
            {
              name: draft.name,
              phone: draft.phone,
              address: draft.address,
              notes: draft.notes,
            },
            editor.id,
          );
          break;

        case 'supplier':
          await service.saveSupplier(
            {
              name: draft.name,
              phone: draft.phone,
              address: draft.address,
              notes: draft.notes,
            },
            editor.id,
          );
          break;

        case 'product':
          await service.saveProduct(
            {
              name_bn: draft.name_bn,
              name_en: draft.name_en,
              sku: draft.sku,
              category_id: draft.category_id,
              unit_id: draft.unit_id,
              preferred_supplier_id: draft.preferred_supplier_id,
              default_selling_price: draft.default_selling_price,
              minimum_stock: draft.minimum_stock,
            },
            editor.id,
          );
          break;

        case 'purchase-price':
          await service.savePurchaseReference(
            draft.product_id,
            draft.reference_purchase_price,
          );
          break;
      }

      setEditor(null);
      setDraft(emptyDraft());
      await loadData();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setMutating(false);
    }
  }

  async function toggleArchived(
    kind: ArchiveKind,
    id: string,
    currentlyArchived: boolean,
  ) {
    if (!service) return;

    setWorkingId(id);
    setError(null);

    try {
      switch (kind) {
        case 'product':
          if (currentlyArchived) {
            await service.restoreProduct(id);
          } else {
            await service.archiveProduct(id);
          }
          break;

        case 'category':
          if (currentlyArchived) {
            await service.restoreCategory(id);
          } else {
            await service.archiveCategory(id);
          }
          break;

        case 'unit':
          if (currentlyArchived) {
            await service.restoreUnit(id);
          } else {
            await service.archiveUnit(id);
          }
          break;

        case 'customer':
          if (currentlyArchived) {
            await service.restoreCustomer(id);
          } else {
            await service.archiveCustomer(id);
          }
          break;

        case 'supplier':
          if (currentlyArchived) {
            await service.restoreSupplier(id);
          } else {
            await service.archiveSupplier(id);
          }
          break;
      }

      await loadData();
    } catch (caught: unknown) {
      setError(caught);
    } finally {
      setWorkingId(null);
    }
  }

  function archiveButton(
    kind: ArchiveKind,
    id: string,
    archived: boolean,
    builtIn = false,
  ) {
    const disabled = mutating || workingId === id || (builtIn && !archived);

    return (
      <button
        type="button"
        className="button md-small-button"
        disabled={disabled}
        onClick={() => {
          void toggleArchived(kind, id, archived);
        }}
      >
        {archived
          ? text(locale, 'পুনরুদ্ধার', 'Restore')
          : text(locale, 'আর্কাইভ', 'Archive')}
      </button>
    );
  }

  function rowActions(
    kind: ArchiveKind,
    row: Product | ProductCategory | ProductUnit | Customer | Supplier,
  ) {
    const manageAllowed =
      kind === 'customer'
        ? canManageCustomers
        : kind === 'supplier'
          ? canManageSuppliers
          : canManageProducts;

    if (!manageAllowed) return null;

    const editorKind: EditorKind = kind;

    return (
      <div className="md-rowactions">
        <button
          type="button"
          className="button md-small-button"
          disabled={mutating}
          onClick={() => startEdit(editorKind, row)}
        >
          {text(locale, 'এডিট', 'Edit')}
        </button>

        {archiveButton(
          kind,
          row.id,
          row.archived_at !== null,
          kind === 'unit' && (row as ProductUnit).is_builtin,
        )}
      </div>
    );
  }

  function renderEditor() {
    if (!editor) return null;

    const isProduct = editor.kind === 'product';

    const isParty = editor.kind === 'customer' || editor.kind === 'supplier';

    const isPurchaseReference = editor.kind === 'purchase-price';

    const editorTitle = text(
      locale,
      editor.id ? 'রেকর্ড এডিট করো' : 'নতুন রেকর্ড',
      editor.id ? 'Edit record' : 'New record',
    );

    return (
      <section className="md-editor">
        <div className="md-panel-heading">
          <h3>{editorTitle}</h3>

          <button
            type="button"
            className="button md-small-button"
            onClick={() => setEditor(null)}
            disabled={mutating}
          >
            {text(locale, 'বন্ধ করো', 'Cancel')}
          </button>
        </div>

        <form className="md-form" onSubmit={saveRecord}>
          {isProduct && (
            <div className="md-formgrid">
              <InputField
                label={text(
                  locale,
                  'পণ্যের নাম (বাংলা)',
                  'Product name (Bangla)',
                )}
                value={draft.name_bn}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    name_bn: value,
                  }))
                }
                required
              />

              <InputField
                label={text(
                  locale,
                  'নাম (ইংরেজি, ঐচ্ছিক)',
                  'Name (English, optional)',
                )}
                value={draft.name_en}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    name_en: value,
                  }))
                }
              />

              <InputField
                label="SKU"
                value={draft.sku}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    sku: value,
                  }))
                }
              />

              <label className="md-field">
                <span>{text(locale, 'ক্যাটাগরি', 'Category')}</span>

                <select
                  value={draft.category_id}
                  onChange={(event) =>
                    setDraft((old) => ({
                      ...old,
                      category_id: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {text(locale, 'ক্যাটাগরি নেই', 'No category')}
                  </option>

                  {categories
                    .filter(
                      (item) =>
                        item.archived_at === null ||
                        item.id === draft.category_id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name_bn}
                        {item.archived_at
                          ? ` — ${text(locale, 'আর্কাইভড', 'archived')}`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>

              <label className="md-field">
                <span>{text(locale, 'একক', 'Unit')}</span>

                <select
                  value={draft.unit_id}
                  onChange={(event) =>
                    setDraft((old) => ({
                      ...old,
                      unit_id: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">
                    {text(locale, 'একক নির্বাচন করো', 'Select a unit')}
                  </option>

                  {units
                    .filter(
                      (item) =>
                        item.archived_at === null || item.id === draft.unit_id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name_bn}
                        {item.archived_at
                          ? ` — ${text(locale, 'আর্কাইভড', 'archived')}`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>

              <label className="md-field">
                <span>
                  {text(locale, 'পছন্দের সাপ্লায়ার', 'Preferred supplier')}
                </span>

                <select
                  value={draft.preferred_supplier_id}
                  onChange={(event) =>
                    setDraft((old) => ({
                      ...old,
                      preferred_supplier_id: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {text(locale, 'নির্বাচন করা হয়নি', 'None selected')}
                  </option>

                  {suppliers
                    .filter(
                      (item) =>
                        item.archived_at === null ||
                        item.id === draft.preferred_supplier_id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.archived_at
                          ? ` — ${text(locale, 'আর্কাইভড', 'archived')}`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>

              <InputField
                label={text(
                  locale,
                  'বিক্রয় মূল্য (৳)',
                  'Default selling price (BDT)',
                )}
                value={draft.default_selling_price}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    default_selling_price: value,
                  }))
                }
                inputMode="decimal"
                required
              />

              <InputField
                label={text(
                  locale,
                  'ন্যূনতম স্টক (ঐচ্ছিক)',
                  'Minimum stock (optional)',
                )}
                value={draft.minimum_stock}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    minimum_stock: value,
                  }))
                }
                inputMode="decimal"
              />
            </div>
          )}

          {(editor.kind === 'category' || editor.kind === 'unit') && (
            <div className="md-formgrid">
              <InputField
                label={text(locale, 'নাম (বাংলা)', 'Name (Bangla)')}
                value={draft.name_bn}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    name_bn: value,
                  }))
                }
                required
              />

              <InputField
                label={text(
                  locale,
                  'নাম (ইংরেজি, ঐচ্ছিক)',
                  'Name (English, optional)',
                )}
                value={draft.name_en}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    name_en: value,
                  }))
                }
              />
            </div>
          )}

          {isParty && (
            <div className="md-formgrid">
              <InputField
                label={text(locale, 'নাম', 'Name')}
                value={draft.name}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    name: value,
                  }))
                }
                required
              />

              <InputField
                label={text(
                  locale,
                  'মোবাইল নম্বর (ঐচ্ছিক)',
                  'Phone (optional)',
                )}
                value={draft.phone}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    phone: value,
                  }))
                }
                inputMode="tel"
              />

              <InputField
                label={text(locale, 'ঠিকানা (ঐচ্ছিক)', 'Address (optional)')}
                value={draft.address}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    address: value,
                  }))
                }
              />

              <TextAreaField
                label={text(locale, 'নোট (ঐচ্ছিক)', 'Notes (optional)')}
                value={draft.notes}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    notes: value,
                  }))
                }
              />
            </div>
          )}

          {isPurchaseReference && (
            <div className="md-formgrid">
              <label className="md-field">
                <span>{text(locale, 'পণ্য', 'Product')}</span>

                <select
                  value={draft.product_id}
                  onChange={(event) =>
                    setDraft((old) => ({
                      ...old,
                      product_id: event.target.value,
                    }))
                  }
                  required
                  disabled={Boolean(editor.id)}
                >
                  <option value="">
                    {text(locale, 'পণ্য নির্বাচন করো', 'Choose a product')}
                  </option>

                  {products
                    .filter(
                      (item) =>
                        item.archived_at === null ||
                        item.id === draft.product_id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name_bn}
                        {item.sku ? ` · ${item.sku}` : ''}
                      </option>
                    ))}
                </select>
              </label>

              <InputField
                label={text(
                  locale,
                  'রেফারেন্স ক্রয়মূল্য (৳)',
                  'Reference purchase price (BDT)',
                )}
                value={draft.reference_purchase_price}
                onChange={(value) =>
                  setDraft((old) => ({
                    ...old,
                    reference_purchase_price: value,
                  }))
                }
                inputMode="decimal"
                required
              />

              <p className="md-muted md-form-note">
                {text(
                  locale,
                  'এটি বর্তমান রেফারেন্স মূল্য—ঐতিহাসিক ক্রয়মূল্য বা স্টক হিসাব নয়।',
                  'This is a current reference price, not historical purchase cost or stock accounting.',
                )}
              </p>
            </div>
          )}

          <div className="md-formactions">
            <button
              type="submit"
              className="button auth-primary"
              disabled={mutating || loading}
            >
              {mutating
                ? text(locale, 'সংরক্ষণ হচ্ছে…', 'Saving…')
                : text(locale, 'সংরক্ষণ করো', 'Save')}
            </button>

            <button
              type="button"
              className="button"
              disabled={mutating}
              onClick={() => setEditor(null)}
            >
              {text(locale, 'বাতিল', 'Cancel')}
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderTable() {
    if (activeSection === 'products') {
      return (
        <div className="md-tablewrap">
          <table>
            <thead>
              <tr>
                <th>{text(locale, 'পণ্যের নাম', 'Product')}</th>
                <th>SKU</th>
                <th>{text(locale, 'ক্যাটাগরি', 'Category')}</th>
                <th>{text(locale, 'একক', 'Unit')}</th>
                <th>{text(locale, 'বিক্রয় মূল্য', 'Selling price')}</th>
                <th>{text(locale, 'স্ট্যাটাস', 'Status')}</th>
                <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {visibleProducts.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name_bn}</strong>
                    {row.name_en && <small>{row.name_en}</small>}
                  </td>
                  <td>{row.sku || '—'}</td>
                  <td>
                    {categories.find((item) => item.id === row.category_id)
                      ?.name_bn ?? '—'}
                  </td>
                  <td>
                    {units.find((item) => item.id === row.unit_id)?.name_bn ??
                      '—'}
                  </td>
                  <td>{money.format(Number(row.default_selling_price))}</td>
                  <td>
                    <span
                      className={`md-statuschip${row.archived_at ? ' is-archived' : ''}`}
                    >
                      {row.archived_at
                        ? text(locale, 'আর্কাইভড', 'Archived')
                        : text(locale, 'সক্রিয়', 'Active')}
                    </span>
                  </td>
                  <td>{rowActions('product', row)}</td>
                </tr>
              ))}

              {!visibleProducts.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      {text(
                        locale,
                        'কোনো পণ্য পাওয়া যায়নি।',
                        'No products found.',
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeSection === 'categories') {
      return (
        <div className="md-tablewrap">
          <table>
            <thead>
              <tr>
                <th>{text(locale, 'নাম (বাংলা)', 'Name')}</th>
                <th>{text(locale, 'নাম (ইংরেজি)', 'English name')}</th>
                <th>{text(locale, 'স্ট্যাটাস', 'Status')}</th>
                <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {visibleCategories.map((row) => (
                <tr key={row.id}>
                  <td>{row.name_bn}</td>
                  <td>{row.name_en || '—'}</td>
                  <td>
                    {row.archived_at
                      ? text(locale, 'আর্কাইভড', 'Archived')
                      : text(locale, 'সক্রিয়', 'Active')}
                  </td>
                  <td>{rowActions('category', row)}</td>
                </tr>
              ))}

              {!visibleCategories.length && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty">
                      {text(
                        locale,
                        'ক্যাটাগরি পাওয়া যায়নি।',
                        'No categories found.',
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeSection === 'units') {
      return (
        <div className="md-tablewrap">
          <table>
            <thead>
              <tr>
                <th>{text(locale, 'নাম', 'Name')}</th>
                <th>{text(locale, 'কোড', 'Code')}</th>
                <th>{text(locale, 'ধরন', 'Type')}</th>
                <th>{text(locale, 'স্ট্যাটাস', 'Status')}</th>
                <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {visibleUnits.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name_bn}</strong>
                    {row.name_en && <small>{row.name_en}</small>}
                  </td>
                  <td>{row.code || '—'}</td>
                  <td>
                    {row.is_builtin
                      ? text(locale, 'সিস্টেম একক', 'Built-in')
                      : text(locale, 'কাস্টম একক', 'Custom')}
                  </td>
                  <td>
                    {row.archived_at
                      ? text(locale, 'আর্কাইভড', 'Archived')
                      : text(locale, 'সক্রিয়', 'Active')}
                  </td>
                  <td>{rowActions('unit', row)}</td>
                </tr>
              ))}

              {!visibleUnits.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      {text(locale, 'একক পাওয়া যায়নি।', 'No units found.')}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeSection === 'customers') {
      return (
        <div className="md-tablewrap">
          <table>
            <thead>
              <tr>
                <th>{text(locale, 'নাম', 'Name')}</th>
                <th>{text(locale, 'মোবাইল', 'Phone')}</th>
                <th>{text(locale, 'ঠিকানা', 'Address')}</th>
                <th>{text(locale, 'স্ট্যাটাস', 'Status')}</th>
                <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {visibleCustomers.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{row.address || '—'}</td>
                  <td>
                    {row.archived_at
                      ? text(locale, 'আর্কাইভড', 'Archived')
                      : text(locale, 'সক্রিয়', 'Active')}
                  </td>
                  <td>{rowActions('customer', row)}</td>
                </tr>
              ))}

              {!visibleCustomers.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      {text(
                        locale,
                        'কাস্টমার পাওয়া যায়নি।',
                        'No customers found.',
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (activeSection === 'suppliers') {
      return (
        <div className="md-tablewrap">
          <table>
            <thead>
              <tr>
                <th>{text(locale, 'নাম', 'Name')}</th>
                <th>{text(locale, 'মোবাইল', 'Phone')}</th>
                <th>{text(locale, 'ঠিকানা', 'Address')}</th>
                <th>{text(locale, 'স্ট্যাটাস', 'Status')}</th>
                <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
              </tr>
            </thead>

            <tbody>
              {visibleSuppliers.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.phone || '—'}</td>
                  <td>{row.address || '—'}</td>
                  <td>
                    {row.archived_at
                      ? text(locale, 'আর্কাইভড', 'Archived')
                      : text(locale, 'সক্রিয়', 'Active')}
                  </td>
                  <td>{rowActions('supplier', row)}</td>
                </tr>
              ))}

              {!visibleSuppliers.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      {text(
                        locale,
                        'সাপ্লায়ার পাওয়া যায়নি।',
                        'No suppliers found.',
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="md-tablewrap">
        <table>
          <thead>
            <tr>
              <th>{text(locale, 'পণ্য', 'Product')}</th>
              <th>
                {text(
                  locale,
                  'রেফারেন্স ক্রয়মূল্য',
                  'Reference purchase price',
                )}
              </th>
              <th>{text(locale, 'অ্যাকশন', 'Actions')}</th>
            </tr>
          </thead>

          <tbody>
            {visiblePurchaseReferences.map((row) => (
              <tr key={row.product_id}>
                <td>
                  {products.find((item) => item.id === row.product_id)
                    ?.name_bn ?? row.product_id}
                </td>

                <td>{money.format(Number(row.reference_purchase_price))}</td>

                <td>
                  {canWritePurchaseReferences && (
                    <button
                      type="button"
                      className="button md-small-button"
                      onClick={() => startEdit('purchase-price', row)}
                    >
                      {text(locale, 'এডিট', 'Edit')}
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!visiblePurchaseReferences.length && (
              <tr>
                <td colSpan={3}>
                  <div className="empty">
                    {text(
                      locale,
                      'রেফারেন্স ক্রয়মূল্যের রেকর্ড পাওয়া যায়নি।',
                      'No purchase reference prices found.',
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="app-layout md-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">হ</span>
          <strong>Mini ERP</strong>
        </div>

        <div className="shop-identity">
          <strong>{tenant.business.name}</strong>
          <small>
            {text(locale, 'সংযুক্ত লাইভ ডেটাবেস', 'Connected live database')}
          </small>
          <small>BDT · Asia/Dhaka</small>
        </div>

        <p className="navlabel">
          {text(locale, 'ব্যবসা ব্যবস্থাপনা', 'BUSINESS MANAGEMENT')}
        </p>

        <nav
          className="nav md-nav"
          aria-label={text(locale, 'প্রধান মেনু', 'Main navigation')}
        >
          {mainMenu.map((item) => (
            <button
              type="button"
              key={item.id}
              className="md-nav-button"
              aria-current={mainSection === item.id ? 'page' : undefined}
              onClick={() => {
                setMainSection(item.id);
                if (item.id === 'products') setShowStock(false);
                setSearch('');
                setEditor(null);
                setError(null);
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {mainTitles[item.id]}
            </button>
          ))}
        </nav>

        <footer className="md-sidebar-footer">
          <span className="avatar" aria-hidden="true">
            {(displayName || email || tenant.business.name).slice(0, 1)}
          </span>

          <div className="md-user">
            <strong>{displayName || email || tenant.business.name}</strong>

            <small>
              {text(
                locale,
                tenant.member.role === 'OWNER' ? 'মালিক' : 'স্টাফ',
                tenant.member.role,
              )}
            </small>

            <button
              className="button md-small-button"
              type="button"
              onClick={onLogout}
            >
              {text(locale, 'লগ আউট', 'Log out')}
            </button>
          </div>
        </footer>
      </aside>

      <div className="workspace">
        <header className="topbar md-topbar">
          <div className="crumb">
            <small>{tenant.business.name}</small>
            <h1>{mainSectionTitle}</h1>
          </div>

          <div className="md-top-actions">
            {can(tenant.member, tenant.permissions, 'sales.create') &&
              canViewProducts &&
              canViewInventory && (
                <button
                  type="button"
                  className="button auth-primary"
                  onClick={() => setMainSection('sales')}
                >
                  {text(locale, 'নতুন বিক্রি', 'New sale')}
                </button>
              )}
            {canViewInventory && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setMainSection('products');
                  setShowStock(true);
                }}
              >
                {text(locale, 'মজুত / স্টক', 'Inventory / Stock')}
              </button>
            )}
            <button type="button" className="button" onClick={onToggleLocale}>
              {locale === 'bn' ? 'English' : 'বাংলা'}
            </button>

            <button type="button" className="button" onClick={onOpenDemo}>
              {text(locale, 'ডেমো প্রিভিউ', 'Demo preview')}
            </button>

            {canSwitchBusiness && (
              <button
                type="button"
                className="button"
                onClick={onSwitchBusiness}
              >
                {text(locale, 'ব্যবসা বদলাও', 'Switch business')}
              </button>
            )}
          </div>
        </header>

        <main className="md-content">
          {mainSection === 'products' ? (
            <>
              <div
                className="ops-main-subnav"
                aria-label={text(
                  locale,
                  'পণ্য ও স্টক বিভাগ',
                  'Products and stock views',
                )}
              >
                <button
                  type="button"
                  className={`ops-chip ${!showStock ? 'active' : ''}`}
                  onClick={() => setShowStock(false)}
                >
                  {text(locale, 'পণ্য মাস্টার', 'Product Master')}
                </button>
                <button
                  type="button"
                  className={`ops-chip ${showStock ? 'active' : ''}`}
                  onClick={() => setShowStock(true)}
                >
                  {text(locale, 'স্টক লেজার', 'Stock Ledger')}
                </button>
              </div>
              {showStock ? (
                <OperationsPanels
                  client={client}
                  tenant={tenant}
                  locale={locale}
                  module="stock"
                  onToggleLocale={onToggleLocale}
                  onOpenDemo={onOpenDemo}
                  onSettingsSaved={onSettingsSaved}
                />
              ) : (
                <>
                  <section className="md-intro">
                    <h2>{tenant.business.name}</h2>

                    <p>
                      {text(
                        locale,
                        'এখানে নির্বাচিত ব্যবসার ডেটাবেস রেকর্ড দেখানো হচ্ছে। তথ্য সংরক্ষণের আগে প্রতিটি পরিবর্তন যাচাই করা হয়।',
                        'This workspace shows records from the selected business database. Inputs are validated before changes are saved.',
                      )}
                    </p>

                    <p className="md-muted">
                      {text(
                        locale,
                        'পণ্য, ক্যাটাগরি, একক, ক্রেতা, সরবরাহকারী ও রেফারেন্স ক্রয়মূল্য এখান থেকে পরিচালনা করো।',
                        'Manage products, categories, units, customers, suppliers and reference purchase prices here.',
                      )}
                    </p>
                  </section>

                  {/*
            Fix for TS2322:
            error has type unknown, so never render it as a JSX condition.
            Compare it with null so the condition is always boolean.
          */}
                  {error !== null && (
                    <div className="md-alert" role="alert">
                      {errorMessage(error, locale)}
                    </div>
                  )}

                  {tabs.length === 0 && (
                    <section className="panel">
                      <h2>
                        {text(locale, 'অনুমতি প্রয়োজন', 'Access required')}
                      </h2>

                      <p>
                        {text(
                          locale,
                          'এই ব্যবসার মাস্টার ডেটা দেখতে তোমার অ্যাকাউন্টে প্রয়োজনীয় permission নেই।',
                          'Your account has no permission to view the master data for this business.',
                        )}
                      </p>
                    </section>
                  )}

                  {tabs.length > 0 && (
                    <section className="panel md-data-panel">
                      <div className="md-panel-heading">
                        <div>
                          <h2>{sectionTitle}</h2>

                          <p className="md-muted">
                            {activeSection === 'purchase-prices'
                              ? text(
                                  locale,
                                  'এই মূল্য শুধু reference হিসেবে ব্যবহৃত হয়।',
                                  'These prices are references only.',
                                )
                              : text(
                                  locale,
                                  'নির্বাচিত ব্যবসার রেকর্ড',
                                  'Records for the selected business',
                                )}
                          </p>
                        </div>

                        <div className="md-toolbar-actions">
                          <button
                            type="button"
                            className="button"
                            onClick={() => void loadData()}
                            disabled={loading || mutating}
                          >
                            {text(locale, 'রিফ্রেশ', 'Refresh')}
                          </button>

                          <button
                            type="button"
                            className="button"
                            onClick={() => {
                              setShowArchived((old) => !old);
                              setEditor(null);
                            }}
                            disabled={loading}
                          >
                            {showArchived
                              ? text(locale, 'সক্রিয় রেকর্ড', 'Active records')
                              : text(
                                  locale,
                                  'আর্কাইভড রেকর্ড',
                                  'Archived records',
                                )}
                          </button>

                          {canAdd && (
                            <button
                              type="button"
                              className="button auth-primary"
                              onClick={() => {
                                const kind: Record<SectionId, EditorKind> = {
                                  products: 'product',
                                  categories: 'category',
                                  units: 'unit',
                                  customers: 'customer',
                                  suppliers: 'supplier',
                                  'purchase-prices': 'purchase-price',
                                };

                                startNew(kind[activeSection]);
                              }}
                              disabled={loading || mutating}
                            >
                              + {text(locale, 'নতুন যোগ করো', 'Add new')}
                            </button>
                          )}
                        </div>
                      </div>

                      <label className="md-search">
                        <span>{text(locale, 'খুঁজুন', 'Search')}</span>

                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={text(
                            locale,
                            'নাম বা সংশ্লিষ্ট তথ্য লিখো',
                            'Search by name or related fields',
                          )}
                        />
                      </label>

                      {renderEditor()}

                      {loading ? (
                        <div className="empty" role="status">
                          {text(
                            locale,
                            'ডেটা লোড হচ্ছে…',
                            'Loading database records…',
                          )}
                        </div>
                      ) : (
                        renderTable()
                      )}

                      <p className="md-footnote">
                        {text(
                          locale,
                          'অনুমতি, ব্যবসার সীমা এবং database RLS policy সার্ভার-পক্ষেও যাচাই করা হয়।',
                          'Permissions, business scope and database RLS policies are also enforced on the server.',
                        )}
                      </p>
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            <OperationsPanels
              client={client}
              tenant={tenant}
              locale={locale}
              module={mainSection}
              onToggleLocale={onToggleLocale}
              onOpenDemo={onOpenDemo}
              onSettingsSaved={onSettingsSaved}
            />
          )}
        </main>
      </div>
    </div>
  );
}
