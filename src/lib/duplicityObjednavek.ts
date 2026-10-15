// 🔁 Zdvojená objednávka nebo řádek — poznat ji dřív, než se uloží.
// ---------------------------------------------------------------------------
// Z provozu 15. 10. 2026: „duplicitní objednávka nebo odečtení se nesmí
// opakovat." Sklad se z objednávky odečítá PO POLOŽKÁCH (zavoz_deductions má
// jeden odpočet na položku) — druhá objednávka se stejnými položkami proto
// odečte stejné sudy podruhé a zpětně zadaná objednávka se navíc odepíše
// rovnou jako zavezená. Dvě věci, které se stály v říjnu:
//
//  • Restaurace na 11. 10. byla v objednávkách dvakrát: ručně zadaná 11. 10.
//    (Světlá 50 l, Desítka 30 l) a znovu zpětně 13. 10. (totéž + Tmavá 50 l).
//    Kontrola z WhatsAppu hledala jen objednávku, jejíž VŠECHNY řádky už
//    existují — druhá měla jeden řádek navíc, tak proklouzla. A ruční zadání
//    se nekontrolovalo vůbec.
//  • Do objednávky Restaurace na 12. 10. se 15. 10. ráno fotkou vložil
//    „Jantar 1,5 l × 5" podruhé — řádek tam už byl a přidání řádků do
//    existující objednávky nic nekontrolovalo.
//
// Tady je jen ČISTÉ porovnávání (žádná databáze, žádný React), aby se dalo
// otestovat na skutečných případech; načtení kandidátů je v
// lib/orderDuplicates.ts a dialog v lib/duplicityDialog.ts.
//
// ⚠️ Nic se nezakazuje natvrdo. Odběratel si ten samý den může objednat
// ještě jeden sud, a to je legitimní. Proto se jen NAHLAS zeptá a výchozí
// odpověď je „nezakládat" — zdvojit objednávku musí člověk výslovně.

/** Řádek nově zadávané objednávky. */
export type RadekNove = {
  beerId: string | null;
  pkgId: string | null;
  qty: number;
};

/** Položka už uložené objednávky. */
export type PolozkaUlozena = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number | string | null;
};

export type ObjednavkaKPorovnani = {
  id: string;
  place_id?: string | null;
  place_name: string | null;
  order_date: string | null;
  delivery_date: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
  polozky: PolozkaUlozena[];
};

export type NovaObjednavka = {
  placeId?: string | null;
  placeName?: string | null;
  /** Datum zadání (u zpětné objednávky bývá později než dovoz). */
  orderDate?: string | null;
  deliveryDate?: string | null;
  radky: RadekNove[];
  /** Při úpravě uložené objednávky se sama se sebou neporovnává. */
  vynechatId?: string | null;
};

export type Shoda = {
  objednavka: ObjednavkaKPorovnani;
  /** Řádky nové objednávky, které v té uložené jsou se stejným pivem, obalem I množstvím. */
  stejne: RadekNove[];
  /** Totéž pivo a obal, ale jiné množství než v té uložené. */
  jinyPocet: { radek: RadekNove; ulozeno: number }[];
  /** Obě mají stejný den dovozu (jinak jde o stejný týden). */
  stejnyDen: boolean;
  /** Všechny řádky nové objednávky už v té uložené jsou, i s množstvím. */
  uplna: boolean;
};

