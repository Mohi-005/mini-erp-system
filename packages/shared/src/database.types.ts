// Hand-maintained constrained client contract. PostgreSQL constraints, grants,
// RLS, and permission policies remain authoritative. Numeric inputs are sent as
// decimal strings so client code does not need to calculate money with floats.
export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  preferred_language: 'bn' | 'en';
  created_at: string;
  updated_at: string;
};

export type Business = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  country: 'BD';
  currency: 'BDT';
  timezone: 'Asia/Dhaka';
  created_by: string;
  onboarding_key: string;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  business_id: string;
  user_id: string;
  role: 'OWNER' | 'STAFF';
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
};

export type Settings = {
  business_id: string;
  default_language: 'bn' | 'en';
  currency: 'BDT';
  timezone: 'Asia/Dhaka';
  negative_stock_allowed: false;
  created_at: string;
  updated_at: string;
};

export type MemberPermission = {
  member_id: string;
  permission: string;
  created_at: string;
};

export type ProductCategory = {
  id: string;
  business_id: string;
  name_bn: string;
  name_en: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductUnit = {
  id: string;
  business_id: string;
  code: string | null;
  name_bn: string;
  name_en: string | null;
  is_builtin: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  customer_type: 'INDIVIDUAL' | 'SHOP';
  owner_name: string | null;
  shop_number: string | null;
  shop_code: string | null;
  email: string | null;
  linked_supplier_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesDocument = {
  id: string;
  business_id: string;
  invoice_no: string;
  operation_id: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  total_amount: string | number;
  paid_amount_at_sale: string | number;
  payment_method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | null;
  occurred_at: string;
  created_by: string;
  created_at: string;
};

export type SalesLine = {
  id: string;
  business_id: string;
  sales_document_id: string;
  line_no: number;
  product_id: string;
  product_name_bn_snapshot: string;
  product_name_en_snapshot: string | null;
  sku_snapshot: string | null;
  unit_name_bn_snapshot: string;
  quantity: string | number;
  unit_price: string | number;
  line_total: string | number;
  unit_cost_at_sale: string | number | null;
  cogs_amount: string | number | null;
  costing_status: 'KNOWN' | 'UNKNOWN';
  created_at: string;
};

export type SalesLineRead = {
  id: string;
  business_id: string;
  sales_document_id: string;
  line_no: number;
  product_id: string;
  product_name_bn_snapshot: string;
  product_name_en_snapshot: string | null;
  sku_snapshot: string | null;
  unit_name_bn_snapshot: string;
  quantity: string | number;
  unit_price: string | number;
  line_total: string | number;
  unit_cost_at_sale: string | number | null;
  cogs_amount: string | number | null;
  costing_status: 'KNOWN' | 'UNKNOWN';
  cost_visible: boolean;
  created_at: string;
};

export type PurchaseDocument = {
  id: string;
  business_id: string;
  invoice_no: string;
  operation_id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  reference_no: string | null;
  subtotal_amount: string | number;
  other_cost_total: string | number;
  total_amount: string | number;
  paid_amount_at_purchase: string | number;
  payment_method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | null;
  occurred_at: string;
  created_by: string;
  created_at: string;
};

export type PurchaseLine = {
  id: string;
  business_id: string;
  purchases_document_id: string;
  line_no: number;
  product_id: string;
  product_name_bn_snapshot: string;
  product_name_en_snapshot: string | null;
  sku_snapshot: string | null;
  unit_name_bn_snapshot: string;
  quantity: string | number;
  unit_cost: string | number;
  line_total: string | number;
  allocated_other_cost: string | number;
  landed_unit_cost: string | number;
  created_at: string;
};

export type PurchaseLineRead = Omit<
  PurchaseLine,
  'unit_cost' | 'line_total' | 'allocated_other_cost' | 'landed_unit_cost'
> & {
  unit_cost: string | number | null;
  line_total: string | number | null;
  allocated_other_cost: string | number | null;
  landed_unit_cost: string | number | null;
  cost_visible: boolean;
};

export type CustomerReceipt = {
  id: string;
  business_id: string;
  receipt_no: string;
  operation_id: string;
  customer_id: string;
  customer_name_snapshot: string;
  amount: string | number;
  payment_method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK';
  reference_no: string | null;
  note: string | null;
  received_at: string;
  created_by: string;
  created_at: string;
};

export type CustomerReceiptAllocation = {
  business_id: string;
  receipt_id: string;
  sales_document_id: string;
  amount: string | number;
  created_at: string;
};

export type SupplierPayment = {
  id: string;
  business_id: string;
  payment_no: string;
  operation_id: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  amount: string | number;
  payment_method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK';
  reference_no: string | null;
  note: string | null;
  paid_at: string;
  created_by: string;
  created_at: string;
};

export type SupplierPaymentAllocation = {
  business_id: string;
  supplier_payment_id: string;
  purchases_document_id: string;
  amount: string | number;
  created_at: string;
};

export type BusinessExpense = {
  id: string;
  business_id: string;
  operation_id: string;
  category: string;
  amount: string | number;
  expense_date: string;
  payment_method: 'CASH' | 'BKASH' | 'NAGAD' | 'BANK';
  reference_no: string | null;
  note: string | null;
  status: 'ACTIVE' | 'VOIDED';
  void_reason: string | null;
  created_by: string;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
};

export type InventoryCostState = {
  business_id: string;
  product_id: string;
  priced_quantity: string | number;
  unpriced_quantity: string | number;
  average_unit_cost: string | number;
  updated_at: string;
};

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Product = {
  id: string;
  business_id: string;
  name_bn: string;
  name_en: string | null;
  sku: string | null;
  category_id: string | null;
  unit_id: string;
  preferred_supplier_id: string | null;
  default_selling_price: number;
  minimum_stock: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductPurchaseReference = {
  business_id: string;
  product_id: string;
  reference_purchase_price: number;
  created_at: string;
  updated_at: string;
};

export type InventoryBalance = {
  business_id: string;
  product_id: string;
  quantity: number;
  first_movement_at: string | null;
  updated_at: string;
};

export type InventoryMovementType =
  | 'opening'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'purchase'
  | 'sale'
  | 'purchase_return'
  | 'sale_return'
  | 'reversal';

export type InventorySourceKind =
  | 'opening_stock'
  | 'manual_adjustment'
  | 'purchase'
  | 'sale'
  | 'purchase_return'
  | 'sale_return'
  | 'reversal';

export type InventoryMovement = {
  id: string;
  business_id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  quantity_after: number;
  source_kind: InventorySourceKind;
  source_id: string | null;
  operation_id: string;
  reason: string | null;
  created_by: string;
  created_at: string;
  unit_cost: string | number | null;
  value_delta: string | number | null;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  // Relation embedding stays deliberately outside this hand-maintained
  // contract; fetch related master records separately unless generated types
  // with verified FK metadata are adopted in a dedicated change.
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        never,
        Partial<Pick<Profile, 'display_name' | 'phone' | 'preferred_language'>>
      >;
      businesses: Table<
        Business,
        never,
        Partial<Pick<Business, 'name' | 'phone' | 'address' | 'email'>>
      >;
      business_members: Table<
        Member,
        Pick<Member, 'business_id' | 'user_id' | 'role'> & {
          status?: Member['status'];
        },
        { status?: Member['status'] }
      >;
      business_member_permissions: Table<
        MemberPermission,
        Pick<MemberPermission, 'member_id' | 'permission'>,
        never
      >;
      business_settings: Table<
        Settings,
        never,
        { default_language?: 'bn' | 'en' }
      >;
      product_categories: Table<
        ProductCategory,
        Pick<ProductCategory, 'business_id' | 'name_bn'> & {
          name_en?: ProductCategory['name_en'];
        },
        Partial<Pick<ProductCategory, 'name_bn' | 'name_en' | 'archived_at'>>
      >;
      product_units: Table<
        ProductUnit,
        Pick<ProductUnit, 'business_id' | 'name_bn'> & {
          name_en?: ProductUnit['name_en'];
        },
        Partial<Pick<ProductUnit, 'name_bn' | 'name_en' | 'archived_at'>>
      >;
      customers: Table<
        Customer,
        Pick<Customer, 'business_id' | 'name'> & {
          phone?: Customer['phone'];
          address?: Customer['address'];
          notes?: Customer['notes'];
          customer_type?: Customer['customer_type'];
          owner_name?: Customer['owner_name'];
          shop_number?: Customer['shop_number'];
          shop_code?: Customer['shop_code'];
          email?: Customer['email'];
          linked_supplier_id?: Customer['linked_supplier_id'];
        },
        Partial<
          Pick<
            Customer,
            | 'name'
            | 'phone'
            | 'address'
            | 'notes'
            | 'archived_at'
            | 'customer_type'
            | 'owner_name'
            | 'shop_number'
            | 'shop_code'
            | 'email'
            | 'linked_supplier_id'
          >
        >
      >;
      suppliers: Table<
        Supplier,
        Pick<Supplier, 'business_id' | 'name'> & {
          phone?: Supplier['phone'];
          address?: Supplier['address'];
          notes?: Supplier['notes'];
        },
        Partial<
          Pick<Supplier, 'name' | 'phone' | 'address' | 'notes' | 'archived_at'>
        >
      >;
      products: Table<
        Product,
        Pick<Product, 'business_id' | 'name_bn' | 'unit_id'> & {
          name_en?: Product['name_en'];
          sku?: Product['sku'];
          category_id?: Product['category_id'];
          preferred_supplier_id?: Product['preferred_supplier_id'];
          default_selling_price: string;
          minimum_stock?: string | null;
        },
        Partial<
          Pick<
            Product,
            | 'name_bn'
            | 'name_en'
            | 'sku'
            | 'category_id'
            | 'unit_id'
            | 'preferred_supplier_id'
            | 'archived_at'
          >
        > & {
          default_selling_price?: string;
          minimum_stock?: string | null;
        }
      >;
      product_purchase_references: Table<
        ProductPurchaseReference,
        Pick<ProductPurchaseReference, 'business_id' | 'product_id'> & {
          reference_purchase_price: string;
        },
        { reference_purchase_price?: string }
      >;
      inventory_balances: Table<InventoryBalance, never, never>;
      inventory_movements: Table<InventoryMovement, never, never>;
      inventory_cost_state: Table<InventoryCostState, never, never>;
      sales_documents: Table<SalesDocument, never, never>;
      sales_lines: Table<SalesLine, never, never>;
      purchases_documents: Table<PurchaseDocument, never, never>;
      purchase_lines: Table<PurchaseLine, never, never>;
      customer_receipts: Table<CustomerReceipt, never, never>;
      customer_receipt_allocations: Table<
        CustomerReceiptAllocation,
        never,
        never
      >;
      supplier_payments: Table<SupplierPayment, never, never>;
      supplier_payment_allocations: Table<
        SupplierPaymentAllocation,
        never,
        never
      >;
      business_expenses: Table<BusinessExpense, never, never>;
      business_audit_log: Table<
        {
          id: string;
          business_id: string;
          actor_id: string | null;
          action: string;
          record_type: string;
          record_id: string | null;
          details: Json;
          created_at: string;
        },
        never,
        never
      >;
    };
    Views: {
      purchase_lines_read: { Row: PurchaseLineRead; Relationships: [] };
      sales_lines_read: { Row: SalesLineRead; Relationships: [] };
      customer_due_summary: {
        Row: {
          business_id: string;
          customer_id: string;
          customer_name: string;
          phone: string | null;
          outstanding_amount: string | number;
        };
        Relationships: [];
      };
      supplier_due_summary: {
        Row: {
          business_id: string;
          supplier_id: string;
          supplier_name: string;
          phone: string | null;
          outstanding_amount: string | number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_initial_business: {
        Args: {
          p_request_id: string;
          p_business_name: string;
          p_display_name?: string;
          p_phone?: string | null;
          p_address?: string | null;
        };
        Returns: string;
      };
      record_inventory_opening_stock: {
        Args: {
          p_product_id: string;
          p_quantity: string | number;
          p_operation_id: string;
          p_note?: string | null;
        };
        Returns: InventoryMovement;
      };
      adjust_inventory_stock: {
        Args: {
          p_product_id: string;
          p_direction: 'IN' | 'OUT';
          p_quantity: string | number;
          p_reason: string;
          p_operation_id: string;
        };
        Returns: InventoryMovement;
      };
      post_sale: {
        Args: {
          p_business_id: string;
          p_customer_id: string | null;
          p_lines: Json;
          p_paid_amount: string | number;
          p_payment_method: string | null;
          p_operation_id: string;
          p_occurred_at?: string;
        };
        Returns: Json;
      };
      post_purchase: {
        Args: {
          p_business_id: string;
          p_supplier_id: string;
          p_lines: Json;
          p_other_cost_total: string | number;
          p_paid_amount: string | number;
          p_payment_method: string | null;
          p_reference_no: string | null;
          p_operation_id: string;
          p_occurred_at?: string;
        };
        Returns: Json;
      };
      collect_customer_payment: {
        Args: {
          p_business_id: string;
          p_customer_id: string;
          p_amount: string | number;
          p_payment_method: string;
          p_reference_no: string | null;
          p_note: string | null;
          p_operation_id: string;
          p_received_at?: string;
        };
        Returns: Json;
      };
      pay_supplier: {
        Args: {
          p_business_id: string;
          p_supplier_id: string;
          p_amount: string | number;
          p_payment_method: string;
          p_reference_no: string | null;
          p_note: string | null;
          p_operation_id: string;
          p_paid_at?: string;
        };
        Returns: Json;
      };
      create_business_expense: {
        Args: {
          p_business_id: string;
          p_category: string;
          p_amount: string | number;
          p_expense_date: string;
          p_payment_method: string;
          p_reference_no: string | null;
          p_note: string | null;
          p_operation_id: string;
        };
        Returns: Json;
      };
      void_business_expense: {
        Args: { p_business_id: string; p_expense_id: string; p_reason: string };
        Returns: Json;
      };
      update_business_profile: {
        Args: {
          p_business_id: string;
          p_name: string;
          p_phone: string | null;
          p_address: string | null;
          p_email: string | null;
          p_default_language: string;
        };
        Returns: Business;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
