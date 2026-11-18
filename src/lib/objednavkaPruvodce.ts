// 🧭 Průvodce zadáním objednávky — čistý model (bez Reactu a bez databáze).
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „návrh, jak by vypadalo zadávání objednávek stejně jako
// zadávání stáčení lahví nebo fasování" a potom „udělej ty objednávky tak jako
// první návrh". Okno (components/objednavky/ObjednavkaPruvodce.tsx) vede třemi
// kroky: odběratel a den → pivo (dlaždice a krokové zadávání obalu a počtu,
// úplně jako ve Fasování) → souhrn a uložení.
//
// Tady je jen to, co jde zkoušet bez obrazovky: rozepsaný „koncept" objednávky,
// úpravy jeho řádků, nabídka dnů, místa závozu odběratele, souhrny a kontrola,
// jestli jde pokračovat. Uložení do databáze dělá obrazovka Objednávky STEJNOU
// cestou jako starý formulář (kontrola duplicit, potvrzení minulého týdne,
// upomínky) — průvodce jen předvyplní stejná pole, ať se pravidla nerozejdou.
import { objemObalu } from './dnesUlozeno';
import { poradiLahvi } from './krokoveZadavani';
import { denZavozuProUlozeni, jeAutomatickyBezZavozu } from './bezZavozu';
import { vychoziDenZavozu, type MistoSVychozimDnem } from './denZavozu';
import { HLAVNI_MISTO, maViceMist, mistaOdberatele, nazevHlavnihoMista, type OdberatelSMisty } from './mistaZavozu';
import { poradiRadkuZadavani } from './poradiPolozek';
import { posunDen } from './businessDate';
import { DAYS } from './shared';

// ── Koncept ─────────────────────────────────────────────────────────────────

export type RadekKonceptu = { id: string; beerId: string; pkgId: string; qty: number };

export type KonceptObjednavky = {
  /** Odběratel z katalogu; prázdné = nový odběratel podle napsaného jména. */
  placeId: string;
  /** Jméno vybraného odběratele, nebo napsané jméno nového. */
  placeName: string;
  /** Kam se veze: id dalšího místa nebo HLAVNI_MISTO; null = nevybráno (jen u odběratele s víc místy). */
  mistoZavozu: string | null;
  /** Den závozu ('po'…'ne') vybraný ručně; prázdné = výchozí den odběratele. */
  den: string;
  /** Datum závozu (YYYY-MM-DD) vybrané ručně; prázdné = výchozí. */
  datum: string;
  bezZavozu: boolean;
  /** Člověk „Bez závozu" přepnul sám — automatika podle jména ho už nepřepíše. */
  bezZavozuRucne: boolean;
  /** Potvrzení, že závoz spadá do jiného (příštího) měsíce. */
  potvrzenoDalsiMesic: boolean;
  poznamka: string;
  radky: RadekKonceptu[];
};

export type OdberatelPruvodce = MistoSVychozimDnem & OdberatelSMisty;

export type KrokPruvodce = 'odberatel' | 'pivo' | 'souhrn';
export const KROKY_PRUVODCE: readonly KrokPruvodce[] = ['odberatel', 'pivo', 'souhrn'];

export function prazdnyKoncept(): KonceptObjednavky {
  return {
    placeId: '', placeName: '', mistoZavozu: null,
    den: '', datum: '', bezZavozu: false, bezZavozuRucne: false, potvrzenoDalsiMesic: false,
    poznamka: '', radky: [],
  };
}

/** Je v konceptu cokoli, o co by člověk zavřením přišel? */
export function konceptMaObsah(k: KonceptObjednavky): boolean {
  return k.radky.length > 0 || k.placeName.trim() !== '' || k.poznamka.trim() !== '';
}

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Odběratel z katalogu, na kterého koncept míří (podle id, jinak podle jména). */
export function odberatelKonceptu<T extends { id: string; name: string }>(k: KonceptObjednavky, odberatele: readonly T[]): T | null {
  if (k.placeId) return odberatele.find((o) => o.id === k.placeId) ?? null;
  const jmeno = norm(k.placeName);
  return jmeno ? odberatele.find((o) => norm(o.name) === jmeno) ?? null : null;
}

