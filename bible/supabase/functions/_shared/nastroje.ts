// 🧰 Nástroje Pivovarské bible pro Clauda — sdílí je konektor do aplikace
// Claude (bible-mcp, R16) i chatbot v appce (bible-chat, etapa 5), ať oba
// hledají, čtou a počítají stejně. Jen čtení přes service roli; zápis
// (uloz_web_zdroj, zaloz_problem, zapis_zjisteni, zapis_varku, dopln_varku,
// zapis_zkusenost) za připojeného uživatele přes SQL funkce, které práva
// hlídají znovu. Žádný přímý insert/update/delete (hlídá test). Do logu nikdy
// text knih.
import { jeUuid, uroven } from './brana.ts';
import {
  dotazHledani, jeCitelny, sPrekladem, SLOUPCE_LISTU, SLOUPCE_PREKLADU, slovaDotazu, slovaVolne, uryvek,
} from './cteni.ts';
import { APP_URL, ChybaNastroje, najdiTema, novejsiVydani, odkazNaList, poznamkaVydani, prehledSOdkazy } from './mcp.ts';
import { ChybaVypoctu, vypocetText } from './vypocty/nastroj.ts';
import { technologieText, type ProfilPivovaru } from './technologie-popisy.ts';
import {
  ChybaVyberu, datumCesky, filtrujVarky, filtrZArgumentu, HODNOTY_VARKY, porovnaniText, porovnejVarky, popisVarky, prehledVarek,
  seznamVarekText, vyberProPorovnani, type FiltrVarek, type PrehledVarek, type VarkaData, type VarkaZaznam,
} from './varky-popisy.ts';
import { filtrujWeb, prehledWebu, webZdrojeText } from './web-popisy.ts';
import { prehledProblemu, problemText, seznamProblemuText } from './problemy-popisy.ts';
import {
  ChybaVstupu, filtrHledani, filtrMimoKnihu, hodnotyVarkyVstup, prekladChybyDb, problemVstup, varkaVstup, webZdrojVstup, zjisteniVstup,
  zkusenostVstup, type ChybaDb, type FiltrHledani,
} from './vstupy.ts';
import type { ZdrojKnihy } from './chat.ts';

/**
 * Klient databáze bible (supabase-js s service rolí). Strukturní typ, ať se
 * modul obejde bez npm importu (testují ho i vitesty appky).
 */
// deno-lint-ignore no-explicit-any
export type Db = any;

const VYSLEDKU = 25;

const misto = (tistena: string | null | undefined, list: number) => (tistena ? `s. ${tistena}` : `list ${list}`);

function textVstupu(e: unknown): never {
  if (e instanceof ChybaVstupu) throw new ChybaNastroje(e.message);
  throw e;
}

async function citelny(db: Db, id: string): Promise<{ nazev: string }> {
  const { data, error } = await db.from('bible_dokumenty').select('nazev,stav').eq('id', id).maybeSingle();
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  if (!data) throw new ChybaNastroje('Kniha s tímto id v knihovně není (seznam_knih vrátí platná id).');
  if (!jeCitelny((data as { stav: string }).stav)) throw new ChybaNastroje('Kniha ještě není zpracovaná — zkus ji později.');
  return { nazev: String((data as { nazev: string }).nazev) };
}

/** Novější vydání podle staršího (etapa 3c); bez migrace (sloupec chybí) prázdné. */
async function vydaniKnih(db: Db): Promise<Map<string, { nazev: string; rok: number | null }[]>> {
  const { data, error } = await db.from('bible_dokumenty').select('id,nazev,rok,predchozi_vydani').not('predchozi_vydani', 'is', null);
  if (error) return new Map();
  return novejsiVydani((data ?? []) as { id: string; nazev: string; rok: number | null; predchozi_vydani: string | null }[]);
}

/** Místo v knize z hledání — stejné pro konektor (text) i chatbot (search_result s citacemi). */
type NalezKnihy = {
  dokumentId: string; nazev: string; autor: string | null; rok: number | null; tistena: string | null; list: number;
  kapitola: string | null; zdroj: 'original' | 'preklad'; vydani: string; shoda: number | null; slov: number | null; uryvek: string;
};

