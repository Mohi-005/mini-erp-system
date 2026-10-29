export const permissionKeys = [
  'sales.view',
  'sales.create',
  'sales.price_override',
  'purchases.view',
  'purchases.create',
  'products.view',
  'products.manage',
  'customers.view',
  'customers.manage',
  'suppliers.view',
  'suppliers.manage',
  'reports.view',
  'prices.change',
  'corrections.create',
  'payments.receive',
  'payments.pay',
  'expenses.view',
  'expenses.create',
  'audit.read',
  'inventory.view',
  'inventory.adjust',
  'inventory.value.read',
  'costs.read',
  'profit.read',
  'invoices.read',
] as const;
export type Permission = (typeof permissionKeys)[number];
export function can(
  member: { role: string; status: string } | null,
  grants: readonly string[],
  permission: Permission,
): boolean {
  return (
    member?.status === 'ACTIVE' &&
    (member.role === 'OWNER' ||
      (member.role === 'STAFF' && grants.includes(permission)))
  );
}