/**
 * Výběr odběratele. Jiný odběratel = nové místo závozu (to patří tomu
 * předchozímu) a „Bez závozu" se znovu nastaví podle jména, pokud ho člověk
 * nepřepnul sám. Den závozu, který člověk vybral ručně, zůstává.
 */
export function vyberOdberatele(k: KonceptObjednavky, odberatel: { id: string; name: string } | null, volneJmeno = ''): KonceptObjednavky {
  const placeId = odberatel?.id ?? '';
  const placeName = (odberatel?.name ?? volneJmeno).trim();
  const stejny = placeId === k.placeId && norm(placeName) === norm(k.placeName);
  return {
    ...k,
    placeId,
    placeName,
    mistoZavozu: stejny ? k.mistoZavozu : null,
    bezZavozu: k.bezZavozuRucne ? k.bezZavozu : jeAutomatickyBezZavozu(placeName),
  };
}

export function nastavBezZavozu(k: KonceptObjednavky, bezZavozu: boolean): KonceptObjednavky {
  return { ...k, bezZavozu, bezZavozuRucne: true };
}

// ── Místa závozu ────────────────────────────────────────────────────────────

export type MistoVolba = { id: string; nazev: string; adresa: string | null };

/**
 * Nabídka „kam tentokrát?" u odběratele s víc místy: hlavní adresa a další
 * místa (Radek: Sklad, Drobák…). Odběratel s jedním místem nic nenabízí.
 */
export function mistaKVolbe(o: OdberatelSMisty | null | undefined): MistoVolba[] {
  if (!o || !maViceMist(o)) return [];
  return [
    { id: HLAVNI_MISTO, nazev: nazevHlavnihoMista(o), adresa: o.address ?? null },
    ...mistaOdberatele(o).map((m) => ({ id: m.id, nazev: m.nazev, adresa: m.adresa })),
  ];
}

/** Krátký popis místa pro dlaždici odběratele: „Sklad · Drobák". */
export function popisMist(o: OdberatelSMisty | null | undefined): string {
  return mistaOdberatele(o).map((m) => m.nazev).join(' · ');
}

export function nastavMisto(k: KonceptObjednavky, mistoZavozu: string | null): KonceptObjednavky {
  return { ...k, mistoZavozu };
}

// ── Den a datum závozu ──────────────────────────────────────────────────────

export type DenNabidky = {
  den: string;
  /** YYYY-MM-DD */
  datum: string;
  /** „Čt" */
  zkratka: string;
  /** „19. 11." */
  kratce: string;
  jeDnes: boolean;
};