async function hledejData(db: Db, args: Record<string, unknown>): Promise<{ dotaz: string; volne: boolean; slova: string[]; nalezy: NalezKnihy[]; filtr: FiltrHledani | null }> {
  let dotaz: string;
  let filtr: FiltrHledani | null;
  try {
    dotaz = dotazHledani(args.dotaz);
    const kniha = args.kniha_id === undefined || args.kniha_id === null || args.kniha_id === '' ? null : args.kniha_id;
    if (kniha !== null && !jeUuid(kniha)) throw new ChybaVstupu('kniha_id musí být id knihy ze seznam_knih.');
    filtr = filtrHledani({ autor: args.autor, rok_od: args.rok_od, rok_do: args.rok_do, jazyk: args.jazyk, druh: args.druh, oblast: args.oblast }, kniha);
  } catch (e) { textVstupu(e); }
  type Radek = {
    dokument_id: string; nazev: string; autor: string | null; rok: number | null; zdroj: string;
    pdf_index: number; tistena_strana: string | null; kapitola: string | null; text: string; shoda?: number; slov?: number;
  };
  // Varianty slov a filtry (migrace 20261111040000); bez ní původní hledání (jen filtr knihy).
  let varianty = true;
  let r = await db.rpc('bible_hledej_v', { p_dotaz: dotaz, p_filtr: filtr, p_limit: VYSLEDKU });
  if (r.error?.code === 'PGRST202') {
    if (filtrMimoKnihu(filtr)) throw new ChybaNastroje('Filtry hledání (autor, rok, jazyk, druh, oblast) čekají na migraci 20261111040000_bible_hledani_filtry — hledej bez nich.');
    varianty = false;
    r = await db.rpc('bible_hledej', { p_dotaz: dotaz, p_dokument: filtr?.dokument ?? null, p_limit: VYSLEDKU });
  }
  if (r.error?.code === 'PGRST202') throw new ChybaNastroje('Hledání v databázi bible ještě není zapnuté (migrace 20261103010000_bible_hledani).');
  if (r.error) throw new Error(`db ${r.error.code ?? '?'}`);
  let radky = (r.data ?? []) as Radek[];
  // Všechna slova na jedné stránce nejsou → stránky s nejvíc slovy otázky (bez výplňových slov, migrace 20261111030000).
  let volne = false;
  if (radky.length === 0 && slovaVolne(dotaz).length > 0) {
    const v = varianty
      ? await db.rpc('bible_hledej_volne_v', { p_dotaz: dotaz, p_filtr: filtr, p_limit: VYSLEDKU })
      : await db.rpc('bible_hledej_volne', { p_dotaz: dotaz, p_dokument: filtr?.dokument ?? null, p_limit: VYSLEDKU });
    if (!v.error && Array.isArray(v.data) && v.data.length > 0) { radky = v.data as Radek[]; volne = true; }
  }
  let slova = volne ? slovaVolne(dotaz) : slovaDotazu(dotaz);
  if (varianty && radky.length > 0) {
    const s = await db.rpc('bible_slova_hledani', { p_dotaz: dotaz, p_volne: volne });
    if (!s.error && Array.isArray(s.data) && s.data.length > 0) slova = (s.data as unknown[]).filter((w): w is string => typeof w === 'string').slice(0, 40);
  }
  const novejsi = radky.length > 0 ? await vydaniKnih(db) : new Map();
  return {
    dotaz, volne, slova, filtr,
    nalezy: radky.map((x) => ({
      dokumentId: x.dokument_id, nazev: x.nazev, autor: x.autor, rok: x.rok, tistena: x.tistena_strana, list: x.pdf_index,
      kapitola: x.kapitola, zdroj: x.zdroj === 'preklad' ? 'preklad' : 'original', vydani: poznamkaVydani(x.dokument_id, novejsi),
      shoda: volne && typeof x.shoda === 'number' ? x.shoda : null, slov: volne && typeof x.slov === 'number' ? x.slov : null,
      uryvek: uryvek(x.text, slova),
    })),
  };
}

/** Filtr hledání slovy (do výsledku pro Clauda), např. „němčina, 1970–1989, autor Kunze". */
function popisFiltru(f: FiltrHledani | null): string {
  if (!f) return '';
  const casti = [
    f.dokument ? 'jen jedna kniha' : '',
    f.autor ? `autor „${f.autor}"` : '',
    f.rok_od !== undefined || f.rok_do !== undefined ? `rok ${f.rok_od ?? '…'}–${f.rok_do ?? '…'}` : '',
    f.jazyk ? `jazyk ${f.jazyk}` : '',
    f.druh ? `druh ${f.druh}` : '',
    f.oblast ? `oblast ${f.oblast}` : '',
  ].filter(Boolean);
  return casti.length ? ` [filtr: ${casti.join(', ')}]` : '';
}

const nicNenalezeno = (dotaz: string, filtr: FiltrHledani | null = null) => `Pro „${dotaz}"${popisFiltru(filtr)} jsem v knihách nic nenašel. Zkus jiné nebo kratší slovo${filtr ? ', nebo bez filtru' : ''}.`;

function hlavaHledani(d: { dotaz: string; volne: boolean; slova: string[]; nalezy: NalezKnihy[]; filtr: FiltrHledani | null }): string {
  return `${d.volne
    ? `Všechna slova „${d.dotaz}" na jedné stránce nejsou. Stránky s nejvíc slovy otázky (i odborné varianty: ${d.slova.slice(0, 12).join(', ')}) — ověř, že opravdu odpovídají`
    : `Nalezeno ${d.nalezy.length} míst pro „${d.dotaz}" (i odborné varianty v češtině, němčině a angličtině)`}${popisFiltru(d.filtr)}: (celý text a kontext: precti_stranu s kniha_id a list)`;
}

/** Jeden řádek popisu místa: kniha, autor, strana, kapitola, originál/překlad, vydání, shoda. */
function popisNalezu(r: NalezKnihy): string {
  return `${r.nazev}${r.autor ? ` (${r.autor}${r.rok ? `, ${r.rok}` : ''})` : ''} — ${misto(r.tistena, r.list)}`
    + `${r.kapitola ? `, kapitola „${r.kapitola}"` : ''} — ${r.zdroj === 'preklad' ? 'český překlad' : 'originál'}${r.vydani}`
    + `${r.shoda && r.slov ? ` — shoda ${r.shoda} z ${r.slov} slov` : ''}`;
}

async function hledej(db: Db, args: Record<string, unknown>): Promise<string> {
  const d = await hledejData(db, args);
  if (d.nalezy.length === 0) return nicNenalezeno(d.dotaz, d.filtr);
  const casti = d.nalezy.map((r, i) => [
    `${i + 1}. ${popisNalezu(r)}`,
    `   kniha_id=${r.dokumentId} list=${r.list} odkaz: ${odkazNaList(r.dokumentId, r.list)}`,
    `   ${r.uryvek}`,
  ].join('\n'));
  return `${hlavaHledani(d)}\n\n${casti.join('\n\n')}`;
}

/** Listy knihy pro precti_stranu (překlad i originál, upozornění ke kontrole). */
async function prectiData(db: Db, args: Record<string, unknown>): Promise<{ id: string; nazev: string; listy: {
  pdf_index: number; tistena_strana: string | null; text: string; ke_kontrole: boolean; kontrola_duvod: string | null;
  preklad: string | null; preklad_kontrola: string | null;
}[] }> {
  if (!jeUuid(args.kniha_id)) throw new ChybaNastroje('kniha_id musí být id knihy ze seznam_knih.');
  const list = typeof args.list === 'number' && Number.isInteger(args.list) && args.list >= 1 ? args.list : null;
  if (list === null) throw new ChybaNastroje('list musí být celé číslo od 1.');
  const pocet = typeof args.pocet === 'number' && Number.isInteger(args.pocet) ? Math.min(3, Math.max(1, args.pocet)) : 2;
  const id = args.kniha_id.toLowerCase();
  const { nazev } = await citelny(db, id);
  const dotaz = (sloupce: string) => db.from('bible_strany').select(sloupce).eq('dokument_id', id).gte('pdf_index', list).order('pdf_index').limit(pocet);
  let { data, error } = await dotaz(`${SLOUPCE_LISTU},${SLOUPCE_PREKLADU}`);
  if (error?.code === '42703') ({ data, error } = await dotaz(SLOUPCE_LISTU));
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const listy = ((data ?? []) as Record<string, unknown>[]).map((l) => sPrekladem(l as { preklad?: string | null })) as unknown as {
    pdf_index: number; tistena_strana: string | null; text: string; ke_kontrole: boolean; kontrola_duvod: string | null;
    preklad: string | null; preklad_kontrola: string | null;
  }[];
  if (listy.length === 0) throw new ChybaNastroje('Takový list kniha nemá.');
  return { id, nazev, listy };
}

const pozorListu = (l: { ke_kontrole: boolean; kontrola_duvod: string | null; preklad: string | null; preklad_kontrola: string | null }) => [
  l.ke_kontrole ? `Pozor: přepis strany ke kontrole${l.kontrola_duvod ? ` (${l.kontrola_duvod})` : ''} — čísla ověř v originále.` : '',
  l.preklad && l.preklad_kontrola ? `Pozor u překladu: ${l.preklad_kontrola}.` : '',
].filter(Boolean).join('\n');

async function prectiStranu(db: Db, args: Record<string, unknown>): Promise<string> {
  const { id, nazev, listy } = await prectiData(db, args);
  return listy.map((l) => {
    const hlava = `### ${nazev} — ${misto(l.tistena_strana, l.pdf_index)} (list ${l.pdf_index})\nOdkaz: ${odkazNaList(id, l.pdf_index)}`;
    const telo = l.preklad
      ? `Český překlad:\n${l.preklad}\n\nOriginál:\n${l.text}`
      : `${l.preklad === null ? '(Český překlad zatím není.)\n' : ''}${l.text || '(Na listu není text.)'}`;
    return [hlava, pozorListu(l), telo].filter(Boolean).join('\n\n');
  }).join('\n\n---\n\n');
}

