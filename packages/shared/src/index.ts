export { translations, type Locale } from './translations.ts';
export { visual, visualText, typography, type VisualKey } from './visual.ts';
export const modules = [
  'home',
  'sales',
  'products',
  'estimator',
  'shops',
  'purchases',
  'customers',
  'suppliers',
  'expenses',
  'payments',
  'invoices',
  'reports',
  'settings',
  'staff',
  'activity',
] as const;
export type ModuleId = (typeof modules)[number];
export const primaryNavigation = [
  'home',
  'sales',
  'products',
  'estimator',
  'more',
] as const;
export type RouteId = ModuleId | 'more';
export type MerchantRole = 'OWNER' | 'STAFF';
// Platform authorization is intentionally not a merchant role.
export type PresentationState = 'loading' | 'empty' | 'error' | 'denied';
export const presentationStates: PresentationState[] = [
  'loading',
  'empty',
  'error',
  'denied',
];
export const tokens = {
  color: {
    ink: '#213b32',
    accent: '#135b43',
    background: '#f5f7f8',
    surface: '#ffffff',
    muted: '#52675b',
    border: '#c7d5cd',
    warning: '#805514',
    mint: '#e8f3ec',
  },
  radius: 16,
};
export function normalizeDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) =>
    String('০১২৩৪৫৬৭৮৯'.indexOf(digit)),
  );
}
// Input presentation only. Never calculate financial values with client floats.
export function isDecimalInput(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(normalizeDigits(value));
}
export function dhakaDate(instant: Date, locale: 'bn' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant);
}
