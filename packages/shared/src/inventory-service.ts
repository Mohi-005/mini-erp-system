import type { SupabaseClient } from '@supabase/supabase-js';

import type { Tenant } from './auth.ts';
import type {
  Database,
  InventoryBalance,
  InventoryMovement,
  Product,
  ProductUnit,
} from './database.types.ts';
import { can, type Permission } from './permissions.ts';
import {
  validateOpeningStockDraft,
  validateStockAdjustmentDraft,
  type InventoryDirection,
  type InventoryValidationIssue,
  type InventoryValidationResult,
} from './inventory.ts';

type DatabaseErrorLike = {
  code: string;
  message: string;
};

export type InventoryServiceErrorCode =
  | 'invalid_context'
  | 'permission_denied'
  | 'validation_failed'
  | 'not_found'
  | 'opening_stock_exists'
  | 'opening_stock_not_first'
  | 'insufficient_stock'
  | 'operation_id_conflict'
  | 'product_archived'
  | 'database_error';

export class InventoryServiceError extends Error {
  readonly code: InventoryServiceErrorCode;
  readonly fieldErrors: Record<string, InventoryValidationIssue> | null;
  readonly databaseCode: string | null;

  constructor(
    code: InventoryServiceErrorCode,
    fieldErrors: Record<string, InventoryValidationIssue> | null = null,
    databaseCode: string | null = null,
  ) {
    super(code);
    this.name = 'InventoryServiceError';
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.databaseCode = databaseCode;
  }
}

function validated<T>(result: InventoryValidationResult<T>): T {
  if (!result.valid) {
    throw new InventoryServiceError('validation_failed', result.errors);
  }
  return result.value;
}

function mapDatabaseError(error: DatabaseErrorLike): InventoryServiceError {
  const message = error.message.toLowerCase();
  if (message.includes('opening_stock_already_recorded')) {
    return new InventoryServiceError('opening_stock_exists', null, error.code);
  }
  if (message.includes('opening_stock_must_be_first_movement')) {
    return new InventoryServiceError(
      'opening_stock_not_first',
      null,
      error.code,
    );
  }
  if (message.includes('insufficient_stock')) {
    return new InventoryServiceError('insufficient_stock', null, error.code);
  }
  if (message.includes('operation_id_conflict')) {
    return new InventoryServiceError('operation_id_conflict', null, error.code);
  }
  if (message.includes('product_archived')) {
    return new InventoryServiceError('product_archived', null, error.code);
  }
  if (message.includes('product_not_found')) {
    return new InventoryServiceError('not_found', null, error.code);
  }
  return new InventoryServiceError('database_error', null, error.code);
}

function rowOrThrow<T>(data: T | null, error: DatabaseErrorLike | null): T {
  if (error) throw mapDatabaseError(error);
  if (data === null) throw new InventoryServiceError('not_found');
  return data;
}

function listOrThrow<T>(
  data: T[] | null,
  error: DatabaseErrorLike | null,
): T[] {
  if (error) throw mapDatabaseError(error);
  return data ?? [];
}

export class InventoryService {
  private readonly client: SupabaseClient<Database>;
  private readonly tenant: Tenant;

  constructor(client: SupabaseClient<Database>, tenant: Tenant) {
    if (tenant.member.business_id !== tenant.business.id) {
      throw new InventoryServiceError('invalid_context');
    }
    this.client = client;
    this.tenant = tenant;
  }

  private get businessId(): string {
    return this.tenant.business.id;
  }

  private requirePermission(permission: Permission): void {
    if (!can(this.tenant.member, this.tenant.permissions, permission)) {
      throw new InventoryServiceError('permission_denied');
    }
  }

  async listBalances(): Promise<InventoryBalance[]> {
    this.requirePermission('inventory.view');
    const result = await this.client
      .from('inventory_balances')
      .select('*')
      .eq('business_id', this.businessId)
      .order('updated_at', { ascending: false });
    return listOrThrow(result.data, result.error);
  }

  async listMovements(limit = 200): Promise<InventoryMovement[]> {
    this.requirePermission('inventory.view');
    const result = await this.client
      .from('inventory_movements')
      .select(
        'id,business_id,product_id,movement_type,quantity_delta,quantity_after,source_kind,source_id,operation_id,reason,created_by,created_at',
      )
      .eq('business_id', this.businessId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(Math.max(1, Math.min(500, Math.floor(limit))));
    return listOrThrow(result.data, result.error).map((movement) => ({
      ...movement,
      unit_cost: null,
      value_delta: null,
    }));
  }

  async listProducts(): Promise<Product[]> {
    this.requirePermission('products.view');
    const result = await this.client
      .from('products')
      .select('*')
      .eq('business_id', this.businessId)
      .order('name_bn', { ascending: true });
    return listOrThrow(result.data, result.error);
  }

  async listUnits(): Promise<ProductUnit[]> {
    this.requirePermission('products.view');
    const result = await this.client
      .from('product_units')
      .select('*')
      .eq('business_id', this.businessId)
      .order('name_bn', { ascending: true });
    return listOrThrow(result.data, result.error);
  }

  async recordOpeningStock(input: {
    product_id: string;
    quantity: string;
    note: string;
    operation_id: string;
  }): Promise<InventoryMovement> {
    this.requirePermission('inventory.adjust');
    const draft = validated(validateOpeningStockDraft(input));
    if (!input.operation_id.trim()) {
      throw new InventoryServiceError('validation_failed', {
        operation_id: 'required',
      });
    }

    const result = await this.client.rpc('record_inventory_opening_stock', {
      p_product_id: draft.product_id,
      p_quantity: draft.quantity,
      p_operation_id: input.operation_id,
      p_note: draft.note,
    });
    return rowOrThrow(result.data, result.error);
  }

  async adjustStock(input: {
    product_id: string;
    direction: InventoryDirection;
    quantity: string;
    reason: string;
    operation_id: string;
  }): Promise<InventoryMovement> {
    this.requirePermission('inventory.adjust');
    const draft = validated(validateStockAdjustmentDraft(input));
    if (!input.operation_id.trim()) {
      throw new InventoryServiceError('validation_failed', {
        operation_id: 'required',
      });
    }

    const result = await this.client.rpc('adjust_inventory_stock', {
      p_product_id: draft.product_id,
      p_direction: draft.direction,
      p_quantity: draft.quantity,
      p_reason: draft.reason,
      p_operation_id: input.operation_id,
    });
    return rowOrThrow(result.data, result.error);
  }
}
