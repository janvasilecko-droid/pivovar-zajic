// 💬 AI sládek — chatbot Pivovarské bible v appce (etapa 5). Čisté funkce
// (testy: chat.test.ts); síť, databáze a volání Claude jsou v bible-chat/index.ts.
// ---------------------------------------------------------------------------
// Majitel 11. 11. 2026: „hlavně ať v aplikaci funguje vyhledávání a hledání
// komplexních odpovědí na problémy — má to být chatbot". Chatbot volá Claude
// přes API (R28; předplatné na dotazy uživatelů appky použít nejde, R14)
// se stejnými nástroji jako konektor (_shared/nastroje.ts). Stránky knih
// dostává jako bloky search_result s citacemi — každá citace v odpovědi tak
// ukazuje na stránku, kterou Claude opravdu četl, a appka ji otevře.
// Nic z toho nesmí do logu (text knih, otázky, odpovědi).
import { jeUuid } from './brana.ts';
import type { Nastroj } from './mcp.ts';
import { ChybaVstupu } from './vstupy.ts';

export const MAX_OTAZKA = 4000;
/** Nejvýš tolik volání Claude na jednu otázku (každé kolo nástrojů je jedno volání). */
export const MAX_KOL = 8;
/** Po této době už žádné další hledání — Claude odpoví z toho, co má. */
export const CAS_NA_NASTROJE_MS = 80_000;
/** Tvrdý konec odpovědi (platforma utne funkci po 150 s). */
export const CAS_KONEC_MS = 140_000;
export const MAX_TOKENU = 16_000;
/** Kolik předchozích zpráv konverzace jde Claudovi jako kontext. */
export const HISTORIE_ZPRAV = 12;
const HISTORIE_ZNAKU = 6_000;
/** Webové hledání: 10 USD za 1000 hledání (ceník Anthropicu). */
export const CENA_HLEDANI_USD = 0.01;
export const MAX_HLEDANI_WEB = 5;
/** Server-side fallback (beta): odmítne-li model dotaz, odpoví doporučený záložní model. */
export const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
export const VYCHOZI_MODEL = 'claude-opus-5-5';

export type PozadavekChatu = { otazka: string; konverzaceId: string | null; problemId: string | null; web: boolean };

/** Tělo požadavku appky → ověřený vstup (ChybaVstupu s českou zprávou). */
export function pozadavekChatu(telo: Record<string, unknown>): PozadavekChatu {
  const otazka = typeof telo.otazka === 'string' ? telo.otazka.trim() : '';
  if (otazka.length < 2) throw new ChybaVstupu('Napiš otázku (aspoň dva znaky).');
  if (otazka.length > MAX_OTAZKA) throw new ChybaVstupu(`Otázka je moc dlouhá (nejvýš ${MAX_OTAZKA} znaků).`);
  const id = (v: unknown, co: string): string | null => {
    if (v === undefined || v === null || v === '') return null;
    if (!jeUuid(v)) throw new ChybaVstupu(`Neplatné id ${co}.`);
    return v.toLowerCase();
  };
  return { otazka, konverzaceId: id(telo.konverzace_id, 'konverzace'), problemId: id(telo.problem_id, 'problému'), web: telo.web === true };
}

// --- Cena ---------------------------------------------------------------------

export type CenaModelu = { vstup: number; vystup: number; cache_cteni?: number; cache_zapis?: number };
export type Cenik = Record<string, CenaModelu>;
/** Model bez ceníku (záložní model po odmítnutí): raději víc než míň — ceny Opus 5. */
const CENA_NEZNAMEHO: CenaModelu = { vstup: 5, vystup: 25, cache_cteni: 0.5, cache_zapis: 6.25 };

type TokenyPokusu = {
  type?: string; model?: string | null;
  input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
};
export type SpotrebaApi = TokenyPokusu & {
  server_tool_use?: { web_search_requests?: number | null } | null;
  iterations?: readonly TokenyPokusu[] | null;
};

export type CenaVolani = {
  cena: number; vstup: number; vystup: number; cacheCteni: number; cacheZapis: number; hledani: number;
  /** Některý pokus běžel na modelu bez ceníku — cena je odhad. */
  odhad: boolean;
};

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Cena jednoho volání podle ceníku z bible_nastaveni (USD za 1 M tokenů).
 * Při odmítnutí a záložním modelu je zdrojem pravdy usage.iterations (každý
 * pokus zvlášť, záložní za svou cenu); jinak horní usage za model odpovědi.
 */