// --- Chatbot: stránky knih jako bloky search_result s citacemi -----------------------

export type BlokVysledku =
  | { type: 'text'; text: string }
  | { type: 'search_result'; source: string; title: string; content: { type: 'text'; text: string }[]; citations: { enabled: true } };

/** Výsledek nástroje pro chatbota: text, nebo bloky se stránkami knih (a jejich údaje pro citace). */
export type VysledekChatu = { text: string } | { bloky: BlokVysledku[]; zdroje: ZdrojKnihy[] };

const vysledekKnihy = (source: string, title: string, texty: string[]): BlokVysledku => ({
  type: 'search_result', source, title,
  content: texty.map((t) => ({ type: 'text' as const, text: t.trim() || '(Na listu není text.)' })),
  citations: { enabled: true },
});

async function hledejBloky(db: Db, args: Record<string, unknown>): Promise<VysledekChatu> {
  const d = await hledejData(db, args);
  if (d.nalezy.length === 0) return { text: nicNenalezeno(d.dotaz, d.filtr) };
  const zdroje: ZdrojKnihy[] = d.nalezy.map((r) => ({
    source: odkazNaList(r.dokumentId, r.list), dokumentId: r.dokumentId, list: r.list, nazev: r.nazev,
    tistena: r.tistena, kapitola: r.kapitola, zdroj: r.zdroj,
  }));
  return {
    bloky: [
      { type: 'text', text: hlavaHledani(d) },
      ...d.nalezy.map((r, i) => vysledekKnihy(zdroje[i].source, `${popisNalezu(r)} · kniha_id=${r.dokumentId} list=${r.list}`, [r.uryvek])),
    ],
    zdroje,
  };
}

async function prectiBloky(db: Db, args: Record<string, unknown>): Promise<VysledekChatu> {
  const { id, nazev, listy } = await prectiData(db, args);
  const pozor = listy.map((l) => { const p = pozorListu(l); return p ? `List ${l.pdf_index}: ${p}` : ''; }).filter(Boolean);
  const zdroje: ZdrojKnihy[] = listy.map((l) => ({
    source: odkazNaList(id, l.pdf_index), dokumentId: id, list: l.pdf_index, nazev, tistena: l.tistena_strana, kapitola: null,
    zdroj: l.preklad ? 'preklad' : 'original',
  }));
  return {
    bloky: [
      ...(pozor.length > 0 ? [{ type: 'text' as const, text: pozor.join('\n') }] : []),
      ...listy.map((l, i) => vysledekKnihy(
        zdroje[i].source,
        `${nazev} — ${misto(l.tistena_strana, l.pdf_index)} (list ${l.pdf_index}) · kniha_id=${id} list=${l.pdf_index}`,
        l.preklad ? [`Český překlad:\n${l.preklad}`, `Originál:\n${l.text}`] : [l.text],
      )),
    ],
    zdroje,
  };
}

