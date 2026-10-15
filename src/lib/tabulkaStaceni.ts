// 📊 Tabulka stáčení z fotky — čtení „od data" a převod na řádky zadávání.
// ---------------------------------------------------------------------------
// 15. 10. 2026, majitel: „čtení fotky z týhle excelový tabulky udělej ve všech
// zadáváních, ať se nemusí ořezávat — můžu zadat datum, od kdy chci data číst.
// Datum platí do tý doby, než se objeví další."
//
// Tohle je část v aplikaci; samotné čtení (Vision, AI, kontroly) je v
// supabase/functions/_shared/tabulka-staceni.ts a tabulka-cteni.ts.
//
// Postup (dvě volání funkce parse-order-image):
//   1. celá fotka → přepis Google Vision po řádcích (data, čísla řádků, poloha),
//   2. z přepisu se spočítá výřez od zvoleného data (najdiOkno), fotka se
//      ořízne a zvětší a AI přečte buňky podle sloupců.
// Při změně data se krok 1 neopakuje — přepis zůstává v paměti fotky.
import {
  bilance,
  najdiOkno,
  type Bunka,
  type DenTabulky,
  type PrepisTabulky,
  type RadekTabulky,
} from '../../supabase/functions/_shared/tabulka-staceni';
import { authenticatedFunctionHeaders } from './functionAuth';
import { oriznutyDataUrl, typObrazku, zmensenyDataUrl } from './obrazek';

/** Fotka, ze které se čte (data URL pro náhled; původní soubor, když ho máme — z něj jde zvětšit ostřeji). */
export type FotoTabulky = { dataUrl: string; soubor?: File };

/** Co se o fotce už zjistilo — ať se při změně data nepřepisuje a nezmenšuje znovu. */
export type PametFotky = { analyza?: string; prepis?: PrepisTabulky | null };

export type VysledekCteniTabulky =
  | {
      stav: 'ok';
      radky: RadekTabulky[];
      dny: DenTabulky[];
      varovani: string[];
      vynechano: number;
      bezData: number;
      /** Čte se výřez fotky (ne celá). */
      orezano: boolean;
      /** Přepis Vision se použil ke kontrole čísel a dat. */
      ocr: boolean;
      odData: string | null;
    }
  | { stav: 'nic-od-data'; odData: string; posledniDatum: string | null; data: string[] }
  | { stav: 'chyba'; zprava: string };

const NAJEZD_ANALYZA = { maxStrana: 2400, kvalita: 0.85, maxZnaku: 4_800_000 };

/** Odpověď funkce parse-order-image v režimech tabulky (viz _shared/tabulka-cteni.ts). */
type DataFunkce = {
  error?: string;
  tabulka?: {
    prepis?: PrepisTabulky | null;
    radky?: RadekTabulky[];
    dny?: DenTabulky[];
    varovani?: string[];
    vynechano?: number;
    bezData?: number;
    ocr?: boolean;
  };
};