export function cenaVolani(usage: SpotrebaApi | null | undefined, modelOdpovedi: string, pozadovanyModel: string, cenik: Cenik): CenaVolani {
  const vysledek: CenaVolani = { cena: 0, vstup: 0, vystup: 0, cacheCteni: 0, cacheZapis: 0, hledani: 0, odhad: false };
  if (!usage) return vysledek;
  const pricti = (t: TokenyPokusu, model: string) => {
    const c = cenik[model] ?? (vysledek.odhad = true, CENA_NEZNAMEHO);
    const vstup = n(t.input_tokens); const vystup = n(t.output_tokens);
    const cteni = n(t.cache_read_input_tokens); const zapis = n(t.cache_creation_input_tokens);
    vysledek.vstup += vstup; vysledek.vystup += vystup; vysledek.cacheCteni += cteni; vysledek.cacheZapis += zapis;
    vysledek.cena += (vstup * n(c.vstup) + vystup * n(c.vystup)
      + cteni * (c.cache_cteni ?? n(c.vstup) * 0.1) + zapis * (c.cache_zapis ?? n(c.vstup) * 1.25)) / 1_000_000;
  };
  const pokusy = Array.isArray(usage.iterations) ? usage.iterations.filter((p) => p && typeof p === 'object') : [];
  if (pokusy.some((p) => p.type === 'fallback_message')) {
    for (const p of pokusy) pricti(p, p.type === 'fallback_message' ? (p.model ?? modelOdpovedi) : pozadovanyModel);
  } else {
    pricti(usage, modelOdpovedi);
  }
  vysledek.hledani = n(usage.server_tool_use?.web_search_requests);
  vysledek.cena += vysledek.hledani * CENA_HLEDANI_USD;
  return vysledek;
}

export function sectiCeny(a: CenaVolani, b: CenaVolani): CenaVolani {
  return {
    cena: a.cena + b.cena, vstup: a.vstup + b.vstup, vystup: a.vystup + b.vystup, cacheCteni: a.cacheCteni + b.cacheCteni,
    cacheZapis: a.cacheZapis + b.cacheZapis, hledani: a.hledani + b.hledani, odhad: a.odhad || b.odhad,
  };
}

export const NULOVA_CENA: CenaVolani = { cena: 0, vstup: 0, vystup: 0, cacheCteni: 0, cacheZapis: 0, hledani: 0, odhad: false };

// --- Nástroje -------------------------------------------------------------------

/**
 * Jen v konektoru (aplikace Claude, předplatné): ukládání webu, zakládání
 * problémů, zápis z provozu (várky, zkušenosti — R32) a dotaz z appky s
 * odpovědí zpátky do appky (R33). Chatbot v appce jen čte; zjištění zapisuje
 * jen v analýze problému.
 */
export const JEN_KONEKTOR: ReadonlySet<string> = new Set([
  'uloz_web_zdroj', 'zaloz_problem', 'zapis_varku', 'dopln_varku', 'zapis_zkusenost', 'dotaz_z_appky', 'uloz_odpoved',
]);

export type NastrojApi =
  | { name: string; description: string; input_schema: Record<string, unknown> }
  | { type: 'web_search_20260209'; name: 'web_search'; max_uses: number };

/** Nástroje pro Clauda v chatu — pevné pořadí (prompt cache), stejné popisy jako konektor. */
export function nastrojeChatu(nastroje: readonly Nastroj[], volby: { zapis: boolean; web: boolean }): NastrojApi[] {
  const vlastni: NastrojApi[] = nastroje
    .filter((t) => !JEN_KONEKTOR.has(t.name) && (t.name !== 'zapis_zjisteni' || volby.zapis))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  return volby.web ? [...vlastni, { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_HLEDANI_WEB }] : vlastni;
}