async function prehledTematu(db: Db, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from('bible_prehledy').select('klic,nazev,oblast').order('poradi');
  if (error?.code === 'PGRST205' || error?.code === '42P01') return 'Přehledy témat v databázi bible ještě nejsou (migrace 20261103020000_bible_prehledy).';
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const seznam = (data ?? []) as { klic: string; nazev: string }[];
  if (seznam.length === 0) return 'Přehledy témat ještě nejsou napsané — vzniknou, až budou všechny knihy zpracované a přeložené. Použij hledej_v_knihach.';
  const tema = typeof args.tema === 'string' ? args.tema : '';
  const p = tema ? najdiTema(seznam, tema) : null;
  if (!p) {
    return `${tema ? `Přehled „${tema}" není. ` : ''}Dostupné přehledy: ${seznam.map((s) => `${s.nazev} (${s.klic})`).join(', ')}.`;
  }
  const r = await db.from('bible_prehledy').select('nazev,text,zdroje,kontrola').eq('klic', p.klic).maybeSingle();
  if (r.error) throw new Error(`db ${r.error.code ?? '?'}`);
  const d = r.data as { nazev: string; text: string; zdroje: { n: number; dokument_id: string; pdf_index: number; nazev: string; tistena_strana: string | null }[]; kontrola: string | null };
  return `# Přehled: ${d.nazev}\n${d.kontrola ? `Pozor: ${d.kontrola}.\n` : ''}\n${prehledSOdkazy(d.text, Array.isArray(d.zdroje) ? d.zdroje : [])}`;
}

// Profil pivovaru (etapa 7): parametry provozu se zdrojem, odděleně od literatury.
async function profilPivovaru(db: Db, args: Record<string, unknown>): Promise<string> {
  const pivovar = args.pivovar_id === undefined || args.pivovar_id === null || args.pivovar_id === '' ? null : args.pivovar_id;
  if (pivovar !== null && !jeUuid(pivovar)) throw new ChybaNastroje('pivovar_id musí být id pivovaru ze seznamu ve výsledku.');
  const { data, error } = await db.rpc('bible_technologie', { p_pivovar: pivovar });
  if (error?.code === 'PGRST202') return 'Profil pivovaru v databázi bible ještě není zapnutý (migrace 20261111000000_bible_technologie).';
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const profil = data as ProfilPivovaru;
  if (pivovar !== null && !profil.pivovar_id) throw new ChybaNastroje('Takový pivovar v bibli není.');
  return technologieText(profil);
}

// Receptury a várky (etapa 8): jen uložené údaje; co chybí, porovnání vyjmenuje.
const BEZ_VAREK = 'Evidence várek v databázi bible ještě není zapnutá (migrace 20261111010000_bible_varky).';

async function nactiVarky(db: Db): Promise<PrehledVarek | null> {
  const { data, error } = await db.rpc('bible_varky_prehled', { p_limit: 2000 });
  if (error?.code === 'PGRST202') return null;
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  return prehledVarek(data);
}

async function seznamVarek(db: Db, args: Record<string, unknown>): Promise<string> {
  const limit = args.limit === undefined || args.limit === null ? 30 : args.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ChybaNastroje('limit je celé číslo 1 až 100.');
  let filtr: FiltrVarek;
  try { filtr = filtrZArgumentu(args); } catch (e) { if (e instanceof ChybaVyberu) throw new ChybaNastroje(e.message); throw e; }
  const p = await nactiVarky(db);
  if (!p) return BEZ_VAREK;
  return seznamVarekText(p, filtrujVarky(p.varky, filtr), limit);
}

async function porovnejVarkyNastroj(db: Db, args: Record<string, unknown>): Promise<string> {
  const p = await nactiVarky(db);
  if (!p) return BEZ_VAREK;
  let vybrane: VarkaZaznam[];
  try { vybrane = vyberProPorovnani(p.varky, args); } catch (e) { if (e instanceof ChybaVyberu) throw new ChybaNastroje(e.message); throw e; }
  return porovnaniText(porovnejVarky(vybrane, p.receptury), p.receptury);
}

// --- Zápis přes konektor (etapy 9 a 10) -------------------------------------
// Kdo konektor připojil (bible_mcp_over): zapisuje se za něj, s příznakem
// pres_claude. Práva hlídá tady i SQL (fail-closed); webový zdroj je vždy
// neověřený — ověří ho správce v appce.
export type Pripojeny = { uzivatel: string; jmeno: string | null; pristup: string };

function smiZapisovat(kdo: Pripojeny): void {
  if (uroven(kdo.pristup) < 2) throw new ChybaNastroje('Zapisovat do bible smí jen přispěvatel nebo správce — tvůj účet má v bibli jen čtení.');
}

/** Vstup z argumentů nástroje; chyba vstupu jde Claudovi jako srozumitelná hláška. */
function vstup<T>(f: () => T): T {
  try { return f(); } catch (e) { if (e instanceof ChybaVstupu) throw new ChybaNastroje(e.message); throw e; }
}

/** Chyba databáze při zápisu: srozumitelná (práva, vstup, neexistuje) Claudovi, jinak výjimka. */
function chybaZapisu(error: ChybaDb): never {
  const p = prekladChybyDb(error);
  if (p.status < 500) throw new ChybaNastroje(p.zprava);
  throw new Error(`db ${error?.code ?? '?'}`);
}

const BEZ_MIGRACE_9_10 = 'Rešerše a analýza problémů v databázi bible ještě nejsou zapnuté (migrace 20261111020000_bible_web_problemy).';

async function webZdroje(db: Db, args: Record<string, unknown>): Promise<string> {
  const limit = args.limit === undefined || args.limit === null ? 20 : args.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new ChybaNastroje('limit je celé číslo 1 až 50.');
  if (args.dotaz !== undefined && args.dotaz !== null && (typeof args.dotaz !== 'string' || args.dotaz.length > 200)) throw new ChybaNastroje('dotaz je text (nejvýš 200 znaků).');
  if (args.oblast !== undefined && args.oblast !== null && args.oblast !== '' && (typeof args.oblast !== 'string' || !/^[A-T]$/.test(args.oblast))) throw new ChybaNastroje('oblast je písmeno A–T.');
  const { data, error } = await db.rpc('bible_web_zdroje_prehled', { p_limit: 2000 });
  if (error?.code === 'PGRST202') return BEZ_MIGRACE_9_10;
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const zdroje = prehledWebu(data);
  const vybrane = filtrujWeb(zdroje, {
    dotaz: typeof args.dotaz === 'string' ? args.dotaz : undefined,
    oblast: typeof args.oblast === 'string' && args.oblast ? args.oblast : undefined,
    stavy: args.vcetne_zamitnutych === true ? undefined : ['overeno', 'neovereno'],
  });
  // Ověřené první, pak podle důvěry.
  vybrane.sort((a, b) => (a.stav === 'overeno' ? 0 : 1) - (b.stav === 'overeno' ? 0 : 1) || a.duvera - b.duvera);
  return webZdrojeText(vybrane.slice(0, limit), zdroje.length);
}

