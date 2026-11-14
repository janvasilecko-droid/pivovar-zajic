// 🔌 Konektor Pivovarské bible do aplikace Claude — čisté funkce (testy: mcp.test.ts).
// ---------------------------------------------------------------------------
// Vzdálený MCP server (Streamable HTTP, JSON odpovědi) s OAuth 2.1 + PKCE.
// Majitel 3. 11. 2026 zvolil „obě" (přehledy + konektor), R16 v
// docs/pivovarska-bible/ROZHODNUTI.md. Bez sítě a bez Dena — síť, databáze
// a nástroje jsou v bible-mcp/index.ts.
import { HODNOTY_VARKY } from './varky-popisy.ts';
import { TYPY_ZKUSENOSTI } from './vstupy.ts';

/** Adresa appky (čtečka knih, schválení připojení, metadata OAuth). */
export const APP_URL = 'https://zajic-pivovar.pages.dev';
/** Vydavatel OAuth = appka (metadata v public/.well-known/oauth-authorization-server). */
export const ISSUER = APP_URL;
/** Kam smí Claude nechat poslat kód (podle dokumentace konektorů Claude). */
export const POVOLENE_NAVRATY: readonly string[] = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];
export const PODPOROVANE_VERZE = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const MAX_ZNAKU_VYSLEDKU = 140_000;