/** Krátký popis kroku pro appku („Hledám v knihách: …") — bez textu knih. */
export function popisKroku(nastroj: string, vstup: Record<string, unknown>): string {
  const t = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 80) : '');
  switch (nastroj) {
    case 'hledej_v_knihach': return `Hledám v knihách: „${t(vstup.dotaz)}"`;
    case 'precti_stranu': return `Čtu stránky knihy${typeof vstup.list === 'number' ? ` (list ${vstup.list})` : ''}`;
    case 'prehled_tematu': return t(vstup.tema) ? `Čtu přehled tématu „${t(vstup.tema)}"` : 'Procházím přehledy témat';
    case 'hledej_zkusenosti': return `Hledám ve zkušenostech sládků${t(vstup.dotaz) ? `: „${t(vstup.dotaz)}"` : ''}`;
    case 'vypocet': return t(vstup.id) ? `Počítám: ${t(vstup.id)}` : 'Zjišťuji, jaké výpočty jsou k dispozici';
    case 'profil_pivovaru': return 'Čtu profil pivovaru';
    case 'seznam_varek': return 'Procházím evidenci várek';
    case 'porovnej_varky': return 'Porovnávám várky';
    case 'web_zdroje': return 'Procházím uložené webové zdroje';
    case 'problemy': return t(vstup.problem_id) ? 'Čtu analýzu problému' : 'Procházím otevřené problémy';
    case 'zapis_zjisteni': return `Zapisuji k problému zjištění (${t(vstup.typ) || '?'})`;
    case 'seznam_knih': return 'Procházím seznam knih';
    case 'web_search': return 'Hledám na internetu';
    default: return nastroj;
  }
}

// --- Prompt ---------------------------------------------------------------------

/** Systémový prompt — beze změn mezi dotazy (prompt cache); proměnné věci jsou v kontextDotazu. */
export const SYSTEM_PROMPT = `Jsi AI sládek Pivovaru Zajíc — odborný pomocník v aplikaci pivovaru. Odpovídáš česky, věcně a přesně, jako zkušený sládek a technolog, který zná literaturu i provoz.

# Odkud bereš fakta
- Knihovna odborné literatury: hledej_v_knihach (1–3 klíčová slova; běžné odborné varianty v němčině a angličtině, např. mladina = Würze = wort, hledá samo, další synonyma zkus sám; ptá-li se na období, autora, jazyk nebo oblast, použij filtry rok_od, rok_do, autor, jazyk, oblast), precti_stranu (kontext kolem nálezu — přečti si ho, než něco tvrdíš), prehled_tematu (hotové přehledy témat a pracovní postupy), seznam_knih.
- hledej_zkusenosti — praxe sládků s úrovní důvěryhodnosti 1–5. Je to praxe, ne literatura.
- vypocet — všechna čísla (stupňovitost, hustota, alkohol, prokvašení, ředění, výtěžek, IBU, barva, CO₂, chlazení, voda, potrubí, CIP, energie, daň, náklady) počítej tímto nástrojem, nikdy zpaměti.
- profil_pivovaru — zařízení a provozní postupy tohoto pivovaru (provozní údaje se zdrojem, ne literatura).
- seznam_varek a porovnej_varky — várky z evidence; pracuj jen s uloženými hodnotami a vyjmenuj, co chybí.
- problemy — technologické problémy rozpracované v appce; web_zdroje — uložené webové zdroje.
- web_search (jen když je zapnutý) — internet. Web vždy zvlášť od knih, s datem a jako neověřený zdroj; nikdy nepřepíše literaturu.

# Pravidla
- Na odbornou otázku nejdřív hledej v knihách, i když odpověď znáš. Hledej postupně a cíleně (víc kratších dotazů je lepší než jeden dlouhý).
- Citace na stránky knih se k odpovědi připojí samy z výsledků hledání a přečtených stran. Nepiš vlastní čísla citací ani odkazy. Cituj jen to, co jsi ve výsledcích opravdu viděl; nevymýšlej knihy, strany ani hodnoty.
- Když knihovna k otázce nic nevrátí, napiš „V knihovně jsem k tomu nic nenašel" a co by pomohlo nahrát. Obecnou znalost pak smíš přidat, ale jasně označenou jako obecnou znalost, ne jako literaturu.
- U údajů z várek, profilu pivovaru, výpočtů a zkušeností řekni zdroj slovy (např. „podle evidence várek", „výpočet: varní výtěžek", „zkušenost sládka, úroveň 4").
- Odhad nikdy nevydávej za změřenou hodnotu, doporučení výrobce za obecné pravidlo a zkušenost jednoho sládka za pravidlo. Výsledek ze „staršího vydání" má v knihovně novější vydání — přednost má novější, rozdíl řekni.
- Chybí-li zásadní údaj (objem várky, stupňovitost, teploty, časy…), zeptej se na něj, nedomýšlej ho.
- Rozpory mezi zdroji výslovně uveď.
- U problému postupuj systematicky: příznaky → možné příčiny podle literatury → co ověřit v datech várek a v provozu → co změřit → doporučení. Hypotézy označ jako hypotézy.

# Odpověď
Nepiš nic před voláním nástrojů — nejdřív hledej, pak napiš celou odpověď. Markdown s těmito nadpisy (oddíl bez obsahu vynech):
## Krátká odpověď
## Co říká literatura
## Zkušenosti z praxe
## Výpočet
## Doporučení
## Rozpory a co chybí

Z textu musí být jasné, co je doložený fakt (s citací), výsledek výpočtu, provozní zkušenost, technologické doporučení (vlastní úvaha), hypotéza a neznámá hodnota. Piš stručně a srozumitelně pro sládka v provozu, čísla a jednotky opisuj přesně. Tabulky jen jednoduché (svislé čáry), vzorce v LaTeXu mezi $ a $.`;