async function ulozWebZdroj(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  const zdroj = vstup(() => webZdrojVstup({ ...args, id: undefined }));
  const { data, error } = await db.rpc('bible_web_zdroj_uloz', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: kdo.jmeno ?? '', p_pres_claude: true, p_zdroj: zdroj,
  });
  if (error?.code === 'PGRST202') return BEZ_MIGRACE_9_10;
  if (error) chybaZapisu(error);
  const r = (data ?? {}) as { id?: string; novy?: boolean; stav?: string };
  return r.novy
    ? `Uloženo jako neověřený webový zdroj (id ${r.id}). Ověří ho správce v appce (Pivovarská bible → Správa znalostí → Rešerše z internetu).`
    : `Tahle adresa už v rešerši je (id ${r.id}, stav: ${r.stav === 'overeno' ? 'ověřeno' : r.stav === 'zamitnuto' ? 'zamítnuto' : 'neověřeno'}) — nic se nezměnilo.`;
}

async function problemy(db: Db, args: Record<string, unknown>): Promise<string> {
  const id = args.problem_id === undefined || args.problem_id === null || args.problem_id === '' ? null : args.problem_id;
  if (id !== null && !jeUuid(id)) throw new ChybaNastroje('problem_id musí být id problému ze seznamu.');
  const { data, error } = await db.rpc('bible_problemy_prehled', { p_limit: 1000 });
  if (error?.code === 'PGRST202') return BEZ_MIGRACE_9_10;
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const seznam = prehledProblemu(data);
  if (id === null) return seznamProblemuText(seznam, args.vse === true);
  const p = seznam.find((x) => x.id.toLowerCase() === (id as string).toLowerCase());
  if (!p) throw new ChybaNastroje('Takový problém v bibli není.');
  const varky = p.varky.length > 0 ? await nactiVarky(db) : null;
  return problemText(p, varky?.varky ?? [], varky?.receptury ?? []);
}

async function zalozProblem(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  const problem = vstup(() => problemVstup({ nazev: args.nazev, popis: args.popis, pivo: args.pivo, varky: args.varka_ids, oblasti: args.oblasti }));
  const { data, error } = await db.rpc('bible_problem_uloz', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: kdo.jmeno ?? '', p_pres_claude: true, p_problem: problem,
  });
  if (error?.code === 'PGRST202') return BEZ_MIGRACE_9_10;
  if (error) chybaZapisu(error);
  return `Problém založen (problem_id=${data}). Zjištění k němu zapisuj nástrojem zapis_zjisteni.`;
}

async function zapisZjisteni(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  const zjisteni = vstup(() => zjisteniVstup(args));
  const { error } = await db.rpc('bible_zjisteni_uloz', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: kdo.jmeno ?? '', p_pres_claude: true, p_zjisteni: zjisteni,
  });
  if (error?.code === 'PGRST202') return BEZ_MIGRACE_9_10;
  if (error) chybaZapisu(error);
  return zjisteni.typ === 'hypoteza'
    ? 'Hypotéza zapsaná jako navržená — potvrdí nebo vyvrátí ji člověk v appce.'
    : 'Zjištění zapsané.';
}

// --- Zápis z provozu přes konektor: várky a zkušenosti (často hlasem) --------
// Majitel 12. 11. 2026 k doporučení „zapisovat várky a zkušenosti hlasem přes
// Claude": „Ano, pokračuj automaticky" (R32). Stejné kontroly jako formulář
// appky (varkaVstup, zkusenostVstup) a stejné SQL funkce (bible_varka_uloz,
// bible_zapis_zkusenost), které práva hlídají znovu. Claude má zápis před
// uložením shrnout a nechat potvrdit (popis nástroje). Pojistky proti zápisu
// navíc: stejné pivo téhož dne a stejná zkušenost se podruhé neuloží, uložená
// hodnota várky se nepřepíše bez výslovné opravy (opravit=true).

const ODKAZ_VARKY = `${APP_URL}/?page=bible&sub=varky`;
const ODKAZ_ZKUSENOSTI = `${APP_URL}/?page=bible&sub=zkusenosti`;

/** Číslo přesně, jak se uložilo (bez zaokrouhlení): desetinná čárka, skutečné minus. */
const presne = (n: number): string => String(n).replace('.', ',').replace(/^-/, '−');

/** Řádky „- Název: hodnota jednotka" v pořadí katalogu (jako formulář appky). */
function radkyHodnot(h: Readonly<Record<string, number>>, klice?: ReadonlySet<string>): string[] {
  return HODNOTY_VARKY
    .filter((k) => typeof h[k.klic] === 'number' && (!klice || klice.has(k.klic)))
    .map((k) => `- ${k.nazev}: ${presne(h[k.klic])}${k.jednotka ? ` ${k.jednotka}` : ''}`);
}

const pocetHodnot = (h: Readonly<Record<string, unknown>>) => HODNOTY_VARKY.filter((k) => typeof h[k.klic] === 'number').length;

/** Kdo zapsal: připojený uživatel přes konektor (v appce u záznamu „zapsal"). */
const jmenoPresClauda = (kdo: Pripojeny) => (kdo.jmeno?.trim() ? `${kdo.jmeno.trim()} přes Claude` : 'Claude (konektor)');

