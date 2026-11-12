// 💬 AI sládek — chatbot Pivovarské bible (etapa 5), klient appky.
// ---------------------------------------------------------------------------
// Majitel 11. 11. 2026: „má to být chatbot, který mi bude vyhledávat problémy".
// Otázka jde do edge funkce bible-chat projektu bible; odpověď přichází po
// řádcích (NDJSON): co Claude právě hledá, průběžný text a nakonec hotová
// odpověď s citacemi [n] na stránky knih. Konverzace, útrata a strop jdou přes
// bible-api. Nic z toho se neukládá do telefonu (R4) — jen v paměti obrazovky.
import { BIBLE_URL, chybaBible, tokenPrihlaseni, volejBibli, type ChybaBible } from './bibleKlient';

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

export type KrokOdpovedi = { nastroj: string; popis: string; chyba: boolean };

export type ZpravaChatu = {
  id: string;
  role: 'uzivatel' | 'asistent';
  text: string;
  kroky: KrokOdpovedi[];
  citace: ZdrojOdpovedi[];
  model: string | null;
  cenaUsd: number;
  neuplna: boolean;
  vytvoreno: string | null;
};

export type Konverzace = { id: string; nazev: string; problemId: string | null; upraveno: string | null; zprav: number };

export type StavChatu = {
  migrace: boolean;
  /** Má chatbot klíč k Claude API (secret projektu bible)? */
  klic: boolean;
  utracenoUsd: number;
  chatUsd: number;
  chatDotazu: number;
  stropUsd: number;
  model: string | null;
};

export type UdalostChatu =
  | { typ: 'start'; konverzaceId: string }
  | { typ: 'premysli'; kolo: number }
  | { typ: 'krok'; popis: string }
  | { typ: 'text'; text: string }
  | { typ: 'mezikrok' }
  | {
    typ: 'hotovo'; konverzaceId: string; zpravaId: string | null; text: string; citace: ZdrojOdpovedi[]; kroky: KrokOdpovedi[];
    neuplna: boolean; model: string | null; cenaUsd: number; utracenoUsd: number; stropUsd: number;
    /** Kód chyby Claude API, když odpověď nedoběhla (např. „kredit"); jinak null. */
    chybaKod: string | null;
  }
  | { typ: 'chyba'; kod: string; zprava: string; konverzaceId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const id = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null);
const cislo = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Zdroj citace z dat funkce — kniha (id + list), nebo webová adresa jen http(s). */
export function zdrojZDat(v: unknown): ZdrojOdpovedi | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.n !== 'number' || !Number.isInteger(o.n) || o.n < 1) return null;
  const web = o.zdroj === 'web';
  const url = web && typeof o.url === 'string' && /^https?:\/\//i.test(o.url) ? o.url : null;
  const dokumentId = web ? null : id(o.dokumentId);
  const pdfIndex = web ? null : typeof o.pdfIndex === 'number' && Number.isInteger(o.pdfIndex) && o.pdfIndex >= 1 ? o.pdfIndex : null;
  if (web ? !url : !dokumentId || pdfIndex === null) return null;
  return {
    n: o.n, dokumentId, pdfIndex, nazev: text(o.nazev) || (web ? (url ?? 'Web') : 'Kniha'), tistena: text(o.tistena), kapitola: text(o.kapitola),
    zdroj: web ? 'web' : o.zdroj === 'preklad' ? 'preklad' : 'original', url, citat: text(o.citat) ?? '',
  };
}

const zdrojeZDat = (v: unknown): ZdrojOdpovedi[] => (Array.isArray(v) ? v.map(zdrojZDat).filter((z): z is ZdrojOdpovedi => z !== null) : []);
const krokyZDat = (v: unknown): KrokOdpovedi[] => (Array.isArray(v) ? v : [])
  .map((k) => (k ?? {}) as Record<string, unknown>)
  .filter((k) => typeof k.popis === 'string')
  .map((k) => ({ nastroj: text(k.nastroj) ?? '', popis: String(k.popis), chyba: k.chyba === true }));

export function zpravaZDat(v: unknown): ZpravaChatu | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const zid = id(o.id);
  if (!zid || (o.role !== 'uzivatel' && o.role !== 'asistent') || typeof o.text !== 'string') return null;
  return {
    id: zid, role: o.role, text: o.text, kroky: krokyZDat(o.kroky), citace: zdrojeZDat(o.citace), model: text(o.model),
    cenaUsd: cislo(o.cena_usd), neuplna: o.neuplna === true, vytvoreno: text(o.created_at),
  };
}

