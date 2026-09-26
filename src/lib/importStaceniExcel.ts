// 📥 Import „Zápis stáčení lahve*.xlsx" — excel, do kterého zapisuje kolega
// mimo appku (appka stáčení lahví jinak vůbec netrackuje, takže žádné
// riziko zdvojení). Cíl: co appka umí zapsat ručně v BottlingScreen, ať
// jde nahrát rovnou ze souboru — beze změny počtů, jen ušetřit přepisování.
//
// Vrstvy: tahle knihovna je čistá — žádné UI, žádný Supabase. Vstup je
// list listů (řádků) tak, jak je přečte xlsx-js-style (pole polí, „AOA").
// Rozpoznaný tvar souboru (list1, řádky 19+; sloupce A–P), viz też
// dokumentace níž u KEG_SLOUPCE/LAHEV_SLOUPCE.
//
// Zásada „radši pomalu, ale správně": cokoli je nejednoznačné (chybí pivo,
// dva různé sudy najednou, neznámý obal, nečíselná hodnota) se NEHÁDÁ —
// řádek skončí v `problemy` a čeká na ruční kontrolu. Nikdy se nedopočítává
// číslo, které v souboru není.
import type { Obal, Pivo } from './statistika';
// Stejné párování textu na appková piva, jaké appka už používá u naučených
// zkratek z WhatsApp objednávek (`parser_aliases`) — ať sedí i tady „12
// Světlá" → appkové pivo, jakmile ho jednou v náhledu importu vybereš.
import { normalize as normalizujNazev } from './orderParser';
export { normalize as normalizujNazev } from './orderParser';

/** Jeden řádek tak, jak ho appka po přečtení xlsx vidí — ještě bez párování na appku. */
export type ExcelRadekStaceni = {
  cisloRadku: number;
  datum: string | null; // ISO yyyy-mm-dd — doplněné z řádku nad sebou, když je buňka prázdná
  /** Buňka datumu měla text, který nejde přečíst jako datum (např. „31.9" — v září není 31.). */
  datumNejdePrecist: string | null;
  pivoRaw: string | null;
  sudy: { objemL: number; hodnota: number | 'neplatne' }[];
  lahve: { objemL: number; hodnota: number | 'neplatne' }[];
  poznamka: string | null;
};

/** Sloupce C–G: kolik sudů dané velikosti se spotřebovalo. */
const KEG_SLOUPCE = [
  { idx: 2, objemL: 50 },
  { idx: 3, objemL: 30 },
  { idx: 4, objemL: 20 },
  { idx: 5, objemL: 15 },
  { idx: 6, objemL: 10 },
];
/** Sloupce H–K: kolik lahví dané velikosti se stočilo. */
const LAHEV_SLOUPCE = [
  { idx: 7, objemL: 1.5 },
  { idx: 8, objemL: 1.0 },
  { idx: 9, objemL: 0.5 },
  { idx: 10, objemL: 0.33 },
];
const DATUM_IDX = 0;
const PIVO_IDX = 1;
const POZNAMKA_IDX = 15;
/** Data v listu 1 začínají na řádku 19 (1–18 je legenda piv a záhlaví). */
const PRVNI_DATOVY_RADEK = 19;

