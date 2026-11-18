// 📋 Přehled týdne — vedle počítání kusů i vidět VŠECHNO, co se v týdnu
// dělo (objednávky, stočení KEG, stočení lahví), ať jde týden zavřít s
// jistotou, ne jen podle sedících čísel. Čistě zobrazovací pomocníci;
// data se táhnou přímo v TydenniInventuraPanel.tsx (fetchAllRows).

import { shodaHledani } from './hledani';

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
  beer_color: string | null;
  package_label: string;
  quantity: number;
  note: string | null;
};

/** Poskládá položky objednávky do jedné čitelné věty pro řádek seznamu. */
export function popisPolozek(polozky: PrehledPolozka[]): string {
  if (polozky.length === 0) return '(bez položek)';
  return polozky.map((p) => `${p.quantity}× ${p.beer_name} ${p.package_label}`).join(', ');
}

// Hledá se bez ohledu na diakritiku (lib/hledani.ts): „luzec" najde „Lužec".
export function objednavkaShoduje(o: PrehledObjednavka, dotaz: string): boolean {
  // Odběratel i položky se hledají dohromady — „lužec světlá" najde objednávku
  // Lužce se světlým pivem (slova se mohou dělit mezi odběratele a položky).
  return shodaHledani([o.place_name, ...o.polozky.flatMap((p) => [p.beer_name, p.package_label])], dotaz);
}

export function zapisShoduje(z: PrehledZapis, dotaz: string): boolean {
  return shodaHledani([z.beer_name, z.package_label, z.note], dotaz);
}