/** Proměnná část zadání (datum, kdo se ptá, analýza problému) — druhý blok systémového promptu. */
export function kontextDotazu(k: { dnes: string; jmeno: string | null; zapis: boolean; problem: { id: string; nazev: string } | null; web: boolean }): string {
  return [
    `Dnes je ${k.dnes}.${k.jmeno ? ` Ptá se ${k.jmeno}.` : ''}`,
    k.web ? 'Hledání na internetu je zapnuté.' : 'Hledání na internetu je vypnuté — odpovídej z knihovny a dat appky.',
    k.problem
      ? `Konverzace je o technologickém problému „${k.problem.nazev}" (problem_id ${k.problem.id}). Nejdřív si ho načti nástrojem problemy a porovnej dotčené várky.${
        k.zapis
          ? ' Podstatná zjištění zapiš nástrojem zapis_zjisteni — každé jeden typ, fakt a výpočet se zdrojem, hypotézu jako hypotézu, chybějící údaj jako chybi; nezapisuj totéž dvakrát.'
          : ' Zjištění do problému nezapisuj (uživatel nemá právo zápisu), jen je uveď v odpovědi.'
      }`
      : '',
  ].filter(Boolean).join('\n');
}

// --- Historie konverzace ----------------------------------------------------------

export type ZdrojOdpovedi = {
  n: number;
  dokumentId: string | null;
  pdfIndex: number | null;
  nazev: string;
  tistena: string | null;
  kapitola: string | null;
  zdroj: 'original' | 'preklad' | 'web';
  url: string | null;
  citat: string;
};

export type UlozenaZprava = { role: string; text: string; citace?: unknown };

const radekZdroje = (z: ZdrojOdpovedi) => z.zdroj === 'web'
  ? `[${z.n}] web: ${z.nazev}${z.url ? ` (${z.url})` : ''}`
  : `[${z.n}] ${z.nazev}${z.tistena ? `, s. ${z.tistena}` : ''}${z.dokumentId ? ` (kniha_id=${z.dokumentId} list=${z.pdfIndex})` : ''}`;

/**
 * Předchozí zprávy konverzace → zprávy pro Claude (jen text, posledních pár).
 * K odpovědi se připojí seznam zdrojů, ať navazující otázka („co přesně píše
 * ta druhá kniha?") ví, kde hledat. Začíná uživatelem, role se střídají.
 */
export function historieProApi(zpravy: readonly UlozenaZprava[]): { role: 'user' | 'assistant'; content: string }[] {
  const vysledek: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const z of zpravy.slice(-HISTORIE_ZPRAV)) {
    const role = z.role === 'asistent' ? 'assistant' : z.role === 'uzivatel' ? 'user' : null;
    if (!role || typeof z.text !== 'string' || !z.text.trim()) continue;
    let text = z.text.length > HISTORIE_ZNAKU ? `${z.text.slice(0, HISTORIE_ZNAKU)}\n[… zkráceno]` : z.text;
    if (role === 'assistant' && Array.isArray(z.citace) && z.citace.length > 0) {
      text += `\n\nZdroje:\n${(z.citace as ZdrojOdpovedi[]).filter((c) => c && typeof c.n === 'number').slice(0, 30).map(radekZdroje).join('\n')}`;
    }
    const posledni = vysledek[vysledek.length - 1];
    if (posledni && posledni.role === role) posledni.content += `\n\n${text}`;
    else vysledek.push({ role, content: text });
  }
  while (vysledek.length > 0 && vysledek[0].role !== 'user') vysledek.shift();
  return vysledek;
}