/** „19. 11." z YYYY-MM-DD. */
export function datumKratce(datum: string): string {
  const [, m, d] = datum.slice(0, 10).split('-').map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${d}. ${m}.` : datum;
}

/** Klíč dne v týdnu ('po'…'ne') pro YYYY-MM-DD. */
export function denKlic(datum: string): string {
  const d = new Date(`${datum.slice(0, 10)}T00:00:00Z`);
  return DAYS[(d.getUTCDay() + 6) % 7].v;
}

const jmenoDne = (klic: string) => DAYS.find((d) => d.v === klic)?.label ?? klic;

/**
 * Nejbližší dny, na které se dá objednávka vozit: od dneška, bez nedělí.
 * Jiný den (i zpětně) se vybírá kalendářem.
 */
export function nabidkaDnu(dnes: string, pocet = 6): DenNabidky[] {
  const out: DenNabidky[] = [];
  for (let i = 0; out.length < pocet && i < pocet * 3; i++) {
    const datum = posunDen(dnes, i);
    const den = denKlic(datum);
    if (den === 'ne') continue;
    out.push({ den, datum, zkratka: jmenoDne(den), kratce: datumKratce(datum), jeDnes: i === 0 });
  }
  return out;
}

export function nastavDen(k: KonceptObjednavky, d: { den: string; datum: string }): KonceptObjednavky {
  return { ...k, den: d.den, datum: d.datum, potvrzenoDalsiMesic: false };
}

/** Datum z kalendáře: den v týdnu se dopočte. Prázdné datum vrátí výběr na výchozí den. */
export function nastavDatum(k: KonceptObjednavky, datum: string): KonceptObjednavky {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return zrusVyberDne(k);
  return { ...k, den: denKlic(datum), datum, potvrzenoDalsiMesic: false };
}

/** Zpátky na výchozí den odběratele. */
export function zrusVyberDne(k: KonceptObjednavky): KonceptObjednavky {
  return { ...k, den: '', datum: '', potvrzenoDalsiMesic: false };
}

export type UcinnyZavoz = {
  den: string | null;
  datum: string | null;
  /** Den nikdo nevybral — je to výchozí den odběratele (nebo žádný). */
  vychozi: boolean;
};

/**
 * Den, se kterým se objednávka uloží. Stejné pravidlo jako starý formulář
 * (lib/bezZavozu.ts denZavozuProUlozeni): vybraný den se nepřepisuje, jinak
 * výchozí den odběratele (středa, Seeberg a Lužec pátek, Restaurace a Prodejna
 * žádný), u „Bez závozu" dnešek.
 */
export function ucinnyZavoz(k: KonceptObjednavky, odberatele: readonly MistoSVychozimDnem[], dnes: string): UcinnyZavoz {
  if (k.den || k.datum) {
    const den = k.den || (k.datum ? denKlic(k.datum) : null);
    return { den: den || null, datum: k.datum || null, vychozi: false };
  }
  const v = denZavozuProUlozeni({
    bezZavozu: k.bezZavozu, den: '', datum: '', datumObjednavky: dnes,
    vychoziDen: vychoziDenZavozu(odberatele, k.placeId || null, k.placeName || null),
  });
  return { den: v.den, datum: v.datum, vychozi: true };
}

/** „Čt 19. 11." nebo „bez pevného dne". */
export function popisZavozu(z: UcinnyZavoz): string {
  if (!z.den && !z.datum) return 'bez pevného dne';
  const den = z.den ? jmenoDne(z.den) : '';
  const datum = z.datum ? datumKratce(z.datum) : '';
  return [den, datum].filter(Boolean).join(' ');
}

/** Spadá závoz do pozdějšího měsíce než dnešek? Pak ho musí člověk potvrdit. */
export function jeDalsiMesic(datum: string | null | undefined, dnes: string): boolean {
  return !!datum && datum.slice(0, 7) > dnes.slice(0, 7);
}

export function potvrdDalsiMesic(k: KonceptObjednavky, potvrzeno: boolean): KonceptObjednavky {
  return { ...k, potvrzenoDalsiMesic: potvrzeno };
}

// ── Řádky ───────────────────────────────────────────────────────────────────

let citacRadku = 1;
/** Nové id řádku (v rámci okna stačí pořadové číslo). */
export const noveIdRadku = (): string => `p${citacRadku++}`;

const cele = (n: unknown): number => {
  const x = Math.floor(Number(n));
  return Number.isFinite(x) && x > 0 ? Math.min(x, 9999) : 0;
};

/** Kolik kusů tohohle piva v tomhle obalu už je v objednávce. */
export function mnozstvi(radky: readonly RadekKonceptu[], beerId: string, pkgId: string): number {
  return radky.filter((r) => r.beerId === beerId && r.pkgId === pkgId).reduce((s, r) => s + r.qty, 0);
}

/**
 * Nastaví počet piva v obalu na přesnou hodnotu. Nula řádek smaže, nové
 * pivo+obal se přidá na konec. Stejné pivo a obal je vždycky jen jeden řádek.
 */
export function nastavMnozstvi(radky: readonly RadekKonceptu[], beerId: string, pkgId: string, qty: number, id: string = noveIdRadku()): RadekKonceptu[] {
  const n = cele(qty);
  const shoda = radky.filter((r) => r.beerId === beerId && r.pkgId === pkgId);
  if (shoda.length === 0) return n > 0 ? [...radky, { id, beerId, pkgId, qty: n }] : [...radky];
  const prvni = shoda[0].id;
  return radky
    .filter((r) => !(r.beerId === beerId && r.pkgId === pkgId) || r.id === prvni)
    .flatMap((r) => (r.id === prvni ? (n > 0 ? [{ ...r, qty: n }] : []) : [r]));
}

export function odeberRadek(radky: readonly RadekKonceptu[], id: string): RadekKonceptu[] {
  return radky.filter((r) => r.id !== id);
}

// ── Obaly ───────────────────────────────────────────────────────────────────

type ObalProPanel = { id: string; kind?: string | null; volume_l?: number | null; label?: string | null };

/** Obaly v pořadí panelu: sudy od největšího (50, 30, 20, 15, 10), pak lahve (1, 1,5, 0,5, 0,33). */
export function obalyProPanel<T extends { id: string; kind?: string | null; volume_l: number | string | null }>(packages: readonly T[]): T[] {
  const sudy = packages.filter((p) => p.kind === 'keg').sort((a, b) => Number(b.volume_l) - Number(a.volume_l));
  const lahve = poradiLahvi(packages.filter((p) => p.kind !== 'keg'));
  return [...sudy, ...lahve];
}

/** „50 l", „0,5 l" — stejný zápis jako ve Fasování. */
export const popisObalu = (p: ObalProPanel | undefined): string => objemObalu(p ? { id: p.id, label: p.label ?? null, volume_l: p.volume_l ?? null } : undefined);

/**
 * Obal, který se u piva nabídne jako první: ten, ve kterém se pivo podle
 * dosavadních objednávek objednává nejčastěji (při shodě větší, ať je sud před
 * lahví). Bez historie první obal v pořadí panelu.
 */
export function nejcastejsiObal<T extends { id: string }>(
  historie: readonly { beer_id: string | null; package_id: string | null }[],
  beerId: string,
  obaly: readonly T[],
): T | undefined {
  const pocty = new Map<string, number>();
  for (const h of historie) {
    if (h.beer_id === beerId && h.package_id) pocty.set(h.package_id, (pocty.get(h.package_id) ?? 0) + 1);
  }
  let nejlepsi: T | undefined;
  let nejvic = 0;
  for (const o of obaly) {
    const n = pocty.get(o.id) ?? 0;
    if (n > nejvic) { nejvic = n; nejlepsi = o; }
  }
  return nejlepsi ?? obaly[0];
}

/** Skupina obalu nad tlačítky obalů. */
export const skupinaObalu = (p: { kind?: string | null }): 'Sudy' | 'Lahve' => (p.kind === 'keg' ? 'Sudy' : 'Lahve');

/** Pět čísel, když z historie nic nevyjde: sudy 1–5, lahve po přepravkách. */
export function zalohaRychlych(p: { kind?: string | null; volume_l?: number | null } | undefined): number[] {
  if (!p) return [];
  if (p.kind === 'keg') return [1, 2, 3, 4, 5];
  const v = Number(p.volume_l);
  if (v === 0.33 || v === 0.5) return [10, 20, 40, 60, 80];
  return [6, 12, 18, 24, 48];
}

// ── Souhrny ─────────────────────────────────────────────────────────────────

type PivoProSouhrn = { id: string; name?: string | null; short_name?: string | null; sort_order?: number | null; beer_color?: string | null };
type ObalProSouhrn = ObalProPanel & { sort_order?: number | null };

export type RadekSouhrnu = { id: string; pkgId: string; qty: number; /** „2× 50 l" */ text: string };
export type SkupinaPiva<B extends PivoProSouhrn> = { beerId: string; pivo: B | undefined; radky: RadekSouhrnu[] };

/** Řádky objednávky po pivech, v pořadí katalogu (pivo, pak obal od největšího). */
export function skupinyPodlePiv<B extends PivoProSouhrn, P extends ObalProSouhrn>(
  radky: readonly RadekKonceptu[],
  packages: readonly P[],
  beers: readonly B[],
): SkupinaPiva<B>[] {
  const serazene = poradiRadkuZadavani([...radky], [...packages], [...beers]);
  const obal = new Map(packages.map((p) => [p.id, p]));
  const pivo = new Map(beers.map((b) => [b.id, b]));
  const out: SkupinaPiva<B>[] = [];
  for (const r of serazene) {
    let s = out.find((x) => x.beerId === r.beerId);
    if (!s) { s = { beerId: r.beerId, pivo: pivo.get(r.beerId), radky: [] }; out.push(s); }
    s.radky.push({ id: r.id, pkgId: r.pkgId, qty: r.qty, text: `${r.qty}× ${popisObalu(obal.get(r.pkgId))}` });
  }
  return out;
}

/** Štítek na dlaždici piva — „2×50, 1×30" jako ve Fasování. Prázdný = pivo není v objednávce. */
export function stitekPiva(radky: readonly RadekKonceptu[], beerId: string, packages: readonly ObalProSouhrn[], beers: readonly PivoProSouhrn[] = []): string {
  const jeho = radky.filter((r) => r.beerId === beerId && r.qty > 0);
  const obal = new Map(packages.map((p) => [p.id, p]));
  return poradiRadkuZadavani([...jeho], [...packages], [...beers])
    .map((r) => {
      const v = Number(obal.get(r.pkgId)?.volume_l);
      return `${r.qty}×${Number.isFinite(v) ? Math.round(v * 100) / 100 : '?'}`.replace('.', ',');
    })
    .join(', ');
}

export type SouctyObjednavky = {
  polozek: number;
  piv: number;
  sudu: number;
  litruVSudech: number;
  lahvi: number;
};

export function souctyObjednavky(radky: readonly RadekKonceptu[], packages: readonly ObalProPanel[]): SouctyObjednavky {
  const obal = new Map(packages.map((p) => [p.id, p]));
  const s: SouctyObjednavky = { polozek: radky.length, piv: new Set(radky.map((r) => r.beerId)).size, sudu: 0, litruVSudech: 0, lahvi: 0 };
  for (const r of radky) {
    const p = obal.get(r.pkgId);
    if (p?.kind === 'keg') {
      s.sudu += r.qty;
      s.litruVSudech += r.qty * (Number(p.volume_l) || 0);
    } else {
      s.lahvi += r.qty;
    }
  }
  s.litruVSudech = Math.round(s.litruVSudech * 100) / 100;
  return s;
}

/** Česká množná čísla: 1 sud, 2–4 sudy, 0 a 5+ sudů. */
export function pocetSlov(n: number, jedna: string, dve: string, pet: string): string {
  const a = Math.abs(n);
  return `${n} ${a === 1 ? jedna : a >= 2 && a <= 4 ? dve : pet}`;
}

/** „130 l v sudech · 10 lahví" (co v objednávce není, se nevypisuje). */
export function popisSouctu(s: SouctyObjednavky): string {
  const casti: string[] = [];
  if (s.sudu > 0) casti.push(`${String(s.litruVSudech).replace('.', ',')} l v sudech`);
  if (s.lahvi > 0) casti.push(pocetSlov(s.lahvi, 'lahev', 'lahve', 'lahví'));
  return casti.join(' · ');
}

/** „2 piva · 4 položky" do lišty pod dlaždicemi. */
export function popisObsahu(s: SouctyObjednavky): string {
  if (s.polozek === 0) return 'zatím nic';
  return `${pocetSlov(s.piv, 'pivo', 'piva', 'piv')} · ${pocetSlov(s.polozek, 'položka', 'položky', 'položek')}`;
}

// ── Kontrola kroků ──────────────────────────────────────────────────────────

/**
 * Proč se z kroku nedá jít dál (text pro člověka), nebo null. U souhrnu platí
 * i všechno z dřívějších kroků — uložit jde jen úplná objednávka.
 */
export function chybaKroku(
  k: KonceptObjednavky,
  krok: KrokPruvodce,
  ctx: { odberatele: readonly OdberatelPruvodce[]; dnes: string },
): string | null {
  if (!k.placeName.trim()) return 'Vyber odběratele.';
  const odberatel = odberatelKonceptu(k, ctx.odberatele);
  if (odberatel && maViceMist(odberatel) && k.mistoZavozu === null) return `Vyber, kam se veze (${odberatel.name} má víc míst).`;
  const z = ucinnyZavoz(k, ctx.odberatele, ctx.dnes);
  if (jeDalsiMesic(z.datum, ctx.dnes) && !k.potvrzenoDalsiMesic) return 'Závoz spadá do dalšího měsíce — potvrď to zaškrtnutím.';
  if (krok === 'odberatel') return null;
  if (k.radky.length === 0) return 'Přidej aspoň jedno pivo.';
  return null;
}

// ── Zopakování poslední objednávky ──────────────────────────────────────────

type ObjednavkaProZopakovani = { id: string; place_id: string | null; place_name: string | null; status?: string | null; order_date: string; created_at?: string | null };
type PolozkaProZopakovani = { beer_id: string | null; package_id: string | null; quantity: number };

/** Poslední (nestornovaná) objednávka odběratele — podle data objednávky, při shodě podle vzniku. */
export function posledniObjednavka<O extends ObjednavkaProZopakovani>(objednavky: readonly O[], placeId: string, placeName: string): O | null {
  const jmeno = norm(placeName);
  const jeho = objednavky.filter((o) => o.status !== 'storno'
    && ((!!placeId && o.place_id === placeId) || (!o.place_id && !!jmeno && norm(o.place_name) === jmeno)));
  if (jeho.length === 0) return null;
  return [...jeho].sort((a, b) => b.order_date.localeCompare(a.order_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
}

/**
 * Položky staré objednávky jako řádky konceptu. Pivo nebo obal, který už
 * v katalogu není (nebo je vypnutý), se přeskočí a spočítá — člověk se to
 * dozví, ne že mu řádek tiše zmizí. Stejné pivo+obal se sečte.
 */
export function zopakujPolozky(
  polozky: readonly PolozkaProZopakovani[],
  beers: readonly { id: string }[],
  packages: readonly { id: string }[],
): { radky: RadekKonceptu[]; vynechano: number } {
  const piva = new Set(beers.map((b) => b.id));
  const obaly = new Set(packages.map((p) => p.id));
  let radky: RadekKonceptu[] = [];
  let vynechano = 0;
  for (const p of polozky) {
    const qty = cele(p.quantity);
    if (!p.beer_id || !p.package_id || qty === 0 || !piva.has(p.beer_id) || !obaly.has(p.package_id)) { vynechano++; continue; }
    radky = nastavMnozstvi(radky, p.beer_id, p.package_id, mnozstvi(radky, p.beer_id, p.package_id) + qty);
  }
  return { radky, vynechano };
}

// ── Seznam odběratelů ───────────────────────────────────────────────────────

/** Kolik odběratelů se ukáže hned, když se nic nehledá. */
export const POCET_RYCHLYCH_ODBERATELU = 6;
