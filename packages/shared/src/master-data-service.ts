import type { SupabaseClient } from '@supabase/supabase-js';

import type { Tenant } from './auth.ts';
import type {
  Customer,
  Database,
  Product,
  ProductCategory,
  ProductPurchaseReference,
  ProductUnit,
  Supplier,
} from './database.types.ts';
import { can, type Permission } from './permissions.ts';
import {
  normalizeNonNegativeDecimal,
  validateCategoryDraft,
  validateCustomerDraft,
  validateProductDraft,
  validateSupplierDraft,
  validateUnitDraft,
  type NamedMasterDraftInput,
  type PartyDraftInput,
  type ProductDraftInput,
  type ValidationIssue,
  type ValidationResult,
} from './master-data.ts';

type DatabaseErrorLike = {
  code: string;
  message: string;
};

export type MasterDataServiceErrorCode =
  | 'invalid_context'
  | 'permission_denied'
  | 'validation_failed'
  | 'not_found'
  | 'database_error';

export class MasterDataServiceError extends Error {
  readonly code: MasterDataServiceErrorCode;
  readonly fieldErrors: Record<string, ValidationIssue> | null;
  readonly databaseCode: string | null;
  readonly databaseMessage: string | null;

  constructor(
    code: MasterDataServiceErrorCode,
    fieldErrors: Record<string, ValidationIssue> | null = null,
    databaseCode: string | null = null,
    databaseMessage: string | null = null,
  ) {
    super(code);
    this.name = 'MasterDataServiceError';
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.databaseCode = databaseCode;
    this.databaseMessage = databaseMessage;
  }
}

function validated<T>(result: ValidationResult<T>): T {
  if (!result.valid) {
    throw new MasterDataServiceError('validation_failed', result.errors);
  }

  return result.value;
}

function rowOrThrow<T>(data: T | null, error: DatabaseErrorLike | null): T {
  if (error) {
    throw new MasterDataServiceError(
      'database_error',
      null,
      error.code,
      error.message,
    );
  }

  if (data === null) {
    throw new MasterDataServiceError('not_found');
  }

  return data;
}