async function volejFunkci(telo: Record<string, unknown>): Promise<{ ok: true; data: DataFunkce } | { ok: false; zprava: string }> {
  try {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-image`, {
      method: 'POST',
      headers: await authenticatedFunctionHeaders(),
      body: JSON.stringify(telo),
    });
    const text = await resp.text();
    let data: DataFunkce | null = null;
    try { data = JSON.parse(text) as DataFunkce; } catch { /* chybová stránka, ne JSON */ }
    if (!resp.ok) return { ok: false, zprava: `HTTP ${resp.status}: ${data?.error ?? text.slice(0, 200)}` };
    if (data?.error) return { ok: false, zprava: String(data.error) };
    if (!data) return { ok: false, zprava: 'Neplatná odpověď: ' + text.slice(0, 200) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, zprava: e instanceof Error ? e.message : String(e) };
  }
}

const base64 = (dataUrl: string) => dataUrl.split(',')[1] ?? '';

/**
 * Přečte tabulku stáčení z fotky od zvoleného data.
 * Nikdy nevyhazuje výjimku — chyby vrací jako `stav: 'chyba'`.
 */
export async function ctiTabulkuZFotky(v: {
  foto: FotoTabulky;
  /** Čtou se jen řádky od tohoto dne (ISO); prázdné = celá tabulka. */
  odData: string | null;
  piva: { id: string; name: string; degree?: string | null }[];
  pamet: PametFotky;
}): Promise<VysledekCteniTabulky> {
  const odData = v.odData || null;
  const katalog = v.piva.map((b) => ({ id: b.id, name: b.name, degree: b.degree ?? null }));

  // Obrázek pro čtení: ze souboru ve větším rozlišení než náhled (malé písmo tabulky).
  if (!v.pamet.analyza) {
    v.pamet.analyza = v.foto.soubor ? await zmensenyDataUrl(v.foto.soubor, NAJEZD_ANALYZA) : v.foto.dataUrl;
  }
  const analyza = v.pamet.analyza;
  const mime = typObrazku(analyza);

  // Krok 1: přepis fotky po řádcích (jednou na fotku).
  if (v.pamet.prepis === undefined) {
    const r = await volejFunkci({ rezim: 'tabulka-okno', imageBase64: base64(analyza), imageMimeType: mime, beers: katalog, packages: [] });
    if (!r.ok) return { stav: 'chyba', zprava: r.zprava };
    v.pamet.prepis = r.data?.tabulka?.prepis ?? null;
  }

  // Odkud číst: výřez od zvoleného data; bez přepisu (nebo když výřez nejde určit) se čte celá fotka.
  const okno = v.pamet.prepis ? najdiOkno(v.pamet.prepis, odData) : null;
  if (okno && odData && okno.duvod === 'nic-od-data') {
    return { stav: 'nic-od-data', odData, posledniDatum: okno.data[okno.data.length - 1] ?? null, data: okno.data };
  }
  let obraz = analyza;
  let orezano = false;
  if (okno?.okno) {
    const vyrez = await oriznutyDataUrl(analyza, okno.okno);
    if (vyrez) { obraz = vyrez; orezano = true; }
  }

  // Krok 2: buňky podle sloupců.
  const r = await volejFunkci({
    rezim: 'tabulka',
    imageBase64: base64(obraz),
    imageMimeType: typObrazku(obraz),
    beers: katalog,
    packages: [],
    odData,
    vyrez: orezano,
    datumOkna: orezano ? okno?.datumOkna ?? null : null,
  });
  if (!r.ok) return { stav: 'chyba', zprava: r.zprava };
  const t = r.data?.tabulka;
  if (!t || !Array.isArray(t.radky)) return { stav: 'chyba', zprava: 'Neplatná odpověď čtení tabulky.' };
  return {
    stav: 'ok',
    radky: t.radky,
    dny: t.dny ?? [],
    varovani: t.varovani ?? [],
    vynechano: t.vynechano ?? 0,
    bezData: t.bezData ?? 0,
    orezano,
    ocr: !!t.ocr,
    odData,
  };
}

// ── Návrh data a výběr dne ──────────────────────────────────────────────

/** Den po posledním zápisu v aplikaci — odtud se tabulka čte, ať se nic nezapíše podruhé. Prázdné, když zápis není. */
export function navrhOdData(posledniZapis: string | null | undefined): string {
  if (!posledniZapis || !/^\d{4}-\d{2}-\d{2}$/.test(posledniZapis)) return '';
  const d = new Date(posledniZapis + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Který den se nabídne k vložení. Jedna dávka zadávání má jedno datum, takže
 * při víc dnech v tabulce se vkládá den po dni. Od zadaného data se jde od
 * nejstaršího (chronologicky); bez data se tabulka čte celá a nabídne se
 * nejnovější den. `undefined` = není z čeho vybírat.
 */
export function vychoziDen(dny: DenTabulky[], odData: string | null): string | null | undefined {
  if (dny.length === 0) return undefined;
  if (dny.length === 1) return dny[0].datum;
  const sDatem = dny.filter((d) => d.datum !== null);
  if (sDatem.length === 0) return null;
  return odData ? sDatem[0].datum : sDatem[sDatem.length - 1].datum;
}

// ── Převod na řádky zadávání ────────────────────────────────────────────

export type ObalKatalog = { id: string; label: string; kind?: string | null; volume_l: number | string };

const stejny = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Obal z katalogu podle objemu a druhu — stejně jako import z excelu (sud = kind keg, lahev = vše ostatní). */
export function obalPodleObjemu(obaly: ObalKatalog[], druh: 'sud' | 'lahev', objemL: number): ObalKatalog | undefined {
  return obaly.find((o) => stejny(Number(o.volume_l), objemL) && (druh === 'sud' ? o.kind === 'keg' : o.kind !== 'keg'));
}

const objemText = (l: number) => `${String(l).replace('.', ',')} l`;

/** Společné údaje každého převedeného řádku. */
type Puvod = {
  /** Den z tabulky (ISO); null = nad prvním datem na fotce. */
  datum: string | null;
  /** Co u řádku zkontrolovat podle fotky. */
  varovani: string[];
  /** Číslo řádku excelu a text z buňky Pivo — do hlavičky řádku. */
  cisloRadku: number | null;
  pivoText: string | null;
};

/** Řádek zadávání stáčení lahví: pivo, až dva sudy a až tři druhy lahví. */
export type RadekLahveZTabulky = Puvod & {
  beerId: string;
  pkgId: string;
  pkg2Id: string;
  pkg3Id: string;
  kegPkgId: string;
  kegQty: string;
  keg2PkgId: string;
  keg2Qty: string;
  qty: string;
  qty2: string;
  qty3: string;
};

function puvod(r: RadekTabulky, varovani: string[]): Puvod {
  return { datum: r.datum, varovani, cisloRadku: r.cislo, pivoText: r.pivo };
}

/**
 * Řádky tabulky → řádky zadávání lahví. Formulář unese dva sudy a tři druhy
 * lahví na pivo; čtvrtý druh lahví jde jako samostatný řádek bez sudu (a řekne
 * se to), třetí velikost sudu se nepřidá (a řekne se to). Co v katalogu obal
 * nemá, zůstane prázdné s varováním.
 */
export function radkyLahveZTabulky(radky: RadekTabulky[], obaly: ObalKatalog[]): RadekLahveZTabulky[] {
  const ven: RadekLahveZTabulky[] = [];
  for (const r of radky) {
    const varovani = [...r.varovani];
    const sud = (b: Bunka | undefined) => {
      if (!b) return { id: '', ks: '' };
      const o = obalPodleObjemu(obaly, 'sud', b.objemL);
      if (!o) varovani.push(`Sud ${objemText(b.objemL)} v katalogu obalů není — vyber ho ručně.`);
      return { id: o?.id ?? '', ks: String(b.ks) };
    };
    const lahev = (b: Bunka | undefined) => {
      if (!b) return { id: '', ks: '' };
      const o = obalPodleObjemu(obaly, 'lahev', b.objemL);
      if (!o) varovani.push(`Lahev ${objemText(b.objemL)} v katalogu obalů není — vyber ji ručně.`);
      return { id: o?.id ?? '', ks: String(b.ks) };
    };
    if (r.sudy.length > 2) {
      varovani.push(`Na řádku jsou ${r.sudy.length} velikosti sudů, formulář umí dvě — ${r.sudy.slice(2).map((s) => `${s.ks}× ${objemText(s.objemL)}`).join(', ')} přidej ručně.`);
    }
    const k1 = sud(r.sudy[0]);
    const k2 = sud(r.sudy[1]);
    const l = [lahev(r.lahve[0]), lahev(r.lahve[1]), lahev(r.lahve[2])];
    const radek: RadekLahveZTabulky = {
      beerId: r.pivoId ?? '',
      pkgId: l[0].id, qty: l[0].ks,
      pkg2Id: l[1].id, qty2: l[1].ks,
      pkg3Id: l[2].id, qty3: l[2].ks,
      kegPkgId: k1.id, kegQty: k1.ks,
      keg2PkgId: k2.id, keg2Qty: k2.ks,
      ...puvod(r, varovani),
    };
    ven.push(radek);

    if (r.lahve.length > 3) {
      const ctvrta = r.lahve[3];
      const o = lahev(ctvrta);
      const text = `${ctvrta.ks}× ${objemText(ctvrta.objemL)}`;
      radek.varovani.push(`Čtvrtý druh lahví (${text}) se do řádku nevešel — je v dalším řádku bez sudu.`);
      ven.push({
        beerId: r.pivoId ?? '',
        pkgId: o.id, qty: o.ks, pkg2Id: '', qty2: '', pkg3Id: '', qty3: '',
        kegPkgId: '', kegQty: '', keg2PkgId: '', keg2Qty: '',
        ...puvod(r, [`Patří k témuž sudu jako řádek nad ním (${text}) — formulář unese jen tři druhy lahví na sud.`]),
      });
    }
  }
  return ven;
}

/** Řádek zadávání sudů nebo výdeje: pivo, obal, počet. */
export type RadekObalZTabulky = Puvod & { beerId: string; pkgId: string; qty: string };

/** Řádky tabulky → řádky po jednom obalu; `sudy` / `lahve` určuje, které sloupce se berou. */
export function radkyObalyZTabulky(
  radky: RadekTabulky[],
  obaly: ObalKatalog[],
  co: { sudy: boolean; lahve: boolean },
): { radky: RadekObalZTabulky[]; preskoceno: number } {
  const ven: RadekObalZTabulky[] = [];
  let preskoceno = 0;
  for (const r of radky) {
    const bunky: { b: Bunka; druh: 'sud' | 'lahev' }[] = [
      ...(co.sudy ? r.sudy.map((b) => ({ b, druh: 'sud' as const })) : []),
      ...(co.lahve ? r.lahve.map((b) => ({ b, druh: 'lahev' as const })) : []),
    ];
    if (bunky.length === 0) { preskoceno++; continue; }
    for (const { b, druh } of bunky) {
      const o = obalPodleObjemu(obaly, druh, b.objemL);
      const varovani = [...r.varovani];
      if (!o) varovani.push(`${druh === 'sud' ? 'Sud' : 'Lahev'} ${objemText(b.objemL)} v katalogu obalů není — vyber obal ručně.`);
      ven.push({ beerId: r.pivoId ?? '', pkgId: o?.id ?? '', qty: String(b.ks), ...puvod(r, varovani) });
    }
  }
  return { radky: ven, preskoceno };
}

/** Litry ze sudů, litry v lahvích a výtrata u řádku zadávání lahví — živě podle toho, co je v řádku teď. */
export function bilanceRadkuLahve(
  r: Pick<RadekLahveZTabulky, 'kegPkgId' | 'kegQty' | 'keg2PkgId' | 'keg2Qty' | 'pkgId' | 'qty' | 'pkg2Id' | 'qty2' | 'pkg3Id' | 'qty3'>,
  obaly: ObalKatalog[],
): { zdrojL: number; stoceneL: number; vytrataProc: number | null } {
  const objem = (id: string) => Number(obaly.find((o) => o.id === id)?.volume_l ?? 0);
  const bunka = (id: string, ks: string): Bunka[] => (id && Number(ks) > 0 && objem(id) > 0 ? [{ objemL: objem(id), ks: Number(ks) }] : []);
  return bilance(
    [...bunka(r.kegPkgId, r.kegQty), ...bunka(r.keg2PkgId, r.keg2Qty)],
    [...bunka(r.pkgId, r.qty), ...bunka(r.pkg2Id, r.qty2), ...bunka(r.pkg3Id, r.qty3)],
  );
}