/** Dnešní datum v Česku (RRRR-MM-DD) — k připsané poznámce várky. */
const dnesVCesku = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const bezTabulky = (error: ChybaDb) => error?.code === 'PGRST205' || error?.code === '42P01';
const stejnyText = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Pivovar várky jako ve formuláři appky: jediný pivovar z Technologie pivovaru, jinak žádný (nic se nehádá). */
async function jedinyPivovar(db: Db): Promise<string | null> {
  const { data, error } = await db.from('bible_pivovary').select('id').limit(2);
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return typeof data[0].id === 'string' ? data[0].id : null;
}

async function zapisVarku(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  const varka = vstup(() => varkaVstup({
    pivovar_id: args.pivovar_id, receptura_id: args.receptura_id, pivo: args.pivo, datum_varu: args.datum_varu, hodnoty: args.hodnoty,
    // Číslo várky řečené hlasem může přijít jako číslo (112).
    cislo: typeof args.cislo === 'number' && Number.isInteger(args.cislo) ? String(args.cislo) : args.cislo,
    poznamka: args.poznamka,
  }));
  let receptura: string | null = null;
  if (varka.receptura_id) {
    const r = await db.from('bible_receptury').select('nazev').eq('id', varka.receptura_id).maybeSingle();
    if (r.error && bezTabulky(r.error)) throw new ChybaNastroje(BEZ_VAREK);
    if (r.error) throw new Error(`db ${r.error.code ?? '?'}`);
    if (!r.data) throw new ChybaNastroje('Taková receptura v evidenci není (seznam_varek vrátí platná receptura_id) — nic jsem neuložil.');
    receptura = String((r.data as { nazev: string }).nazev);
  }
  if (!varka.pivovar_id) varka.pivovar_id = await jedinyPivovar(db);
  if (args.dalsi_varka_tehoz_dne !== true) {
    // Hlasem se snadno řekne (nebo pošle) dvakrát: stejné pivo téhož dne v témže pivovaru (nebo bez pivovaru) se podruhé neuloží.
    const { data, error } = await db.from('bible_varky').select('id,cislo,pivo,pivovar_id').eq('datum_varu', varka.datum_varu).limit(100);
    if (error && bezTabulky(error)) throw new ChybaNastroje(BEZ_VAREK);
    if (error) throw new Error(`db ${error.code ?? '?'}`);
    const stejna = ((data ?? []) as { id: string; cislo: string | null; pivo: string; pivovar_id: string | null }[])
      .find((v) => stejnyText(v.pivo, varka.pivo) && (!v.pivovar_id || !varka.pivovar_id || v.pivovar_id === varka.pivovar_id));
    if (stejna) {
      throw new ChybaNastroje(`Várka ${stejna.cislo ? `č. ${stejna.cislo} ` : ''}„${stejna.pivo}" z ${datumCesky(String(varka.datum_varu))} už v evidenci je `
        + `(varka_id=${stejna.id}) — nic jsem neuložil. Hodnoty k ní přidá dopln_varku. Je-li to opravdu další várka téhož dne, `
        + 'potvrď to se sládkem a pošli zapis_varku znovu s dalsi_varka_tehoz_dne=true.');
    }
  }
  const { data, error } = await db.rpc('bible_varka_uloz', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: jmenoPresClauda(kdo), p_varka: varka,
  });
  if (error?.code === 'PGRST202') throw new ChybaNastroje(BEZ_VAREK);
  if (error) chybaZapisu(error);
  const hodnoty = varka.hodnoty as Record<string, number>;
  const radky = radkyHodnot(hodnoty);
  return [
    `Várka uložena (varka_id=${data}): ${popisVarky(varka as unknown as VarkaData)}${receptura ? ` · receptura ${receptura}` : ''}`,
    radky.length > 0 ? `Hodnoty (${radky.length} z ${HODNOTY_VARKY.length}):\n${radky.join('\n')}` : 'Hodnoty: zatím žádné.',
    varka.poznamka ? `Poznámka: ${varka.poznamka}` : '',
    `Další hodnoty (kvašení, ležení, laboratoř) přidá dopln_varku. V appce: ${ODKAZ_VARKY}`,
  ].filter(Boolean).join('\n');
}