const b64url = (bajty: Uint8Array): string => {
  let s = '';
  for (const b of bajty) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function nahodnyToken(bajtu = 32): string {
  const b = new Uint8Array(bajtu);
  crypto.getRandomValues(b);
  return b64url(b);
}

export async function sha256hex(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** PKCE S256: base64url(sha256(code_verifier)). */
export async function s256(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** code_verifier podle RFC 7636: 43–128 znaků [A-Za-z0-9-._~]. */
export const platnyVerifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
export const platnaChallenge = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
export const platnyClient = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

/** Registrace klienta (RFC 7591): jen adresy návratu Claude. */
export function registrace(telo: unknown): { ok: true; nazev: string; navraty: string[] } | { ok: false; chyba: string } {
  const t = (telo ?? {}) as Record<string, unknown>;
  const navraty = Array.isArray(t.redirect_uris) ? t.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (navraty.length === 0 || navraty.length > 5) return { ok: false, chyba: 'redirect_uris chybí' };
  if (!navraty.every((u) => POVOLENE_NAVRATY.includes(u))) return { ok: false, chyba: 'Tenhle server přijímá jen aplikaci Claude.' };
  const nazev = typeof t.client_name === 'string' && t.client_name.trim() ? t.client_name.trim().slice(0, 100) : 'Claude';
  return { ok: true, nazev, navraty };
}

/** Metadata chráněného zdroje (RFC 9728) pro tuhle adresu MCP serveru. */
export function metadataZdroje(zaklad: string) {
  return {
    resource: zaklad,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ['header'],
    resource_name: 'Pivovarská bible — Pivovar Zajíc',
  };
}

export const wwwAuthenticate = (zaklad: string) => `Bearer resource_metadata="${zaklad}/.well-known/oauth-protected-resource"`;

/** Odkaz do čtečky v appce (otevře knihu na listu). */
export const odkazNaList = (dokumentId: string, list: number) => `${APP_URL}/?page=bible&sub=kniha:${dokumentId}:${list}`;

// --- JSON-RPC ---------------------------------------------------------------------

/**
 * Popisky nástroje podle MCP (ToolAnnotations): aplikace Claude podle nich
 * odliší nástroje, které jen čtou (smí běžet bez ptaní), od těch, které
 * zapisují (u nich se může ptát na schválení).
 */
export type PopiskyNastroje = { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean };

export type Nastroj = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: PopiskyNastroje;
};

/** Jen čte knihovnu a data appky (nic mimo bibli). */
const CTE: PopiskyNastroje = { readOnlyHint: true, openWorldHint: false };
/** Přidá nový záznam, nic nepřepíše. */
const PRIDAVA: PopiskyNastroje = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
/** Doplní záznam; uloženou hodnotu přepíše jen na výslovnou opravu. Stejné volání podruhé nic nezmění. */
const UPRAVUJE: PopiskyNastroje = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

/** Hodnoty várky pro Clauda: klíč → číslo s jednotkou a rozsahem (katalog HODNOTY_VARKY, stejný jako formulář appky a SQL). */
const SCHEMA_HODNOT: Record<string, unknown> = {
  type: 'object',
  description: 'Změřené hodnoty {klíč: číslo} — jen ty, které sládek řekl, v jednotce z popisu klíče (objemy sladiny a mladiny v hl, horké; '
    + 'extrakty v °P; pH bez jednotky). Nic nepřepočítávej a nedoplňuj.',
  properties: Object.fromEntries(HODNOTY_VARKY.map((h) => [h.klic, {
    type: h.cele ? 'integer' : 'number',
    minimum: h.min,
    maximum: h.max,
    description: `${h.nazev}${h.jednotka ? ` [${h.jednotka}]` : ''}`,
  }])),
  additionalProperties: false,
};

const POTVRZENI = 'PŘED ULOŽENÍM sládkovi shrň, co zapíšeš, a ulož až po jeho potvrzení. Nic nedomýšlej, nepřepočítávej a nezaokrouhluj; co neřekl, nezapisuj.';

export const NASTROJE: readonly Nastroj[] = [
  {
    name: 'hledej_v_knihach',
    title: 'Hledat v knihách',
    description: 'Fulltextové hledání v odborných pivovarských knihách majitele (text knih i jejich český překlad). '
      + 'Hledají se začátky slov i odborné varianty v češtině, němčině a angličtině (mladina = Würze = wort, rmutování = Maischen = mashing): '
      + 'nejdřív stránky se všemi slovy, když žádné nejsou, stránky s nejvíc slovy dotazu. Nejlíp 1–3 klíčová slova. '
      + 'Volitelné filtry: autor, rok_od a rok_do (rok vydání), jazyk knihy, druh dokumentu, oblast A–T. Vrací úryvky s knihou, stranou a odkazem.',
    inputSchema: {
      type: 'object',
      properties: {
        dotaz: { type: 'string', description: '1–3 klíčová slova' },
        kniha_id: { type: 'string', description: 'Volitelně jen v jedné knize (id ze seznam_knih)' },
        autor: { type: 'string', description: 'Část jména autora (nepovinné)' },
        rok_od: { type: 'integer', minimum: 1400, maximum: 2100, description: 'Rok vydání od (nepovinné)' },
        rok_do: { type: 'integer', minimum: 1400, maximum: 2100, description: 'Rok vydání do (nepovinné)' },
        jazyk: { type: 'string', enum: ['cs', 'de', 'en', 'sk', 'jiny'], description: 'Jazyk knihy (nepovinné)' },
        druh: { type: 'string', enum: ['kniha', 'skripta', 'clanek', 'norma', 'prirucka', 'poznamky', 'tabulky', 'jiny'], description: 'Druh dokumentu (nepovinné)' },
        oblast: { type: 'string', description: 'Oblast A–T (nepovinné)' },
      },
      required: ['dotaz'],
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'precti_stranu',
    title: 'Přečíst stránky knihy',
    description: 'Celý text 1–3 listů knihy od zadaného listu: český překlad (je-li) i originál, s odkazem na stránku. '
      + 'Použij pro kontext kolem úryvku z hledání (list = číslo listu z výsledku).',
    inputSchema: {
      type: 'object',
      properties: {
        kniha_id: { type: 'string' },
        list: { type: 'integer', minimum: 1 },
        pocet: { type: 'integer', minimum: 1, maximum: 3 },
      },
      required: ['kniha_id', 'list'],
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'prehled_tematu',
    title: 'Přehled tématu',
    description: 'Hotové přehledy hlavních témat (chmelovar, rmutování, kvašení…) napsané z porovnání všech knih, s citacemi a odkazy, '
      + 'a pracovní postupy krok za krokem (klíče postup_…, např. „postup_chmelovar"). Bez tématu vrátí seznam dostupných přehledů a postupů.',
    inputSchema: {
      type: 'object',
      properties: { tema: { type: 'string', description: 'Název nebo klíč tématu, např. „chmelovar"' } },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'hledej_zkusenosti',
    title: 'Zkušenosti sládků',
    description: 'Praktické zkušenosti sládků zapsané v appce (řešení problémů, provozní postupy, rozhovory) s úrovní důvěryhodnosti: '
      + '1 ověřená odborná publikace, 2 výrobní dokumentace, 3 opakovaně ověřená provozní zkušenost, 4 zkušenost jednoho sládka, '
      + '5 neověřená informace. Je to praxe, ne literatura — v odpovědi ji odděl a řekni úroveň. Filtr dotaz a oblast (A–T).',
    inputSchema: {
      type: 'object',
      properties: {
        dotaz: { type: 'string', description: 'Slova k hledání (nepovinné)' },
        oblast: { type: 'string', description: 'Oblast A–T (nepovinné)' },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'vypocet',
    title: 'Výpočet (ověřené vzorce)',
    description: 'Pivovarské výpočty výpočetním modulem bible: stupňovitost ↔ hustota, alkohol a prokvašení (Balling), ředění, '
      + 'varní výtěžek, teplota vody pro vystírku, hořkost IBU (Tinseth), barva (Morey), obsah CO₂ a přetlak pro sycení, '
      + 'chlazení mladiny a plocha výměníku, zbytková alkalita vody a kyselina na její snížení, vyslazovací voda, odpar při chmelovaru, '
      + 'dávka kvasnic, cukr na dokvašení v lahvi, tlaková ztráta potrubí a příkon čerpadla, CIP roztok z koncentrátu, '
      + 'energie na ohřev a var, spotřební daň z piva a náklady várky. '
      + 'Bez id vrátí seznam výpočtů a jejich vstupy. Čísla ber z výsledku, nepočítej je sám.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id výpočtu ze seznamu (např. „alkohol")' },
        vstupy: { type: 'object', description: 'Vstupy {id_vstupu: číslo} podle seznamu', additionalProperties: { type: 'number' } },
        radky: { type: 'array', description: 'Řádky u výpočtů se seznamem (chmelové dávky, slady)', items: { type: 'object', additionalProperties: { type: 'number' } } },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'profil_pivovaru',
    title: 'Profil pivovaru (parametry provozu)',
    description: 'Zařízení a provozní postupy konkrétního pivovaru zapsané v appce (varna, nádoby, tanky, čerpadla, potrubí, výměníky, chlazení…) '
      + 's parametry a jejich zdrojem (štítek, dokumentace, změřeno, odhad). Bez pivovar_id vrátí hlavní pivovar. '
      + 'Jsou to údaje provozu, ne literatura — v odpovědi je odděl.',
    inputSchema: {
      type: 'object',
      properties: { pivovar_id: { type: 'string', description: 'Id jiného pivovaru ze seznamu ve výsledku (nepovinné)' } },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'seznam_varek',
    title: 'Seznam várek',
    description: 'Várky z evidence v appce (nejnovější první) s krátkým přehledem hodnot a seznam receptur s id. '
      + 'Filtry: pivo (část názvu), receptura_id, od a do (RRRR-MM-DD), limit (nejvýš 100). Id várek použij v porovnej_varky.',
    inputSchema: {
      type: 'object',
      properties: {
        pivo: { type: 'string', description: 'Část názvu piva (nepovinné)' },
        receptura_id: { type: 'string', description: 'Id receptury ze seznamu (nepovinné)' },
        od: { type: 'string', description: 'Datum varu od, RRRR-MM-DD (nepovinné)' },
        do: { type: 'string', description: 'Datum varu do, RRRR-MM-DD (nepovinné)' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Kolik várek vypsat (výchozí 30)' },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'porovnej_varky',
    title: 'Porovnání várek',
    description: 'Porovná várky z evidence: hodnoty (sypání, objemy, extrakty, pH, kvašení, ležení, laboratoř) s cíli receptury a odchylkami, '
      + 'odvozené hodnoty (varní výtěžek, odpar, prokvašení, alkohol) spočítané výpočetním modulem a seznam toho, co chybí. '
      + 'Buď varka_ids (2–12 id ze seznam_varek), nebo posledni (2–12, výchozí 5) s filtrem pivo, receptura_id, od, do.',
    inputSchema: {
      type: 'object',
      properties: {
        varka_ids: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 12, description: 'Id várek ze seznam_varek' },
        posledni: { type: 'integer', minimum: 2, maximum: 12, description: 'Kolik posledních várek porovnat (výchozí 5)' },
        pivo: { type: 'string', description: 'Část názvu piva (nepovinné)' },
        receptura_id: { type: 'string', description: 'Id receptury (nepovinné)' },
        od: { type: 'string', description: 'Datum varu od, RRRR-MM-DD (nepovinné)' },
        do: { type: 'string', description: 'Datum varu do, RRRR-MM-DD (nepovinné)' },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'web_zdroje',
    title: 'Webové zdroje (rešerše)',
    description: 'Zdroje z internetu uložené v bibli — odděleně od knih: adresa, titulek, datum publikace a zjištění, důvěra 1–5 a stav '
      + '(neověřeno, ověřeno). Filtr dotaz a oblast (A–T); zamítnuté jen s vcetne_zamitnutych.',
    inputSchema: {
      type: 'object',
      properties: {
        dotaz: { type: 'string', description: 'Slova k hledání (nepovinné)' },
        oblast: { type: 'string', description: 'Oblast A–T (nepovinné)' },
        vcetne_zamitnutych: { type: 'boolean', description: 'Ukázat i zamítnuté zdroje' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Kolik zdrojů vypsat (výchozí 20)' },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'uloz_web_zdroj',
    title: 'Uložit webový zdroj',
    description: 'Uloží do bible zdroj nalezený na internetu — vždy jako NEOVĚŘENÝ (ověří ho správce v appce). Shrnutí piš vlastními slovy '
      + '(žádné dlouhé citace), datum publikace uveď, je-li známé, a důvěru 1–5: 1 odborná instituce nebo recenzovaný článek, 2 norma nebo '
      + 'dokumentace výrobce, 3 odborný časopis nebo článek, 4 blog, diskuse nebo zkušenost jednoho autora, 5 neověřený zdroj. Stejná adresa se podruhé neuloží.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Adresa stránky (https://…)' },
        titulek: { type: 'string', description: 'Titulek stránky nebo článku' },
        shrnuti: { type: 'string', description: 'Co zdroj říká, vlastními slovy (nejvýš 4000 znaků)' },
        vydavatel: { type: 'string', description: 'Web, instituce nebo autor (nepovinné)' },
        datum_publikace: { type: 'string', description: 'RRRR-MM-DD (nepovinné)' },
        oblasti: { type: 'array', items: { type: 'string' }, description: 'Oblasti A–T (nepovinné)' },
        duvera: { type: 'integer', minimum: 1, maximum: 5, description: 'Důvěra 1–5' },
      },
      required: ['url', 'titulek', 'shrnuti', 'duvera'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'problemy',
    title: 'Analýza problémů',
    description: 'Technologické problémy (oblast T) zapsané v appce. Bez problem_id seznam otevřených (vse=true i uzavřené); s problem_id detail: '
      + 'příznaky, zjištění podle typu (fakt, výpočet, zkušenost, doporučení, hypotéza, chybí) a porovnání dotčených várek.',
    inputSchema: {
      type: 'object',
      properties: {
        problem_id: { type: 'string', description: 'Id problému ze seznamu (nepovinné)' },
        vse: { type: 'boolean', description: 'I vyřešené a odložené problémy' },
      },
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'zaloz_problem',
    title: 'Založit problém',
    description: 'Založí v bibli nový technologický problém: název, příznaky, pivo, dotčené várky (varka_ids ze seznam_varek) a oblasti A–T.',
    inputSchema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Krátký název problému' },
        popis: { type: 'string', description: 'Příznaky: co se děje, od kdy, jak se to projevuje' },
        pivo: { type: 'string', description: 'Pivo (nepovinné)' },
        varka_ids: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'Dotčené várky (nepovinné)' },
        oblasti: { type: 'array', items: { type: 'string' }, description: 'Oblasti A–T (nepovinné; řešení problémů je T)' },
      },
      required: ['nazev'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'zapis_zjisteni',
    title: 'Zapsat zjištění k problému',
    description: 'Zapíše k problému jedno zjištění jednoho typu: fakt (povinně se zdrojem — kniha a strana, várka, měření), vypocet (povinně '
      + 'se zdrojem — který výpočet), zkusenost, doporuceni, hypoteza (nepotvrzený předpoklad; potvrdí nebo vyvrátí ho člověk v appce) nebo chybi (údaj, který chybí).',
    inputSchema: {
      type: 'object',
      properties: {
        problem_id: { type: 'string', description: 'Id problému' },
        typ: { type: 'string', enum: ['fakt', 'vypocet', 'zkusenost', 'doporuceni', 'hypoteza', 'chybi'] },
        text: { type: 'string', description: 'Zjištění jednou až dvěma větami' },
        zdroj: { type: 'string', description: 'Zdroj (u faktu a výpočtu povinný)' },
      },
      required: ['problem_id', 'typ', 'text'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'zapis_varku',
    title: 'Zapsat várku',
    description: 'Zapíše do evidence novou várku — třeba když ji sládek diktuje hlasem („Zapiš várku Desítky z dneška: sypání 450 kg, '
      + `pH rmutu 5,6, mladina 11,8 °P"). ${POTVRZENI} Shrnutí: pivo, datum varu, číslo várky a každá hodnota s jednotkou. `
      + 'Rozsahy hodnot hlídá nástroj i databáze. Recepturu (receptura_id) ber jen ze seznam_varek, pivovar (pivovar_id) jen z profil_pivovaru; '
      + 'bez pivovar_id se várka přiřadí k pivovaru jako ve formuláři appky (jen když je v bibli jediný). Stejné pivo téhož dne podruhé neuloží — '
      + 'další várku téhož dne pošli s dalsi_varka_tehoz_dne=true, až ji sládek potvrdí. Hodnoty k už zapsané várce přidá dopln_varku.',
    inputSchema: {
      type: 'object',
      properties: {
        pivo: { type: 'string', description: 'Název piva, např. „Desítka"' },
        datum_varu: { type: 'string', description: 'Datum varu RRRR-MM-DD' },
        cislo: { type: 'string', description: 'Číslo várky, jak se píše v provozu (nepovinné)' },
        receptura_id: { type: 'string', description: 'Id receptury ze seznam_varek (nepovinné)' },
        pivovar_id: { type: 'string', description: 'Id pivovaru z profil_pivovaru (nepovinné)' },
        hodnoty: SCHEMA_HODNOT,
        poznamka: { type: 'string', description: 'Průběh a odchylky od receptury slovy sládka (nepovinné)' },
        dalsi_varka_tehoz_dne: { type: 'boolean', description: 'Jen když sládek potvrdil další várku stejného piva téhož dne' },
      },
      required: ['pivo', 'datum_varu'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'dopln_varku',
    title: 'Doplnit várku',
    description: 'Doplní k várce z evidence další hodnoty (kvašení, ležení, laboratoř…) nebo poznámku. Várku najdi přes seznam_varek (varka_id) '
      + `a v shrnutí ji jmenuj (pivo, číslo, datum varu). ${POTVRZENI} Hodnotu, kterou už várka má jinou, nepřepíše: vrátí rozdíly a nic neuloží. `
      + 'opravit=true pošli, jen když sládek opravu výslovně potvrdil. Poznámka se připíše k dosavadní s dnešním datem.',
    inputSchema: {
      type: 'object',
      properties: {
        varka_id: { type: 'string', description: 'Id várky ze seznam_varek' },
        hodnoty: SCHEMA_HODNOT,
        poznamka: { type: 'string', description: 'Co připsat k poznámce várky (nepovinné)' },
        opravit: { type: 'boolean', description: 'Přepsat už uložené hodnoty — jen na výslovnou opravu sládka' },
      },
      required: ['varka_id'],
      additionalProperties: false,
    },
    annotations: UPRAVUJE,
  },
  {
    name: 'zapis_zkusenost',
    title: 'Zapsat zkušenost sládka',
    description: 'Zapíše do bible praktickou zkušenost sládka (řešení problému, provozní postup, rozhovor…). '
      + `${POTVRZENI} Shrnutí: název, text, druh a úroveň. Text piš slovy sládka, nic nepřidávej z knih ani z vlastní znalosti. `
      + 'Úroveň důvěryhodnosti: 4 zkušenost jednoho sládka (výchozí), 5 neověřená informace; 1–3 (ověřené zdroje) smí nastavit jen správce. '
      + 'Stejnou zkušenost (stejný název i text) podruhé neuloží.',
    inputSchema: {
      type: 'object',
      properties: {
        nazev: { type: 'string', description: 'Krátký název (nejvýš 200 znaků)' },
        text: { type: 'string', description: 'Zkušenost slovy sládka (nejvýš 8000 znaků)' },
        typ: {
          type: 'string', enum: [...TYPY_ZKUSENOSTI],
          description: 'Druh: provozni_zkusenost (výchozí), reseni_problemu, postup, pripadova_studie, rozhovor, diskuse, doporuceni_vyrobce',
        },
        oblasti: { type: 'array', items: { type: 'string' }, description: 'Oblasti A–T (nepovinné; řešení problémů je T)' },
        uroven: { type: 'integer', minimum: 1, maximum: 5, description: 'Úroveň důvěryhodnosti 1–5 (výchozí 4)' },
        zdroj: { type: 'string', description: 'Kdo, kde, kdy — např. „sládek Honza, várka 112" (nepovinné)' },
      },
      required: ['nazev', 'text'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'dotaz_z_appky',
    title: 'Dotaz z appky',
    description: 'Otázka, kterou uživatel položil v appce pivovaru a poslal sem k zodpovězení (dotaz_id je v zadání): text otázky, '
      + 'konverzace, předchozí zprávy a případně problém z Analýzy problémů. Odpověď pak ulož nástrojem uloz_odpoved, ať ji uživatel vidí v appce.',
    inputSchema: {
      type: 'object',
      properties: { dotaz_id: { type: 'string', description: 'dotaz_id ze zadání' } },
      required: ['dotaz_id'],
      additionalProperties: false,
    },
    annotations: CTE,
  },
  {
    name: 'uloz_odpoved',
    title: 'Uložit odpověď do appky',
    description: 'Uloží tvou hotovou odpověď na dotaz z appky pivovaru (dotaz_id ze zadání) do konverzace AI sládka — uživatel ji uvidí v appce '
      + 'i v historii. Pošli celou odpověď v Markdownu tak, jak jsi ji napsal (nadpisy, odrážky, tabulky). Odkazy na stránky knih nech přesně tak, '
      + `jak byly ve výsledcích nástrojů (${APP_URL}/?page=bible&sub=kniha:…), a webové adresy jako odkazy — appka z nich udělá klikací citace [n]; `
      + 'vlastní čísla citací v hranatých závorkách nepiš. Na jeden dotaz jde uložit jen jedna odpověď.',
    inputSchema: {
      type: 'object',
      properties: {
        dotaz_id: { type: 'string', description: 'dotaz_id ze zadání' },
        odpoved: { type: 'string', description: 'Celá odpověď v Markdownu (nejvýš 60 000 znaků)' },
      },
      required: ['dotaz_id', 'odpoved'],
      additionalProperties: false,
    },
    annotations: PRIDAVA,
  },
  {
    name: 'seznam_knih',
    title: 'Seznam knih',
    description: 'Knihy v knihovně: název, autor, rok, jazyk, stav zpracování a id pro další nástroje.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: CTE,
  },
];

export const INSTRUKCE = 'Knihovna odborné pivovarské literatury Pivovaru Zajíc. Odpovídej česky. Fakta ber z nástrojů '
  + '(hledej_v_knihach, precti_stranu, prehled_tematu) a u každého tvrzení uveď odkaz na knihu a stránku přesně tak, jak je ve výsledku. '
  + 'Hledání samo zkouší odborné varianty v němčině a angličtině a umí filtry (rok vydání, autor, jazyk, druh, oblast). '
  + 'Čísla a jednotky opisuj přesně. Když knihy něco neříkají, řekni to; vlastní obecnou znalost jasně odliš od toho, co je v knihách. '
  + 'Praxi sládků (hledej_zkusenosti) uváděj zvlášť s úrovní důvěryhodnosti, nikdy jako obecné pravidlo. '
  + 'Výsledek označený „starší vydání" má v knihovně novější vydání: přednost má novější (hodnoty se mohly změnit), rozdíl řekni. '
  + 'Čísla z výpočtů (stupňovitost, alkohol, ředění, výtěžek, IBU, barva, CO₂, chlazení, voda, potrubí, CIP, energie, daň, náklady…) '
  + 'počítej nástrojem vypocet, ne zpaměti. Parametry konkrétního provozu (objemy nádob, výkony, čerpadla, postupy) ber z profil_pivovaru, '
  + 'vždy je odliš od obecných znalostí z knih a u čísla řekni zdroj; co v profilu chybí, nedomýšlej. '
  + 'Várky porovnávej nástrojem porovnej_varky: pracuj jen s uloženými údaji, co chybí, vyjmenuj, a příčiny odchylek uváděj jako hypotézy s oporou v knihách. '
  + 'Internet: užitečný nalezený zdroj ulož nástrojem uloz_web_zdroj (shrnutí vlastními slovy, datum, důvěra); uložené vrací web_zdroje. '
  + 'Web v odpovědi vždy zvlášť od knih, s datem a stavem (neověřený tak označ), a nikdy nepřepíše literaturu. '
  + 'Problémy (oblast T): problemy, zaloz_problem a zapis_zjisteni — každé zjištění jeden typ, fakt a výpočet se zdrojem, hypotézu nevydávej za fakt. '
  + 'Zápis z provozu, často hlasem (zapis_varku, dopln_varku, zapis_zkusenost): před uložením vždy shrň, co zapíšeš (pivo, datum, hodnoty '
  + 's jednotkami; u zkušenosti název a text), a ulož až po potvrzení; nic nedomýšlej ani nepřepočítávej a uloženou hodnotu přepiš jen na výslovnou opravu. '
  + 'Otázka z appky (zadání s dotaz_id): odpověz a celou odpověď ulož nástrojem uloz_odpoved, ať ji uživatel vidí v appce; navazuje-li na předchozí '
  + 'konverzaci, načti si ji nejdřív nástrojem dotaz_z_appky.';

/** Novější vydání podle id staršího (etapa 3c): z dvojic dokument → předchozí vydání. */
export function novejsiVydani(radky: readonly { id: string; nazev: string; rok: number | null; predchozi_vydani: string | null }[]): Map<string, { nazev: string; rok: number | null }[]> {
  const mapa = new Map<string, { nazev: string; rok: number | null }[]>();
  for (const r of radky) {
    if (!r.predchozi_vydani || r.predchozi_vydani === r.id) continue;
    mapa.set(r.predchozi_vydani, [...(mapa.get(r.predchozi_vydani) ?? []), { nazev: r.nazev, rok: r.rok }]);
  }
  return mapa;
}

/** Poznámka k výsledku ze staršího vydání; '' u nejnovějšího nebo bez vazby. */
export function poznamkaVydani(dokumentId: string, novejsi: ReadonlyMap<string, readonly { nazev: string; rok: number | null }[]>): string {
  const n = novejsi.get(dokumentId);
  if (!n || n.length === 0) return '';
  return ` — starší vydání (novější: ${n.map((x) => `${x.nazev}${x.rok ? `, ${x.rok}` : ''}`).join('; ')})`;
}

type Zprava = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };

export class ChybaNastroje extends Error {}

/**
 * Jedna zpráva JSON-RPC → odpověď (null u notifikace). `zavolej` provede nástroj
 * a vrátí text; ChybaNastroje se vrátí jako výsledek s isError (Claude ji vidí).
 */
export async function zpracujZpravu(
  z: Zprava,
  zavolej: (jmeno: string, args: Record<string, unknown>) => Promise<string>,
): Promise<Record<string, unknown> | null> {
  const id = z.id ?? null;
  const notifikace = z.id === undefined;
  const chyba = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (z.jsonrpc !== '2.0' || typeof z.method !== 'string') return notifikace ? null : chyba(-32600, 'Invalid Request');
  const p = (z.params ?? {}) as Record<string, unknown>;
  switch (z.method) {
    case 'initialize': {
      const chce = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: PODPOROVANE_VERZE.includes(chce) ? chce : PODPOROVANE_VERZE[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'pivovarska-bible', title: 'Pivovarská bible', version: '1.0.0' },
          instructions: INSTRUKCE,
        },
      };
    }
    case 'ping':
      return notifikace ? null : { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: NASTROJE } };
    case 'tools/call': {
      const jmeno = typeof p.name === 'string' ? p.name : '';
      if (!NASTROJE.some((n) => n.name === jmeno)) return chyba(-32602, `Neznámý nástroj: ${jmeno}`);
      const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Record<string, unknown>;
      try {
        const text = await zavolej(jmeno, args);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: orizni(text) }], isError: false } };
      } catch (e) {
        if (e instanceof ChybaNastroje) return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } };
        throw e;
      }
    }
    default:
      if (z.method.startsWith('notifications/')) return null;
      return notifikace ? null : chyba(-32601, 'Method not found');
  }
}

export function orizni(text: string, max = MAX_ZNAKU_VYSLEDKU): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[… zkráceno — vyžádej si menší část]`;
}

const bezDiakritiky = (z: string) => z.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Najde přehled podle klíče nebo názvu (bez diakritiky, i část názvu). */
export function najdiTema<T extends { klic: string; nazev: string }>(prehledy: readonly T[], tema: string): T | null {
  const t = bezDiakritiky(tema).trim();
  if (!t) return null;
  return prehledy.find((p) => p.klic === t)
    ?? prehledy.find((p) => bezDiakritiky(p.nazev) === t)
    ?? prehledy.find((p) => bezDiakritiky(p.nazev).includes(t) || t.includes(bezDiakritiky(p.nazev).split(' ')[0]))
    ?? null;
}

const SKUPINA_CITACI = /\[((?:\s*(?:zdroje?|zdrojích|viz|č\.)\s*)?\d{1,3}(?:\s*(?:,|;|–|-|\ba\b|\band\b)\s*\d{1,3})+\s*|\s*(?:zdroje?|zdrojích|viz|č\.)\s*\d{1,3}\s*)\]/gi;

/** [2, 5] / [2–4] / [zdroj 2] → [2][5] / [2][3][4] / [2] (stejně jako worker, prehledy.normalizuj_citace). */
export function normalizujCitace(text: string): string {
  return text.replace(SKUPINA_CITACI, (celek: string, obsah: string) => {
    const cisla: number[] = [];
    for (const cast of obsah.replace(/zdrojích|zdroje?|viz|č\./gi, '').trim().split(/\s*(?:,|;|\ba\b|\band\b)\s*/)) {
      const rozsah = /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.exec(cast);
      if (rozsah) {
        const a = Number(rozsah[1]);
        const b = Number(rozsah[2]);
        if (b - a > 0 && b - a <= 30) for (let i = a; i <= b; i++) cisla.push(i);
        else cisla.push(a, b);
      } else if (/^\d+$/.test(cast)) cisla.push(Number(cast));
    }
    const jedinecna = [...new Set(cisla)];
    return jedinecna.length ? jedinecna.map((c) => `[${c}]`).join('') : celek;
  });
}

/** Čísla citací [n] v textu (po normalizaci). */
export function citovaneZdroje(text: string): Set<number> {
  return new Set([...normalizujCitace(text).matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
}

/** Citace [n] přehledu → odkazy Markdown na stránku knihy; ve zdrojích jen citované (jinak všechny). */
export function prehledSOdkazy(text: string, zdroje: readonly { n: number; dokument_id: string; pdf_index: number; nazev: string; tistena_strana: string | null }[]): string {
  const mapa = new Map(zdroje.map((z) => [z.n, z]));
  const citovane = citovaneZdroje(text);
  const telo = normalizujCitace(text).replace(/\[(\d{1,3})\]/g, (m, n) => {
    const z = mapa.get(Number(n));
    return z ? `[[${n}]](${odkazNaList(z.dokument_id, z.pdf_index)})` : m;
  });
  const vypsat = zdroje.some((z) => citovane.has(z.n)) ? zdroje.filter((z) => citovane.has(z.n)) : zdroje;
  const seznam = vypsat.map((z) => `[${z.n}] ${z.nazev}, ${z.tistena_strana ? `s. ${z.tistena_strana}` : `list ${z.pdf_index}`} — ${odkazNaList(z.dokument_id, z.pdf_index)}`);
  return `${telo}\n\nZdroje:\n${seznam.join('\n')}`;
}