/** Název odběratele bez diakritiky, velkých písmen a nadbytečných mezer. */
export const normJmeno = (s?: string | null): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Pondělí ISO týdne, do kterého datum (RRRR-MM-DD) spadá. */
export function pondeliTydne(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = pondělí
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Den, ke kterému objednávka patří: den dovozu, a když chybí, den zadání. */
export const denObjednavky = (o: { delivery_date?: string | null; order_date?: string | null }): string | null =>
  o.delivery_date || o.order_date || null;

/** Je to týž odběratel? Stejné id, nebo stejný název (po normalizaci). */
export function stejnyOdberatel(
  nova: { placeId?: string | null; placeName?: string | null },
  ulozena: { place_id?: string | null; place_name?: string | null },
): boolean {
  if (nova.placeId && ulozena.place_id && nova.placeId === ulozena.place_id) return true;
  const a = normJmeno(nova.placeName);
  return a !== '' && a === normJmeno(ulozena.place_name);
}

const klicRadku = (beerId: string | null | undefined, pkgId: string | null | undefined) => `${beerId ?? ''}|${pkgId ?? ''}`;
const cislo = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Spáruje řádky nové objednávky s položkami uložené. Každá uložená položka se
 * použije nejvýš jednou — dva stejné řádky v nové objednávce nejsou „shodné"
 * s jednou uloženou položkou dvakrát.
 */
function sparuj(radky: RadekNove[], polozky: PolozkaUlozena[]): { stejne: RadekNove[]; jinyPocet: Shoda['jinyPocet'] } {
  const volne = polozky.map((p) => ({ klic: klicRadku(p.beer_id, p.package_id), qty: cislo(p.quantity), pouzita: false }));
  const stejne: RadekNove[] = [];
  const jinyPocet: Shoda['jinyPocet'] = [];
  const zbyle: RadekNove[] = [];
  // Napřed přesné shody (pivo + obal + množství), ať řádek s jiným množstvím
  // „nesebere" položku, kterou má jiný řádek přesně.
  for (const r of radky) {
    const k = klicRadku(r.beerId, r.pkgId);
    const p = volne.find((v) => !v.pouzita && v.klic === k && v.qty === r.qty);
    if (p) { p.pouzita = true; stejne.push(r); } else zbyle.push(r);
  }
  for (const r of zbyle) {
    const k = klicRadku(r.beerId, r.pkgId);
    const p = volne.find((v) => !v.pouzita && v.klic === k);
    if (p) { p.pouzita = true; jinyPocet.push({ radek: r, ulozeno: p.qty }); }
  }
  return { stejne, jinyPocet };
}

/**
 * Najde uložené objednávky, které vypadají jako ta, co se právě zadává.
 *
 * Shoda je, když jde o TÝŽ odběratele a:
 *  - mají stejný den dovozu a sdílejí aspoň jedno pivo v obalu (i s jiným
 *    množstvím — oprava překlepu se zadává znovu stejně často jako druhý sud), nebo
 *  - jsou ve stejném týdnu a nová je celá k nalezení v té uložené
 *    (stejné pivo, obal i množství u všech řádků) — pravidelná týdenní
 *    objednávka je legitimní, dvě stejné v jednom týdnu ne.
 *
 * Stornované objednávky se nepočítají. Nejpodobnější je první.
 */
export function najdiShody(nova: NovaObjednavka, ulozene: ObjednavkaKPorovnani[]): Shoda[] {
  const radky = nova.radky.filter((r) => r.beerId && r.pkgId && r.qty > 0);
  const den = nova.deliveryDate || nova.orderDate || null;
  if (radky.length === 0 || !den) return [];
  const tyden = pondeliTydne(den);

  const out: Shoda[] = [];
  for (const o of ulozene) {
    if (o.status === 'storno') continue;
    if (nova.vynechatId && o.id === nova.vynechatId) continue;
    if (!stejnyOdberatel(nova, o)) continue;
    const denO = denObjednavky(o);
    if (!denO) continue;
    const stejnyDen = denO === den;
    if (!stejnyDen && pondeliTydne(denO) !== tyden) continue;

    const { stejne, jinyPocet } = sparuj(radky, o.polozky);
    const uplna = stejne.length === radky.length;
    if (stejnyDen ? stejne.length + jinyPocet.length > 0 : uplna) {
      out.push({ objednavka: o, stejne, jinyPocet, stejnyDen, uplna });
    }
  }
  // Úplná shoda napřed, pak stejný den, pak podle počtu shodných řádků.
  return out.sort((a, b) =>
    Number(b.uplna) - Number(a.uplna)
    || Number(b.stejnyDen) - Number(a.stejnyDen)
    || b.stejne.length - a.stejne.length
    || b.jinyPocet.length - a.jinyPocet.length);
}

// ---------------------------------------------------------------------------
// Řádky přidávané do JIŽ ULOŽENÉ objednávky
// ---------------------------------------------------------------------------

export type ZdvojenyRadek = {
  radek: RadekNove;
  /** Množství stejného piva a obalu, která už v objednávce jsou. */
  ulozeno: number[];
  /** Je tam řádek se stejným množstvím — skoro jistě druhé zadání téhož. */
  stejnyPocet: boolean;
};

/**
 * Které z přidávaných řádků už v objednávce jsou (stejné pivo a obal).
 *
 * Dvě stejné položky v jedné objednávce jsou skoro vždycky omyl (viz
 * lib/zdvojenePolozky.ts, případ Manea). Tahle funkce hlídá okamžik PŘIDÁNÍ
 * do objednávky, která už existuje — fotka vložená do objednávky, kterou už
 * někdo zadal, přidala Jantar podruhé.
 */
export function najdiZdvojeneRadky(ulozene: PolozkaUlozena[], nove: RadekNove[]): ZdvojenyRadek[] {
  const poKlici = new Map<string, number[]>();
  for (const p of ulozene) {
    const k = klicRadku(p.beer_id, p.package_id);
    poKlici.set(k, [...(poKlici.get(k) ?? []), cislo(p.quantity)]);
  }
  const out: ZdvojenyRadek[] = [];
  for (const r of nove) {
    if (!r.beerId || !r.pkgId || !(r.qty > 0)) continue;
    const ulozeno = poKlici.get(klicRadku(r.beerId, r.pkgId));
    if (ulozeno?.length) out.push({ radek: r, ulozeno, stejnyPocet: ulozeno.includes(r.qty) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text pro člověka
// ---------------------------------------------------------------------------

export type Nazvy = {
  pivo: (beerId: string | null) => string;
  obal: (pkgId: string | null) => string;
};

const ZDROJE: Record<string, string> = {
  rucne: 'ručně', fotka: 'z fotky', whatsapp: 'z WhatsAppu', duplikat: 'kopií jiné objednávky',
};

/** „11. 10." z RRRR-MM-DD. */
export const datumKratce = (iso: string): string => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

/** „11. 10. ve 12:10" — v pražském čase, ať text nezávisí na zařízení. */
export function kdyZadano(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  // Po částech: samotný den čeština píše „11." a samotný měsíc „10", takže
  // slepování hotových řetězců dávalo „11.. 10".
  const casti = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const cast = (typ: string) => casti.find((c) => c.type === typ)?.value ?? '';
  return `${Number(cast('day'))}. ${Number(cast('month'))}. v ${cast('hour')}:${cast('minute')}`;
}

const radekText = (r: RadekNove, n: Nazvy) => `${n.pivo(r.beerId)} ${n.obal(r.pkgId)} ×${r.qty}`;

/** Jedna uložená objednávka v textu: „Restaurace, dodání 11. 10., zadaná ručně 11. 10. v 12:10". */
function popisObjednavky(s: Shoda): string {
  const o = s.objednavka;
  const den = denObjednavky(o);
  const kdy = kdyZadano(o.created_at);
  const zdroj = o.source && ZDROJE[o.source] ? `zadaná ${ZDROJE[o.source]}` : 'zadaná';
  return `${o.place_name ?? 'odběratel'}, dodání ${den ? datumKratce(den) : '—'}, ${zdroj}${kdy ? ` ${kdy}` : ''}`;
}

/**
 * Text dialogu „tahle objednávka už nejspíš existuje". Řekne, co se shoduje
 * (ať je jasné, proč se dialog ukazuje) a proč na tom záleží — druhá objednávka
 * odečte sklad podruhé.
 */
export function textDuplicity(shody: Shoda[], n: Nazvy): string {
  const [s, ...dalsi] = shody;
  if (!s) return '';
  const casti: string[] = [`Uložená objednávka: ${popisObjednavky(s)}.`];
  if (s.uplna) {
    casti.push(`Všechny zadávané položky už v ní jsou: ${s.stejne.map((r) => radekText(r, n)).join(', ')}.`);
  } else {
    if (s.stejne.length) casti.push(`Stejné položky už v ní jsou: ${s.stejne.map((r) => radekText(r, n)).join(', ')}.`);
    if (s.jinyPocet.length) {
      casti.push(`Totéž pivo a obal s jiným množstvím: ${s.jinyPocet.map((j) => `${n.pivo(j.radek.beerId)} ${n.obal(j.radek.pkgId)} — uloženo ×${j.ulozeno}, zadáváš ×${j.radek.qty}`).join('; ')}.`);
    }
  }
  if (dalsi.length) casti.push(`(A ještě ${dalsi.length} ${dalsi.length === 1 ? 'další podobná' : dalsi.length < 5 ? 'další podobné' : 'dalších podobných'}.)`);
  casti.push('Druhá objednávka by sklad odečetla podruhé. Zakládáš ji znovu omylem, nebo je to opravdu další objednávka?');
  return casti.join('\n\n');
}

/** Text dialogu pro řádky přidávané do už uložené objednávky. */
export function textZdvojenychRadku(z: ZdvojenyRadek[], n: Nazvy): string {
  const radky = z.map((x) => {
    const co = `${n.pivo(x.radek.beerId)} ${n.obal(x.radek.pkgId)}`;
    return x.stejnyPocet
      ? `• ${co} ×${x.radek.qty} — v objednávce už je přesně takový řádek`
      : `• ${co} ×${x.radek.qty} — v objednávce už je ×${x.ulozeno.join(' a ×')}`;
  });
  return `V téhle objednávce už je:\n${radky.join('\n')}\n\nDruhý stejný řádek by sklad odečetl podruhé.`;
}