function jePrazdna(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/** Excel/JS datum → ISO, nebo null (řetězec z ručního zápisu se nehádá). */
function naIso(v: unknown): string | null {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/**
 * Rozparsuje syrové řádky listu (od buňky A1) na datové řádky. Přeskočí
 * legendu/záhlaví (1–18) a řádky bez jediné produkční hodnoty (jen vzorce
 * dopočítávající 0, nebo čistě poznámkové řádky bez čísel).
 *
 * Datum: kolega ho píše jen na první řádek dne, další řádky pod ním ho
 * nechává prázdné — proto se prázdná buňka doplní z posledního datumu nad
 * sebou. Když buňka NENÍ prázdná, ale nejde přečíst (typo), datum se
 * NEDOPLŇUJE potichu — jde do `datumNejdePrecist` k ruční kontrole, protože
 * kolega zjevně chtěl napsat jiné datum, jen se to nepovedlo.
 */
export function naparsujRadkyStaceniLahvi(aoa: unknown[][]): ExcelRadekStaceni[] {
  const out: ExcelRadekStaceni[] = [];
  let posledniDatum: string | null = null;
  for (let i = PRVNI_DATOVY_RADEK - 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const sudy = KEG_SLOUPCE
      .map((s) => ({ objemL: s.objemL, hodnota: row[s.idx] }))
      .filter((s) => !jePrazdna(s.hodnota))
      .map((s) => ({ objemL: s.objemL, hodnota: typeof s.hodnota === 'number' ? s.hodnota : 'neplatne' as const }));
    const lahve = LAHEV_SLOUPCE
      .map((s) => ({ objemL: s.objemL, hodnota: row[s.idx] }))
      .filter((s) => !jePrazdna(s.hodnota))
      .map((s) => ({ objemL: s.objemL, hodnota: typeof s.hodnota === 'number' ? s.hodnota : 'neplatne' as const }));
    if (sudy.length === 0 && lahve.length === 0) continue; // jen poznámka / prázdný vzorcový chvost

    const datumBunka = row[DATUM_IDX];
    let datum: string | null;
    let datumNejdePrecist: string | null = null;
    if (jePrazdna(datumBunka)) {
      datum = posledniDatum; // stejný den jako řádek nad tím
    } else {
      const iso = naIso(datumBunka);
      if (iso) { datum = iso; posledniDatum = iso; }
      else { datum = posledniDatum; datumNejdePrecist = String(datumBunka); }
    }

    out.push({
      cisloRadku: i + 1,
      datum,
      datumNejdePrecist,
      pivoRaw: jePrazdna(row[PIVO_IDX]) ? null : String(row[PIVO_IDX]).trim(),
      sudy,
      lahve,
      poznamka: jePrazdna(row[POZNAMKA_IDX]) ? null : String(row[POZNAMKA_IDX]).trim(),
    });
  }
  return out;
}

export type ProblemRadku =
  | { druh: 'chybi_datum' }
  | { druh: 'datum_nejde_precist'; text: string }
  | { druh: 'chybi_pivo' }
  | { druh: 'nezname_pivo'; nazev: string }
  | { druh: 'vic_sudu_najednou'; pocetDruhu: number }
  | { druh: 'sud_bez_lahvi' }
  | { druh: 'neplatna_hodnota'; objemL: number; typ: 'sud' | 'lahev' }
  | { druh: 'neznamy_obal'; objemL: number; typ: 'sud' | 'lahev' };

export function popisProblemu(p: ProblemRadku): string {
  switch (p.druh) {
    case 'chybi_datum': return 'chybí datum';
    case 'datum_nejde_precist': return `datum „${p.text}" nejde přečíst`;
    case 'chybi_pivo': return 'chybí pivo';
    case 'nezname_pivo': return `neznámé pivo „${p.nazev}"`;
    case 'vic_sudu_najednou': return `${p.pocetDruhu} různé velikosti sudu najednou — appka umí jen jeden zdroj`;
    case 'sud_bez_lahvi': return 'sud je zadaný, ale žádné lahve k němu';
    case 'neplatna_hodnota': return `neplatná hodnota u ${p.typ === 'sud' ? 'sudu' : 'lahve'} ${p.objemL} l`;
    case 'neznamy_obal': return `appka nemá založený obal ${p.typ === 'sud' ? 'KEG' : 'lahev'} ${p.objemL} l`;
  }
}

export type RadekKZapisu = {
  entry_date: string;
  beer_id: string;
  beer_name: string | null;
  kegs_used: number | null;
  kegs_used_package_id: string | null;
  source_volume_l: number | null;
  package_id: string;
  package_label: string | null;
  quantity: number;
  note: string | null;
};

export type PripravenyRadek = {
  cisloRadku: number;
  otisk: string;
  popis: string;
  bezSudu: boolean;
  zaznamy: RadekKZapisu[];
};

export type VysledekPripravy = {
  pripravene: PripravenyRadek[];
  jizNaimportovane: number;
  prazdne: number;
  problemy: { cisloRadku: number; radek: ExcelRadekStaceni; problemy: ProblemRadku[] }[];
  neznamaPiva: string[];
};

/** Krátký stabilní otisk (FNV-1a) — jen na rozpoznání „už jsem tenhle řádek zapsal". */
function otiskRadku(casti: (string | number | null)[]): string {
  const s = casti.map((v) => (v === null || v === undefined ? '' : String(v))).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const ZNACKA = 'xls-lahve';
/** Otisky už zapsaných řádků appka pozná podle značky v poznámce (`note`). */
export function najdiJizNaimportovaneOtisky(poznamky: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(`#${ZNACKA}:([0-9a-z]+)`);
  for (const n of poznamky) {
    const m = n ? n.match(re) : null;
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * Připraví řádky k zápisu do `bottling`. Nic tady nehádá: co je nejednoznačné
 * (viz ProblemRadku), skončí v `problemy` a nezapíše se. `mapovaniPiv` je
 * ruční přiřazení názvu z excelu na appkové `beer_id` (pro případy, kdy se
 * text v excelu s appkou přesně neshoduje) — klíč je `normalizujNazev(pivoRaw)`.
 */
export function pripravImportStaceniLahvi(
  radky: ExcelRadekStaceni[],
  piva: Pivo[],
  mapovaniPiv: Record<string, string>,
  obaly: Obal[],
  jizNaimportovaneOtisky: Set<string>,
): VysledekPripravy {
  const pivaPodleNazvu = new Map(piva.map((p) => [normalizujNazev(p.name), p]));
  const pivaPodleId = new Map(piva.map((p) => [p.id, p]));
  const najdiObal = (objemL: number, typ: 'sud' | 'lahev') =>
    obaly.find((o) => Number(o.volume_l) === objemL && (typ === 'sud' ? o.kind === 'keg' : o.kind !== 'keg'));

  const pripravene: PripravenyRadek[] = [];
  const problemy: VysledekPripravy['problemy'] = [];
  const neznamaPiva = new Set<string>();
  let jizNaimportovane = 0;
  let prazdne = 0;
  const pouzitePocty = new Map<string, number>(); // báze otisku → kolikrát se dnes už použila (rozliší shodné řádky)

  for (const radek of radky) {
    if (radek.sudy.length === 0 && radek.lahve.length === 0) { prazdne++; continue; }

    const p: ProblemRadku[] = [];
    // Nečitelné datum je vždycky problém, i kdyby se předtím dal dopočítat
    // z řádku nad tím — kolega evidentně chtěl napsat JINÉ datum než to
    // dřívější, jen se překlep nedal přečíst.
    if (radek.datumNejdePrecist) p.push({ druh: 'datum_nejde_precist', text: radek.datumNejdePrecist });
    else if (!radek.datum) p.push({ druh: 'chybi_datum' });
    if (!radek.pivoRaw) p.push({ druh: 'chybi_pivo' });

    let pivo: Pivo | undefined;
    if (radek.pivoRaw) {
      const klic = normalizujNazev(radek.pivoRaw);
      pivo = pivaPodleNazvu.get(klic) ?? (mapovaniPiv[klic] ? pivaPodleId.get(mapovaniPiv[klic]) : undefined);
      if (!pivo) { p.push({ druh: 'nezname_pivo', nazev: radek.pivoRaw }); neznamaPiva.add(radek.pivoRaw); }
    }

    if (radek.sudy.length > 1) p.push({ druh: 'vic_sudu_najednou', pocetDruhu: radek.sudy.length });
    if (radek.sudy.length >= 1 && radek.lahve.length === 0) p.push({ druh: 'sud_bez_lahvi' });

    for (const s of radek.sudy) {
      if (s.hodnota === 'neplatne') p.push({ druh: 'neplatna_hodnota', objemL: s.objemL, typ: 'sud' });
      else if (!najdiObal(s.objemL, 'sud')) p.push({ druh: 'neznamy_obal', objemL: s.objemL, typ: 'sud' });
    }
    for (const l of radek.lahve) {
      if (l.hodnota === 'neplatne') p.push({ druh: 'neplatna_hodnota', objemL: l.objemL, typ: 'lahev' });
      else if (!najdiObal(l.objemL, 'lahev')) p.push({ druh: 'neznamy_obal', objemL: l.objemL, typ: 'lahev' });
    }

    if (p.length > 0) { problemy.push({ cisloRadku: radek.cisloRadku, radek, problemy: p }); continue; }

    // Otisk NEobsahuje poznámku — pozdější oprava jen textu poznámky se
    // nebere jako nový řádek. Pořadové číslo v rámci stejné báze rozliší
    // dva reálně různé řádky se shodou okolností stejnými čísly / dnem.
    const baze = otiskRadku([
      radek.datum, normalizujNazev(radek.pivoRaw!),
      ...radek.sudy.map((s) => `s${s.objemL}:${s.hodnota}`),
      ...radek.lahve.map((l) => `l${l.objemL}:${l.hodnota}`),
    ]);
    const poradi = pouzitePocty.get(baze) ?? 0;
    pouzitePocty.set(baze, poradi + 1);
    const otisk = poradi === 0 ? baze : `${baze}-${poradi}`;

    if (jizNaimportovaneOtisky.has(otisk)) { jizNaimportovane++; continue; }

    const sud = radek.sudy[0];
    const sudObal = sud ? najdiObal(sud.objemL, 'sud') : undefined;
    const kegsUsed = sud ? Number(sud.hodnota) : null;
    const sourceL = sud && sudObal ? Number(sud.hodnota) * sud.objemL : null;
    const note = `${radek.poznamka ? radek.poznamka + ' ' : ''}#${ZNACKA}:${otisk}`;

    const zaznamy: RadekKZapisu[] = radek.lahve.map((l) => {
      const obal = najdiObal(l.objemL, 'lahev')!;
      return {
        entry_date: radek.datum!, beer_id: pivo!.id, beer_name: pivo!.name,
        kegs_used: kegsUsed, kegs_used_package_id: sudObal?.id ?? null, source_volume_l: sourceL,
        package_id: obal.id, package_label: obal.label, quantity: Number(l.hodnota), note,
      };
    });

    const rozpadLahvi = radek.lahve.map((l) => `${l.hodnota}×${l.objemL} l`).join(' + ');
    const rozpadSudu = sud ? `${sud.hodnota}×KEG ${sud.objemL} l → ` : '(bez sudu) ';
    pripravene.push({
      cisloRadku: radek.cisloRadku, otisk, bezSudu: !sud,
      popis: `${radek.datum} · ${pivo!.name} · ${rozpadSudu}${rozpadLahvi}`,
      zaznamy,
    });
  }

  return { pripravene, jizNaimportovane, prazdne, problemy, neznamaPiva: [...neznamaPiva] };
}
