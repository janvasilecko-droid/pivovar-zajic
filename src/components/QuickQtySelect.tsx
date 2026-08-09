import type { Package } from '../lib/supabase';

// Rychlé hodnoty počtu v Objednávkách podle zvoleného obalu:
// - jakýkoli keg → 4 / 6 / 10 / 12 ks
// - lahev 0,33 / 0,5 l → 10 / 20 / 40 / 60 / 80 / 100 ks
// - lahev 1 / 1,5 l → 5 / 6 / 12 / 20 / 24 / 36 / 40 / 50 ks
const QUICK_QTY_KEG = [4, 6, 10, 12];
const QUICK_QTY_BOTTLE_033_05 = [10, 20, 40, 60, 80, 100];
const QUICK_QTY_BOTTLE_1_15 = [5, 6, 12, 20, 24, 36, 40, 50];

export function orderQuickQtys(pkg: Pick<Package, 'kind' | 'volume_l'> | null | undefined): number[] | null {
  if (!pkg) return null;
  if (pkg.kind === 'keg') return QUICK_QTY_KEG;
  const v = Number(pkg.volume_l);
  if (v === 0.33 || v === 0.5) return QUICK_QTY_BOTTLE_033_05;
  if (v === 1 || v === 1.5) return QUICK_QTY_BOTTLE_1_15;
  return null;
}

export function QuickQtySelect({ pkg, qty, onSelect, className }: {
  pkg: Pick<Package, 'kind' | 'volume_l'> | null | undefined;
  qty: string | number;
  onSelect: (q: number) => void;
  className?: string;
}) {
  const qtys = orderQuickQtys(pkg);
  if (!qtys) return null;
  const num = Number(qty);
  return (
    <select
      className={className ?? 'h-6 rounded-lg bg-white border border-amber-300 text-emerald-950 font-bold text-[11px] px-1 cursor-pointer transition'}
      value={qtys.includes(num) ? num : ''}
      onChange={(e) => { const v = e.target.value; if (v !== '') onSelect(Number(v)); }}
      title={`Rychlé nastavení počtu (${qtys.join('/')})`}
    >
      <option value="" disabled>+</option>
      {qtys.map((q) => (
        <option key={q} value={q}>{q} ks</option>
      ))}
    </select>
  );
}