// --- Citace ----------------------------------------------------------------------

/** Stránka knihy, kterou chatbot dostal jako search_result (zdroj = odkaz do čtečky). */
export type ZdrojKnihy = {
  source: string; dokumentId: string; list: number; nazev: string;
  tistena: string | null; kapitola: string | null; zdroj: 'original' | 'preklad';
};

type BlokOdpovedi = { type?: unknown; text?: unknown; citations?: unknown };
type CitaceApi = { type?: unknown; source?: unknown; url?: unknown; title?: unknown; cited_text?: unknown };

const ODKAZ_KNIHY = /[?&]sub=kniha:([0-9a-f-]{36}):(\d+)/i;

/** Odkaz do čtečky v appce → kniha a list (null u cizí adresy). */
export function knihaZOdkazu(odkaz: string): { dokumentId: string; list: number } | null {
  const m = ODKAZ_KNIHY.exec(odkaz);
  return m && jeUuid(m[1]) ? { dokumentId: m[1].toLowerCase(), list: Number(m[2]) } : null;
}

const MAX_CITAT = 300;

/**
 * Textové bloky odpovědi → markdown s čísly citací [n] za citovaným úsekem
 * a seznam zdrojů (kniha a list, nebo webová adresa). Vlastní „[n]" v textu
 * Clauda se změní na „(n)", ať se neplete s citacemi.
 */
export function textSCitacemi(bloky: readonly unknown[], knihy: ReadonlyMap<string, ZdrojKnihy>): { text: string; zdroje: ZdrojOdpovedi[] } {
  const zdroje: ZdrojOdpovedi[] = [];
  const cisla = new Map<string, number>();
  let text = '';
  for (const b of bloky as BlokOdpovedi[]) {
    if (!b || b.type !== 'text' || typeof b.text !== 'string') continue;
    const kus = b.text.replace(/\[(\d{1,3})\]/g, '($1)');
    const znacky: number[] = [];
    for (const c of Array.isArray(b.citations) ? (b.citations as CitaceApi[]) : []) {
      const citat = typeof c?.cited_text === 'string' ? c.cited_text.replace(/\s+/g, ' ').trim().slice(0, MAX_CITAT) : '';
      let klic: string | null = null;
      let novy: Omit<ZdrojOdpovedi, 'n'> | null = null;
      if (c?.type === 'search_result_location' && typeof c.source === 'string') {
        klic = c.source;
        const k = knihy.get(c.source);
        const z = k ?? knihaZOdkazu(c.source);
        if (z) {
          novy = {
            dokumentId: k?.dokumentId ?? z.dokumentId, pdfIndex: k?.list ?? z.list,
            nazev: k?.nazev ?? (typeof c.title === 'string' && c.title ? c.title : 'Kniha'),
            tistena: k?.tistena ?? null, kapitola: k?.kapitola ?? null, zdroj: k?.zdroj ?? 'original', url: null, citat,
          };
        }
      } else if (c?.type === 'web_search_result_location' && typeof c.url === 'string' && /^https?:\/\//.test(c.url)) {
        klic = c.url;
        novy = {
          dokumentId: null, pdfIndex: null, nazev: typeof c.title === 'string' && c.title ? c.title : c.url,
          tistena: null, kapitola: null, zdroj: 'web', url: c.url, citat,
        };
      }
      if (!klic || !novy) continue;
      let cislo = cisla.get(klic);
      if (cislo === undefined) {
        cislo = zdroje.length + 1;
        cisla.set(klic, cislo);
        zdroje.push({ n: cislo, ...novy });
      }
      if (!znacky.includes(cislo)) znacky.push(cislo);
    }
    if (znacky.length === 0) { text += kus; continue; }
    const konec = /\s*$/.exec(kus)?.index ?? kus.length;
    text += `${kus.slice(0, konec)}${znacky.map((c) => `[${c}]`).join('')}${kus.slice(konec)}`;
  }
  return { text: text.trim(), zdroje };
}

// --- Záložní model (server-side fallback) -------------------------------------------

type Blok = { type?: unknown; id?: unknown; tool_use_id?: unknown };