async function doplnVarku(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  if (!jeUuid(args.varka_id)) throw new ChybaNastroje('varka_id musí být id várky ze seznam_varek.');
  const id = args.varka_id.toLowerCase();
  const nove = vstup(() => hodnotyVarkyVstup(args.hodnoty));
  if (args.poznamka !== undefined && args.poznamka !== null && typeof args.poznamka !== 'string') throw new ChybaNastroje('poznamka je text.');
  const pripsat = typeof args.poznamka === 'string' ? args.poznamka.trim() : '';
  if (Object.keys(nove).length === 0 && !pripsat) throw new ChybaNastroje('Chybí hodnoty nebo poznámka k doplnění.');
  const { data: v, error } = await db.from('bible_varky')
    .select('id,pivovar_id,receptura_id,cislo,pivo,datum_varu,hodnoty,poznamka').eq('id', id).maybeSingle();
  if (error && bezTabulky(error)) throw new ChybaNastroje(BEZ_VAREK);
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  if (!v) throw new ChybaNastroje('Taková várka v evidenci není (seznam_varek vrátí platná varka_id) — nic jsem neuložil.');
  const varka = v as VarkaData & { pivovar_id: string | null };
  const stare: Record<string, number> = {};
  for (const [k, n] of Object.entries((varka.hodnoty ?? {}) as Record<string, unknown>)) if (typeof n === 'number') stare[k] = n;
  const pridano = new Set<string>();
  const opraveno = new Set<string>();
  const stejne = new Set<string>();
  for (const [k, n] of Object.entries(nove)) {
    if (stare[k] === undefined) pridano.add(k);
    else if (stare[k] === n) stejne.add(k);
    else opraveno.add(k);
  }
  const nazev = popisVarky(varka);
  if (opraveno.size > 0 && args.opravit !== true) {
    const rozdily = HODNOTY_VARKY.filter((k) => opraveno.has(k.klic))
      .map((k) => `- ${k.nazev}: uloženo ${presne(stare[k.klic])}, nově ${presne(nove[k.klic])}${k.jednotka ? ` ${k.jednotka}` : ''}`);
    throw new ChybaNastroje(`Várka ${nazev} už má tyhle hodnoty jinak — nic jsem neuložil:\n${rozdily.join('\n')}\n`
      + 'Je-li to oprava, potvrď ji se sládkem a pošli dopln_varku znovu s opravit=true.');
  }
  const radekPoznamky = pripsat ? `${datumCesky(dnesVCesku())}: ${pripsat}` : '';
  const stara = (varka.poznamka ?? '').trim();
  const poznamkaUz = radekPoznamky !== '' && stara.includes(radekPoznamky);
  const poznamka = radekPoznamky && !poznamkaUz ? (stara ? `${stara}\n${radekPoznamky}` : radekPoznamky) : stara;
  if (poznamka.length > 4000) throw new ChybaNastroje('Poznámka várky by byla delší než 4000 znaků — připiš kratší text, nebo ji uprav v appce.');
  if (pridano.size === 0 && opraveno.size === 0 && poznamka === stara) {
    return `Várka ${nazev} už tohle všechno má — nic se nezměnilo.`;
  }
  const hodnoty = { ...stare, ...nove };
  const zaznam = vstup(() => varkaVstup({
    id, pivovar_id: varka.pivovar_id, receptura_id: varka.receptura_id, cislo: varka.cislo, pivo: varka.pivo,
    datum_varu: varka.datum_varu, hodnoty, poznamka: poznamka || null,
  }));
  const ulozeni = await db.rpc('bible_varka_uloz', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: jmenoPresClauda(kdo), p_varka: zaznam,
  });
  if (ulozeni.error?.code === 'PGRST202') throw new ChybaNastroje(BEZ_VAREK);
  if (ulozeni.error) chybaZapisu(ulozeni.error);
  const opravy = HODNOTY_VARKY.filter((k) => opraveno.has(k.klic))
    .map((k) => `- ${k.nazev}: ${presne(stare[k.klic])} → ${presne(nove[k.klic])}${k.jednotka ? ` ${k.jednotka}` : ''}`);
  return [
    `Várka doplněna (varka_id=${id}): ${nazev}`,
    pridano.size > 0 ? `Nově zapsáno:\n${radkyHodnot(nove, pridano).join('\n')}` : '',
    opravy.length > 0 ? `Opraveno:\n${opravy.join('\n')}` : '',
    stejne.size > 0 ? `Beze změny (už uložené stejně):\n${radkyHodnot(nove, stejne).join('\n')}` : '',
    radekPoznamky ? (poznamkaUz ? 'Poznámka už u várky je — nepřipsal jsem ji podruhé.' : `Připsáno k poznámce: ${radekPoznamky}`) : '',
    `Ve várce je teď ${pocetHodnot(hodnoty)} z ${HODNOTY_VARKY.length} hodnot. V appce: ${ODKAZ_VARKY}`,
  ].filter(Boolean).join('\n');
}

/** Druhy zkušeností slovy (stejně jako appka, src/lib/bibleZkusenostiApi.ts — shodu hlídá test). */
export const DRUHY_ZKUSENOSTI_NAZVY: Readonly<Record<string, string>> = {
  provozni_zkusenost: 'Provozní zkušenost',
  reseni_problemu: 'Řešení problému',
  postup: 'Praktický postup',
  pripadova_studie: 'Případová studie',
  rozhovor: 'Rozhovor se sládkem',
  diskuse: 'Odborná diskuse',
  doporuceni_vyrobce: 'Doporučení výrobce',
};

async function zapisZkusenost(db: Db, args: Record<string, unknown>, kdo: Pripojeny): Promise<string> {
  smiZapisovat(kdo);
  const z = vstup(() => zkusenostVstup({
    typ: args.typ, nazev: args.nazev, text: args.text, oblasti: args.oblasti, uroven: args.uroven, zdroj: args.zdroj,
  }));
  const nazev = String(z.nazev).trim();
  const text = String(z.text).trim();
  // Stejná zkušenost podruhé (opakované volání, dvakrát řečeno) se neuloží. Hledá se podle
  // názvu (krátký) a text se porovná tady — dlouhý text by se do adresy dotazu nevešel.
  const { data: uz, error: chybaCteni } = await db.from('bible_zkusenosti').select('id,text').eq('nazev', nazev).limit(50);
  if (chybaCteni && bezTabulky(chybaCteni)) throw new ChybaNastroje(BEZ_ZKUSENOSTI);
  if (chybaCteni) throw new Error(`db ${chybaCteni.code ?? '?'}`);
  const stejna = ((uz ?? []) as { id: string; text: string | null }[]).find((x) => (x.text ?? '').trim() === text);
  if (stejna) throw new ChybaNastroje(`Stejná zkušenost „${nazev}" už v bibli je (id ${stejna.id}) — nic jsem neuložil.`);
  const { data, error } = await db.rpc('bible_zapis_zkusenost', {
    p_uzivatel: kdo.uzivatel, p_pristup: kdo.pristup, p_jmeno: jmenoPresClauda(kdo), p_zkusenost: z,
  });
  if (error?.code === 'PGRST202') throw new ChybaNastroje(BEZ_ZKUSENOSTI);
  if (error) chybaZapisu(error);
  const oblasti = z.oblasti as string[];
  return [
    `Zkušenost uložena (id ${data}): „${nazev}"`,
    `- Druh: ${DRUHY_ZKUSENOSTI_NAZVY[String(z.typ)] ?? z.typ}`,
    `- Úroveň ${z.uroven} — ${UROVNE[z.uroven as number] ?? ''}`,
    oblasti.length > 0 ? `- Oblasti: ${oblasti.join(', ')}` : '',
    z.zdroj ? `- Zdroj: ${String(z.zdroj).trim()}` : '',
    `V appce (Zkušenosti sládků): ${ODKAZ_ZKUSENOSTI}`,
  ].filter(Boolean).join('\n');
}

