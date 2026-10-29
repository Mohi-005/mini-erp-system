import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, type Tenant } from '@mini-erp/shared/auth';
import type {
  BusinessExpense,
  Customer,
  CustomerReceipt,
  CustomerReceiptAllocation,
  Database,
  InventoryBalance,
  InventoryCostState,
  InventoryMovement,
  Product,
  ProductCategory,
  ProductPurchaseReference,
  ProductUnit,
  PurchaseDocument,
  PurchaseLineRead,
  SalesDocument,
  SalesLineRead,
  Supplier,
  SupplierPayment,
  SupplierPaymentAllocation,
} from '@mini-erp/shared/database-types';
import {
  multiplyDecimalStrings,
  sumDecimalStrings,
} from '@mini-erp/shared/sales';
import './operations.css';

export type MainModule =
  | 'home'
  | 'shops'
  | 'sales'
  | 'purchases'
  | 'stock'
  | 'dues'
  | 'expenses'
  | 'estimator'
  | 'reports'
  | 'transactions'
  | 'settings';
type Locale = 'bn' | 'en';
type PaymentMethod = 'CASH' | 'BKASH' | 'NAGAD' | 'BANK';
type CartLine = { product_id: string; quantity: string; unit_price: string };
type PurchaseCartLine = {
  product_id: string;
  quantity: string;
  unit_cost: string;
};
type TransactionRow = {
  kind: 'SALE' | 'PURCHASE' | 'RECEIPT' | 'SUPPLIER_PAYMENT';
  id: string;
  ref: string;
  occurred: string;
  party: string;
  amount: number;
  due: number;
  extraSearch: string;
};
type LoadState = {
  products: Product[];
  categories: ProductCategory[];
  units: ProductUnit[];
  customers: Customer[];
  suppliers: Supplier[];
  balances: InventoryBalance[];
  costState: InventoryCostState[];
  movements: InventoryMovement[];
  sales: Omit<SalesDocument, 'operation_id' | 'created_by'>[];
  salesLines: SalesLineRead[];
  purchases: Omit<PurchaseDocument, 'operation_id' | 'created_by'>[];
  purchaseLines: PurchaseLineRead[];
  receipts: Omit<CustomerReceipt, 'operation_id' | 'created_by'>[];
  receiptAllocations: CustomerReceiptAllocation[];
  supplierPayments: Omit<SupplierPayment, 'operation_id' | 'created_by'>[];
  supplierAllocations: SupplierPaymentAllocation[];
  expenses: Omit<
    BusinessExpense,
    'operation_id' | 'created_by' | 'voided_by'
  >[];
  purchaseRefs: ProductPurchaseReference[];
};

const emptyData: LoadState = {
  products: [],
  categories: [],
  units: [],
  customers: [],
  suppliers: [],
  balances: [],
  costState: [],
  movements: [],
  sales: [],
  salesLines: [],
  purchases: [],
  purchaseLines: [],
  receipts: [],
  receiptAllocations: [],
  supplierPayments: [],
  supplierAllocations: [],
  expenses: [],
  purchaseRefs: [],
};
const t = (locale: Locale, bn: string, en: string) =>
  locale === 'bn' ? bn : en;
const moneyNumber = (value: string | number | null | undefined) =>
  Number(value ?? 0) || 0;
const dateKeyDhaka = (value: string) => {
  if (!value.includes('T')) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: 'year' | 'month' | 'day') =>
    parts.find((item) => item.type === name)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const todayDhaka = () => dateKeyDhaka(new Date().toISOString());
const monthStart = () => `${todayDhaka().slice(0, 7)}-01`;
const newOperationId = () => crypto.randomUUID();
type ReadError = { message: string; code?: string } | null;
async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: ReadError }>,
): Promise<{ data: T[] | null; error: ReadError }> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await page(from, from + 999);
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    all.push(...rows);
    if (rows.length < 1000) return { data: all, error: null };
    if (from >= 999_000)
      return {
        data: null,
        error: {
          message:
            'Record limit exceeded; narrow the date range before loading more than 1,000,000 rows.',
        },
      };
  }
}
const payMethodLabel = (locale: Locale, value: string) =>
  ({
    CASH: t(locale, 'নগদ', 'Cash'),
    BKASH: 'bKash',
    NAGAD: 'Nagad',
    BANK: t(locale, 'ব্যাংক', 'Bank'),
  })[value] ?? value;
const formatMoney = (locale: Locale, value: string | number) =>
  new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 2,
  }).format(moneyNumber(value));
const formatDate = (locale: Locale, value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
        dateStyle: 'medium',
        timeStyle: value.includes('T') ? 'short' : undefined,
        timeZone: 'Asia/Dhaka',
      }).format(new Date(value))
    : t(locale, 'তারিখ নেই', 'Date unknown');
