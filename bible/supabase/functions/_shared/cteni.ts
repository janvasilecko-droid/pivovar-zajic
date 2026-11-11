// 📖 bible-api: čtení zpracované knihy (etapa 3a) — čisté funkce bez sítě a bez Dena.
// ---------------------------------------------------------------------------
// Kapitoly, strany a pasáže zapisuje worker po částech (bez transakce), takže
// číst se smí jen dokument ve stavu hotovo / ke_kontrole — jinak můžou být
// data napůl smazaná nebo napůl zapsaná. Obsah knih nesmí do logu (repo je
// veřejné) a jeden požadavek vydá jen pár listů (žádný export celé knihy).
// Testy: cteni.test.ts.
import { ChybaVstupu } from './vstupy.ts';

/** Stavy, ve kterých jsou kapitoly, strany i pasáže kompletní (stejně jako jeZpracovany v appce). */
export const CITELNE_STAVY: readonly string[] = ['hotovo', 'ke_kontrole'];

export const jeCitelny = (stav: unknown): boolean => typeof stav === 'string' && CITELNE_STAVY.includes(stav);

/** Česká zpráva, proč kniha ještě nejde číst (kód 'nezpracovano'). */
export function zpravaNezpracovano(stav: unknown): string {
  switch (stav) {
    case 'nahrava': return 'Kniha se ještě nahrává — číst půjde, až bude nahraná a zpracovaná.';
    case 'ceka': return 'Kniha čeká na zpracování — číst půjde, až zpracování doběhne.';
    case 'zpracovava': return 'Kniha se právě zpracovává — číst půjde, až zpracování doběhne.';
    case 'chyba': return 'Knihu se nepodařilo zpracovat — důvod je u ní v knihovně.';
    case 'pozastaveno': return 'Zpracování knihy je pozastavené — v knihovně ho jde pustit znovu.';
    default: return 'Kniha ještě není zpracovaná.';
  }
}

/**
 * Dokument je hotový, ale text v databázi bible chybí — obnova ze zálohy vrací
 * jen řádky dokumentů (kapitoly, listy a pasáže se nezálohují, vzniknou znovu
 * zpracováním). Bez téhle hlášky by čtečka ukázala prázdnou knihu „0 listů".
 */
export const ZPRAVA_BEZ_TEXTU = 'Text knihy v databázi bible chybí (třeba po obnově ze zálohy) — správce ji v knihovně pustí „Zpracovat znovu".';

/** Nejvýš tolik listů vydá jeden požadavek na čtení (a míň, když jsou husté). */
export const MAX_LISTU_NA_DOTAZ = 3;
/** Strop znaků textu v jedné odpovědi — vždy ale aspoň jeden celý list. */
export const MAX_ZNAKU_ODPOVEDI = 150_000;
/** PostgREST vrací nejvýš 1000 řádků na dotaz — rejstříky se čtou po stránkách. */
export const STRANKA_DB = 1000;
/** Pojistka stránkování (kniha s víc listy nebo kapitolami neexistuje). */
export const MAX_RADKU = 20_000;
/** Tabulek, vzorců a popisků na jeden požadavek (další po „Načíst další"). */
export const OBJEKTU_NA_DOTAZ = 100;
/** Kolik znaků z tabulky nebo vzorce ukáže přehled (celé jsou na stránce). */
export const NAHLED_ZNAKU = 300;

export type DruhObjektu = 'tabulka' | 'vzorec' | 'popisek';
export const DRUHY_OBJEKTU: readonly DruhObjektu[] = ['tabulka', 'vzorec', 'popisek'];

export function celeCislo(v: unknown, jmeno: string, min: number, max: number, vychozi?: number): number {
  if ((v === undefined || v === null) && vychozi !== undefined) return vychozi;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ChybaVstupu(`${jmeno} musí být celé číslo.`);
  if (v < min || v > max) throw new ChybaVstupu(`${jmeno} musí být ${min}–${max}.`);
  return v;
}

/** Druh objektu pro přehled; nic = tabulky, vzorce i popisky. */
export function druhObjektu(v: unknown): DruhObjektu | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && (DRUHY_OBJEKTU as readonly string[]).includes(v)) return v as DruhObjektu;
  throw new ChybaVstupu('Druh musí být tabulka, vzorec nebo popisek.');
}