/**
 * Obsah odpovědi k poslání zpět v dalším kole. Po přepnutí na záložní model
 * uprostřed odpovědi se před posledním blokem „fallback" vynechá thinking,
 * tool_use a nespárované server_tool_use (pravidla API); blok fallback zůstává.
 */
export function obsahKOdeslani<T>(obsah: readonly T[]): T[] {
  const bloky = obsah as unknown as Blok[];
  let hranice = -1;
  bloky.forEach((b, i) => { if (b?.type === 'fallback') hranice = i; });
  if (hranice < 0) return [...obsah];
  const sVysledkem = new Set(bloky.filter((b) => typeof b?.tool_use_id === 'string' && b.type !== 'tool_result').map((b) => b.tool_use_id));
  return obsah.filter((_, i) => {
    if (i >= hranice) return true;
    const b = bloky[i];
    if (b?.type === 'thinking' || b?.type === 'redacted_thinking' || b?.type === 'tool_use') return false;
    if (b?.type === 'server_tool_use') return sVysledkem.has(b.id);
    return b?.type === 'text' || (typeof b?.tool_use_id === 'string');
  });
}

/** Volání vlastních nástrojů k provedení (po přepnutí modelu jen ta za hranicí). */
export function nastrojeKProvedeni<T>(obsah: readonly T[]): T[] {
  const odeslat = obsahKOdeslani(obsah);
  return odeslat.filter((b) => (b as unknown as Blok)?.type === 'tool_use');
}

// --- Chyby API --------------------------------------------------------------------

const ODKAZ_KLICE = 'https://platform.claude.com/settings/keys';
const ODKAZ_KREDITU = 'https://platform.claude.com/settings/billing';
const ODKAZ_TABULKY = 'https://supabase.com/dashboard/project/sasqexjadvlqyticxwja/editor';
const ODKAZ_NASAZENI = 'https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/deploy.yml';

/** Chyba volání Claude API → kód a česká hláška s odkazem, kde to opravit. */
export function chybaApi(status: number | undefined, typ: string | null | undefined): { kod: string; zprava: string } {
  if (status === 401 || typ === 'authentication_error') {
    return {
      kod: 'klic_neplati',
      zprava: `Klíč k Claude API neplatí nebo byl zrušen. Nový klíč: ${ODKAZ_KLICE} — ulož ho v hlavní databázi do tabulky app_secrets (řádek ANTHROPIC_API_KEY): ${ODKAZ_TABULKY} a spusť nasazení: ${ODKAZ_NASAZENI} (Run workflow).`,
    };
  }
  if (status === 402 || typ === 'billing_error') {
    return { kod: 'kredit', zprava: `Na účtu Claude API došel kredit nebo je problém s platbou. Dobít: ${ODKAZ_KREDITU}` };
  }
  if (status === 403 || typ === 'permission_error') return { kod: 'api_pristup', zprava: 'Klíč k Claude API nemá přístup k tomuto modelu nebo funkci.' };
  if (status === 404 || typ === 'not_found_error') return { kod: 'model', zprava: 'Model z nastavení bible (model_odpovedi) není dostupný.' };
  if (status === 413 || typ === 'request_too_large') return { kod: 'velke', zprava: 'Konverzace je na Clauda moc dlouhá — začni novou.' };
  if (status === 429 || typ === 'rate_limit_error') return { kod: 'limit', zprava: 'Claude API má teď moc dotazů (limit účtu). Zkus to za minutu.' };
  if (status === 529 || typ === 'overloaded_error' || (status !== undefined && status >= 500)) {
    return { kod: 'pretizeno', zprava: 'Claude je teď přetížený nebo nedostupný. Zkus to za chvíli.' };
  }
  if (status === undefined) return { kod: 'spojeni', zprava: 'Nepodařilo se spojit s Claude API. Zkus to znovu.' };
  return { kod: 'chyba_api', zprava: 'Claude požadavek odmítl. Zkus to znovu; když se to opakuje, dej vědět správci.' };
}

/** Název konverzace ze začátku první otázky. */
export function nazevKonverzace(otazka: string): string {
  const t = otazka.replace(/\s+/g, ' ').trim();
  return t.length <= 80 ? t : `${t.slice(0, 79).replace(/\s+\S*$/, '')}…`;
}

/** Datum pro prompt (Praha), např. „středa 11. 11. 2026". */
export function dnesPraha(ted = new Date()): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).format(ted);
}
