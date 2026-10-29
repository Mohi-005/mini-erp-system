// Deliberately separate entry: future live repositories must never import demo fixtures.
// Legacy name/unit fixtures retained for compatibility. Rich visual snapshots are separate.
export {
  products,
  shops,
  transactions,
  expenses,
  dashboard,
  week,
} from './fixtures.ts';
export const demoProducts = [
  {
    demoId: 'demo-rice',
    name: { bn: 'চাল', en: 'Rice' },
    unit: { bn: 'কেজি', en: 'kg' },
  },
  {
    demoId: 'demo-oil',
    name: { bn: 'সয়াবিন তেল', en: 'Soybean oil' },
    unit: { bn: 'লিটার', en: 'litre' },
  },
] as const;