// Zkušenosti sládků (etapa 3b): praxe s úrovní důvěryhodnosti — nikdy obecné pravidlo.
const BEZ_ZKUSENOSTI = 'Zkušenosti sládků v databázi bible ještě nejsou (migrace 20261104000000_bible_zkusenosti).';
const UROVNE = ['', 'ověřená odborná publikace', 'výrobní dokumentace', 'opakovaně ověřená provozní zkušenost', 'zkušenost jednoho sládka', 'neověřená informace'];

async function hledejZkusenosti(db: Db, args: Record<string, unknown>): Promise<string> {
  const dotaz = typeof args.dotaz === 'string' ? args.dotaz.trim().slice(0, 200) : '';
  const oblast = typeof args.oblast === 'string' && /^[A-T]$/.test(args.oblast) ? args.oblast : null;
  const { data, error } = await db.rpc('bible_hledej_zkusenosti', { p_dotaz: dotaz || null, p_oblast: oblast, p_nejhorsi: 5, p_limit: 15 });
  if (error?.code === 'PGRST202') return BEZ_ZKUSENOSTI;
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  type Zkusenost = { nazev: string; text: string; uroven: number; zdroj: string | null; zapsal_jmeno: string | null; oblasti: string[] };
  let radky = (data ?? []) as Zkusenost[];
  if (radky.length === 0 && dotaz && slovaVolne(dotaz).length > 0) {
    const v = await db.rpc('bible_hledej_zkusenosti_volne', { p_dotaz: dotaz, p_oblast: oblast, p_nejhorsi: 5, p_limit: 15 });
    if (!v.error && Array.isArray(v.data)) radky = v.data as Zkusenost[];
  }
  if (radky.length === 0) return dotaz ? `Ve zkušenostech sládků k „${dotaz}" nic není.` : 'Zkušenosti sládků jsou zatím prázdné.';
  return [
    `# Zkušenosti sládků (${radky.length}) — PRAXE, ne literatura: u každé řekni úroveň důvěryhodnosti a nevydávej ji za obecné pravidlo.`,
    ...radky.map((z) => `\n## ${z.nazev}\nÚroveň ${z.uroven} — ${UROVNE[z.uroven] ?? ''}${z.zdroj ? ` · zdroj: ${z.zdroj}` : ''}${z.zapsal_jmeno ? ` · zapsal ${z.zapsal_jmeno}` : ''}\n${z.text}`),
  ].join('\n');
}

async function seznamKnih(db: Db): Promise<string> {
  const { data, error } = await db.from('bible_dokumenty').select('id,nazev,autor,rok,jazyk,stav,stran_celkem').order('nazev');
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const knihy = (data ?? []) as { id: string; nazev: string; autor: string | null; rok: number | null; jazyk: string | null; stav: string; stran_celkem: number | null }[];
  if (knihy.length === 0) return 'Knihovna je zatím prázdná.';
  const novejsi = await vydaniKnih(db);
  return knihy.map((k) => `- ${k.nazev}${k.autor ? ` — ${k.autor}` : ''}${k.rok ? `, ${k.rok}` : ''}${k.jazyk ? ` [${k.jazyk}]` : ''}`
    + ` — ${jeCitelny(k.stav) ? 'zpracovaná' : `stav: ${k.stav}`}${k.stran_celkem ? `, ${k.stran_celkem} stran` : ''}${poznamkaVydani(k.id, novejsi)} — kniha_id=${k.id}`).join('\n');
}

/** Nástroje pro chatbota: stránky knih jako search_result (citace), ostatní jako text konektoru. */
export function zavolejNastrojChat(db: Db, kdo: Pripojeny) {
  const textove = zavolejNastroj(db, kdo);
  return async (jmeno: string, args: Record<string, unknown>): Promise<VysledekChatu> => {
    if (jmeno === 'hledej_v_knihach') return hledejBloky(db, args);
    if (jmeno === 'precti_stranu') return prectiBloky(db, args);
    return { text: await textove(jmeno, args) };
  };
}

export function zavolejNastroj(db: Db, kdo: Pripojeny) {
  return (jmeno: string, args: Record<string, unknown>): Promise<string> => {
    if (jmeno === 'hledej_zkusenosti') return hledejZkusenosti(db, args);
    if (jmeno === 'web_zdroje') return webZdroje(db, args);
    if (jmeno === 'uloz_web_zdroj') return ulozWebZdroj(db, args, kdo);
    if (jmeno === 'problemy') return problemy(db, args);
    if (jmeno === 'zaloz_problem') return zalozProblem(db, args, kdo);
    if (jmeno === 'zapis_zjisteni') return zapisZjisteni(db, args, kdo);
    if (jmeno === 'zapis_varku') return zapisVarku(db, args, kdo);
    if (jmeno === 'dopln_varku') return doplnVarku(db, args, kdo);
    if (jmeno === 'zapis_zkusenost') return zapisZkusenost(db, args, kdo);
    if (jmeno === 'hledej_v_knihach') return hledej(db, args);
    if (jmeno === 'precti_stranu') return prectiStranu(db, args);
    if (jmeno === 'prehled_tematu') return prehledTematu(db, args);
    if (jmeno === 'profil_pivovaru') return profilPivovaru(db, args);
    if (jmeno === 'seznam_varek') return seznamVarek(db, args);
    if (jmeno === 'porovnej_varky') return porovnejVarkyNastroj(db, args);
    if (jmeno === 'vypocet') {
      try {
        return Promise.resolve(vypocetText(args));
      } catch (e) {
        if (e instanceof ChybaVypoctu) return Promise.reject(new ChybaNastroje(e.message));
        return Promise.reject(e);
      }
    }
    return seznamKnih(db);
  };
}