/** Listy pod strop znaků (text i překlad) — vždy aspoň jeden celý, žádný se nezkracuje (zbytek si appka vyžádá). */
export function listyPodStropem<T extends { text?: string | null; preklad?: string | null }>(listy: T[], maxZnaku = MAX_ZNAKU_ODPOVEDI): T[] {
  const vysledek: T[] = [];
  let znaku = 0;
  for (const l of listy) {
    const delka = (l.text ?? '').length + (l.preklad ?? '').length;
    if (vysledek.length > 0 && znaku + delka > maxZnaku) break;
    vysledek.push(l);
    znaku += delka;
  }
  return vysledek;
}

/** Sloupce listu ke čtení; překlad zvlášť — bez migrace 20261103000000_bible_preklad sloupce chybí (42703). */
export const SLOUPCE_LISTU = 'pdf_index,tistena_strana,tistena_zdroj,zdroj_textu,text,ke_kontrole,kontrola_duvod,kapitola_id';
export const SLOUPCE_PREKLADU = 'preklad,preklad_kontrola,preklad_platny';

/**
 * Český překlad listu pro appku: jen platný (vznikl z dnešního textu strany,
 * DB to hlídá přes md5). Neplatný nebo chybějící → null (appka ukáže originál
 * a „překlad se připravuje"); prázdný řetězec = strana překlad nepotřebuje.
 */
export function sPrekladem<T extends { preklad?: string | null; preklad_kontrola?: string | null; preklad_platny?: boolean | null }>(
  list: T,
): Omit<T, 'preklad' | 'preklad_kontrola' | 'preklad_platny'> & { preklad: string | null; preklad_kontrola: string | null } {
  const { preklad, preklad_kontrola, preklad_platny, ...zbytek } = list;
  const platny = preklad_platny === true && typeof preklad === 'string';
  return { ...zbytek, preklad: platny ? preklad : null, preklad_kontrola: platny ? (preklad_kontrola ?? null) : null };
}

/** Začátek textu pro přehled tabulek a vzorců (bez rozpůleného znaku na konci). */
export function nahled(text: string | null | undefined, max = NAHLED_ZNAKU): string {
  const t = (text ?? '').trim();
  if (t.length <= max) return t;
  const znaky = Array.from(t);
  return znaky.length <= max ? t : `${znaky.slice(0, max).join('').trimEnd()}…`;
}

/** Kompaktní rejstřík listů: [pdf_index, tištěná strana, zdroj textu ('v' vrstva, 'o' OCR, 's' soubor), ke kontrole]. */
export type RadekRejstriku = [number, string | null, 'v' | 'o' | 's', 0 | 1];

const ZKRATKA_ZDROJE: Record<string, 'v' | 'o' | 's'> = { vrstva: 'v', ocr: 'o', soubor: 's' };

export function rejstrikListu(radky: readonly {
  pdf_index: number; tistena_strana: string | null; zdroj_textu: string; ke_kontrole: boolean | null;
}[]): RadekRejstriku[] {
  return radky.map((r) => [r.pdf_index, r.tistena_strana ?? null, ZKRATKA_ZDROJE[r.zdroj_textu] ?? 'v', r.ke_kontrole ? 1 : 0]);
}

/**
 * Všechny řádky dotazu po stránkách (PostgREST jich vrátí nejvýš 1000 najednou).
 * `stranka(od, do)` = stejný dotaz s .range(od, do) a pevným řazením.
 */
export async function vsechnyRadky<T>(
  stranka: (od: number, do_: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  max = MAX_RADKU,
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (let od = 0; od < max; od += STRANKA_DB) {
    const { data: kus, error } = await stranka(od, Math.min(od + STRANKA_DB, max) - 1);
    if (error) return { data, error };
    const radky = kus ?? [];
    data.push(...radky);
    if (radky.length < STRANKA_DB) break;
  }
  return { data, error: null };
}

// --- Hledání (etapa 4, migrace 20261103010000_bible_hledani) --------------------

/** Nejvýš tolik výsledků hledání na dotaz. */
export const VYSLEDKU_HLEDANI = 40;
/** Délka úryvku kolem nálezu (znaků). */
export const URYVEK_ZNAKU = 320;

/** Dotaz hledání: text 2–200 znaků s aspoň jedním písmenem nebo číslicí. */
export function dotazHledani(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (t.length < 2 || t.length > 200 || !/[\p{L}\p{N}]/u.test(t)) throw new ChybaVstupu('Napiš, co hledáš (2–200 znaků).');
  return t;
}

const bezDiakritiky = (z: string): string => z.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Slova dotazu bez diakritiky malými písmeny (jako bible_dotaz v SQL). */
export function slovaDotazu(dotaz: string): string[] {
  return bezDiakritiky(dotaz).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 || /^[0-9]$/.test(w)).slice(0, 8);
}

