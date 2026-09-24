// Typy a drobnosti sdílené hlavní obrazovkou Objednávek a jejími částmi.
// Vytaženo z screens/Orders.tsx (4 100 řádků) — viz docs/20-navrhu-2026-09-13.md, bod 16.

export type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  source: string; status: string; note: string | null; created_at: string;
  delivery_day: string | null; delivery_date: string | null;
  is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; delivered_at: string | null;
  /** Podpis převzetí (data URL) a jméno toho, kdo přebíral — píše Závoz i detail objednávky. */
  signature_url?: string | null; signature_name?: string | null; 
  place_phone?: string | null; // Add place_phone to Order type
  whatsapp_message_id?: string | null; // WhatsApp zpráva, ze které objednávka vznikla (#18)
  /** Bez závozu — odběratel si pivo bere sám, nejde do trasy. Viz lib/bezZavozu.ts. */
  no_delivery?: boolean;
};
export type OrderItem = {
  id: string; order_id: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
  is_prepared: boolean; is_bottled: boolean;
};

export const DAY_COLORS: Record<string, { bg: string; bar: string; border: string; chip: string; text: string; dot: string }> = {
  po: { bg: 'bg-sky-50/70', bar: 'bg-sky-700', border: 'border-sky-600/40', chip: 'bg-sky-700 text-white font-black shadow-2xs', text: 'text-sky-950 font-bold', dot: 'bg-sky-700' },
  ut: { bg: 'bg-emerald-50/70', bar: 'bg-emerald-700', border: 'border-emerald-600/40', chip: 'bg-emerald-700 text-white font-black shadow-2xs', text: 'text-emerald-950 font-bold', dot: 'bg-emerald-700' },
  st: { bg: 'bg-amber-100/60', bar: 'bg-amber-600', border: 'border-amber-600/40', chip: 'bg-amber-700 text-white font-black shadow-2xs', text: 'text-amber-800 font-bold', dot: 'bg-amber-600' },
  ct: { bg: 'bg-rose-50/70', bar: 'bg-rose-600', border: 'border-rose-600/40', chip: 'bg-rose-700 text-white font-black shadow-2xs', text: 'text-rose-950 font-bold', dot: 'bg-rose-600' },
  pa: { bg: 'bg-violet-50/70', bar: 'bg-violet-600', border: 'border-violet-600/40', chip: 'bg-violet-700 text-white font-black shadow-2xs', text: 'text-violet-950 font-bold', dot: 'bg-violet-600' },
  so: { bg: 'bg-primary-50/70', bar: 'bg-primary-600', border: 'border-primary-600/40', chip: 'bg-primary-700 text-white font-black shadow-2xs', text: 'text-primary-900 font-bold', dot: 'bg-primary-600' },
  ne: { bg: 'bg-neutral-100', bar: 'bg-neutral-600', border: 'border-neutral-600/40', chip: 'bg-neutral-700 text-white font-black shadow-2xs', text: 'text-neutral-800 font-bold', dot: 'bg-neutral-600' },
};
export function dayColor(d: string | null | undefined) { return d ? DAY_COLORS[d] : null; }

// 🍺 Ikona rezervovaného výčepu u objednávky: najde v lokálním úložišti rezervaci
// výčepu navázanou na danou objednávku (order_id) a vrátí jméno výčepu (nebo null).
export function getTapNameForOrder(orderId: string): string | null {
  try {
    const saved = localStorage.getItem('vycepy_reservations_v1');
    if (!saved) return null;
    const list = JSON.parse(saved) as any[];
    const r = list.find((it) => it.order_id === orderId);
    return r?.tap_name && String(r.tap_name).trim() ? String(r.tap_name).trim() : null;
  } catch { return null; }
}