/** Jeden řádek odpovědi bible-chat → událost (neznámý nebo vadný řádek = null). */
export function udalostZRadku(radek: string): UdalostChatu | null {
  let o: Record<string, unknown>;
  try {
    const j = JSON.parse(radek) as unknown;
    if (!j || typeof j !== 'object') return null;
    o = j as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (o.typ) {
    case 'start': return id(o.konverzace_id) ? { typ: 'start', konverzaceId: o.konverzace_id as string } : null;
    case 'premysli': return { typ: 'premysli', kolo: cislo(o.kolo) };
    case 'krok': return typeof o.popis === 'string' ? { typ: 'krok', popis: o.popis } : null;
    case 'text': return typeof o.text === 'string' ? { typ: 'text', text: o.text } : null;
    case 'mezikrok': return { typ: 'mezikrok' };
    case 'hotovo': {
      const kid = id(o.konverzace_id);
      if (!kid || typeof o.text !== 'string') return null;
      return {
        typ: 'hotovo', konverzaceId: kid, zpravaId: id(o.zprava_id), text: o.text, citace: zdrojeZDat(o.citace), kroky: krokyZDat(o.kroky),
        neuplna: o.neuplna === true, model: text(o.model), cenaUsd: cislo(o.cena_usd), utracenoUsd: cislo(o.utraceno_usd), stropUsd: cislo(o.strop_usd),
        chybaKod: text(o.chyba),
      };
    }
    case 'chyba':
      return { typ: 'chyba', kod: text(o.kod) ?? 'chyba', zprava: text(o.zprava) ?? 'Něco se pokazilo. Zkus to znovu.', konverzaceId: id(o.konverzace_id) };
    default: return null;
  }
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const SIT = 'Spojení se přerušilo. Zkus to znovu, až bude signál.';

/**
 * Položí otázku AI sládkovi. Události (kroky, průběžný text, hotová odpověď)
 * chodí do `naUdalost`. Chyba před začátkem odpovědi (strop, chybí klíč,
 * přihlášení…) se vrátí jako { ok: false } s českou zprávou.
 */
export async function zeptejSe(
  p: { otazka: string; konverzaceId?: string | null; problemId?: string | null; web?: boolean },
  naUdalost: (u: UdalostChatu) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; chyba: ChybaBible }> {
  const prihlaseni = await tokenPrihlaseni();
  if ('chyba' in prihlaseni) {
    return prihlaseni.chyba === 'sit' ? chybaBible('sit', SIT) : chybaBible('neprihlasen', 'Přihlášení vypršelo. Obnov stránku a přihlas se znovu.', 401);
  }
  let odpoved: Response;
  try {
    // Bez časového limitu: odpověď s hledáním v knihách trvá až dvě minuty.
    odpoved = await fetch(`${BIBLE_URL}/functions/v1/bible-chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${prihlaseni.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otazka: p.otazka, konverzace_id: p.konverzaceId ?? null, problem_id: p.problemId ?? null, web: p.web === true }),
      signal,
    });
  } catch {
    if (signal?.aborted) return chybaBible('zruseno', 'Zrušeno.');
    return offline() ? chybaBible('sit', SIT) : chybaBible('nedostupna', 'AI sládek neodpovídá — funkce ještě není nasazená, nebo má Supabase výpadek.');
  }
  if (!odpoved.ok || !(odpoved.headers.get('Content-Type') ?? '').includes('ndjson')) {
    let j: Record<string, unknown> = {};
    try { j = ((await odpoved.json()) ?? {}) as Record<string, unknown>; } catch { j = {}; }
    if (typeof j.kod === 'string' && typeof j.zprava === 'string') return chybaBible(j.kod, j.zprava, odpoved.status);
    if (odpoved.status === 404) return chybaBible('nenasazeno', 'AI sládek se právě nasazuje — zkus to za pár minut.', 404);
    return chybaBible('chyba', `AI sládek vrátil chybu (HTTP ${odpoved.status}).`, odpoved.status);
  }
  const ctecka = odpoved.body?.getReader();
  if (!ctecka) return chybaBible('chyba', 'Odpověď AI sládka nejde číst.');
  const dekoder = new TextDecoder();
  let zbytek = '';
  let konec = false;
  const zpracuj = (radek: string) => {
    if (!radek.trim()) return;
    const u = udalostZRadku(radek.trim());
    if (!u) return;
    if (u.typ === 'hotovo' || u.typ === 'chyba') konec = true;
    naUdalost(u);
  };
  try {
    for (;;) {
      const { value, done } = await ctecka.read();
      if (done) break;
      zbytek += dekoder.decode(value, { stream: true });
      let i = zbytek.indexOf('\n');
      while (i >= 0) {
        zpracuj(zbytek.slice(0, i));
        zbytek = zbytek.slice(i + 1);
        i = zbytek.indexOf('\n');
      }
    }
    zpracuj(zbytek + dekoder.decode());
  } catch {
    if (signal?.aborted) return chybaBible('zruseno', 'Zrušeno.');
    return chybaBible('sit', 'Spojení se přerušilo uprostřed odpovědi. Odpověď se dopočítá a uloží — za chvíli ji najdeš v historii.');
  }
  if (!konec) return chybaBible('preruseno', 'Odpověď se nedokončila (spojení nebo časový limit). Jakmile se uloží, najdeš ji v historii.');
  return { ok: true };
}

const NENASAZENO = 'AI sládek se právě nasazuje — zkus to za pár minut.';
const jeNenasazeno = (ch: ChybaBible) => ch.kod === 'nenasazeno' || (ch.kod === 'neplatny_vstup' && ch.zprava === 'Neznámá akce.');

export type Odpoved<T> = { stav: 'ok'; data: T } | { stav: 'chyba'; kod: string; zprava: string };

async function api<T>(telo: Record<string, unknown>, prevod: (d: Record<string, unknown>) => T): Promise<Odpoved<T>> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (!r.ok) return { stav: 'chyba', kod: jeNenasazeno(r.chyba) ? 'nenasazeno' : r.chyba.kod, zprava: jeNenasazeno(r.chyba) ? NENASAZENO : r.chyba.zprava };
  return { stav: 'ok', data: prevod((r.data ?? {}) as Record<string, unknown>) };
}

export const nactiStavChatu = (): Promise<Odpoved<StavChatu>> => api({ akce: 'chat_stav' }, (d) => ({
  migrace: d.migrace === true, klic: d.klic === true, utracenoUsd: cislo(d.utraceno_usd), chatUsd: cislo(d.chat_usd),
  chatDotazu: cislo(d.chat_dotazu), stropUsd: cislo(d.strop_usd), model: text(d.model),
}));

export const nactiKonverzace = (): Promise<Odpoved<Konverzace[]>> => api({ akce: 'konverzace' }, (d) => (Array.isArray(d.konverzace) ? d.konverzace : [])
  .map((k) => (k ?? {}) as Record<string, unknown>)
  .filter((k) => id(k.id) && typeof k.nazev === 'string')
  .map((k) => ({ id: k.id as string, nazev: k.nazev as string, problemId: id(k.problem_id), upraveno: text(k.upraveno_at), zprav: cislo(k.zprav) })));

export const nactiKonverzaci = (konverzaceId: string): Promise<Odpoved<{ id: string; nazev: string; problemId: string | null; zpravy: ZpravaChatu[] }>> =>
  api({ akce: 'konverzace_detail', id: konverzaceId }, (d) => {
    const k = (d.konverzace ?? {}) as Record<string, unknown>;
    return {
      id: id(k.id) ?? konverzaceId, nazev: text(k.nazev) ?? 'Konverzace', problemId: id(k.problem_id),
      zpravy: (Array.isArray(d.zpravy) ? d.zpravy : []).map(zpravaZDat).filter((z): z is ZpravaChatu => z !== null),
    };
  });

export const smazKonverzaci = (konverzaceId: string): Promise<Odpoved<boolean>> =>
  api({ akce: 'konverzace_smazat', id: konverzaceId }, (d) => d.smazano === true);

export const nastavStrop = (usd: number): Promise<Odpoved<number>> =>
  api({ akce: 'strop_nastavit', usd }, (d) => cislo(d.strop_usd));

/** „1,23 USD" (pod dolar na tři místa). */
export const usdText = (n: number) => `${n.toFixed(n < 1 ? 3 : 2).replace('.', ',')} USD`;