// Hledání otázkou v běžné řeči — stejná výplňová slova a koncovky jako
// bible_slova_volne v SQL (migrace 20261111030000_bible_chat). Změna jen na obou místech.
const VYPLNOVA = new Set((
  'proc jak jaky jaka jake jaci kdy kde kam kolik ktery ktera ktere kteri neco nejak pro pri pod nad mezi jsem jsme jste jsou '
  + 'byl byla bylo byly bude budou mam mame mate maji mit mel mela melo meli muze muzu mohu mohl muzeme lze neni nebo ale ani '
  + 'tak take jen aby bych bys bychom byste kdyz jako jeho jeji jejich tento tato toto tyto tech tem ten tam tady zde jeste '
  + 'velmi moc hodne malo trochu nas nase nasi vas vase muj moje svuj sve sva treba proto protoze potom pak nez chci chceme '
  + 'potrebuji potrebuju vim nevim delat udelat resit poradit poradte prosim dekuji diky '
  + 'the and for with why how what when does from that this are was not der die das und mit fur wie warum ist sind ein eine bei von'
).split(' '));
const KONCOVKY = (
  'ovani ovat ujeme ujete ovych ovymi ovemu oveho ovou eni ani uje uji ovy ova ove ovi ich ych ech ach ami emi imi ymi eho emu '
  + 'iho imu ou em im ym um am at it et a e i o u y'
).split(' ').sort((a, b) => b.length - a.length);
const ZNACKY = new Set(['ph', 'o2', 'fe', 'cu', 'zn', 'ca', 'mg']);

/** Slova otázky pro volné hledání: bez výplňových slov, s uříznutou českou koncovkou (chmelovaru → chmelovar), nejvýš 8. */
export function slovaVolne(dotaz: string): string[] {
  const vysledek: string[] = [];
  for (const slovo of bezDiakritiky(dotaz).split(/[^a-z0-9]+/)) {
    const cislo = /^[0-9]+$/.test(slovo);
    if (!(slovo.length >= 3 || cislo || ZNACKY.has(slovo)) || VYPLNOVA.has(slovo)) continue;
    let kmen = slovo;
    if (!cislo && slovo.length >= 4) {
      const k = KONCOVKY.find((x) => slovo.endsWith(x) && slovo.length - x.length >= 3);
      if (k) kmen = slovo.slice(0, -k.length);
    }
    if (!vysledek.includes(kmen)) vysledek.push(kmen);
    if (vysledek.length === 8) break;
  }
  return vysledek;
}

/**
 * Úryvek textu kolem prvního nalezeného slova dotazu (bez ohledu na diakritiku
 * a velikost písmen). Nenajde-li se nic, začátek textu. Celá slova, s „…".
 */
export function uryvek(text: string | null | undefined, slova: readonly string[], max = URYVEK_ZNAKU): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  // Mapa znaků bez diakritiky → pozice v originále (NFD může znak rozložit).
  let plochy = '';
  const pozice: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const z = bezDiakritiky(t[i]);
    for (let j = 0; j < z.length; j++) { plochy += z[j]; pozice.push(i); }
  }
  let nalez = -1;
  for (const w of slova) {
    const k = plochy.indexOf(w);
    if (k >= 0 && (nalez < 0 || k < nalez)) nalez = k;
  }
  const stred = nalez >= 0 ? pozice[nalez] : 0;
  let od = Math.max(0, stred - Math.floor(max * 0.35));
  let do_ = Math.min(t.length, od + max);
  od = Math.max(0, do_ - max);
  if (od > 0) { const m = t.indexOf(' ', od); if (m >= 0 && m < stred) od = m + 1; }
  if (do_ < t.length) { const m = t.lastIndexOf(' ', do_); if (m > stred) do_ = m; }
  return `${od > 0 ? '…' : ''}${t.slice(od, do_)}${do_ < t.length ? '…' : ''}`;
}
