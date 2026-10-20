// 🛢️ Statistika malých sudů (KEG 20 / 15 / 10 l): kolik jich šlo, s jakým pivem
// a pro koho. Zadání 20. 10. 2026: „dělej i statistiky, kolik malých sudů šlo
// a jaký obsah měly a pro koho."
//
// Zdroj jsou objednávky (ne storno) a jejich položky: sud „šel", když objednávka
// odjela (zavezená nebo vyřízená); ostatní jsou jen objednané. Den = den
// závozu, jinak den objednání — jako zbytek Statistiky.
import { jeMalySud, type ObalProSudy } from './maleSudy';
import { jeVyrizena } from './stavyObjednavek';

export type ObjednavkaStat = {
  id: string;
  place_name: string | null;
  delivery_date?: string | null;
  order_date?: string | null;
  status?: string | null;
  is_delivered?: boolean | null;
};
export type PolozkaStat = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number | string | null };
export type PivoStat = { id: string; name: string };

export type RadekSudu = {
  odberatel: string;
  pivo: string;
  obalL: number;
  obal: string;
  kusu: number;
  zavezeno: number;
};

export type SouhrnSudu = {
  kusu: number;
  zavezeno: number;
  litru: number;
  poObalech: { obalL: number; obal: string; kusu: number; zavezeno: number }[];
  poPivech: { pivo: string; kusu: number; zavezeno: number; litru: number }[];
  poOdberatelich: { odberatel: string; kusu: number; zavezeno: number; litru: number; radky: RadekSudu[] }[];
};

const den = (o: ObjednavkaStat) => (o.delivery_date || o.order_date || '').slice(0, 10);

/** Malé sudy v objednávkách mezi `od` a `do` (včetně), bez storna. */
export function statistikaMalychSudu(p: {
  orders: ObjednavkaStat[];
  items: PolozkaStat[];
  obaly: (ObalProSudy & { id: string; label?: string | null })[];
  piva: PivoStat[];
  od: string;
  do: string;
}): SouhrnSudu {
  const obal = new Map(p.obaly.map((o) => [o.id, o]));
  const pivo = new Map(p.piva.map((b) => [b.id, b.name]));
  const objednavka = new Map(p.orders.filter((o) => o.status !== 'storno').map((o) => [o.id, o]));
  const radky = new Map<string, RadekSudu>();

  for (const it of p.items) {
    const o = objednavka.get(it.order_id);
    const ob = it.package_id ? obal.get(it.package_id) : undefined;
    if (!o || !ob || !jeMalySud(ob)) continue;
    const d = den(o);
    if (!d || d < p.od || d > p.do) continue;
    const kusu = Number(it.quantity) || 0;
    if (!(kusu > 0)) continue;
    const odjelo = !!o.is_delivered || jeVyrizena(o.status);
    const odberatel = (o.place_name ?? '').trim() || '— bez odběratele —';
    const nazevPiva = (it.beer_id && pivo.get(it.beer_id)) || '— bez piva —';
    const obalL = Number(ob.volume_l);
    const klic = `${odberatel}|${nazevPiva}|${obalL}`;
    const r = radky.get(klic) ?? { odberatel, pivo: nazevPiva, obalL, obal: `${obalL} l`, kusu: 0, zavezeno: 0 };
    r.kusu += kusu;
    if (odjelo) r.zavezeno += kusu;
    radky.set(klic, r);
  }

  const vsechny = [...radky.values()];
  const soucty = <K extends string>(klic: (r: RadekSudu) => K) => {
    const m = new Map<K, { kusu: number; zavezeno: number; litru: number }>();
    for (const r of vsechny) {
      const k = klic(r);
      const s = m.get(k) ?? { kusu: 0, zavezeno: 0, litru: 0 };
      s.kusu += r.kusu; s.zavezeno += r.zavezeno; s.litru += r.kusu * r.obalL;
      m.set(k, s);
    }
    return m;
  };

  const poObalech = [...soucty((r) => String(r.obalL)).entries()]
    .map(([l, s]) => ({ obalL: Number(l), obal: `${l} l`, kusu: s.kusu, zavezeno: s.zavezeno }))
    .sort((a, b) => b.obalL - a.obalL);
  const poPivech = [...soucty((r) => r.pivo).entries()]
    .map(([pivoNazev, s]) => ({ pivo: pivoNazev, ...s }))
    .sort((a, b) => b.kusu - a.kusu || a.pivo.localeCompare(b.pivo, 'cs'));
  const poOdberatelich = [...soucty((r) => r.odberatel).entries()]
    .map(([odberatel, s]) => ({
      odberatel,
      ...s,
      radky: vsechny.filter((r) => r.odberatel === odberatel).sort((a, b) => b.obalL - a.obalL || a.pivo.localeCompare(b.pivo, 'cs')),
    }))
    .sort((a, b) => b.kusu - a.kusu || a.odberatel.localeCompare(b.odberatel, 'cs'));

  return {
    kusu: vsechny.reduce((s, r) => s + r.kusu, 0),
    zavezeno: vsechny.reduce((s, r) => s + r.zavezeno, 0),
    litru: vsechny.reduce((s, r) => s + r.kusu * r.obalL, 0),
    poObalech,
    poPivech,
    poOdberatelich,
  };
}