function listOrThrow<T>(
  data: T[] | null,
  error: DatabaseErrorLike | null,
): T[] {
  if (error) {
    throw new MasterDataServiceError(
      'database_error',
      null,
      error.code,
      error.message,
    );
  }

  return data ?? [];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ArchiveableTable =
  | 'product_categories'
  | 'product_units'
  | 'customers'
  | 'suppliers'
  | 'products';

export class MasterDataService {
  private readonly client: SupabaseClient<Database>;
  private readonly tenant: Tenant;

  constructor(client: SupabaseClient<Database>, tenant: Tenant) {
    if (tenant.member.business_id !== tenant.business.id) {
      throw new MasterDataServiceError('invalid_context');
    }

    this.client = client;
    this.tenant = tenant;
  }

  private get businessId(): string {
    return this.tenant.business.id;
  }

  private requirePermission(permission: Permission): void {
    if (!can(this.tenant.member, this.tenant.permissions, permission)) {
      throw new MasterDataServiceError('permission_denied');
    }
  }

  private requireCostAccess(write: boolean): void {
    this.requirePermission(write ? 'products.manage' : 'products.view');
    this.requirePermission('costs.read');
  }

  // ---------- Product categories ----------

  async listCategories(includeArchived = false): Promise<ProductCategory[]> {
    this.requirePermission('products.view');

    const result = includeArchived
      ? await this.client
          .from('product_categories')
          .select('*')
          .eq('business_id', this.businessId)
          .order('name_bn', { ascending: true })
      : await this.client
          .from('product_categories')
          .select('*')
          .eq('business_id', this.businessId)
          .is('archived_at', null)
          .order('name_bn', { ascending: true });

    return listOrThrow(result.data, result.error);
  }

  async saveCategory(
    input: NamedMasterDraftInput,
    id?: string,
  ): Promise<ProductCategory> {
    this.requirePermission('products.manage');

    const draft = validated(validateCategoryDraft(input));

    if (id) {
      const { data, error } = await this.client
        .from('product_categories')
        .update(draft)
        .eq('business_id', this.businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      return rowOrThrow(data, error);
    }

    const { data, error } = await this.client
      .from('product_categories')
      .insert({
        business_id: this.businessId,
        ...draft,
      })
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  async archiveCategory(id: string): Promise<void> {
    await this.setArchived('product_categories', id, true);
  }

  async restoreCategory(id: string): Promise<void> {
    await this.setArchived('product_categories', id, false);
  }

  // ---------- Product units ----------

  async listUnits(includeArchived = false): Promise<ProductUnit[]> {
    this.requirePermission('products.view');

    const result = includeArchived
      ? await this.client
          .from('product_units')
          .select('*')
          .eq('business_id', this.businessId)
          .order('name_bn', { ascending: true })
      : await this.client
          .from('product_units')
          .select('*')
          .eq('business_id', this.businessId)
          .is('archived_at', null)
          .order('name_bn', { ascending: true });

    return listOrThrow(result.data, result.error);
  }

  async saveUnit(
    input: NamedMasterDraftInput,
    id?: string,
  ): Promise<ProductUnit> {
    this.requirePermission('products.manage');

    const draft = validated(validateUnitDraft(input));

    if (id) {
      const { data, error } = await this.client
        .from('product_units')
        .update(draft)
        .eq('business_id', this.businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      return rowOrThrow(data, error);
    }

    const { data, error } = await this.client
      .from('product_units')
      .insert({
        business_id: this.businessId,
        ...draft,
      })
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  async archiveUnit(id: string): Promise<void> {
    await this.setArchived('product_units', id, true);
  }

  async restoreUnit(id: string): Promise<void> {
    await this.setArchived('product_units', id, false);
  }

  // ---------- Customers ----------

  async listCustomers(includeArchived = false): Promise<Customer[]> {
    this.requirePermission('customers.view');

    const result = includeArchived
      ? await this.client
          .from('customers')
          .select('*')
          .eq('business_id', this.businessId)
          .order('name', { ascending: true })
      : await this.client
          .from('customers')
          .select('*')
          .eq('business_id', this.businessId)
          .is('archived_at', null)
          .order('name', { ascending: true });

    return listOrThrow(result.data, result.error);
  }

  async saveCustomer(input: PartyDraftInput, id?: string): Promise<Customer> {
    this.requirePermission('customers.manage');

    const draft = validated(validateCustomerDraft(input));

    if (id) {
      const { data, error } = await this.client
        .from('customers')
        .update(draft)
        .eq('business_id', this.businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      return rowOrThrow(data, error);
    }

    const { data, error } = await this.client
      .from('customers')
      .insert({
        business_id: this.businessId,
        ...draft,
      })
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  async archiveCustomer(id: string): Promise<void> {
    await this.setArchived('customers', id, true);
  }

  async restoreCustomer(id: string): Promise<void> {
    await this.setArchived('customers', id, false);
  }

  // ---------- Suppliers ----------

  async listSuppliers(includeArchived = false): Promise<Supplier[]> {
    this.requirePermission('suppliers.view');

    const result = includeArchived
      ? await this.client
          .from('suppliers')
          .select('*')
          .eq('business_id', this.businessId)
          .order('name', { ascending: true })
      : await this.client
          .from('suppliers')
          .select('*')
          .eq('business_id', this.businessId)
          .is('archived_at', null)
          .order('name', { ascending: true });

    return listOrThrow(result.data, result.error);
  }

  async saveSupplier(input: PartyDraftInput, id?: string): Promise<Supplier> {
    this.requirePermission('suppliers.manage');

    const draft = validated(validateSupplierDraft(input));

    if (id) {
      const { data, error } = await this.client
        .from('suppliers')
        .update(draft)
        .eq('business_id', this.businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      return rowOrThrow(data, error);
    }

    const { data, error } = await this.client
      .from('suppliers')
      .insert({
        business_id: this.businessId,
        ...draft,
      })
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  async archiveSupplier(id: string): Promise<void> {
    await this.setArchived('suppliers', id, true);
  }

  async restoreSupplier(id: string): Promise<void> {
    await this.setArchived('suppliers', id, false);
  }

  // ---------- Products ----------

  async listProducts(includeArchived = false): Promise<Product[]> {
    this.requirePermission('products.view');

    const result = includeArchived
      ? await this.client
          .from('products')
          .select('*')
          .eq('business_id', this.businessId)
          .order('name_bn', { ascending: true })
      : await this.client
          .from('products')
          .select('*')
          .eq('business_id', this.businessId)
          .is('archived_at', null)
          .order('name_bn', { ascending: true });

    return listOrThrow(result.data, result.error);
  }

  async saveProduct(input: ProductDraftInput, id?: string): Promise<Product> {
    this.requirePermission('products.manage');

    const draft = validated(validateProductDraft(input));

    if (id) {
      const { data, error } = await this.client
        .from('products')
        .update(draft)
        .eq('business_id', this.businessId)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      return rowOrThrow(data, error);
    }

    const { data, error } = await this.client
      .from('products')
      .insert({
        business_id: this.businessId,
        ...draft,
      })
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  async archiveProduct(id: string): Promise<void> {
    await this.setArchived('products', id, true);
  }

  async restoreProduct(id: string): Promise<void> {
    await this.setArchived('products', id, false);
  }

  // ---------- Restricted purchase-price references ----------

  async listPurchaseReferences(): Promise<ProductPurchaseReference[]> {
    this.requireCostAccess(false);

    const { data, error } = await this.client
      .from('product_purchase_references')
      .select('*')
      .eq('business_id', this.businessId)
      .order('product_id', { ascending: true });

    return listOrThrow(data, error);
  }

  async savePurchaseReference(
    productIdInput: string,
    priceInput: string,
  ): Promise<ProductPurchaseReference> {
    this.requireCostAccess(true);

    const productId = productIdInput.trim();
    const fieldErrors: Record<string, ValidationIssue> = {};

    if (!productId) {
      fieldErrors.product_id = 'required';
    } else if (!UUID_PATTERN.test(productId)) {
      fieldErrors.product_id = 'invalid_uuid';
    }

    const price = normalizeNonNegativeDecimal(priceInput);

    if (!priceInput.trim()) {
      fieldErrors.reference_purchase_price = 'required';
    } else if (price === null) {
      fieldErrors.reference_purchase_price = 'invalid_decimal';
    }

    if (Object.keys(fieldErrors).length > 0 || price === null) {
      throw new MasterDataServiceError('validation_failed', fieldErrors);
    }

    const { data, error } = await this.client
      .from('product_purchase_references')
      .upsert(
        {
          business_id: this.businessId,
          product_id: productId,
          reference_purchase_price: price,
        },
        {
          onConflict: 'business_id,product_id',
        },
      )
      .select('*')
      .single();

    return rowOrThrow(data, error);
  }

  // ---------- Shared archive/restore operation ----------

  private async setArchived(
    table: ArchiveableTable,
    id: string,
    archived: boolean,
  ): Promise<void> {
    const permission: Permission =
      table === 'customers'
        ? 'customers.manage'
        : table === 'suppliers'
          ? 'suppliers.manage'
          : 'products.manage';

    this.requirePermission(permission);

    const archivedAt = archived ? new Date().toISOString() : null;

    let result: {
      data: { id: string } | null;
      error: DatabaseErrorLike | null;
    };

    switch (table) {
      case 'product_categories':
        result = await this.client
          .from('product_categories')
          .update({ archived_at: archivedAt })
          .eq('business_id', this.businessId)
          .eq('id', id)
          .select('id')
          .maybeSingle();
        break;

      case 'product_units':
        result = await this.client
          .from('product_units')
          .update({ archived_at: archivedAt })
          .eq('business_id', this.businessId)
          .eq('id', id)
          .select('id')
          .maybeSingle();
        break;

      case 'customers':
        result = await this.client
          .from('customers')
          .update({ archived_at: archivedAt })
          .eq('business_id', this.businessId)
          .eq('id', id)
          .select('id')
          .maybeSingle();
        break;

      case 'suppliers':
        result = await this.client
          .from('suppliers')
          .update({ archived_at: archivedAt })
          .eq('business_id', this.businessId)
          .eq('id', id)
          .select('id')
          .maybeSingle();
        break;

      case 'products':
        result = await this.client
          .from('products')
          .update({ archived_at: archivedAt })
          .eq('business_id', this.businessId)
          .eq('id', id)
          .select('id')
          .maybeSingle();
        break;
    }

    rowOrThrow(result.data, result.error);
  }
}

// The inventory service is exposed through this existing package subpath so
// no new package export or module-resolution setting is required.
export {
  InventoryService,
  InventoryServiceError,
} from './inventory-service.ts';