const roundMoney = (value: string | null) => {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  const carry = (fraction + '000')[2] >= '5' ? 1n : 0n;
  const rounded = cents + carry;
  return `${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
};
const lineTotal = (quantity: string, unitPrice: string) =>
  roundMoney(multiplyDecimalStrings(quantity, unitPrice));
const cartTotal = (cart: CartLine[]) =>
  sumDecimalStrings(
    cart.map((line) => lineTotal(line.quantity, line.unit_price) ?? '0'),
  ) ?? '0';
const purchaseSubtotal = (cart: PurchaseCartLine[]) =>
  sumDecimalStrings(
    cart.map((line) => lineTotal(line.quantity, line.unit_cost) ?? '0'),
  ) ?? '0';
const dueForSale = (
  sale: Pick<SalesDocument, 'id' | 'total_amount' | 'paid_amount_at_sale'>,
  allocations: CustomerReceiptAllocation[],
) =>
  Math.max(
    0,
    moneyNumber(sale.total_amount) -
      moneyNumber(sale.paid_amount_at_sale) -
      allocations
        .filter((a) => a.sales_document_id === sale.id)
        .reduce((sum, a) => sum + moneyNumber(a.amount), 0),
  );
const dueForPurchase = (
  purchase: Pick<
    PurchaseDocument,
    'id' | 'total_amount' | 'paid_amount_at_purchase'
  >,
  allocations: SupplierPaymentAllocation[],
) =>
  Math.max(
    0,
    moneyNumber(purchase.total_amount) -
      moneyNumber(purchase.paid_amount_at_purchase) -
      allocations
        .filter((a) => a.purchases_document_id === purchase.id)
        .reduce((sum, a) => sum + moneyNumber(a.amount), 0),
  );
const errorText = (locale: Locale, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/does not exist|schema cache|Could not find the table/i.test(message))
    return t(
      locale,
      'নতুন Accounting/Operations ডেটাবেস মাইগ্রেশন এখনো প্রয়োগ হয়নি। ZIP-এর migration ফাইলটি আগে DEV Supabase-এ চালাতে হবে।',
      'The Accounting/Operations migration is not applied yet. Apply the included migration to DEV Supabase first.',
    );
  if (/permission|not_authorized|42501/i.test(message))
    return t(
      locale,
      'এই কাজটি করার অনুমতি নেই। ব্যবসার মালিকের কাছ থেকে প্রয়োজনীয় অনুমতি নিতে হবে।',
      'You do not have permission for this action. Ask the business owner to grant the required permission.',
    );
  if (/insufficient_stock/i.test(message))
    return t(
      locale,
      'স্টক যথেষ্ট নেই। পণ্যের স্টক রিফ্রেশ করে আবার চেষ্টা করো।',
      'Insufficient stock. Refresh inventory and try again.',
    );
  if (/customer_required_for_credit_sale/i.test(message))
    return t(
      locale,
      'বাকিতে বিক্রির জন্য নির্দিষ্ট ক্রেতা নির্বাচন করতে হবে।',
      'Select a specific customer for a credit sale.',
    );
  if (/payment_exceeds_outstanding_due/i.test(message))
    return t(
      locale,
      'প্রদত্ত টাকা মোট পাওনার চেয়ে বেশি। টাকার পরিমাণ ঠিক করো।',
      'Payment exceeds the outstanding balance. Check the amount.',
    );
  if (/paid_exceeds_total/i.test(message))
    return t(
      locale,
      'পরিশোধিত টাকা মোট টাকার বেশি হতে পারবে না।',
      'Paid amount cannot exceed the total.',
    );
  if (
    /shop_code|customers_business_shop_code_ci_uq|duplicate key/i.test(message)
  )
    return t(
      locale,
      'এই দোকান কোডটি আগে থেকে আছে। অন্য একটি ইউনিক কোড দাও।',
      'That shop code already exists. Enter a unique code.',
    );
  return t(
    locale,
    `কাজটি সম্পন্ন হয়নি। বিস্তারিত: ${message.slice(0, 260) || 'অজানা ত্রুটি'}`,
    `The action failed. Details: ${message.slice(0, 260) || 'Unknown error'}`,
  );
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
  step,
  min,
  disabled = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="md-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        disabled={disabled}
        readOnly={readOnly}
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  children,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="md-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      >
        {children}
      </select>
    </label>
  );
}
function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="ops-summary">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="empty ops-empty">{children}</div>;
}

type OperationsLoadResult = { data: LoadState; error: ReadError };

/** Fetches the current business snapshot without mutating React state. */
async function fetchOperationsData(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<OperationsLoadResult> {
  const [
    products,
    categories,
    units,
    customers,
    suppliers,
    balances,
    costState,
    movements,
    sales,
    salesLines,
    purchases,
    purchaseLines,
    receipts,
    receiptAllocations,
    supplierPayments,
    supplierAllocations,
    expenses,
    purchaseRefs,
  ] = await Promise.all([
    fetchAllPages((from, to) =>
      client
        .from('products')
        .select('*')
        .eq('business_id', businessId)
        .is('archived_at', null)
        .order('name_bn')
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('product_categories')
        .select('*')
        .eq('business_id', businessId)
        .is('archived_at', null)
        .order('name_bn')
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('product_units')
        .select('*')
        .eq('business_id', businessId)
        .is('archived_at', null)
        .order('name_bn')
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('customers')
        .select('*')
        .eq('business_id', businessId)
        .order('name')
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('suppliers')
        .select('*')
        .eq('business_id', businessId)
        .order('name')
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('inventory_balances')
        .select('*')
        .eq('business_id', businessId)
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('inventory_cost_state')
        .select('*')
        .eq('business_id', businessId)
        .range(from, to),
    ),
    client
      .from('inventory_movements')
      .select(
        'id,business_id,product_id,movement_type,quantity_delta,quantity_after,source_kind,source_id,operation_id,reason,created_by,created_at',
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, 199),
    fetchAllPages((from, to) =>
      client
        .from('sales_documents')
        .select(
          'id,business_id,invoice_no,customer_id,customer_name_snapshot,total_amount,paid_amount_at_sale,payment_method,occurred_at,created_at',
        )
        .eq('business_id', businessId)
        .order('occurred_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('sales_lines_read')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('purchases_documents')
        .select(
          'id,business_id,invoice_no,supplier_id,supplier_name_snapshot,reference_no,subtotal_amount,other_cost_total,total_amount,paid_amount_at_purchase,payment_method,occurred_at,created_at',
        )
        .eq('business_id', businessId)
        .order('occurred_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('purchase_lines_read')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('customer_receipts')
        .select(
          'id,business_id,receipt_no,customer_id,customer_name_snapshot,amount,payment_method,reference_no,note,received_at,created_at',
        )
        .eq('business_id', businessId)
        .order('received_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('customer_receipt_allocations')
        .select('*')
        .eq('business_id', businessId)
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('supplier_payments')
        .select(
          'id,business_id,payment_no,supplier_id,supplier_name_snapshot,amount,payment_method,reference_no,note,paid_at,created_at',
        )
        .eq('business_id', businessId)
        .order('paid_at', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('supplier_payment_allocations')
        .select('*')
        .eq('business_id', businessId)
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('business_expenses')
        .select(
          'id,business_id,category,amount,expense_date,payment_method,reference_no,note,status,void_reason,voided_at,created_at',
        )
        .eq('business_id', businessId)
        .order('expense_date', { ascending: false })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from('product_purchase_references')
        .select('*')
        .eq('business_id', businessId)
        .range(from, to),
    ),
  ]);

  const results = [
    products,
    categories,
    units,
    customers,
    suppliers,
    balances,
    costState,
    movements,
    sales,
    salesLines,
    purchases,
    purchaseLines,
    receipts,
    receiptAllocations,
    supplierPayments,
    supplierAllocations,
    expenses,
    purchaseRefs,
  ];
  const failed = results.find((result) => result.error);

  return {
    error: failed?.error ?? null,
    data: {
      products: products.data ?? [],
      categories: categories.data ?? [],
      units: units.data ?? [],
      customers: customers.data ?? [],
      suppliers: suppliers.data ?? [],
      balances: balances.data ?? [],
      costState: costState.data ?? [],
      movements: (movements.data ?? []).map((movement) => ({
        ...movement,
        unit_cost: null,
        value_delta: null,
      })),
      sales: sales.data ?? [],
      salesLines: salesLines.data ?? [],
      purchases: purchases.data ?? [],
      purchaseLines: purchaseLines.data ?? [],
      receipts: receipts.data ?? [],
      receiptAllocations: receiptAllocations.data ?? [],
      supplierPayments: supplierPayments.data ?? [],
      supplierAllocations: supplierAllocations.data ?? [],
      expenses: expenses.data ?? [],
      purchaseRefs: purchaseRefs.data ?? [],
    },
  };
}

export default function OperationsPanels({
  client,
  tenant,
  locale,
  module,
  onToggleLocale,
  onOpenDemo,
  onSettingsSaved,
}: {
  client: SupabaseClient<Database> | null;
  tenant: Tenant;
  locale: Locale;
  module: MainModule;
  onToggleLocale: () => void;
  onOpenDemo: () => void;
  onSettingsSaved: () => void;
}) {
  const businessId = tenant.business.id;
  const allow = (permission: Parameters<typeof can>[2]) =>
    can(tenant.member, tenant.permissions, permission);
  const [data, setData] = useState<LoadState>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadedBusinessId, setLoadedBusinessId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const isLoadingCurrentBusiness = loading || loadedBusinessId !== businessId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(todayDhaka());

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!client) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchOperationsData(client, businessId);
      if (requestId !== loadRequestRef.current) return;
      setError(result.error ? errorText(locale, result.error) : '');
      setData(result.data);
    } catch (caught) {
      if (requestId !== loadRequestRef.current) return;
      setError(errorText(locale, caught));
      setData(emptyData);
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoadedBusinessId(businessId);
        setLoading(false);
      }
    }
  }, [client, businessId, locale]);

  // Data fetching is state-free; React state is updated only in promise callbacks.
  // This avoids synchronously scheduling a render from the effect body and makes
  // request cancellation explicit when the active business/client changes.
  useEffect(() => {
    if (!client) return;
    let active = true;
    const requestId = ++loadRequestRef.current;

    void fetchOperationsData(client, businessId)
      .then((result) => {
        if (!active || requestId !== loadRequestRef.current) return;
        setError(result.error ? errorText(locale, result.error) : '');
        setData(result.data);
      })
      .catch((caught: unknown) => {
        if (!active || requestId !== loadRequestRef.current) return;
        setError(errorText(locale, caught));
        setData(emptyData);
      })
      .finally(() => {
        if (!active || requestId !== loadRequestRef.current) return;
        setLoadedBusinessId(businessId);
        setLoading(false);
      });

    return () => {
      active = false;
      loadRequestRef.current += 1;
    };
  }, [client, businessId, locale]);

  const dateMatches = useCallback(
    (value: string) => {
      const date = dateKeyDhaka(value);
      return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    },
    [dateFrom, dateTo],
  );
  const salesForPeriod = useMemo(
    () => data.sales.filter((sale) => dateMatches(sale.occurred_at)),
    [data.sales, dateMatches],
  );
  const purchasesForPeriod = useMemo(
    () =>
      data.purchases.filter((purchase) => dateMatches(purchase.occurred_at)),
    [data.purchases, dateMatches],
  );
  const expensesForPeriod = useMemo(
    () =>
      data.expenses.filter(
        (expense) =>
          expense.status === 'ACTIVE' && dateMatches(expense.expense_date),
      ),
    [data.expenses, dateMatches],
  );
  const totalSales = salesForPeriod.reduce(
    (sum, sale) => sum + moneyNumber(sale.total_amount),
    0,
  );
  const totalPurchases = purchasesForPeriod.reduce(
    (sum, purchase) => sum + moneyNumber(purchase.total_amount),
    0,
  );
  const totalExpenses = expensesForPeriod.reduce(
    (sum, expense) => sum + moneyNumber(expense.amount),
    0,
  );
  const totalKnownCogs = salesForPeriod.reduce(
    (sum, sale) =>
      sum +
      data.salesLines
        .filter(
          (line) =>
            line.sales_document_id === sale.id && line.cogs_amount !== null,
        )
        .reduce((part, line) => part + moneyNumber(line.cogs_amount), 0),
    0,
  );
  const hasUnknownCosts = salesForPeriod.some((sale) =>
    data.salesLines.some(
      (line) =>
        line.sales_document_id === sale.id && line.costing_status === 'UNKNOWN',
    ),
  );
  const customerDue = (customerId: string) =>
    data.sales
      .filter((sale) => sale.customer_id === customerId)
      .reduce(
        (sum, sale) => sum + dueForSale(sale, data.receiptAllocations),
        0,
      );
  const supplierDue = (supplierId: string) =>
    data.purchases
      .filter((purchase) => purchase.supplier_id === supplierId)
      .reduce(
        (sum, purchase) =>
          sum + dueForPurchase(purchase, data.supplierAllocations),
        0,
      );
  const runAction = async (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await action();
      if (result.error)
        throw new Error(
          result.error.message || result.error.code || 'database_error',
        );
      setNotice(success);
      setLoading(true);
      await load();
      return result.data ?? true;
    } catch (caught) {
      setError(errorText(locale, caught));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const panelTitle: Record<MainModule, string> = {
    home: t(locale, 'হোম', 'Home'),
    shops: t(locale, 'দোকানদারের তালিকা', 'Shop Directory'),
    sales: t(locale, 'বিক্রি', 'Sales / POS'),
    purchases: t(locale, 'কেনাকাটা', 'Purchases'),
    stock: t(locale, 'স্টক লেজার', 'Stock Ledger'),
    dues: t(locale, 'ক্রেতার বাকি', 'Customer Dues'),
    expenses: t(locale, 'খরচ', 'Expenses'),
    estimator: t(locale, 'লাভের হিসাব', 'Profit Estimator'),
    reports: t(locale, 'রিপোর্ট', 'Reports'),
    transactions: t(locale, 'ইনভয়েস ও লেনদেন', 'Invoices & Transactions'),
    settings: t(locale, 'সেটিংস', 'Settings'),
  };

  return (
    <div className="ops-workspace">
      <div className="ops-panel-heading">
        <div>
          <h2>{panelTitle[module]}</h2>
          <p className="md-muted">
            {t(
              locale,
              'সব হিসাব নির্বাচিত ব্যবসার Supabase ডেটাবেসের সঙ্গে যুক্ত।',
              'Records are loaded from the selected business database.',
            )}
          </p>
        </div>
        <div className="md-toolbar-actions">
          <button
            type="button"
            className="button md-small-button"
            onClick={() => {
              setLoading(true);
              setError('');
              void load();
            }}
            disabled={isLoadingCurrentBusiness || busy}
          >
            {t(locale, 'রিফ্রেশ', 'Refresh')}
          </button>
        </div>
      </div>
      {error && (
        <div className="md-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="ops-notice" role="status">
          {notice}
        </div>
      )}
      {!client ? (
        <Empty>
          {t(
            locale,
            'ডেটাবেস সংযোগ কনফিগার করা নেই।',
            'Database connection is not configured.',
          )}
        </Empty>
      ) : isLoadingCurrentBusiness ? (
        <Empty>
          {t(
            locale,
            'ডেটাবেস থেকে তথ্য আনা হচ্ছে…',
            'Loading business records…',
          )}
        </Empty>
      ) : (
        <>
          {module === 'home' && (
            <HomePanel
              data={data}
              locale={locale}
              allow={allow}
              format={formatMoney}
              onJump={(section) =>
                window.dispatchEvent(
                  new CustomEvent('mini-erp-navigate', { detail: section }),
                )
              }
            />
          )}
          {module === 'shops' && (
            <ShopsPanel
              data={data}
              client={client}
              businessId={businessId}
              locale={locale}
              allow={allow}
              format={formatMoney}
              due={customerDue}
              query={query}
              setQuery={setQuery}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'sales' && (
            <SalesPanel
              data={data}
              client={client}
              businessId={businessId}
              locale={locale}
              allow={allow}
              format={formatMoney}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'purchases' && (
            <PurchasesPanel
              data={data}
              client={client}
              businessId={businessId}
              locale={locale}
              allow={allow}
              format={formatMoney}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'stock' && (
            <StockPanel
              data={data}
              client={client}
              locale={locale}
              allow={allow}
              format={formatMoney}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'dues' && (
            <DuesPanel
              data={data}
              client={client}
              businessId={businessId}
              locale={locale}
              allow={allow}
              format={formatMoney}
              customerDue={customerDue}
              supplierDue={supplierDue}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'expenses' && (
            <ExpensesPanel
              data={data}
              client={client}
              businessId={businessId}
              locale={locale}
              allow={allow}
              format={formatMoney}
              busy={busy}
              runAction={runAction}
            />
          )}
          {module === 'estimator' && (
            <EstimatorPanel locale={locale} format={formatMoney} data={data} />
          )}
          {module === 'reports' && (
            <ReportsPanel
              data={data}
              locale={locale}
              allow={allow}
              format={formatMoney}
              sales={salesForPeriod}
              purchases={purchasesForPeriod}
              expenses={expensesForPeriod}
              totalSales={totalSales}
              totalPurchases={totalPurchases}
              totalExpenses={totalExpenses}
              cogs={totalKnownCogs}
              hasUnknownCosts={hasUnknownCosts}
              dueForCustomer={customerDue}
              dueForSupplier={supplierDue}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
          )}
          {module === 'transactions' && (
            <TransactionsPanel
              data={data}
              locale={locale}
              allow={allow}
              format={formatMoney}
              query={query}
              setQuery={setQuery}
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
          )}
          {module === 'settings' && (
            <SettingsPanel
              client={client}
              tenant={tenant}
              locale={locale}
              onToggleLocale={onToggleLocale}
              onOpenDemo={onOpenDemo}
              onSettingsSaved={onSettingsSaved}
              busy={busy}
              runAction={runAction}
            />
          )}
        </>
      )}
    </div>
  );
}

function HomePanel({
  data,
  locale,
  allow,
  format,
  onJump,
}: {
  data: LoadState;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  onJump: (section: MainModule) => void;
}) {
  const today = todayDhaka();
  const todaysSales = data.sales.filter(
    (sale) => dateKeyDhaka(sale.occurred_at) === today,
  );
  const todaysExpenses = data.expenses.filter(
    (expense) => expense.status === 'ACTIVE' && expense.expense_date === today,
  );
  const todaysLines = data.salesLines.filter((line) =>
    todaysSales.some((sale) => sale.id === line.sales_document_id),
  );
  const unknownCogs = todaysLines.some(
    (line) => line.costing_status === 'UNKNOWN',
  );
  const due = data.sales.reduce(
    (sum, sale) => sum + dueForSale(sale, data.receiptAllocations),
    0,
  );
  const revenue = todaysSales.reduce(
    (sum, sale) => sum + moneyNumber(sale.total_amount),
    0,
  );
  const cogs = todaysLines.reduce(
    (sum, line) => sum + moneyNumber(line.cogs_amount),
    0,
  );
  const expense = todaysExpenses.reduce(
    (sum, row) => sum + moneyNumber(row.amount),
    0,
  );
  const canSeeExpenses = allow('expenses.view') || allow('reports.view');
  const weekStart = new Date(`${today}T12:00:00+06:00`);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  });
  const weekAmounts = weekLabels.map((date) =>
    data.sales
      .filter((sale) => dateKeyDhaka(sale.occurred_at) === date)
      .reduce((sum, sale) => sum + moneyNumber(sale.total_amount), 0),
  );
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(weekStart.getDate() - 7);
  const previousWeekLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(previousWeekStart);
    date.setDate(previousWeekStart.getDate() + index);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  });
  const previousWeekTotal = previousWeekLabels.reduce(
    (sum, date) =>
      sum +
      data.sales
        .filter((sale) => dateKeyDhaka(sale.occurred_at) === date)
        .reduce((daily, sale) => daily + moneyNumber(sale.total_amount), 0),
    0,
  );
  const currentWeekTotal = weekAmounts.reduce((sum, amount) => sum + amount, 0);
  const bestDayIndex = weekAmounts.indexOf(Math.max(...weekAmounts));
  const worstDayIndex = weekAmounts.indexOf(Math.min(...weekAmounts));
  const maxWeek = Math.max(...weekAmounts, 1);
  const lowStock = data.products.filter(
    (product) =>
      product.minimum_stock !== null &&
      moneyNumber(
        data.balances.find((balance) => balance.product_id === product.id)
          ?.quantity,
      ) <= moneyNumber(product.minimum_stock),
  );
  return (
    <>
      <div className="ops-welcome">
        <div>
          <h3>
            {t(locale, 'স্বাগতম', 'Welcome')} {locale === 'bn' ? '👋' : '👋'}
          </h3>
          <p>
            {t(
              locale,
              'দৈনন্দিন কাজ এখান থেকে শুরু করো। সব অঙ্ক সংরক্ষিত লেনদেন থেকে হিসাব করা হয়।',
              'Start everyday work here. Figures are derived from saved transactions.',
            )}
          </p>
        </div>
        <div className="md-toolbar-actions">
          <button
            className="button auth-primary"
            onClick={() => onJump('sales')}
          >
            {t(locale, 'বিক্রি করুন', 'New sale')}
          </button>
          <button className="button" onClick={() => onJump('purchases')}>
            {t(locale, 'পণ্য কিনুন', 'New purchase')}
          </button>
        </div>
      </div>
      <div className="ops-summary-grid">
        <SummaryCard
          label={t(locale, 'আজকের বিক্রি', "Today's sales")}
          value={allow('sales.view') ? format(locale, revenue) : '—'}
          note={
            allow('sales.view')
              ? `${todaysSales.length} ${t(locale, 'টি ইনভয়েস', 'invoices')}`
              : t(locale, 'অনুমতি প্রয়োজন', 'Permission required')
          }
        />
        <SummaryCard
          label={t(locale, 'আজকের লাভ', "Today's profit")}
          value={
            allow('profit.read') && canSeeExpenses && !unknownCogs
              ? format(locale, revenue - cogs - expense)
              : '—'
          }
          note={
            !allow('profit.read')
              ? t(
                  locale,
                  'লাভ দেখার অনুমতি প্রয়োজন',
                  'Profit permission required',
                )
              : unknownCogs
                ? t(
                    locale,
                    'কিছু পণ্যের প্রকৃত ক্রয়মূল্য অজানা',
                    'Cost unknown for some items',
                  )
                : !canSeeExpenses
                  ? t(
                      locale,
                      'খরচ দেখার অনুমতি প্রয়োজন',
                      'Expense visibility permission required',
                    )
                  : t(locale, 'বিক্রি − COGS − খরচ', 'Sales − COGS − expenses')
          }
        />
        <SummaryCard
          label={t(locale, 'ক্রেতার কাছে পাওনা', 'Customer receivables')}
          value={
            allow('sales.view') && allow('payments.receive')
              ? format(locale, due)
              : '—'
          }
          note={t(
            locale,
            'বকেয়া ইনভয়েস ও বরাদ্দকৃত পেমেন্ট',
            'Open invoices minus allocated receipts',
          )}
        />
        <SummaryCard
          label={t(locale, 'আজকের খরচ', "Today's expenses")}
          value={allow('expenses.view') ? format(locale, expense) : '—'}
          note={`${todaysExpenses.length} ${t(locale, 'টি রেকর্ড', 'records')}`}
        />
      </div>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'গত ৭ দিনের বিক্রি', 'Sales for the last 7 days')}</h3>
          <span className="md-muted">
            {t(locale, 'সার্ভার-সংরক্ষিত ইনভয়েস', 'Saved sales invoices')}
          </span>
        </div>
        {!allow('sales.view') &&
        !allow('reports.view') &&
        !allow('invoices.read') ? (
          <Empty>
            {t(
              locale,
              'বিক্রির রিপোর্ট দেখতে অনুমতি প্রয়োজন।',
              'Sales viewing permission is required.',
            )}
          </Empty>
        ) : (
          <>
            <div className="ops-chart">
              {weekLabels.map((day, index) => (
                <div className="ops-chart-item" key={day}>
                  <span title={format(locale, weekAmounts[index])}>
                    {format(locale, weekAmounts[index])}
                  </span>
                  <div className="ops-chart-track">
                    <div
                      className="ops-chart-bar"
                      style={{
                        height: `${Math.max(5, (weekAmounts[index] / maxWeek) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {new Intl.DateTimeFormat(
                      locale === 'bn' ? 'bn-BD' : 'en-BD',
                      { weekday: 'short', timeZone: 'Asia/Dhaka' },
                    ).format(new Date(`${day}T12:00:00+06:00`))}
                  </small>
                </div>
              ))}
            </div>
            <div className="ops-period-summary">
              <span>
                {t(locale, 'গত ৭ দিনের মোট', 'Last 7 days')}:{' '}
                <strong>{format(locale, currentWeekTotal)}</strong>
              </span>
              <span>
                {t(locale, 'আগের ৭ দিনের তুলনায়', 'vs previous 7 days')}:{' '}
                <strong>
                  {currentWeekTotal >= previousWeekTotal ? '+' : '−'}
                  {format(
                    locale,
                    Math.abs(currentWeekTotal - previousWeekTotal),
                  )}
                </strong>
              </span>
              <span>
                {t(locale, 'সর্বোচ্চ দিন', 'Highest day')}:{' '}
                <strong>{weekLabels[bestDayIndex]}</strong>
              </span>
              <span>
                {t(locale, 'সর্বনিম্ন দিন', 'Lowest day')}:{' '}
                <strong>{weekLabels[worstDayIndex]}</strong>
              </span>
            </div>
          </>
        )}
      </section>
      <div className="ops-two-col">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'কম স্টকের পণ্য', 'Low-stock products')}</h3>
            <button
              className="button md-small-button"
              onClick={() => onJump('stock')}
            >
              {t(locale, 'স্টক দেখুন', 'View stock')}
            </button>
          </div>
          {!allow('inventory.view') ? (
            <Empty>
              {t(
                locale,
                'স্টক দেখতে inventory.view অনুমতি প্রয়োজন।',
                'Grant inventory.view to view low-stock products.',
              )}
            </Empty>
          ) : lowStock.length === 0 ? (
            <Empty>
              {t(locale, 'কম স্টকের পণ্য নেই।', 'No low-stock products.')}
            </Empty>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'পণ্য', 'Product')}</th>
                    <th>{t(locale, 'বর্তমান', 'Current')}</th>
                    <th>{t(locale, 'সর্বনিম্ন', 'Minimum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.slice(0, 8).map((product) => (
                    <tr key={product.id}>
                      <td>{product.name_bn}</td>
                      <td>
                        {moneyNumber(
                          data.balances.find(
                            (balance) => balance.product_id === product.id,
                          )?.quantity,
                        )}
                      </td>
                      <td>{moneyNumber(product.minimum_stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'সাম্প্রতিক বিক্রি', 'Recent sales')}</h3>
            <button
              className="button md-small-button"
              onClick={() => onJump('transactions')}
            >
              {t(locale, 'সব দেখুন', 'View all')}
            </button>
          </div>
          {!allow('sales.view') ? (
            <Empty>{t(locale, 'অনুমতি প্রয়োজন', 'Permission required')}</Empty>
          ) : data.sales.length === 0 ? (
            <Empty>
              {t(
                locale,
                'এখনো কোনো বিক্রি সংরক্ষিত হয়নি।',
                'No saved sales yet.',
              )}
            </Empty>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'ইনভয়েস', 'Invoice')}</th>
                    <th>{t(locale, 'ক্রেতা', 'Customer')}</th>
                    <th>{t(locale, 'মোট', 'Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.slice(0, 6).map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        {sale.invoice_no}
                        <small>{formatDate(locale, sale.occurred_at)}</small>
                      </td>
                      <td>{sale.customer_name_snapshot}</td>
                      <td>
                        {format(locale, sale.total_amount)}
                        <small>
                          {t(locale, 'বাকি', 'Due')}:{' '}
                          {(allow('sales.view') && allow('payments.receive')) ||
                          allow('reports.view') ||
                          allow('invoices.read')
                            ? format(
                                locale,
                                dueForSale(sale, data.receiptAllocations),
                              )
                            : '—'}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ShopsPanel({
  data,
  client,
  businessId,
  locale,
  allow,
  format,
  due,
  query,
  setQuery,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  businessId: string;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  due: (id: string) => number;
  query: string;
  setQuery: (value: string) => void;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    owner_name: '',
    shop_number: '',
    phone: '',
    shop_code: '',
    email: '',
    address: '',
    linked_supplier_id: '',
  });
  const shops = data.customers.filter(
    (customer) =>
      customer.customer_type === 'SHOP' &&
      (showArchived
        ? customer.archived_at !== null
        : customer.archived_at === null),
  );
  const canSeeSales =
    allow('sales.view') || allow('reports.view') || allow('invoices.read');
  const canSeeCustomerDue =
    (allow('payments.receive') && canSeeSales) ||
    allow('reports.view') ||
    allow('invoices.read');
  const canSeePurchases =
    allow('purchases.view') || allow('reports.view') || allow('invoices.read');
  const canSeeSupplierDue =
    (allow('payments.pay') && canSeePurchases) ||
    allow('reports.view') ||
    allow('invoices.read');
  const selected = shops.find((shop) => shop.id === selectedId) ?? null;
  const write = (key: keyof typeof draft, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const clear = () => {
    setEditId(null);
    setDraft({
      name: '',
      owner_name: '',
      shop_number: '',
      phone: '',
      shop_code: '',
      email: '',
      address: '',
      linked_supplier_id: '',
    });
  };
  const beginEdit = (shop: Customer) => {
    setSelectedId(null);
    setEditId(shop.id);
    setDraft({
      name: shop.name,
      owner_name: shop.owner_name ?? '',
      shop_number: shop.shop_number ?? '',
      phone: shop.phone ?? '',
      shop_code: shop.shop_code ?? '',
      email: shop.email ?? '',
      address: shop.address ?? '',
      linked_supplier_id: shop.linked_supplier_id ?? '',
    });
  };
  const validBdMobile = (value: string) =>
    /^(?:\+?88)?01[3-9]\d{8}$/.test(value.trim().replace(/[\s()-]/g, ''));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client) return;
    if (
      !draft.name.trim() ||
      !draft.owner_name.trim() ||
      !draft.shop_code.trim()
    ) {
      window.alert(
        t(
          locale,
          'দোকানের নাম, মালিকের নাম ও ইউনিক কোড দিতে হবে।',
          'Shop name, owner name and unique shop code are required.',
        ),
      );
      return;
    }
    if (!validBdMobile(draft.phone)) {
      window.alert(
        t(
          locale,
          'বাংলাদেশের সঠিক মোবাইল নম্বর দাও (01XXXXXXXXX)।',
          'Enter a valid Bangladesh mobile number (01XXXXXXXXX).',
        ),
      );
      return;
    }
    if (
      draft.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
    ) {
      window.alert(
        t(locale, 'ইমেইল ঠিকানাটি যাচাই করো।', 'Enter a valid email address.'),
      );
      return;
    }
    const payload = {
      customer_type: 'SHOP' as const,
      name: draft.name.trim(),
      owner_name: draft.owner_name.trim(),
      shop_number: draft.shop_number.trim() || null,
      phone: draft.phone.trim(),
      shop_code: draft.shop_code.trim().toUpperCase(),
      email: draft.email.trim() || null,
      address: draft.address.trim() || null,
      linked_supplier_id: draft.linked_supplier_id || null,
    };
    const result = await runAction(
      async () =>
        editId
          ? await client
              .from('customers')
              .update(payload)
              .eq('business_id', businessId)
              .eq('id', editId)
          : await client
              .from('customers')
              .insert({ ...payload, business_id: businessId }),
      t(locale, 'দোকানের তথ্য সংরক্ষণ করা হয়েছে।', 'Shop saved successfully.'),
    );
    if (result !== null) {
      clear();
      setQuery('');
    }
  };
  const archive = async (shop: Customer) => {
    if (
      !client ||
      !window.confirm(
        t(
          locale,
          `${shop.name} সক্রিয় তালিকা থেকে আর্কাইভ করবে? পুরোনো হিসাব মুছে যাবে না।`,
          `Archive ${shop.name} from the active list? Historical records will be preserved.`,
        ),
      )
    )
      return;
    const result = await runAction(
      () =>
        client
          .from('customers')
          .update({ archived_at: new Date().toISOString() })
          .eq('business_id', businessId)
          .eq('id', shop.id),
      t(
        locale,
        'দোকান আর্কাইভ হয়েছে; পুরোনো হিসাব অক্ষত আছে।',
        'Shop archived; historical records are preserved.',
      ),
    );
    if (result !== null) setSelectedId(null);
  };
  const restore = async (shop: Customer) => {
    if (
      !client ||
      !window.confirm(
        t(
          locale,
          `${shop.name} আবার সক্রিয় তালিকায় আনবে?`,
          `Restore ${shop.name} to the active directory?`,
        ),
      )
    )
      return;
    const result = await runAction(
      () =>
        client
          .from('customers')
          .update({ archived_at: null })
          .eq('business_id', businessId)
          .eq('id', shop.id),
      t(locale, 'দোকানটি আবার সক্রিয় করা হয়েছে।', 'Shop restored.'),
    );
    if (result !== null) setSelectedId(null);
  };
  if (!allow('customers.view') && !allow('customers.manage'))
    return (
      <Empty>
        {t(
          locale,
          'দোকানের তালিকা দেখতে customers.view বা customers.manage অনুমতি প্রয়োজন।',
          'Grant customers.view or customers.manage to access the shop directory.',
        )}
      </Empty>
    );
  if (selected) {
    const saleTotal = data.sales
      .filter((sale) => sale.customer_id === selected.id)
      .reduce((sum, sale) => sum + moneyNumber(sale.total_amount), 0);
    const supplierTotal = selected.linked_supplier_id
      ? data.purchases
          .filter(
            (purchase) => purchase.supplier_id === selected.linked_supplier_id,
          )
          .reduce(
            (sum, purchase) => sum + moneyNumber(purchase.total_amount),
            0,
          )
      : 0;
    const shopSales = data.sales.filter(
      (sale) => sale.customer_id === selected.id,
    );
    const shopTransactions = [
      ...(canSeeSales
        ? shopSales.map((sale) => ({
            kind: 'SALE' as const,
            id: sale.id,
            reference: sale.invoice_no,
            occurred: sale.occurred_at,
            amount: moneyNumber(sale.total_amount),
            due: dueForSale(sale, data.receiptAllocations),
          }))
        : []),
      ...(canSeePurchases && selected.linked_supplier_id
        ? data.purchases
            .filter(
              (purchase) =>
                purchase.supplier_id === selected.linked_supplier_id,
            )
            .map((purchase) => ({
              kind: 'PURCHASE' as const,
              id: purchase.id,
              reference: purchase.invoice_no,
              occurred: purchase.occurred_at,
              amount: moneyNumber(purchase.total_amount),
              due: dueForPurchase(purchase, data.supplierAllocations),
            }))
        : []),
    ]
      .filter(
        (row) =>
          (!dateFrom || dateKeyDhaka(row.occurred) >= dateFrom) &&
          (!dateTo || dateKeyDhaka(row.occurred) <= dateTo),
      )
      .sort((a, b) => b.occurred.localeCompare(a.occurred));
    return (
      <div className="ops-section">
        <div className="ops-section-title">
          <h3>{selected.name}</h3>
          <div className="md-toolbar-actions">
            <button
              type="button"
              className="button"
              onClick={() => setSelectedId(null)}
            >
              {t(locale, 'ফিরে যান', 'Back')}
            </button>
            {allow('products.manage') && (
              <button
                type="button"
                className="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('mini-erp-navigate', {
                      detail: 'products',
                    }),
                  )
                }
              >
                {t(locale, 'পণ্য যোগ / দেখুন', 'Add / view products')}
              </button>
            )}
            {allow('customers.manage') &&
              (selected.archived_at ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => void restore(selected)}
                  disabled={busy}
                >
                  {t(locale, 'আবার সক্রিয়', 'Restore')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="button"
                    onClick={() => beginEdit(selected)}
                  >
                    {t(locale, 'সম্পাদনা', 'Edit')}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void archive(selected)}
                    disabled={busy}
                  >
                    {t(locale, 'আর্কাইভ', 'Archive')}
                  </button>
                </>
              ))}
          </div>
        </div>
        <div className="ops-summary-grid">
          <SummaryCard
            label={t(locale, 'মোট বিক্রি', 'Total sales')}
            value={canSeeSales ? format(locale, saleTotal) : '—'}
          />
          <SummaryCard
            label={t(locale, 'মোট কেনাকাটা', 'Total purchases')}
            value={canSeePurchases ? format(locale, supplierTotal) : '—'}
            note={
              selected.linked_supplier_id
                ? t(
                    locale,
                    'লিংক করা সাপ্লায়ারের ক্রয়',
                    'Linked supplier purchases',
                  )
                : t(locale, 'সাপ্লায়ার লিংক করা হয়নি', 'No linked supplier')
            }
          />
          <SummaryCard
            label={t(locale, 'বর্তমান পাওনা', 'Outstanding due')}
            value={canSeeCustomerDue ? format(locale, due(selected.id)) : '—'}
          />
        </div>
        <div className="ops-detail-grid">
          <p>
            <strong>{t(locale, 'দোকান কোড', 'Shop code')}:</strong>{' '}
            {selected.shop_code}
          </p>
          <p>
            <strong>{t(locale, 'মালিক', 'Owner')}:</strong>{' '}
            {selected.owner_name}
          </p>
          <p>
            <strong>{t(locale, 'দোকান নম্বর', 'Shop number')}:</strong>{' '}
            {selected.shop_number || '—'}
          </p>
          <p>
            <strong>{t(locale, 'মোবাইল', 'Mobile')}:</strong> {selected.phone}
          </p>
          <p>
            <strong>Email:</strong> {selected.email || '—'}
          </p>
          <p>
            <strong>{t(locale, 'ঠিকানা', 'Address')}:</strong>{' '}
            {selected.address || '—'}
          </p>
        </div>
        <h3>{t(locale, 'লেনদেনের ইতিহাস', 'Transaction history')}</h3>
        <div className="ops-filter-row">
          <Field
            label={t(locale, 'শুরু তারিখ', 'From date')}
            value={dateFrom}
            onChange={setDateFrom}
            type="date"
          />
          <Field
            label={t(locale, 'শেষ তারিখ', 'To date')}
            value={dateTo}
            onChange={setDateTo}
            type="date"
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            {t(locale, 'তারিখ রিসেট', 'Reset dates')}
          </button>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'ধরন', 'Type')}</th>
                <th>{t(locale, 'ইনভয়েস', 'Invoice')}</th>
                <th>{t(locale, 'তারিখ', 'Date')}</th>
                <th>{t(locale, 'মোট', 'Total')}</th>
                <th>{t(locale, 'বাকি', 'Due')}</th>
              </tr>
            </thead>
            <tbody>
              {shopTransactions.map((row) => (
                <tr key={`${row.kind}:${row.id}`}>
                  <td>
                    {row.kind === 'SALE'
                      ? t(locale, 'বিক্রি', 'Sale')
                      : t(locale, 'কেনাকাটা', 'Purchase')}
                  </td>
                  <td>{row.reference}</td>
                  <td>{formatDate(locale, row.occurred)}</td>
                  <td>{format(locale, row.amount)}</td>
                  <td>
                    {row.kind === 'SALE'
                      ? canSeeCustomerDue
                        ? format(locale, row.due)
                        : '—'
                      : canSeeSupplierDue
                        ? format(locale, row.due)
                        : '—'}
                  </td>
                </tr>
              ))}
              {shopTransactions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    {!canSeeSales && !canSeePurchases
                      ? t(
                          locale,
                          'লেনদেনের ইতিহাস দেখতে sales.view বা purchases.view অনুমতি প্রয়োজন।',
                          'Grant sales.view or purchases.view to view transaction history.',
                        )
                      : t(
                          locale,
                          'এই তারিখের মধ্যে দেখানোর মতো লেনদেন নেই।',
                          'No visible transactions in this date range.',
                        )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <>
      {allow('customers.manage') && (
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>
              {t(
                locale,
                editId ? 'দোকানের তথ্য সম্পাদনা' : 'নতুন দোকান যোগ করুন',
                editId ? 'Edit shop' : 'Add a shop',
              )}
            </h3>
          </div>
          <form className="md-form" onSubmit={(event) => void save(event)}>
            <div className="md-formgrid">
              <Field
                label={t(locale, 'দোকানের নাম', 'Shop name')}
                value={draft.name}
                onChange={(value) => write('name', value)}
                required
              />
              <Field
                label={t(locale, 'মালিকের নাম', 'Owner name')}
                value={draft.owner_name}
                onChange={(value) => write('owner_name', value)}
                required
              />
              <Field
                label={t(locale, 'দোকান নম্বর', 'Shop number')}
                value={draft.shop_number}
                onChange={(value) => write('shop_number', value)}
              />
              <Field
                label={t(locale, 'মোবাইল নম্বর', 'Mobile number')}
                value={draft.phone}
                onChange={(value) => write('phone', value)}
                required
                placeholder="01XXXXXXXXX"
              />
              <Field
                label={t(locale, 'ইউনিক দোকান কোড', 'Unique shop code')}
                value={draft.shop_code}
                onChange={(value) => write('shop_code', value)}
                required
              />
              <Field
                label={t(locale, 'ইমেইল (ঐচ্ছিক)', 'Email (optional)')}
                value={draft.email}
                onChange={(value) => write('email', value)}
                type="email"
              />
              <Field
                label={t(locale, 'ঠিকানা (ঐচ্ছিক)', 'Address (optional)')}
                value={draft.address}
                onChange={(value) => write('address', value)}
              />
              <SelectField
                label={t(
                  locale,
                  'সাপ্লায়ার লিংক (ঐচ্ছিক)',
                  'Link supplier (optional)',
                )}
                value={draft.linked_supplier_id}
                onChange={(value) => write('linked_supplier_id', value)}
              >
                <option value="">
                  {t(locale, 'লিংক নেই', 'No linked supplier')}
                </option>
                {data.suppliers
                  .filter((supplier) => supplier.archived_at === null)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </SelectField>
            </div>
            <div className="md-formactions">
              <button
                type="submit"
                className="button auth-primary"
                disabled={busy}
              >
                {editId
                  ? t(locale, 'পরিবর্তন সংরক্ষণ', 'Save changes')
                  : t(locale, 'দোকান সংরক্ষণ', 'Save shop')}
              </button>
              {editId && (
                <button type="button" className="button" onClick={clear}>
                  {t(locale, 'বাতিল', 'Cancel')}
                </button>
              )}
            </div>
          </form>
        </section>
      )}
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'দোকানের তালিকা', 'Shop directory')}</h3>
          <div className="md-toolbar-actions">
            <button
              type="button"
              className="button md-small-button"
              onClick={() => setShowArchived((old) => !old)}
            >
              {showArchived
                ? t(locale, 'সক্রিয় দোকান', 'Active shops')
                : t(locale, 'আর্কাইভ করা দোকান', 'Archived shops')}
            </button>
            <span className="md-muted">
              {shops.length}{' '}
              {showArchived
                ? t(locale, 'টি আর্কাইভ করা দোকান', 'archived shops')
                : t(locale, 'টি সক্রিয় দোকান', 'active shops')}
            </span>
          </div>
        </div>
        <label className="md-search">
          <span>{t(locale, 'খুঁজুন', 'Search')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              locale,
              'দোকান, কোড, মালিক বা মোবাইল',
              'Shop, code, owner or mobile',
            )}
          />
        </label>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'দোকান', 'Shop')}</th>
                <th>{t(locale, 'কোড / মালিক', 'Code / Owner')}</th>
                <th>{t(locale, 'মোবাইল', 'Mobile')}</th>
                <th>{t(locale, 'বিক্রি', 'Sales')}</th>
                <th>{t(locale, 'কেনাকাটা', 'Purchases')}</th>
                <th>{t(locale, 'পাওনা', 'Due')}</th>
                <th>{t(locale, 'কাজ', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shops
                .filter((shop) =>
                  [shop.name, shop.shop_code, shop.owner_name, shop.phone].some(
                    (value) =>
                      (value ?? '').toLowerCase().includes(query.toLowerCase()),
                  ),
                )
                .map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <button
                        type="button"
                        className="ops-link"
                        onClick={() => {
                          setSelectedId(shop.id);
                          setDateFrom('');
                          setDateTo('');
                        }}
                      >
                        {shop.name}
                      </button>
                    </td>
                    <td>
                      {shop.shop_code}
                      <small>{shop.owner_name}</small>
                    </td>
                    <td>{shop.phone}</td>
                    <td>
                      {canSeeSales
                        ? format(
                            locale,
                            data.sales
                              .filter((sale) => sale.customer_id === shop.id)
                              .reduce(
                                (sum, sale) =>
                                  sum + moneyNumber(sale.total_amount),
                                0,
                              ),
                          )
                        : '—'}
                    </td>
                    <td>
                      {canSeePurchases
                        ? format(
                            locale,
                            shop.linked_supplier_id
                              ? data.purchases
                                  .filter(
                                    (purchase) =>
                                      purchase.supplier_id ===
                                      shop.linked_supplier_id,
                                  )
                                  .reduce(
                                    (sum, purchase) =>
                                      sum + moneyNumber(purchase.total_amount),
                                    0,
                                  )
                              : 0,
                          )
                        : '—'}
                    </td>
                    <td>
                      {canSeeCustomerDue ? format(locale, due(shop.id)) : '—'}
                    </td>
                    <td>
                      <div className="md-rowactions">
                        <button
                          type="button"
                          className="button md-small-button"
                          onClick={() => {
                            setSelectedId(shop.id);
                            setDateFrom('');
                            setDateTo('');
                          }}
                        >
                          {t(locale, 'বিস্তারিত', 'Details')}
                        </button>
                        {allow('customers.manage') &&
                          (showArchived ? (
                            <button
                              type="button"
                              className="button md-small-button"
                              onClick={() => void restore(shop)}
                              disabled={busy}
                            >
                              {t(locale, 'আবার সক্রিয়', 'Restore')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button md-small-button"
                              onClick={() => beginEdit(shop)}
                            >
                              {t(locale, 'এডিট', 'Edit')}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              {shops.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {t(
                      locale,
                      'এখনো কোনো দোকান যোগ করা হয়নি।',
                      'No shops added yet.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SalesPanel({
  data,
  client,
  businessId,
  locale,
  allow,
  format,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  businessId: string;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lastInvoice, setLastInvoice] = useState('');
  const total = cartTotal(cart);
  const operation = useMemo(
    () => ({ id: newOperationId(), occurredAt: new Date().toISOString() }),
    [cart, customerId, paid, method],
  );
  const canOverride = allow('sales.price_override');
  const stockFor = (id: string) =>
    moneyNumber(
      data.balances.find((balance) => balance.product_id === id)?.quantity,
    );
  const add = (product: Product) =>
    setCart((old) => {
      const exists = old.find((line) => line.product_id === product.id);
      if (exists)
        return old.map((line) =>
          line.product_id === product.id
            ? { ...line, quantity: String(moneyNumber(line.quantity) + 1) }
            : line,
        );
      return [
        ...old,
        {
          product_id: product.id,
          quantity: '1',
          unit_price: String(product.default_selling_price),
        },
      ];
    });
  const setLine = (id: string, key: keyof CartLine, value: string) =>
    setCart((old) =>
      old.map((line) =>
        line.product_id === id ? { ...line, [key]: value } : line,
      ),
    );
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || cart.length === 0) return;
    const totalNumber = moneyNumber(total);
    if (
      !Number.isFinite(Number(paid)) ||
      Number(paid) < 0 ||
      Number(paid) > totalNumber
    ) {
      window.alert(
        t(
          locale,
          'পরিশোধিত টাকা মোটের মধ্যে হতে হবে।',
          'Paid amount must be between zero and the total.',
        ),
      );
      return;
    }
    if (Number(paid) < totalNumber && !customerId) {
      window.alert(
        t(
          locale,
          'বাকিতে বিক্রির জন্য নির্দিষ্ট ক্রেতা বেছে নাও।',
          'Choose a customer for a credit sale.',
        ),
      );
      return;
    }
    const summary = cart
      .map(
        (line) =>
          `${data.products.find((product) => product.id === line.product_id)?.name_bn ?? line.product_id}: ${line.quantity} × ${line.unit_price} = ${lineTotal(line.quantity, line.unit_price) ?? '—'}`,
      )
      .join('\n');
    const preview = `${t(locale, 'পণ্যসমূহ', 'Items')}\n${summary}\n${t(locale, 'মোট', 'Total')}: ${total}\n${t(locale, 'পরিশোধ', 'Paid')}: ${paid}\n${t(locale, 'বাকি', 'Due')}: ${Math.max(0, totalNumber - Number(paid))}`;
    if (
      !window.confirm(
        t(
          locale,
          `বিক্রির তথ্য যাচাই করো:\n${preview}\n\nস্টক পরিবর্তন ও ইনভয়েস সংরক্ষণ করবে?`,
          `Review sale:\n${preview}\n\nCommit stock change and invoice?`,
        ),
      )
    )
      return;
    const result = (await runAction(
      () =>
        client.rpc('post_sale', {
          p_business_id: businessId,
          p_customer_id: customerId || null,
          p_lines: cart.map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            unit_price: line.unit_price,
          })),
          p_paid_amount: paid,
          p_payment_method: Number(paid) > 0 ? method : null,
          p_operation_id: operation.id,
          p_occurred_at: operation.occurredAt,
        }),
      t(
        locale,
        'বিক্রি সংরক্ষণ হয়েছে; স্টক, পাওনা ও ইনভয়েস আপডেট হয়েছে।',
        'Sale posted; inventory, receivable and invoice were updated.',
      ),
    )) as { invoice_no?: string; duplicate?: boolean } | null;
    if (result) {
      setLastInvoice(result.invoice_no ?? '');
      setCart([]);
      setCustomerId('');
      setPaid('0');
    }
  };
  const categories = data.categories.filter((category) =>
    data.products.some((product) => product.category_id === category.id),
  );
  if (
    !allow('sales.create') ||
    !allow('products.view') ||
    !allow('inventory.view')
  )
    return (
      <Empty>
        {t(
          locale,
          'বিক্রি করতে sales.create, products.view এবং inventory.view অনুমতি প্রয়োজন।',
          'Sales require sales.create, products.view and inventory.view permissions.',
        )}
      </Empty>
    );
  return (
    <>
      {lastInvoice && (
        <div className="ops-notice">
          {t(locale, 'সর্বশেষ ইনভয়েস', 'Last invoice')}:{' '}
          <strong>{lastInvoice}</strong>
          <button
            type="button"
            className="button md-small-button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('mini-erp-navigate', {
                  detail: 'transactions',
                }),
              )
            }
          >
            {t(locale, 'ইনভয়েস খুলুন', 'Open invoices')}
          </button>
        </div>
      )}
      <div className="ops-pos-grid">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'পণ্য বেছে নাও', 'Select products')}</h3>
            <span>
              {data.products.length} {t(locale, 'টি পণ্য', 'products')}
            </span>
          </div>
          <input
            className="ops-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(
              locale,
              'পণ্যের নাম বা SKU খোঁজো',
              'Search product or SKU',
            )}
          />
          <div className="ops-category-row">
            <button
              className={`ops-chip ${category === '' ? 'active' : ''}`}
              onClick={() => setCategory('')}
            >
              {t(locale, 'সব', 'All')}
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                className={`ops-chip ${category === cat.id ? 'active' : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                {locale === 'en' && cat.name_en ? cat.name_en : cat.name_bn}
              </button>
            ))}
          </div>
          <div className="ops-products-grid">
            {data.products
              .filter(
                (product) =>
                  [product.name_bn, product.name_en, product.sku].some(
                    (value) =>
                      (value ?? '')
                        .toLocaleLowerCase()
                        .includes(search.toLocaleLowerCase()),
                  ) &&
                  (!category || product.category_id === category),
              )
              .map((product) => {
                const qty = stockFor(product.id);
                return (
                  <button
                    type="button"
                    className="ops-product-card"
                    key={product.id}
                    onClick={() => add(product)}
                    disabled={qty <= 0}
                  >
                    <strong>
                      {locale === 'en' && product.name_en
                        ? product.name_en
                        : product.name_bn}
                    </strong>
                    <span>{format(locale, product.default_selling_price)}</span>
                    <small>
                      {t(locale, 'স্টক', 'Stock')}: {qty}
                    </small>
                    <span className="ops-add-mark">+</span>
                  </button>
                );
              })}
            {data.products.length === 0 && (
              <Empty>
                {t(
                  locale,
                  'পণ্য নেই বা ডেটাবেস মাইগ্রেশন হয়নি।',
                  'No products are available, or the database migration is not applied.',
                )}
              </Empty>
            )}
          </div>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'বিক্রির ঝুড়ি', 'Sale basket')}</h3>
            <button
              className="button md-small-button"
              type="button"
              onClick={() => setCart([])}
              disabled={cart.length === 0}
            >
              {t(locale, 'খালি করো', 'Clear')}
            </button>
          </div>
          {cart.length === 0 ? (
            <Empty>
              {t(
                locale,
                'বাম পাশ থেকে পণ্য যোগ করো।',
                'Add products from the left.',
              )}
            </Empty>
          ) : (
            <div className="ops-cart-list">
              {cart.map((line) => {
                const product = data.products.find(
                  (item) => item.id === line.product_id,
                );
                return (
                  <div className="ops-cart-item" key={line.product_id}>
                    <div className="ops-cart-head">
                      <strong>{product?.name_bn ?? line.product_id}</strong>
                      <button
                        type="button"
                        className="ops-remove"
                        onClick={() =>
                          setCart((old) =>
                            old.filter(
                              (item) => item.product_id !== line.product_id,
                            ),
                          )
                        }
                        aria-label={t(locale, 'পণ্য বাদ দাও', 'Remove item')}
                      >
                        ×
                      </button>
                    </div>
                    <div className="ops-cart-fields">
                      <Field
                        label={t(locale, 'পরিমাণ', 'Quantity')}
                        type="number"
                        step="any"
                        value={line.quantity}
                        onChange={(value) =>
                          setLine(line.product_id, 'quantity', value)
                        }
                        required
                      />
                      <Field
                        label={t(locale, 'প্রতি এককের দাম', 'Unit price')}
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unit_price}
                        onChange={(value) =>
                          setLine(line.product_id, 'unit_price', value)
                        }
                        required
                        readOnly={!canOverride}
                      />
                      {!canOverride && (
                        <small>
                          {t(
                            locale,
                            'মূল্য পরিবর্তনের অনুমতি নেই',
                            'Price override is not allowed',
                          )}
                        </small>
                      )}
                    </div>
                    <div className="ops-cart-subtotal">
                      {t(locale, 'মোট', 'Line total')}:{' '}
                      <strong>
                        {format(
                          locale,
                          lineTotal(line.quantity, line.unit_price) ?? 0,
                        )}
                      </strong>{' '}
                      · {t(locale, 'স্টক', 'Stock')}:{' '}
                      {stockFor(line.product_id)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <form
            className="md-form ops-checkout"
            onSubmit={(event) => void save(event)}
          >
            <div className="ops-total">
              <span>{t(locale, 'মোট বিক্রি', 'Sale total')}</span>
              <strong>{format(locale, total)}</strong>
            </div>
            <SelectField
              label={t(locale, 'ক্রেতা', 'Customer')}
              value={customerId}
              onChange={setCustomerId}
            >
              <option value="">
                {t(locale, 'ক্যাশ / Walk-in ক্রেতা', 'Cash / walk-in customer')}
              </option>
              {data.customers
                .filter(
                  (customer) =>
                    customer.archived_at === null && allow('customers.view'),
                )
                .map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.customer_type === 'SHOP'
                      ? ` (${customer.shop_code ?? 'Shop'})`
                      : ''}
                  </option>
                ))}
            </SelectField>
            <div className="md-formgrid">
              <Field
                label={t(locale, 'এখন পরিশোধ', 'Amount paid now')}
                type="number"
                step="0.01"
                value={paid}
                onChange={setPaid}
                required
              />
              <SelectField
                label={t(locale, 'পেমেন্ট মাধ্যম', 'Payment method')}
                value={method}
                onChange={(value) => setMethod(value as PaymentMethod)}
              >
                <option value="CASH">{payMethodLabel(locale, 'CASH')}</option>
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="BANK">{payMethodLabel(locale, 'BANK')}</option>
              </SelectField>
            </div>
            <div className="ops-total">
              <span>{t(locale, 'বাকি', 'Due')}</span>
              <strong>
                {format(
                  locale,
                  Math.max(0, moneyNumber(total) - moneyNumber(paid)),
                )}
              </strong>
            </div>
            <button
              className="button auth-primary"
              type="submit"
              disabled={busy || cart.length === 0}
            >
              {t(
                locale,
                'যাচাই করে বিক্রি নিশ্চিত করুন',
                'Review and confirm sale',
              )}
            </button>
            <small>
              {t(
                locale,
                'স্টক আবার সার্ভারে যাচাই করা হবে। সফল হলে ইনভয়েস ও স্টক একই database transaction-এ সংরক্ষিত হবে।',
                'Stock is rechecked server-side; invoice, payment and stock are committed atomically.',
              )}
            </small>
          </form>
        </section>
      </div>
    </>
  );
}

function PurchasesPanel({
  data,
  client,
  businessId,
  locale,
  allow,
  format,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  businessId: string;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [cart, setCart] = useState<PurchaseCartLine[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierNotes, setSupplierNotes] = useState('');
  const [paid, setPaid] = useState('0');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [otherCost, setOtherCost] = useState('0');
  const [reference, setReference] = useState('');
  const [search, setSearch] = useState('');
  const [lastInvoice, setLastInvoice] = useState('');
  const subtotal = purchaseSubtotal(cart);
  const total =
    sumDecimalStrings([subtotal, roundMoney(otherCost) ?? '0']) ?? subtotal;
  const operation = useMemo(
    () => ({ id: newOperationId(), occurredAt: new Date().toISOString() }),
    [cart, supplierId, paid, method, otherCost, reference],
  );
  const add = (product: Product) =>
    setCart((old) => {
      const exists = old.find((line) => line.product_id === product.id);
      const referenceCost = data.purchaseRefs.find(
        (row) => row.product_id === product.id,
      )?.reference_purchase_price;
      if (exists)
        return old.map((line) =>
          line.product_id === product.id
            ? { ...line, quantity: String(moneyNumber(line.quantity) + 1) }
            : line,
        );
      return [
        ...old,
        {
          product_id: product.id,
          quantity: '1',
          unit_cost: String(referenceCost ?? '0'),
        },
      ];
    });
  const setLine = (id: string, key: keyof PurchaseCartLine, value: string) =>
    setCart((old) =>
      old.map((line) =>
        line.product_id === id ? { ...line, [key]: value } : line,
      ),
    );

  const addSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !allow('suppliers.manage')) return;
    const name = supplierName.trim();
    if (!name) return;
    const result = await runAction(
      () =>
        client
          .from('suppliers')
          .insert({
            business_id: businessId,
            name,
            phone: supplierPhone.trim() || null,
            address: supplierAddress.trim() || null,
            notes: supplierNotes.trim() || null,
          })
          .select('id')
          .single(),
      t(locale, 'নতুন সরবরাহকারী যোগ হয়েছে।', 'Supplier added successfully.'),
    );
    if (result) {
      setSupplierName('');
      setSupplierPhone('');
      setSupplierAddress('');
      setSupplierNotes('');
    }
  };

  const setSupplierArchived = async (supplier: Supplier, archived: boolean) => {
    if (!client || !allow('suppliers.manage')) return;
    const label = supplier.name;
    if (
      !window.confirm(
        archived
          ? t(
              locale,
              `${label} সরবরাহকারীকে সক্রিয় তালিকা থেকে সরাবেন? পুরোনো ক্রয়ের ইতিহাস থাকবে।`,
              `Archive supplier ${label}? Historical purchases will be preserved.`,
            )
          : t(
              locale,
              `${label} সরবরাহকারীকে আবার সক্রিয় করবেন?`,
              `Restore supplier ${label}?`,
            ),
      )
    )
      return;
    const result = await runAction(
      () =>
        client
          .from('suppliers')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('business_id', businessId)
          .eq('id', supplier.id)
          .select('id')
          .single(),
      archived
        ? t(
            locale,
            'সরবরাহকারী আর্কাইভ হয়েছে; পুরোনো হিসাব অক্ষত আছে।',
            'Supplier archived; historical records remain intact.',
          )
        : t(
            locale,
            'সরবরাহকারী পুনরায় সক্রিয় হয়েছে।',
            'Supplier restored successfully.',
          ),
    );
    if (result && archived && supplierId === supplier.id) {
      setSupplierId('');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || cart.length === 0 || !supplierId) return;
    if (Number(paid) < 0 || Number(paid) > moneyNumber(total)) {
      window.alert(
        t(
          locale,
          'পরিশোধিত টাকা মোটের মধ্যে হতে হবে।',
          'Paid amount must be between zero and the total.',
        ),
      );
      return;
    }
    const summary = cart
      .map(
        (line) =>
          `${data.products.find((product) => product.id === line.product_id)?.name_bn ?? line.product_id}: ${line.quantity} × ${line.unit_cost} = ${lineTotal(line.quantity, line.unit_cost) ?? '—'}`,
      )
      .join('\n');
    const preview = `${t(locale, 'পণ্যসমূহ', 'Items')}\n${summary}\n${t(locale, 'পণ্যের মোট', 'Subtotal')}: ${subtotal}\n${t(locale, 'অন্যান্য খরচ', 'Other costs')}: ${otherCost}\n${t(locale, 'সর্বমোট', 'Total')}: ${total}\n${t(locale, 'পরিশোধ', 'Paid')}: ${paid}`;
    if (
      !window.confirm(
        t(
          locale,
          `কেনাকাটার তথ্য যাচাই করো:\n${preview}\n\nস্টক ও খরচ সংরক্ষণ করবে?`,
          `Review purchase:\n${preview}\n\nCommit stock and cost?`,
        ),
      )
    )
      return;
    const result = (await runAction(
      () =>
        client.rpc('post_purchase', {
          p_business_id: businessId,
          p_supplier_id: supplierId,
          p_lines: cart.map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            unit_cost: line.unit_cost,
          })),
          p_other_cost_total: otherCost,
          p_paid_amount: paid,
          p_payment_method: Number(paid) > 0 ? method : null,
          p_reference_no: reference || null,
          p_operation_id: operation.id,
          p_occurred_at: operation.occurredAt,
        }),
      t(
        locale,
        'কেনাকাটা সংরক্ষণ হয়েছে; স্টক ও সরবরাহকারীর বাকি আপডেট হয়েছে।',
        'Purchase posted; stock and supplier payable were updated.',
      ),
    )) as { invoice_no?: string } | null;
    if (result) {
      setLastInvoice(result.invoice_no ?? '');
      setCart([]);
      setPaid('0');
      setOtherCost('0');
      setReference('');
    }
  };
  if (
    !allow('purchases.create') ||
    !allow('products.view') ||
    !allow('suppliers.view')
  )
    return (
      <Empty>
        {t(
          locale,
          'কেনাকাটা করতে purchases.create, products.view এবং suppliers.view অনুমতি প্রয়োজন।',
          'Purchases require purchases.create, products.view and suppliers.view permissions.',
        )}
      </Empty>
    );
  return (
    <>
      {lastInvoice && (
        <div className="ops-notice">
          {t(locale, 'সর্বশেষ ক্রয় ইনভয়েস', 'Last purchase invoice')}:{' '}
          <strong>{lastInvoice}</strong>
        </div>
      )}
      <div className="ops-pos-grid">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'পণ্য বেছে নাও', 'Choose products')}</h3>
          </div>
          <input
            className="ops-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(locale, 'পণ্যের নাম/SKU', 'Product name/SKU')}
          />
          <div className="ops-products-grid">
            {data.products
              .filter((product) =>
                [product.name_bn, product.name_en, product.sku].some((value) =>
                  (value ?? '').toLowerCase().includes(search.toLowerCase()),
                ),
              )
              .map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className="ops-product-card"
                  onClick={() => add(product)}
                >
                  <strong>{product.name_bn}</strong>
                  {allow('costs.read') && (
                    <small>
                      {t(locale, 'রেফারেন্স ক্রয়মূল্য', 'Reference cost')}:{' '}
                      {format(
                        locale,
                        data.purchaseRefs.find(
                          (row) => row.product_id === product.id,
                        )?.reference_purchase_price ?? 0,
                      )}
                    </small>
                  )}
                  <span className="ops-add-mark">+</span>
                </button>
              ))}
          </div>

          <section className="ops-section ops-supplier-manager">
            <div className="ops-section-title">
              <h3>{t(locale, 'সরবরাহকারীর তালিকা', 'Supplier directory')}</h3>
              <small>
                {
                  data.suppliers.filter((row) => row.archived_at === null)
                    .length
                }{' '}
                {t(locale, 'জন সক্রিয়', 'active')}
              </small>
            </div>
            {allow('suppliers.manage') ? (
              <>
                <form
                  className="md-form ops-supplier-form"
                  onSubmit={(event) => void addSupplier(event)}
                >
                  <div className="md-formgrid">
                    <Field
                      label={t(locale, 'সাপ্লায়ারের নাম *', 'Supplier name *')}
                      value={supplierName}
                      onChange={setSupplierName}
                      required
                    />
                    <Field
                      label={t(locale, 'মোবাইল', 'Mobile')}
                      value={supplierPhone}
                      onChange={setSupplierPhone}
                    />
                    <Field
                      label={t(locale, 'ঠিকানা', 'Address')}
                      value={supplierAddress}
                      onChange={setSupplierAddress}
                    />
                    <Field
                      label={t(locale, 'নোট (ঐচ্ছিক)', 'Notes (optional)')}
                      value={supplierNotes}
                      onChange={setSupplierNotes}
                    />
                  </div>
                  <button
                    className="button auth-primary"
                    type="submit"
                    disabled={busy || !supplierName.trim()}
                  >
                    + {t(locale, 'নতুন সাপ্লায়ার যোগ করুন', 'Add new supplier')}
                  </button>
                </form>
                <div className="ops-table-wrap">
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>{t(locale, 'সরবরাহকারী', 'Supplier')}</th>
                        <th>{t(locale, 'মোবাইল / ঠিকানা', 'Contact')}</th>
                        <th>{t(locale, 'স্ট্যাটাস', 'Status')}</th>
                        <th>{t(locale, 'অ্যাকশন', 'Action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.suppliers
                        .slice()
                        .sort(
                          (a, b) =>
                            Number(a.archived_at !== null) -
                              Number(b.archived_at !== null) ||
                            a.name.localeCompare(b.name),
                        )
                        .map((supplier) => (
                          <tr key={supplier.id}>
                            <td>{supplier.name}</td>
                            <td>{supplier.phone || supplier.address || '—'}</td>
                            <td>
                              {supplier.archived_at
                                ? t(locale, 'আর্কাইভড', 'Archived')
                                : t(locale, 'সক্রিয়', 'Active')}
                            </td>
                            <td>
                              {supplier.archived_at ? (
                                <button
                                  type="button"
                                  className="button md-small-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void setSupplierArchived(supplier, false)
                                  }
                                >
                                  {t(locale, 'পুনরায় চালু', 'Restore')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="ops-remove"
                                  title={t(
                                    locale,
                                    'সক্রিয় তালিকা থেকে সরাও',
                                    'Archive supplier',
                                  )}
                                  aria-label={t(
                                    locale,
                                    `${supplier.name} সরবরাহকারী আর্কাইভ করো`,
                                    `Archive supplier ${supplier.name}`,
                                  )}
                                  disabled={busy}
                                  onClick={() =>
                                    void setSupplierArchived(supplier, true)
                                  }
                                >
                                  <span aria-hidden="true">×</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      {data.suppliers.length === 0 && (
                        <tr>
                          <td colSpan={4}>
                            <Empty>
                              {t(
                                locale,
                                'এখনো কোনো সাপ্লায়ার যোগ করা হয়নি। উপরের ফর্ম দিয়ে যোগ করো।',
                                'No suppliers yet. Add one using the form above.',
                              )}
                            </Empty>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty>
                {t(
                  locale,
                  'সাপ্লায়ার যোগ বা আর্কাইভ করতে suppliers.manage অনুমতি প্রয়োজন।',
                  'The suppliers.manage permission is required to add or archive suppliers.',
                )}
              </Empty>
            )}
          </section>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'কেনাকাটার ঝুড়ি', 'Purchase basket')}</h3>
            <button
              type="button"
              className="button md-small-button"
              onClick={() => setCart([])}
            >
              {t(locale, 'খালি করো', 'Clear')}
            </button>
          </div>
          {cart.length === 0 ? (
            <Empty>
              {t(
                locale,
                'বাম পাশ থেকে পণ্য যোগ করো।',
                'Add products from the left.',
              )}
            </Empty>
          ) : (
            <div className="ops-cart-list">
              {cart.map((line) => (
                <div className="ops-cart-item" key={line.product_id}>
                  <div className="ops-cart-head">
                    <strong>
                      {
                        data.products.find((p) => p.id === line.product_id)
                          ?.name_bn
                      }
                    </strong>
                    <button
                      type="button"
                      className="ops-remove"
                      onClick={() =>
                        setCart((old) =>
                          old.filter(
                            (item) => item.product_id !== line.product_id,
                          ),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                  <div className="ops-cart-fields">
                    <Field
                      label={t(locale, 'পরিমাণ', 'Quantity')}
                      type="number"
                      step="any"
                      value={line.quantity}
                      onChange={(value) =>
                        setLine(line.product_id, 'quantity', value)
                      }
                      required
                    />
                    <Field
                      label={t(
                        locale,
                        'প্রকৃত একক ক্রয়মূল্য',
                        'Actual unit cost',
                      )}
                      type="number"
                      step="0.01"
                      value={line.unit_cost}
                      onChange={(value) =>
                        setLine(line.product_id, 'unit_cost', value)
                      }
                      required
                    />
                  </div>
                  <small>
                    {t(
                      locale,
                      'ক্রয়ের রসিদ দেখে প্রকৃত মূল্য যাচাই করো। রেফারেন্স মূল্য শুধু প্রস্তাবিত।',
                      'Verify actual cost from the supplier invoice; reference cost is only a suggestion.',
                    )}
                  </small>
                </div>
              ))}
            </div>
          )}
          <form
            className="md-form ops-checkout"
            onSubmit={(event) => void save(event)}
          >
            <SelectField
              label={t(locale, 'সরবরাহকারী', 'Supplier')}
              value={supplierId}
              onChange={setSupplierId}
              required
            >
              <option value="">
                {t(locale, 'নির্বাচন করো', 'Select supplier')}
              </option>
              {data.suppliers
                .filter((supplier) => supplier.archived_at === null)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </SelectField>
            <Field
              label={t(
                locale,
                'রেফারেন্স / চালান নম্বর',
                'Reference / supplier bill no.',
              )}
              value={reference}
              onChange={setReference}
            />
            <div className="md-formgrid">
              <Field
                label={t(
                  locale,
                  'পরিবহন ও অন্যান্য খরচ',
                  'Freight and other costs',
                )}
                type="number"
                step="0.01"
                value={otherCost}
                onChange={setOtherCost}
                required
              />
              <Field
                label={t(locale, 'এখন পরিশোধ', 'Amount paid now')}
                type="number"
                step="0.01"
                value={paid}
                onChange={setPaid}
                required
              />
            </div>
            <SelectField
              label={t(locale, 'পেমেন্ট মাধ্যম', 'Payment method')}
              value={method}
              onChange={(value) => setMethod(value as PaymentMethod)}
            >
              <option value="CASH">{payMethodLabel(locale, 'CASH')}</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="BANK">{payMethodLabel(locale, 'BANK')}</option>
            </SelectField>
            <div className="ops-total">
              <span>{t(locale, 'পণ্যের মোট', 'Items subtotal')}</span>
              <strong>{format(locale, subtotal)}</strong>
            </div>
            <div className="ops-total">
              <span>{t(locale, 'সর্বমোট', 'Grand total')}</span>
              <strong>{format(locale, total)}</strong>
            </div>
            <div className="ops-total">
              <span>{t(locale, 'সরবরাহকারীর বাকি', 'Supplier due')}</span>
              <strong>
                {format(
                  locale,
                  Math.max(0, moneyNumber(total) - moneyNumber(paid)),
                )}
              </strong>
            </div>
            <button
              className="button auth-primary"
              type="submit"
              disabled={busy || cart.length === 0 || !supplierId}
            >
              {t(
                locale,
                'যাচাই করে কেনাকাটা নিশ্চিত করুন',
                'Review and confirm purchase',
              )}
            </button>
            <small>
              {t(
                locale,
                'পরিবহন/অতিরিক্ত খরচ লাইনভিত্তিক অনুপাতে ভাগ হবে; স্টক ও খরচ একই transaction-এ সেভ হবে।',
                'Other costs are allocated proportionally across lines, and stock/cost are saved atomically.',
              )}
            </small>
          </form>
        </section>
      </div>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'সাম্প্রতিক কেনাকাটা', 'Recent purchases')}</h3>
        </div>
        {!allow('purchases.view') &&
        !allow('reports.view') &&
        !allow('invoices.read') ? (
          <Empty>
            {t(
              locale,
              'ক্রয়ের ইতিহাস দেখতে purchases.view বা invoices.read অনুমতি প্রয়োজন।',
              'Grant purchases.view or invoices.read to view purchase history.',
            )}
          </Empty>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{t(locale, 'ইনভয়েস', 'Invoice')}</th>
                  <th>{t(locale, 'সরবরাহকারী', 'Supplier')}</th>
                  <th>{t(locale, 'তারিখ', 'Date')}</th>
                  <th>{t(locale, 'মোট', 'Total')}</th>
                  <th>{t(locale, 'বাকি', 'Due')}</th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.slice(0, 20).map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.invoice_no}</td>
                    <td>{purchase.supplier_name_snapshot}</td>
                    <td>{formatDate(locale, purchase.occurred_at)}</td>
                    <td>{format(locale, purchase.total_amount)}</td>
                    <td>
                      {(allow('purchases.view') && allow('payments.pay')) ||
                      allow('reports.view') ||
                      allow('invoices.read')
                        ? format(
                            locale,
                            dueForPurchase(purchase, data.supplierAllocations),
                          )
                        : '—'}
                    </td>
                  </tr>
                ))}
                {data.purchases.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {t(
                        locale,
                        'কোনো ক্রয় রেকর্ড নেই।',
                        'No purchase records yet.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StockPanel({
  data,
  client,
  locale,
  allow,
  format,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [mode, setMode] = useState<'opening' | 'adjustment'>('adjustment');
  const knownValue = data.costState.reduce(
    (sum, row) =>
      sum +
      moneyNumber(row.priced_quantity) * moneyNumber(row.average_unit_cost),
    0,
  );
  const unpricedProducts = data.costState.filter(
    (row) => moneyNumber(row.unpriced_quantity) > 0,
  );
  const selected = data.products.find((product) => product.id === productId);
  const operation = useMemo(
    () => newOperationId(),
    [productId, quantity, note, direction, mode],
  );
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !client ||
      !productId ||
      !Number.isFinite(Number(quantity)) ||
      Number(quantity) <= 0
    )
      return;
    if (mode === 'adjustment' && !note.trim()) {
      window.alert(
        t(
          locale,
          'স্টক সমন্বয়ের কারণ লিখতে হবে।',
          'Enter a reason for the stock adjustment.',
        ),
      );
      return;
    }
    const result = await runAction(
      () =>
        mode === 'opening'
          ? client.rpc('record_inventory_opening_stock', {
              p_product_id: productId,
              p_quantity: quantity,
              p_operation_id: operation,
              p_note: note.trim() || null,
            })
          : client.rpc('adjust_inventory_stock', {
              p_product_id: productId,
              p_direction: direction,
              p_quantity: quantity,
              p_reason: note.trim(),
              p_operation_id: operation,
            }),
      mode === 'opening'
        ? t(
            locale,
            'প্রারম্ভিক স্টক সংরক্ষিত হয়েছে।',
            'Opening stock recorded.',
          )
        : t(
            locale,
            'স্টক সমন্বয় সংরক্ষিত হয়েছে।',
            'Stock adjustment recorded.',
          ),
    );
    if (result !== null) {
      setQuantity('');
      setNote('');
    }
  };
  if (!allow('inventory.view'))
    return (
      <Empty>
        {t(
          locale,
          'স্টক দেখতে inventory.view অনুমতি প্রয়োজন।',
          'Grant inventory.view to access stock.',
        )}
      </Empty>
    );
  return (
    <>
      <div className="ops-summary-grid">
        <SummaryCard
          label={t(locale, 'সক্রিয় পণ্য', 'Active products')}
          value={String(data.products.length)}
        />
        <SummaryCard
          label={t(
            locale,
            'জানা ক্রয়মূল্যে স্টকের মূল্য',
            'Stock value at known cost',
          )}
          value={
            allow('inventory.value.read') ? format(locale, knownValue) : '—'
          }
          note={t(
            locale,
            'শুধু প্রকৃত রেকর্ড করা মূল্যযুক্ত স্টক',
            'Only stock with recorded costs',
          )}
        />
        <SummaryCard
          label={t(locale, 'মূল্য অজানা স্টক', 'Unpriced stock')}
          value={
            allow('inventory.value.read')
              ? String(unpricedProducts.length)
              : '—'
          }
          note={t(
            locale,
            'পণ্যের সংখ্যা; টাকার মূল্য অনুমান করা হয়নি',
            'Product count; no invented monetary value',
          )}
        />
        <SummaryCard
          label={t(locale, 'কম স্টক', 'Low stock')}
          value={String(
            data.products.filter(
              (product) =>
                product.minimum_stock !== null &&
                moneyNumber(
                  data.balances.find((b) => b.product_id === product.id)
                    ?.quantity,
                ) <= moneyNumber(product.minimum_stock),
            ).length,
          )}
        />
      </div>
      {allow('inventory.value.read') && unpricedProducts.length > 0 && (
        <p className="ops-warning">
          {t(
            locale,
            'কিছু স্টকের প্রকৃত ক্রয়মূল্য জানা নেই। তাই পূর্ণ স্টক ভ্যালু বা নিশ্চিত লাভ দেখানো হচ্ছে না।',
            'Some stock has unknown historical cost. A complete stock valuation or certain profit is therefore not shown.',
          )}
        </p>
      )}
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'স্টক তালিকা', 'Stock list')}</h3>
          <span>{t(locale, 'পরিমাণ ও মূল্য', 'Quantity and costing')}</span>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'পণ্য', 'Product')}</th>
                <th>{t(locale, 'একক', 'Unit')}</th>
                <th>{t(locale, 'বর্তমান পরিমাণ', 'Current quantity')}</th>
                <th>{t(locale, 'সর্বনিম্ন', 'Minimum')}</th>
                <th>{t(locale, 'গড় জানা ক্রয়মূল্য', 'Average known cost')}</th>
                <th>{t(locale, 'জানা স্টক মূল্য', 'Known stock value')}</th>
                <th>{t(locale, 'অবস্থা', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => {
                const balance = data.balances.find(
                  (row) => row.product_id === product.id,
                );
                const cost = data.costState.find(
                  (row) => row.product_id === product.id,
                );
                const stock = moneyNumber(balance?.quantity);
                const unknown = moneyNumber(cost?.unpriced_quantity) > 0;
                const low =
                  product.minimum_stock !== null &&
                  stock <= moneyNumber(product.minimum_stock);
                return (
                  <tr key={product.id}>
                    <td>
                      {product.name_bn}
                      <small>{product.sku || '—'}</small>
                    </td>
                    <td>
                      {data.units.find((unit) => unit.id === product.unit_id)
                        ?.name_bn ?? '—'}
                    </td>
                    <td>{stock}</td>
                    <td>{product.minimum_stock ?? '—'}</td>
                    <td>
                      {allow('inventory.value.read') &&
                      cost &&
                      moneyNumber(cost.priced_quantity) > 0
                        ? format(locale, cost.average_unit_cost)
                        : '—'}
                    </td>
                    <td>
                      {allow('inventory.value.read') &&
                      cost &&
                      moneyNumber(cost.priced_quantity) > 0
                        ? format(
                            locale,
                            moneyNumber(cost.priced_quantity) *
                              moneyNumber(cost.average_unit_cost),
                          )
                        : '—'}
                      {unknown && (
                        <small>
                          {t(
                            locale,
                            'অংশবিশেষের মূল্য অজানা',
                            'Part of quantity unpriced',
                          )}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={`ops-state ${low ? 'warning' : 'good'}`}>
                        {low
                          ? t(locale, 'কম স্টক', 'Low stock')
                          : t(locale, 'ঠিক আছে', 'In stock')}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data.products.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {t(
                      locale,
                      'প্রথমে পণ্য মাস্টার থেকে পণ্য যোগ করো।',
                      'Add products from Product Master first.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="ops-two-col">
        {allow('inventory.adjust') && (
          <section className="ops-section">
            <div className="ops-section-title">
              <h3>
                {t(locale, 'স্টক এন্ট্রি / সমন্বয়', 'Stock entry / adjustment')}
              </h3>
            </div>
            <form className="md-form" onSubmit={(event) => void save(event)}>
              <SelectField
                label={t(locale, 'পণ্যের নাম', 'Product')}
                value={productId}
                onChange={setProductId}
                required
              >
                <option value="">
                  {t(locale, 'পণ্য নির্বাচন করো', 'Choose a product')}
                </option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name_bn}
                  </option>
                ))}
              </SelectField>
              <div className="md-formgrid">
                <SelectField
                  label={t(locale, 'কাজের ধরন', 'Action')}
                  value={mode}
                  onChange={(value) =>
                    setMode(value as 'opening' | 'adjustment')
                  }
                >
                  <option value="adjustment">
                    {t(locale, 'স্টক সমন্বয়', 'Adjustment')}
                  </option>
                  <option value="opening">
                    {t(
                      locale,
                      'একবারের প্রারম্ভিক স্টক',
                      'One-time opening stock',
                    )}
                  </option>
                </SelectField>
                {mode === 'adjustment' && (
                  <SelectField
                    label={t(locale, 'দিক', 'Direction')}
                    value={direction}
                    onChange={(value) => setDirection(value as 'IN' | 'OUT')}
                  >
                    <option value="IN">
                      {t(locale, 'স্টক বাড়াও', 'Increase stock')}
                    </option>
                    <option value="OUT">
                      {t(locale, 'স্টক কমাও', 'Decrease stock')}
                    </option>
                  </SelectField>
                )}
              </div>
              <Field
                label={t(locale, 'পরিমাণ', 'Quantity')}
                value={quantity}
                onChange={setQuantity}
                type="number"
                min="0.000001"
                step="any"
                required
              />
              <Field
                label={t(locale, 'কারণ / নোট', 'Reason / note')}
                value={note}
                onChange={setNote}
                required={mode === 'adjustment'}
                placeholder={t(
                  locale,
                  'যেমন: গণনায় বেশি পাওয়া গেছে',
                  'e.g. stock count adjustment',
                )}
              />
              {selected && (
                <p className="md-muted">
                  {t(locale, 'বর্তমান স্টক', 'Current stock')}:{' '}
                  {moneyNumber(
                    data.balances.find((b) => b.product_id === selected.id)
                      ?.quantity,
                  )}
                </p>
              )}
              <button
                className="button auth-primary"
                type="submit"
                disabled={busy || !productId}
              >
                {t(locale, 'যাচাই করে সংরক্ষণ', 'Validate and save')}
              </button>
              <small>
                {t(
                  locale,
                  'স্টক সরাসরি ব্রাউজার থেকে পরিবর্তন হয় না; অনুমোদিত সার্ভার RPC, স্টক সীমা ও duplicate-operation চেক ব্যবহার করে।',
                  'Stock is changed through authorized server RPCs with stock guards and duplicate-operation protection.',
                )}
              </small>
            </form>
          </section>
        )}
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'সর্বশেষ স্টক চলাচল', 'Recent stock movements')}</h3>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{t(locale, 'সময়', 'Date')}</th>
                  <th>{t(locale, 'পণ্য', 'Product')}</th>
                  <th>{t(locale, 'ধরন', 'Type')}</th>
                  <th>{t(locale, 'পরিমাণ', 'Delta')}</th>
                  <th>{t(locale, 'শেষ স্টক', 'Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.slice(0, 50).map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDate(locale, movement.created_at)}</td>
                    <td>
                      {data.products.find((p) => p.id === movement.product_id)
                        ?.name_bn ?? movement.product_id.slice(0, 8)}
                    </td>
                    <td>{movement.movement_type}</td>
                    <td
                      className={
                        movement.quantity_delta < 0
                          ? 'ops-negative'
                          : 'ops-positive'
                      }
                    >
                      {movement.quantity_delta > 0 ? '+' : ''}
                      {movement.quantity_delta}
                    </td>
                    <td>{movement.quantity_after}</td>
                  </tr>
                ))}
                {data.movements.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {t(
                        locale,
                        'এখনো কোনো স্টক চলাচলের রেকর্ড নেই।',
                        'No stock movements recorded yet.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function DuesPanel({
  data,
  client,
  businessId,
  locale,
  allow,
  format,
  customerDue,
  supplierDue,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  businessId: string;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  customerDue: (id: string) => number;
  supplierDue: (id: string) => number;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [side, setSide] = useState<'customers' | 'suppliers'>(
    allow('sales.view') && allow('payments.receive') && allow('customers.view')
      ? 'customers'
      : 'suppliers',
  );
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const partyDue = side === 'customers' ? customerDue : supplierDue;
  const customer = data.customers.find((row) => row.id === partyId);
  const supplier = data.suppliers.find((row) => row.id === partyId);
  const due = partyId ? partyDue(partyId) : 0;
  const operation = useMemo(
    () => ({ id: newOperationId(), occurredAt: new Date().toISOString() }),
    [side, partyId, amount, method, reference, note],
  );
  const canCollect =
    allow('payments.receive') && allow('sales.view') && allow('customers.view');
  const canPay =
    allow('payments.pay') && allow('purchases.view') && allow('suppliers.view');
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !client ||
      !partyId ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    )
      return;
    if (Number(amount) > due) {
      window.alert(
        t(
          locale,
          'পেমেন্ট বর্তমান পাওনার বেশি হতে পারবে না।',
          'Payment cannot exceed the outstanding balance.',
        ),
      );
      return;
    }
    if (
      !window.confirm(
        t(
          locale,
          `${side === 'customers' ? (customer?.name ?? '') : (supplier?.name ?? '')} — ${amount} টাকা। ${t(locale, 'পেমেন্ট সংরক্ষণ করবে?', 'Confirm payment?')}`,
          `Confirm ${amount} payment for ${side === 'customers' ? (customer?.name ?? '') : (supplier?.name ?? '')}?`,
        ),
      )
    )
      return;
    const success =
      side === 'customers'
        ? t(
            locale,
            'ক্রেতার পেমেন্ট ও রসিদ সংরক্ষিত হয়েছে।',
            'Customer payment and receipt saved.',
          )
        : t(
            locale,
            'সরবরাহকারী পেমেন্ট সংরক্ষিত হয়েছে।',
            'Supplier payment saved.',
          );
    const result = await runAction(
      () =>
        side === 'customers'
          ? client.rpc('collect_customer_payment', {
              p_business_id: businessId,
              p_customer_id: partyId,
              p_amount: amount,
              p_payment_method: method,
              p_reference_no: reference || null,
              p_note: note || null,
              p_operation_id: operation.id,
              p_received_at: operation.occurredAt,
            })
          : client.rpc('pay_supplier', {
              p_business_id: businessId,
              p_supplier_id: partyId,
              p_amount: amount,
              p_payment_method: method,
              p_reference_no: reference || null,
              p_note: note || null,
              p_operation_id: operation.id,
              p_paid_at: operation.occurredAt,
            }),
      success,
    );
    if (result !== null) {
      setAmount('');
      setReference('');
      setNote('');
    }
  };
  const outstandingCustomers = data.customers
    .map((row) => ({ row, due: customerDue(row.id) }))
    .filter((item) => item.due > 0)
    .sort((a, b) => b.due - a.due);
  const outstandingSuppliers = data.suppliers
    .map((row) => ({ row, due: supplierDue(row.id) }))
    .filter((item) => item.due > 0)
    .sort((a, b) => b.due - a.due);
  if (!canCollect && !canPay)
    return (
      <Empty>
        {t(
          locale,
          'বাকি দেখতে sales.view/purchases.view এবং টাকা আদায় বা পেমেন্টের প্রয়োজনীয় অনুমতি দিতে হবে।',
          'Grant the required sales/purchase view and payment permissions to use due management.',
        )}
      </Empty>
    );
  const totalCustomerDue = outstandingCustomers.reduce(
    (sum, row) => sum + row.due,
    0,
  );
  const totalSupplierDue = outstandingSuppliers.reduce(
    (sum, row) => sum + row.due,
    0,
  );
  return (
    <>
      <div className="ops-summary-grid">
        <SummaryCard
          label={t(locale, 'ক্রেতার কাছ থেকে পাওনা', 'Customer receivables')}
          value={format(locale, totalCustomerDue)}
          note={`${outstandingCustomers.length} ${t(locale, 'জন ক্রেতা', 'customers')}`}
        />
        <SummaryCard
          label={t(locale, 'সরবরাহকারীকে দিতে হবে', 'Supplier payables')}
          value={format(locale, totalSupplierDue)}
          note={`${outstandingSuppliers.length} ${t(locale, 'জন সরবরাহকারী', 'suppliers')}`}
        />
      </div>
      <div className="ops-segmented">
        <button
          type="button"
          disabled={!canCollect}
          className={`ops-chip ${side === 'customers' ? 'active' : ''}`}
          onClick={() => {
            setSide('customers');
            setPartyId('');
          }}
        >
          {t(locale, 'ক্রেতার বাকি আদায়', 'Collect customer due')}
        </button>
        <button
          type="button"
          disabled={!canPay}
          className={`ops-chip ${side === 'suppliers' ? 'active' : ''}`}
          onClick={() => {
            setSide('suppliers');
            setPartyId('');
          }}
        >
          {t(locale, 'সরবরাহকারীকে পেমেন্ট', 'Pay supplier')}
        </button>
      </div>
      <div className="ops-two-col">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>
              {side === 'customers'
                ? t(locale, 'যাদের কাছে পাওনা আছে', 'Customers with balances')
                : t(locale, 'যাদের টাকা দিতে হবে', 'Suppliers with balances')}
            </h3>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{t(locale, 'নাম', 'Name')}</th>
                  <th>{t(locale, 'মোবাইল', 'Mobile')}</th>
                  <th>{t(locale, 'পাওনা', 'Outstanding')}</th>
                  <th>{t(locale, 'কাজ', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {side === 'customers'
                  ? outstandingCustomers.map(({ row, due: rowDue }) => (
                      <tr key={row.id}>
                        <td>
                          {row.name}
                          {row.customer_type === 'SHOP' && (
                            <small>{row.shop_code}</small>
                          )}
                        </td>
                        <td>{row.phone || '—'}</td>
                        <td>{format(locale, rowDue)}</td>
                        <td>
                          <button
                            className="button md-small-button"
                            onClick={() => setPartyId(row.id)}
                          >
                            {t(locale, 'পেমেন্ট নাও', 'Collect')}
                          </button>
                        </td>
                      </tr>
                    ))
                  : outstandingSuppliers.map(({ row, due: rowDue }) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.phone || '—'}</td>
                        <td>{format(locale, rowDue)}</td>
                        <td>
                          <button
                            className="button md-small-button"
                            onClick={() => setPartyId(row.id)}
                          >
                            {t(locale, 'পেমেন্ট দাও', 'Pay')}
                          </button>
                        </td>
                      </tr>
                    ))}
                {(side === 'customers'
                  ? outstandingCustomers.length
                  : outstandingSuppliers.length) === 0 && (
                  <tr>
                    <td colSpan={4}>
                      {t(
                        locale,
                        'বর্তমানে কোনো বাকি নেই।',
                        'No outstanding balances.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>
              {side === 'customers'
                ? t(locale, 'টাকা গ্রহণ / রসিদ', 'Receive payment / receipt')
                : t(locale, 'সরবরাহকারী পেমেন্ট', 'Supplier payment')}
            </h3>
          </div>
          <form className="md-form" onSubmit={(event) => void save(event)}>
            <SelectField
              label={
                side === 'customers'
                  ? t(locale, 'ক্রেতা', 'Customer')
                  : t(locale, 'সরবরাহকারী', 'Supplier')
              }
              value={partyId}
              onChange={setPartyId}
              required
            >
              <option value="">{t(locale, 'নির্বাচন করো', 'Choose')}</option>
              {(side === 'customers' ? data.customers : data.suppliers).map(
                (row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ),
              )}
            </SelectField>
            <SummaryCard
              label={t(locale, 'বর্তমান পাওনা', 'Current outstanding')}
              value={format(locale, due)}
            />
            <Field
              label={t(locale, 'পেমেন্টের পরিমাণ', 'Payment amount')}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={setAmount}
              required
            />
            <SelectField
              label={t(locale, 'পেমেন্ট মাধ্যম', 'Payment method')}
              value={method}
              onChange={(value) => setMethod(value as PaymentMethod)}
            >
              <option value="CASH">Cash</option>
              <option value="BKASH">bKash</option>
              <option value="NAGAD">Nagad</option>
              <option value="BANK">Bank</option>
            </SelectField>
            <Field
              label={t(locale, 'রেফারেন্স নম্বর', 'Reference number')}
              value={reference}
              onChange={setReference}
            />
            <Field
              label={t(locale, 'নোট', 'Note')}
              value={note}
              onChange={setNote}
            />
            <button
              type="submit"
              className="button auth-primary"
              disabled={busy || !partyId || due <= 0}
            >
              {side === 'customers'
                ? t(
                    locale,
                    'টাকা গ্রহণ ও রসিদ তৈরি',
                    'Receive and create receipt',
                  )
                : t(locale, 'পেমেন্ট নিশ্চিত করো', 'Confirm payment')}
            </button>
            {customer && side === 'customers' && (
              <small>
                {t(
                  locale,
                  'এই টাকা পাওনা ইনভয়েসে পুরোনো থেকে নতুন ক্রমে বরাদ্দ হবে। এটি নতুন বিক্রির আয় নয়।',
                  'Allocated to oldest open invoices first; this is not new sales revenue.',
                )}
              </small>
            )}
            {supplier && side === 'suppliers' && (
              <small>
                {t(
                  locale,
                  'পেমেন্ট পুরোনো বকেয়া ক্রয় ইনভয়েসে বরাদ্দ হবে।',
                  'Payment is allocated to oldest outstanding purchase invoices.',
                )}
              </small>
            )}
          </form>
        </section>
      </div>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>
            {t(
              locale,
              'সাম্প্রতিক রসিদ ও পেমেন্ট',
              'Recent receipts and supplier payments',
            )}
          </h3>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'রেফারেন্স', 'Reference')}</th>
                <th>{t(locale, 'ধরন', 'Type')}</th>
                <th>{t(locale, 'নাম', 'Party')}</th>
                <th>{t(locale, 'তারিখ', 'Date')}</th>
                <th>{t(locale, 'পরিমাণ', 'Amount')}</th>
                <th>{t(locale, 'মাধ্যম', 'Method')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...data.receipts.map((r) => ({
                  id: r.id,
                  ref: r.receipt_no,
                  kind: t(locale, 'ক্রেতার রসিদ', 'Customer receipt'),
                  name: r.customer_name_snapshot,
                  date: r.received_at,
                  amount: r.amount,
                  method: r.payment_method,
                })),
                ...data.supplierPayments.map((r) => ({
                  id: r.id,
                  ref: r.payment_no,
                  kind: t(locale, 'সরবরাহকারী পেমেন্ট', 'Supplier payment'),
                  name: r.supplier_name_snapshot,
                  date: r.paid_at,
                  amount: r.amount,
                  method: r.payment_method,
                })),
              ]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 30)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{r.ref}</td>
                    <td>{r.kind}</td>
                    <td>{r.name}</td>
                    <td>{formatDate(locale, r.date)}</td>
                    <td>{format(locale, r.amount)}</td>
                    <td>{payMethodLabel(locale, r.method)}</td>
                  </tr>
                ))}
              {data.receipts.length + data.supplierPayments.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {t(
                      locale,
                      'এখনো কোনো রসিদ বা পেমেন্ট নেই।',
                      'No receipts or payments yet.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ExpensesPanel({
  data,
  client,
  businessId,
  locale,
  allow,
  format,
  busy,
  runAction,
}: {
  data: LoadState;
  client: SupabaseClient<Database> | null;
  businessId: string;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [category, setCategory] = useState('Transportation');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayDhaka());
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const operation = useMemo(
    () => newOperationId(),
    [category, amount, date, method, reference, note],
  );
  const active = data.expenses.filter((row) => row.status === 'ACTIVE');
  const total = active.reduce((sum, row) => sum + moneyNumber(row.amount), 0);
  const dayTotal = active
    .filter((row) => row.expense_date === todayDhaka())
    .reduce((sum, row) => sum + moneyNumber(row.amount), 0);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !client ||
      !category.trim() ||
      !date ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    )
      return;
    if (
      !window.confirm(
        t(
          locale,
          `${category} খরচ ${amount} টাকা, তারিখ ${date}। সংরক্ষণ করবে?`,
          `Save expense ${amount} for ${category} on ${date}?`,
        ),
      )
    )
      return;
    const result = await runAction(
      () =>
        client.rpc('create_business_expense', {
          p_business_id: businessId,
          p_category: category.trim(),
          p_amount: amount,
          p_expense_date: date,
          p_payment_method: method,
          p_reference_no: reference || null,
          p_note: note || null,
          p_operation_id: operation,
        }),
      t(locale, 'খরচ সংরক্ষিত হয়েছে।', 'Expense saved.'),
    );
    if (result !== null) {
      setAmount('');
      setReference('');
      setNote('');
    }
  };
  const voidExpense = async (row: LoadState['expenses'][number]) => {
    if (!client) return;
    const reason = window.prompt(
      t(
        locale,
        'এই খরচটি বাতিল করার কারণ লিখো। রেকর্ড মুছে যাবে না।',
        'Enter a reason to void this expense. The record will be preserved.',
      ),
    );
    if (!reason?.trim()) return;
    await runAction(
      () =>
        client.rpc('void_business_expense', {
          p_business_id: businessId,
          p_expense_id: row.id,
          p_reason: reason.trim(),
        }),
      t(
        locale,
        'খরচটি বাতিল করা হয়েছে; ইতিহাস সংরক্ষিত আছে।',
        'Expense voided; history is preserved.',
      ),
    );
  };
  if (!allow('expenses.view') && !allow('expenses.create'))
    return (
      <Empty>
        {t(
          locale,
          'খরচ দেখতে বা যোগ করতে যথাযথ permission প্রয়োজন।',
          'Grant expenses.view or expenses.create to access expenses.',
        )}
      </Empty>
    );
  return (
    <>
      {allow('expenses.view') && (
        <div className="ops-summary-grid">
          <SummaryCard
            label={t(locale, 'সব সক্রিয় খরচ', 'All active expenses')}
            value={format(locale, total)}
          />
          <SummaryCard
            label={t(locale, 'আজকের খরচ', "Today's expenses")}
            value={format(locale, dayTotal)}
          />
          <SummaryCard
            label={t(locale, 'মোট রেকর্ড', 'Expense records')}
            value={String(data.expenses.length)}
          />
        </div>
      )}
      <div className="ops-two-col">
        {allow('expenses.create') && (
          <section className="ops-section">
            <div className="ops-section-title">
              <h3>{t(locale, 'খরচ যোগ করো', 'Add expense')}</h3>
            </div>
            <form className="md-form" onSubmit={(event) => void save(event)}>
              <SelectField
                label={t(locale, 'খরচের ধরন', 'Category')}
                value={category}
                onChange={setCategory}
              >
                <option value="Transportation">
                  {t(locale, 'পরিবহন', 'Transportation')}
                </option>
                <option value="Rent">{t(locale, 'দোকান ভাড়া', 'Rent')}</option>
                <option value="Electricity">
                  {t(locale, 'বিদ্যুৎ', 'Electricity')}
                </option>
                <option value="Salary">{t(locale, 'বেতন', 'Salary')}</option>
                <option value="Other">{t(locale, 'অন্যান্য', 'Other')}</option>
              </SelectField>
              <Field
                label={t(locale, 'টাকার পরিমাণ', 'Amount')}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={setAmount}
                required
              />
              <Field
                label={t(locale, 'তারিখ', 'Date')}
                type="date"
                value={date}
                onChange={setDate}
                required
              />
              <SelectField
                label={t(locale, 'পেমেন্ট মাধ্যম', 'Payment method')}
                value={method}
                onChange={(value) => setMethod(value as PaymentMethod)}
              >
                <option value="CASH">Cash</option>
                <option value="BKASH">bKash</option>
                <option value="NAGAD">Nagad</option>
                <option value="BANK">Bank</option>
              </SelectField>
              <Field
                label={t(locale, 'রেফারেন্স', 'Reference')}
                value={reference}
                onChange={setReference}
              />
              <Field
                label={t(locale, 'বিবরণ / নোট', 'Description / note')}
                value={note}
                onChange={setNote}
              />
              <button
                type="submit"
                className="button auth-primary"
                disabled={busy}
              >
                {t(locale, 'খরচ সংরক্ষণ', 'Save expense')}
              </button>
            </form>
          </section>
        )}
        {allow('expenses.view') && (
          <section className="ops-section">
            <div className="ops-section-title">
              <h3>{t(locale, 'খরচের ইতিহাস', 'Expense history')}</h3>
              <button
                className="button md-small-button"
                onClick={() => setShowVoided((old) => !old)}
              >
                {showVoided
                  ? t(locale, 'শুধু সক্রিয়', 'Active only')
                  : t(locale, 'বাতিলসহ সব', 'Include voided')}
              </button>
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'তারিখ', 'Date')}</th>
                    <th>{t(locale, 'খাত', 'Category')}</th>
                    <th>{t(locale, 'পরিমাণ', 'Amount')}</th>
                    <th>{t(locale, 'মাধ্যম', 'Method')}</th>
                    <th>{t(locale, 'অবস্থা / কাজ', 'Status / action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses
                    .filter((row) => showVoided || row.status === 'ACTIVE')
                    .map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(locale, row.expense_date)}</td>
                        <td>
                          {row.category}
                          <small>{row.note || row.reference_no || ''}</small>
                        </td>
                        <td>{format(locale, row.amount)}</td>
                        <td>{payMethodLabel(locale, row.payment_method)}</td>
                        <td>
                          {row.status === 'VOIDED' ? (
                            <>
                              <span className="ops-state warning">
                                {t(locale, 'বাতিল', 'Voided')}
                              </span>
                              <small>{row.void_reason}</small>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="button md-small-button"
                              disabled={busy}
                              onClick={() => void voidExpense(row)}
                            >
                              {t(locale, 'বাতিল করো', 'Void')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {data.expenses.filter(
                    (row) => showVoided || row.status === 'ACTIVE',
                  ).length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        {t(locale, 'কোনো খরচ নেই।', 'No expenses recorded.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function EstimatorPanel({
  data,
  locale,
  format,
}: {
  data: LoadState;
  locale: Locale;
  format: (locale: Locale, value: string | number) => string;
}) {
  const [productId, setProductId] = useState('');
  const [buyQty, setBuyQty] = useState('100');
  const [buyCost, setBuyCost] = useState('100');
  const [sellPrice, setSellPrice] = useState('130');
  const [freight, setFreight] = useState('500');
  const [other, setOther] = useState('200');
  const [sellQty, setSellQty] = useState('80');
  const values = [buyQty, buyCost, sellPrice, freight, other, sellQty].map(
    Number,
  );
  const valid =
    values.every((value) => Number.isFinite(value) && value >= 0) &&
    Number(buyQty) > 0 &&
    Number(sellQty) <= Number(buyQty);
  const investment =
    Number(buyQty) * Number(buyCost) + Number(freight) + Number(other);
  const landedUnitCost =
    Number(buyQty) > 0
      ? (Number(buyQty) * Number(buyCost) + Number(freight)) / Number(buyQty)
      : 0;
  const revenue = Number(sellQty) * Number(sellPrice);
  const cogs = Number(sellQty) * landedUnitCost;
  const profit = revenue - cogs - Number(other);
  const remainingStock = (Number(buyQty) - Number(sellQty)) * landedUnitCost;
  return (
    <>
      <div className="ops-notice">
        {t(
          locale,
          'এটি পরিকল্পনার ক্যালকুলেটর। এখানে দেওয়া মান বাস্তব স্টক, বিক্রি, পাওনা বা রিপোর্ট পরিবর্তন করে না।',
          'Planning calculator only. Values here never change live stock, sales, dues or reports.',
        )}
      </div>
      <div className="ops-two-col">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'পরিকল্পনার ইনপুট', 'Scenario inputs')}</h3>
          </div>
          <div className="md-form">
            <SelectField
              label={t(locale, 'পণ্য (ঐচ্ছিক)', 'Product (optional)')}
              value={productId}
              onChange={(value) => {
                setProductId(value);
                const product = data.products.find((row) => row.id === value);
                if (product) {
                  setSellPrice(String(product.default_selling_price));
                  const ref = data.purchaseRefs.find(
                    (row) => row.product_id === product.id,
                  );
                  if (ref) setBuyCost(String(ref.reference_purchase_price));
                }
              }}
            >
              <option value="">
                {t(locale, 'নিজে মূল্য লিখব', 'Enter values manually')}
              </option>
              {data.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name_bn}
                </option>
              ))}
            </SelectField>
            <div className="md-formgrid">
              <Field
                label={t(locale, 'কেনার পরিমাণ', 'Purchase quantity')}
                type="number"
                min="0"
                step="any"
                value={buyQty}
                onChange={setBuyQty}
              />
              <Field
                label={t(locale, 'প্রতি একক ক্রয়মূল্য', 'Buy cost per unit')}
                type="number"
                min="0"
                step="0.01"
                value={buyCost}
                onChange={setBuyCost}
              />
            </div>
            <div className="md-formgrid">
              <Field
                label={t(
                  locale,
                  'প্রতি একক বিক্রয়মূল্য',
                  'Selling price per unit',
                )}
                type="number"
                min="0"
                step="0.01"
                value={sellPrice}
                onChange={setSellPrice}
              />
              <Field
                label={t(
                  locale,
                  'বিক্রির প্রত্যাশিত পরিমাণ',
                  'Expected quantity to sell',
                )}
                type="number"
                min="0"
                step="any"
                value={sellQty}
                onChange={setSellQty}
              />
            </div>
            <div className="md-formgrid">
              <Field
                label={t(locale, 'পরিবহন খরচ', 'Freight')}
                type="number"
                min="0"
                step="0.01"
                value={freight}
                onChange={setFreight}
              />
              <Field
                label={t(locale, 'অন্যান্য খরচ', 'Other costs')}
                type="number"
                min="0"
                step="0.01"
                value={other}
                onChange={setOther}
              />
            </div>
            {!valid && (
              <p className="md-alert" role="alert">
                {t(
                  locale,
                  'সব মান শূন্য বা ধনাত্মক হতে হবে, কেনার পরিমাণ শূন্যের বেশি এবং বিক্রির পরিমাণ কেনার পরিমাণের বেশি নয়।',
                  'Values must be non-negative, purchase quantity must be positive, and expected sales cannot exceed purchase quantity.',
                )}
              </p>
            )}
          </div>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'সম্ভাব্য ফলাফল', 'Estimated result')}</h3>
          </div>
          {valid ? (
            <>
              <div className="ops-estimate-hero">
                <span>
                  {profit >= 0
                    ? t(locale, 'সম্ভাব্য নিট লাভ', 'Estimated net profit')
                    : t(locale, 'সম্ভাব্য লোকসান', 'Estimated loss')}
                </span>
                <strong>{format(locale, profit)}</strong>
              </div>
              <div className="ops-summary-grid">
                <SummaryCard
                  label={t(locale, 'প্রাথমিক বিনিয়োগ', 'Initial investment')}
                  value={format(locale, investment)}
                />
                <SummaryCard
                  label={t(locale, 'সম্ভাব্য বিক্রির আয়', 'Expected revenue')}
                  value={format(locale, revenue)}
                />
                <SummaryCard
                  label={t(
                    locale,
                    'বিক্রি হওয়া স্টকের খরচ',
                    'Cost of units sold',
                  )}
                  value={format(locale, cogs)}
                />
                <SummaryCard
                  label={t(
                    locale,
                    'অবশিষ্ট স্টকের মূল্য',
                    'Remaining stock value',
                  )}
                  value={format(locale, remainingStock)}
                />
              </div>
              <p className="md-muted">
                {t(
                  locale,
                  'সূত্র: বিক্রির আয় − (বিক্রিত একক × প্রতি একক landed cost) − অন্যান্য খরচ। পরিবহন খরচ landed cost-এর মধ্যে অন্তর্ভুক্ত।',
                  'Formula: revenue − (units sold × landed unit cost) − other costs. Freight is included in landed cost.',
                )}
              </p>
            </>
          ) : (
            <Empty>
              {t(
                locale,
                'ইনপুট ঠিক করলে ফলাফল দেখানো হবে।',
                'Correct the inputs to see the estimate.',
              )}
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}

function ReportsPanel({
  data,
  locale,
  allow,
  format,
  sales,
  purchases,
  expenses,
  totalSales,
  totalPurchases,
  totalExpenses,
  cogs,
  hasUnknownCosts,
  dueForCustomer,
  dueForSupplier,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: {
  data: LoadState;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  sales: Omit<SalesDocument, 'operation_id' | 'created_by'>[];
  purchases: Omit<PurchaseDocument, 'operation_id' | 'created_by'>[];
  expenses: Omit<
    BusinessExpense,
    'operation_id' | 'created_by' | 'voided_by'
  >[];
  totalSales: number;
  totalPurchases: number;
  totalExpenses: number;
  cogs: number;
  hasUnknownCosts: boolean;
  dueForCustomer: (id: string) => number;
  dueForSupplier: (id: string) => number;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}) {
  if (!allow('reports.view'))
    return (
      <Empty>
        {t(
          locale,
          'এই রিপোর্ট দেখতে reports.view অনুমতি প্রয়োজন।',
          'Grant reports.view to access business reports.',
        )}
      </Empty>
    );
  const customerDue = data.customers.reduce(
    (sum, row) => sum + dueForCustomer(row.id),
    0,
  );
  const supplierDue = data.suppliers.reduce(
    (sum, row) => sum + dueForSupplier(row.id),
    0,
  );
  return (
    <>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'রিপোর্টের সময়সীমা', 'Report date range')}</h3>
        </div>
        <div className="ops-filter-row">
          <Field
            label={t(locale, 'শুরু', 'From')}
            type="date"
            value={dateFrom}
            onChange={setDateFrom}
          />
          <Field
            label={t(locale, 'শেষ', 'To')}
            type="date"
            value={dateTo}
            onChange={setDateTo}
          />
          <button
            type="button"
            className="button md-small-button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            {t(locale, 'সব তারিখ', 'All dates')}
          </button>
        </div>
      </section>
      <div className="ops-summary-grid">
        <SummaryCard
          label={t(locale, 'বিক্রির মোট', 'Sales total')}
          value={format(locale, totalSales)}
          note={`${sales.length} ${t(locale, 'টি ইনভয়েস', 'invoices')}`}
        />
        <SummaryCard
          label={t(locale, 'কেনাকাটার মোট', 'Purchases total')}
          value={format(locale, totalPurchases)}
          note={`${purchases.length} ${t(locale, 'টি ক্রয়', 'purchases')}`}
        />
        <SummaryCard
          label={t(locale, 'পরিচালন খরচ', 'Operating expenses')}
          value={format(locale, totalExpenses)}
          note={`${expenses.length} ${t(locale, 'টি রেকর্ড', 'records')}`}
        />
        <SummaryCard
          label={t(locale, 'বিক্রিত পণ্যের খরচ (COGS)', 'Cost of goods sold')}
          value={hasUnknownCosts ? '—' : format(locale, cogs)}
          note={
            hasUnknownCosts
              ? t(
                  locale,
                  'অন্তত একটি বিক্রির প্রকৃত মূল্য অজানা',
                  'Cost is unknown for at least one sold line',
                )
              : t(
                  locale,
                  'শুধু রেকর্ড করা প্রকৃত খরচ',
                  'Recorded historical costs only',
                )
          }
        />
      </div>
      <div className="ops-summary-grid">
        <SummaryCard
          label={t(locale, 'বর্তমান ক্রেতা পাওনা', 'Current customer due')}
          value={format(locale, customerDue)}
          note={t(
            locale,
            'বর্তমান অবশিষ্ট পাওনা; নির্বাচিত তারিখ নয়',
            'Current outstanding balance, not date scoped',
          )}
        />
        <SummaryCard
          label={t(
            locale,
            'বর্তমান সরবরাহকারী বাকি',
            'Current supplier payable',
          )}
          value={format(locale, supplierDue)}
          note={t(
            locale,
            'বর্তমান অবশিষ্ট বাকি; নির্বাচিত তারিখ নয়',
            'Current outstanding balance, not date scoped',
          )}
        />
        <SummaryCard
          label={t(locale, 'আনুমানিক নিট লাভ', 'Estimated net profit')}
          value={
            hasUnknownCosts
              ? '—'
              : format(locale, totalSales - cogs - totalExpenses)
          }
          note={
            hasUnknownCosts
              ? t(
                  locale,
                  'প্রকৃত খরচ পূরণ না হওয়া পর্যন্ত দেখানো হবে না',
                  'Unavailable until historical costs are known',
                )
              : t(
                  locale,
                  'বিক্রি − COGS − পরিচালন খরচ',
                  'Sales − COGS − operating expenses',
                )
          }
        />
      </div>
      <div className="ops-two-col">
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'বিক্রির রিপোর্ট', 'Sales report')}</h3>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{t(locale, 'ইনভয়েস', 'Invoice')}</th>
                  <th>{t(locale, 'ক্রেতা', 'Customer')}</th>
                  <th>{t(locale, 'তারিখ', 'Date')}</th>
                  <th>{t(locale, 'মোট', 'Total')}</th>
                  <th>{t(locale, 'বাকি', 'Due')}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{sale.invoice_no}</td>
                    <td>{sale.customer_name_snapshot}</td>
                    <td>{formatDate(locale, sale.occurred_at)}</td>
                    <td>{format(locale, sale.total_amount)}</td>
                    <td>
                      {format(
                        locale,
                        dueForSale(sale, data.receiptAllocations),
                      )}
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {t(
                        locale,
                        'এই সময়সীমায় বিক্রি নেই।',
                        'No sales in this date range.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'কেনাকাটার রিপোর্ট', 'Purchases report')}</h3>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>{t(locale, 'ইনভয়েস', 'Invoice')}</th>
                  <th>{t(locale, 'সরবরাহকারী', 'Supplier')}</th>
                  <th>{t(locale, 'তারিখ', 'Date')}</th>
                  <th>{t(locale, 'মোট', 'Total')}</th>
                  <th>{t(locale, 'বাকি', 'Due')}</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{purchase.invoice_no}</td>
                    <td>{purchase.supplier_name_snapshot}</td>
                    <td>{formatDate(locale, purchase.occurred_at)}</td>
                    <td>{format(locale, purchase.total_amount)}</td>
                    <td>
                      {format(
                        locale,
                        dueForPurchase(purchase, data.supplierAllocations),
                      )}
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {t(
                        locale,
                        'এই সময়সীমায় কেনাকাটা নেই।',
                        'No purchases in this date range.',
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'খরচের রিপোর্ট', 'Expense report')}</h3>
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'তারিখ', 'Date')}</th>
                <th>{t(locale, 'খাত', 'Category')}</th>
                <th>{t(locale, 'নোট', 'Note')}</th>
                <th>{t(locale, 'পরিমাণ', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.expense_date}</td>
                  <td>{expense.category}</td>
                  <td>{expense.note || '—'}</td>
                  <td>{format(locale, expense.amount)}</td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    {t(
                      locale,
                      'এই সময়সীমায় খরচ নেই।',
                      'No expenses in this date range.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TransactionsPanel({
  data,
  locale,
  allow,
  format,
  query,
  setQuery,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: {
  data: LoadState;
  locale: Locale;
  allow: (permission: Parameters<typeof can>[2]) => boolean;
  format: (locale: Locale, value: string | number) => string;
  query: string;
  setQuery: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}) {
  const [kindFilter, setKindFilter] = useState<'ALL' | TransactionRow['kind']>(
    'ALL',
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const rows: TransactionRow[] = [
    ...data.sales.map((row) => {
      const customer = data.customers.find(
        (customer) => customer.id === row.customer_id,
      );
      return {
        kind: 'SALE' as const,
        id: row.id,
        ref: row.invoice_no,
        occurred: row.occurred_at,
        party: row.customer_name_snapshot,
        amount: moneyNumber(row.total_amount),
        due: dueForSale(row, data.receiptAllocations),
        extraSearch: `${customer?.shop_code ?? ''} ${customer?.shop_number ?? ''} ${customer?.phone ?? ''}`,
      };
    }),
    ...data.purchases.map((row) => ({
      kind: 'PURCHASE' as const,
      id: row.id,
      ref: row.invoice_no,
      occurred: row.occurred_at,
      party: row.supplier_name_snapshot,
      amount: moneyNumber(row.total_amount),
      due: dueForPurchase(row, data.supplierAllocations),
      extraSearch: row.reference_no ?? '',
    })),
    ...data.receipts.map((row) => ({
      kind: 'RECEIPT' as const,
      id: row.id,
      ref: row.receipt_no,
      occurred: row.received_at,
      party: row.customer_name_snapshot,
      amount: moneyNumber(row.amount),
      due: 0,
      extraSearch: `${row.reference_no ?? ''} ${row.note ?? ''}`,
    })),
    ...data.supplierPayments.map((row) => ({
      kind: 'SUPPLIER_PAYMENT' as const,
      id: row.id,
      ref: row.payment_no,
      occurred: row.paid_at,
      party: row.supplier_name_snapshot,
      amount: moneyNumber(row.amount),
      due: 0,
      extraSearch: `${row.reference_no ?? ''} ${row.note ?? ''}`,
    })),
  ];
  const filtered = rows
    .filter(
      (row) =>
        (!dateFrom || dateKeyDhaka(row.occurred) >= dateFrom) &&
        (!dateTo || dateKeyDhaka(row.occurred) <= dateTo) &&
        (kindFilter === 'ALL' || row.kind === kindFilter) &&
        `${row.ref} ${row.party} ${row.extraSearch}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => b.occurred.localeCompare(a.occurred));
  const selected = selectedKey
    ? (rows.find((row) => `${row.kind}:${row.id}` === selectedKey) ?? null)
    : null;
  const saleLines =
    selected?.kind === 'SALE'
      ? data.salesLines.filter((line) => line.sales_document_id === selected.id)
      : [];
  const purchaseLines =
    selected?.kind === 'PURCHASE'
      ? data.purchaseLines.filter(
          (line) => line.purchases_document_id === selected.id,
        )
      : [];
  const receipt =
    selected?.kind === 'RECEIPT'
      ? data.receipts.find((row) => row.id === selected.id)
      : null;
  const supplierPayment =
    selected?.kind === 'SUPPLIER_PAYMENT'
      ? data.supplierPayments.find((row) => row.id === selected.id)
      : null;
  const typeName = (kind: TransactionRow['kind']) =>
    ({
      SALE: t(locale, 'বিক্রি ইনভয়েস', 'Sales invoice'),
      PURCHASE: t(locale, 'ক্রয় ইনভয়েস', 'Purchase invoice'),
      RECEIPT: t(locale, 'ক্রেতার রসিদ', 'Customer receipt'),
      SUPPLIER_PAYMENT: t(locale, 'সরবরাহকারী পেমেন্ট', 'Supplier payment'),
    })[kind];
  return (
    <>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>
            {t(
              locale,
              'ইনভয়েস ও লেনদেন খোঁজো',
              'Search invoices and transactions',
            )}
          </h3>
          <button
            type="button"
            className="button md-small-button"
            onClick={() => {
              setQuery('');
              setDateFrom('');
              setDateTo('');
              setKindFilter('ALL');
              setSelectedKey(null);
            }}
          >
            {t(locale, 'ফিল্টার রিসেট', 'Reset filters')}
          </button>
        </div>
        <div className="ops-filter-row">
          <Field
            label={t(
              locale,
              'নাম, দোকান কোড বা ইনভয়েস',
              'Name, shop code or invoice',
            )}
            value={query}
            onChange={setQuery}
          />
          <Field
            label={t(locale, 'শুরু তারিখ', 'From date')}
            type="date"
            value={dateFrom}
            onChange={setDateFrom}
          />
          <Field
            label={t(locale, 'শেষ তারিখ', 'To date')}
            type="date"
            value={dateTo}
            onChange={setDateTo}
          />
          <label className="md-field">
            <span>{t(locale, 'লেনদেনের ধরন', 'Type')}</span>
            <select
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as typeof kindFilter)
              }
            >
              <option value="ALL">{t(locale, 'সব', 'All')}</option>
              <option value="SALE">{t(locale, 'বিক্রি', 'Sales')}</option>
              <option value="PURCHASE">
                {t(locale, 'কেনাকাটা', 'Purchases')}
              </option>
              <option value="RECEIPT">
                {t(locale, 'ক্রেতার রসিদ', 'Receipts')}
              </option>
              <option value="SUPPLIER_PAYMENT">
                {t(locale, 'সরবরাহকারী পেমেন্ট', 'Supplier payments')}
              </option>
            </select>
          </label>
        </div>
        <div className="ops-summary-grid">
          <SummaryCard
            label={t(
              locale,
              'বিক্রি মোট (ফিল্টারকৃত)',
              'Sales total (filtered)',
            )}
            value={format(
              locale,
              filtered
                .filter((row) => row.kind === 'SALE')
                .reduce((sum, row) => sum + row.amount, 0),
            )}
          />
          <SummaryCard
            label={t(
              locale,
              'কেনাকাটা মোট (ফিল্টারকৃত)',
              'Purchase total (filtered)',
            )}
            value={format(
              locale,
              filtered
                .filter((row) => row.kind === 'PURCHASE')
                .reduce((sum, row) => sum + row.amount, 0),
            )}
          />
          <SummaryCard
            label={t(locale, 'ক্রেতা রসিদ মোট', 'Receipt total')}
            value={format(
              locale,
              filtered
                .filter((row) => row.kind === 'RECEIPT')
                .reduce((sum, row) => sum + row.amount, 0),
            )}
          />
        </div>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{t(locale, 'ধরন', 'Type')}</th>
                <th>{t(locale, 'রেফারেন্স', 'Reference')}</th>
                <th>{t(locale, 'তারিখ', 'Date')}</th>
                <th>
                  {t(locale, 'ক্রেতা / সরবরাহকারী', 'Customer / supplier')}
                </th>
                <th>{t(locale, 'মোট', 'Amount')}</th>
                <th>{t(locale, 'বাকি', 'Due')}</th>
                <th>{t(locale, 'দেখুন', 'View')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={`${row.kind}:${row.id}`}>
                  <td>{typeName(row.kind)}</td>
                  <td>{row.ref}</td>
                  <td>{formatDate(locale, row.occurred)}</td>
                  <td>{row.party}</td>
                  <td>{format(locale, row.amount)}</td>
                  <td>
                    {row.kind === 'SALE'
                      ? (allow('sales.view') && allow('payments.receive')) ||
                        allow('reports.view') ||
                        allow('invoices.read')
                        ? format(locale, row.due)
                        : '—'
                      : row.kind === 'PURCHASE'
                        ? (allow('purchases.view') && allow('payments.pay')) ||
                          allow('reports.view') ||
                          allow('invoices.read')
                          ? format(locale, row.due)
                          : '—'
                        : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button md-small-button"
                      onClick={() => setSelectedKey(`${row.kind}:${row.id}`)}
                    >
                      {t(locale, 'বিস্তারিত', 'Details')}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    {t(
                      locale,
                      'মিলেছে এমন কোনো লেনদেন নেই।',
                      'No transactions match these filters.',
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <section className="ops-section ops-printable">
          <div className="ops-section-title">
            <h3>
              {typeName(selected.kind)} · {selected.ref}
            </h3>
            <div className="md-toolbar-actions">
              <button
                type="button"
                className="button"
                onClick={() => setSelectedKey(null)}
              >
                {t(locale, 'বন্ধ', 'Close')}
              </button>
              <button
                type="button"
                className="button auth-primary"
                onClick={() => window.print()}
              >
                {t(locale, 'প্রিন্ট / PDF', 'Print / PDF')}
              </button>
            </div>
          </div>
          <div className="ops-detail-grid">
            <p>
              <strong>{t(locale, 'তারিখ', 'Date')}:</strong>{' '}
              {formatDate(locale, selected.occurred)}
            </p>
            <p>
              <strong>{t(locale, 'নাম', 'Party')}:</strong> {selected.party}
            </p>
            <p>
              <strong>{t(locale, 'রেফারেন্স', 'Reference')}:</strong>{' '}
              {selected.ref}
            </p>
            <p>
              <strong>{t(locale, 'মোট', 'Amount')}:</strong>{' '}
              {format(locale, selected.amount)}
            </p>
            {selected.kind === 'SALE' &&
              ((allow('sales.view') && allow('payments.receive')) ||
                allow('reports.view') ||
                allow('invoices.read')) && (
                <p>
                  <strong>{t(locale, 'বাকি', 'Due')}:</strong>{' '}
                  {format(locale, selected.due)}
                </p>
              )}
            {selected.kind === 'PURCHASE' &&
              ((allow('purchases.view') && allow('payments.pay')) ||
                allow('reports.view') ||
                allow('invoices.read')) && (
                <p>
                  <strong>{t(locale, 'বাকি', 'Due')}:</strong>{' '}
                  {format(locale, selected.due)}
                </p>
              )}
          </div>
          {(saleLines.length > 0 || purchaseLines.length > 0) && (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'পণ্য', 'Product')}</th>
                    <th>{t(locale, 'পরিমাণ', 'Quantity')}</th>
                    <th>{t(locale, 'একক মূল্য', 'Unit price')}</th>
                    <th>{t(locale, 'লাইন মোট', 'Line total')}</th>
                    {purchaseLines.length > 0 && (
                      <th>
                        {t(
                          locale,
                          'অতিরিক্ত ব্যয়সহ একক খরচ',
                          'Landed unit cost',
                        )}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {saleLines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.product_name_bn_snapshot}
                        <small>{line.sku_snapshot || ''}</small>
                      </td>
                      <td>
                        {line.quantity} {line.unit_name_bn_snapshot}
                      </td>
                      <td>{format(locale, line.unit_price)}</td>
                      <td>
                        {line.line_total == null
                          ? '—'
                          : format(locale, line.line_total)}
                      </td>
                    </tr>
                  ))}
                  {purchaseLines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        {line.product_name_bn_snapshot}
                        <small>{line.sku_snapshot || ''}</small>
                      </td>
                      <td>
                        {line.quantity} {line.unit_name_bn_snapshot}
                      </td>
                      <td>
                        {line.unit_cost == null
                          ? '—'
                          : format(locale, line.unit_cost)}
                      </td>
                      <td>
                        {line.line_total == null
                          ? '—'
                          : format(locale, line.line_total)}
                      </td>
                      <td>
                        {line.landed_unit_cost == null
                          ? '—'
                          : format(locale, line.landed_unit_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {receipt && (
            <p>
              {t(
                locale,
                'ক্রেতার পেমেন্ট রসিদ—এটি বিক্রির ইনভয়েস নয়।',
                'Customer payment receipt — this is not a sales invoice.',
              )}{' '}
              · {payMethodLabel(locale, receipt.payment_method)} ·{' '}
              {format(locale, receipt.amount)}
              {receipt.note ? ` · ${receipt.note}` : ''}
            </p>
          )}
          {supplierPayment && (
            <p>
              {t(
                locale,
                'সরবরাহকারী পেমেন্ট রেকর্ড।',
                'Supplier payment record.',
              )}{' '}
              · {payMethodLabel(locale, supplierPayment.payment_method)} ·{' '}
              {format(locale, supplierPayment.amount)}
            </p>
          )}
          {(selected.kind === 'SALE' || selected.kind === 'PURCHASE') && (
            <p className="md-muted">
              {t(
                locale,
                'ঐতিহাসিক পণ্যের নাম, একক ও মূল্য ইনভয়েসে সংরক্ষিত snapshot থেকে এসেছে।',
                'Historical product names, units and prices come from saved invoice snapshots.',
              )}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function SettingsPanel({
  client,
  tenant,
  locale,
  onToggleLocale,
  onOpenDemo,
  onSettingsSaved,
  busy,
  runAction,
}: {
  client: SupabaseClient<Database> | null;
  tenant: Tenant;
  locale: Locale;
  onToggleLocale: () => void;
  onOpenDemo: () => void;
  onSettingsSaved: () => void;
  busy: boolean;
  runAction: (
    action: () => PromiseLike<{
      error: { message?: string; code?: string } | null;
      data?: unknown;
    }>,
    success: string,
  ) => Promise<unknown>;
}) {
  const [name, setName] = useState(tenant.business.name);
  const [phone, setPhone] = useState(tenant.business.phone ?? '');
  const [address, setAddress] = useState(tenant.business.address ?? '');
  const [email, setEmail] = useState(tenant.business.email ?? '');
  const [defaultLanguage, setDefaultLanguage] = useState<Locale>(locale);
  const [members, setMembers] = useState<
    { id: string; user_id: string; role: string; status: string }[]
  >([]);
  const [grants, setGrants] = useState<
    { member_id: string; permission: string }[]
  >([]);
  const [memberError, setMemberError] = useState('');
  const isOwner = tenant.member.role === 'OWNER';
  const currentBusinessId = tenant.business.id;
  const availablePermissions = [
    ['sales.view', t(locale, 'বিক্রি দেখা', 'View sales')],
    ['sales.create', t(locale, 'বিক্রি তৈরি', 'Create sales')],
    [
      'sales.price_override',
      t(locale, 'বিক্রয়মূল্য পরিবর্তন', 'Override sale price'),
    ],
    ['purchases.view', t(locale, 'কেনাকাটা দেখা', 'View purchases')],
    ['purchases.create', t(locale, 'কেনাকাটা তৈরি', 'Create purchases')],
    ['products.view', t(locale, 'পণ্য দেখা', 'View products')],
    ['products.manage', t(locale, 'পণ্য ব্যবস্থাপনা', 'Manage products')],
    ['customers.view', t(locale, 'ক্রেতা দেখা', 'View customers')],
    ['customers.manage', t(locale, 'ক্রেতা ব্যবস্থাপনা', 'Manage customers')],
    ['suppliers.view', t(locale, 'সরবরাহকারী দেখা', 'View suppliers')],
    [
      'suppliers.manage',
      t(locale, 'সরবরাহকারী ব্যবস্থাপনা', 'Manage suppliers'),
    ],
    ['inventory.view', t(locale, 'স্টক দেখা', 'View stock')],
    ['inventory.adjust', t(locale, 'স্টক সমন্বয়', 'Adjust stock')],
    ['inventory.value.read', t(locale, 'স্টক মূল্য দেখা', 'Read stock value')],
    [
      'payments.receive',
      t(locale, 'ক্রেতার পেমেন্ট গ্রহণ', 'Receive customer payments'),
    ],
    ['payments.pay', t(locale, 'সরবরাহকারীকে পেমেন্ট', 'Pay suppliers')],
    ['expenses.view', t(locale, 'খরচ দেখা', 'View expenses')],
    ['expenses.create', t(locale, 'খরচ যোগ / বাতিল', 'Create / void expenses')],
    ['reports.view', t(locale, 'রিপোর্ট দেখা', 'View reports')],
    ['profit.read', t(locale, 'লাভ দেখা', 'Read profit')],
    [
      'costs.read',
      t(locale, 'ক্রয় রেফারেন্স মূল্য দেখা', 'Read reference cost'),
    ],
    ['invoices.read', t(locale, 'ইনভয়েস দেখা', 'View invoices')],
    ['audit.read', t(locale, 'অডিট লগ দেখা', 'Read audit log')],
  ] as const;
  useEffect(() => {
    let cancelled = false;
    if (!client) return;
    void Promise.all([
      client
        .from('business_settings')
        .select('default_language')
        .eq('business_id', currentBusinessId)
        .maybeSingle(),
      isOwner
        ? client
            .from('business_members')
            .select('id,user_id,role,status')
            .eq('business_id', currentBusinessId)
            .order('created_at')
        : Promise.resolve({ data: null, error: null }),
      isOwner
        ? client
            .from('business_member_permissions')
            .select('member_id,permission')
        : Promise.resolve({ data: null, error: null }),
    ])
      .then(([settingsResult, memberResult, permissionResult]) => {
        if (cancelled) return;
        if (
          settingsResult.data?.default_language === 'bn' ||
          settingsResult.data?.default_language === 'en'
        )
          setDefaultLanguage(settingsResult.data.default_language);
        if (memberResult.error || permissionResult.error)
          setMemberError(
            (memberResult.error ?? permissionResult.error)?.message ??
              'Unable to load permissions',
          );
        setMembers(
          (memberResult.data ?? []) as {
            id: string;
            user_id: string;
            role: string;
            status: string;
          }[],
        );
        setGrants(
          (permissionResult.data ?? []) as {
            member_id: string;
            permission: string;
          }[],
        );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setMemberError(
            error instanceof Error ? error.message : String(error),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client, currentBusinessId, isOwner]);
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !isOwner) return;
    const result = await runAction(
      () =>
        client.rpc('update_business_profile', {
          p_business_id: currentBusinessId,
          p_name: name.trim(),
          p_phone: phone.trim() || null,
          p_address: address.trim() || null,
          p_email: email.trim() || null,
          p_default_language: defaultLanguage,
        }),
      t(locale, 'ব্যবসার তথ্য সংরক্ষিত হয়েছে।', 'Business profile saved.'),
    );
    if (result !== null) onSettingsSaved();
  };
  const changeGrant = async (
    memberId: string,
    permission: string,
    checked: boolean,
  ) => {
    if (!client || !isOwner) return;
    const result = await runAction(
      () =>
        checked
          ? client
              .from('business_member_permissions')
              .insert({ member_id: memberId, permission })
          : client
              .from('business_member_permissions')
              .delete()
              .eq('member_id', memberId)
              .eq('permission', permission),
      t(locale, 'Staff permission আপডেট হয়েছে।', 'Staff permission updated.'),
    );
    if (result !== null)
      setGrants((old) =>
        checked
          ? [...old, { member_id: memberId, permission }]
          : old.filter(
              (row) =>
                row.member_id !== memberId || row.permission !== permission,
            ),
      );
  };
  const changeStatus = async (
    memberId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) => {
    if (!client || !isOwner) return;
    if (
      !window.confirm(
        t(
          locale,
          `এই Staff সদস্যকে ${status === 'ACTIVE' ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করবে?`,
          `Set this staff member to ${status}?`,
        ),
      )
    )
      return;
    const result = await runAction(
      () =>
        client
          .from('business_members')
          .update({ status })
          .eq('business_id', currentBusinessId)
          .eq('id', memberId),
      t(locale, 'Staff status আপডেট হয়েছে।', 'Staff status updated.'),
    );
    if (result !== null)
      setMembers((old) =>
        old.map((row) => (row.id === memberId ? { ...row, status } : row)),
      );
  };
  return (
    <>
      <div className="ops-notice">
        {t(
          locale,
          'ভাষা পরিবর্তন পুরো অ্যাপের লেখায় প্রযোজ্য হবে। লাইভ ব্যবসার ডেটা Demo reset দিয়ে মুছে ফেলা হয় না; এই পেজে কোনো live-data reset নেই।',
          'Language applies to the interface. Demo reset never deletes live business data; this page intentionally has no live-data reset action.',
        )}
      </div>
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>
            {t(
              locale,
              'ভাষা ও ব্যবসার পরিচিতি',
              'Language and business profile',
            )}
          </h3>
          <button className="button" type="button" onClick={onToggleLocale}>
            {locale === 'bn' ? 'English' : 'বাংলা'}
          </button>
        </div>
        <form className="md-form" onSubmit={(event) => void saveProfile(event)}>
          <Field
            label={t(locale, 'ব্যবসার নাম', 'Business name')}
            value={name}
            onChange={setName}
            required
            readOnly={!isOwner}
          />
          <div className="md-formgrid">
            <Field
              label={t(locale, 'মোবাইল', 'Phone')}
              value={phone}
              onChange={setPhone}
              readOnly={!isOwner}
            />
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
              readOnly={!isOwner}
            />
          </div>
          <Field
            label={t(locale, 'ঠিকানা', 'Address')}
            value={address}
            onChange={setAddress}
            readOnly={!isOwner}
          />
          <SelectField
            label={t(locale, 'ডিফল্ট ভাষা', 'Default language')}
            value={defaultLanguage}
            onChange={(value) => setDefaultLanguage(value as Locale)}
          >
            <option value="bn">বাংলা</option>
            <option value="en">English</option>
          </SelectField>
          <p className="md-muted">
            {t(
              locale,
              'মুদ্রা: BDT (৳) · টাইমজোন: Asia/Dhaka · নেগেটিভ স্টক নিষিদ্ধ।',
              'Currency: BDT (৳) · Timezone: Asia/Dhaka · Negative stock is disabled.',
            )}
          </p>
          {isOwner && (
            <button
              type="submit"
              className="button auth-primary"
              disabled={busy}
            >
              {t(locale, 'প্রোফাইল সংরক্ষণ', 'Save profile')}
            </button>
          )}
        </form>
      </section>
      {isOwner && (
        <section className="ops-section">
          <div className="ops-section-title">
            <h3>{t(locale, 'Staff ও অনুমতি', 'Staff and permissions')}</h3>
          </div>
          <p className="md-muted">
            {t(
              locale,
              'নতুন Staff অ্যাকাউন্ট তৈরির invitation এই ব্যাচে নেই। বিদ্যমান Staff-এর অনুমতি ডিফল্টভাবে বন্ধ; এখানে কেবল প্রয়োজনীয় access দেওয়া যায়।',
              'Staff invitation is not part of this batch. Existing staff defaults to no access; grant only the permissions they need.',
            )}
          </p>
          {memberError && (
            <div className="md-alert" role="alert">
              {memberError}
            </div>
          )}
          {members
            .filter((member) => member.role === 'STAFF')
            .map((member) => (
              <div className="ops-staff-card" key={member.id}>
                <div className="ops-section-title">
                  <div>
                    <strong>{member.user_id.slice(0, 8)}…</strong>
                    <small>{member.status}</small>
                  </div>
                  <button
                    className="button md-small-button"
                    type="button"
                    onClick={() =>
                      void changeStatus(
                        member.id,
                        member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                      )
                    }
                    disabled={busy}
                  >
                    {member.status === 'ACTIVE'
                      ? t(locale, 'নিষ্ক্রিয় করো', 'Deactivate')
                      : t(locale, 'সক্রিয় করো', 'Activate')}
                  </button>
                </div>
                <div className="ops-permission-grid">
                  {availablePermissions.map(([permission, label]) => (
                    <label key={permission} className="ops-permission">
                      <input
                        type="checkbox"
                        checked={grants.some(
                          (row) =>
                            row.member_id === member.id &&
                            row.permission === permission,
                        )}
                        disabled={busy || member.status !== 'ACTIVE'}
                        onChange={(event) =>
                          void changeGrant(
                            member.id,
                            permission,
                            event.target.checked,
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          {members.filter((member) => member.role === 'STAFF').length === 0 && (
            <Empty>
              {t(
                locale,
                'এখনো কোনো Staff সদস্য যোগ হয়নি।',
                'No staff members have been added yet.',
              )}
            </Empty>
          )}
        </section>
      )}
      <section className="ops-section">
        <div className="ops-section-title">
          <h3>{t(locale, 'ডেমো প্রিভিউ', 'Demo preview')}</h3>
          <button type="button" className="button" onClick={onOpenDemo}>
            {t(locale, 'ডেমো খুলুন', 'Open demo')}
          </button>
        </div>
        <p className="md-muted">
          {t(
            locale,
            'Demo আলাদা নমুনা UI; এই অপশন বর্তমান ব্যবসার লেনদেন, স্টক বা পাওনার কোনো পরিবর্তন করে না।',
            'The demo is a separate sample UI and this action does not change the live business records.',
          )}
        </p>
      </section>
    </>
  );
}
