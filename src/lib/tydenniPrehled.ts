// 📋 Přehled týdne — vedle počítání kusů i vidět VŠECHNO, co se v týdnu
// dělo (objednávky, stočení KEG, stočení lahví), ať jde týden zavřít s
// jistotou, ne jen podle sedících čísel. Čistě zobrazovací pomocníci;
// data se táhnou přímo v TydenniInventuraPanel.tsx (fetchAllRows).

export type PrehledPolozka = { beer_name: string; package_label: string; quantity: number };

export type PrehledObjednavka = {
  id: string;
  place_name: string | null;
  order_date: string;
  delivery_date: string | null;
  status: string | null;
  polozky: PrehledPolozka[];
};

export type PrehledZapis = {
  id: string;
  entry_date: string;
  beer_name: string;
  package_label: string;
  quantity: number;
  note: string | null;
};

/** Poskládá položky objednávky do jedné čitelné věty pro řádek seznamu. */
export function popisPolozek(polozky: PrehledPolozka[]): string {
  if (polozky.length === 0) return '(bez položek)';
  return polozky.map((p) => `${p.quantity}× ${p.beer_name} ${p.package_label}`).join(', ');
}

export function objednavkaShoduje(o: PrehledObjednavka, dotaz: string): boolean {
  const q = dotaz.trim().toLowerCase();
  if (!q) return true;
  if ((o.place_name || '').toLowerCase().includes(q)) return true;
  return o.polozky.some(
    (p) => p.beer_name.toLowerCase().includes(q) || p.package_label.toLowerCase().includes(q),
  );
}

export function zapisShoduje(z: PrehledZapis, dotaz: string): boolean {
  const q = dotaz.trim().toLowerCase();
  if (!q) return true;
  return (
    z.beer_name.toLowerCase().includes(q) ||
    z.package_label.toLowerCase().includes(q) ||
    (z.note || '').toLowerCase().includes(q)
  );
}
