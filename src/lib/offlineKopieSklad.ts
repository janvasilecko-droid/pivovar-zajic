// 📴 Kopie provozních tabulek v telefonu — úložiště (IndexedDB + paměť).
// ---------------------------------------------------------------------------
// Majitel 27. 11. 2026: „offline si to má držet aspoň objednávky na daný týden, závozy, stáčení, sklad aktuální."
//
// Tady se kopie jen UKLÁDÁ a ČTE. Stahuje ji lib/offlineKopie.ts (se signálem, na pozadí) a bez signálu z ní
// odpovídá lib/supabase.ts přes lib/offlineDotaz.ts. Modul schválně neimportuje klienta Supabase — supabase.ts
// ho potřebuje při odpovídání a kruhová závislost by rozbila start aplikace.
//
// Pravidla, na kterých stojí správnost:
//  • Do kopie zapisuje JEN stahování celých tabulek (celé řádky ze serveru). Nikdy se do ní nepřimíchávají
//    odpovědi na běžné dotazy obrazovek — ty nesou jen část sloupců a přejmenované sloupce by přepsaly skutečné.
//  • Kopie patří uživateli, který ji stáhl (vidí jen to, co mu databáze dovolí). Jiný přihlášený účet z ní
//    nedostane nic, dokud si nestáhne vlastní; při odhlášení se maže.
//  • Když úložiště v telefonu nejde (soukromé okno, plný disk), nic nespadne — kopie prostě není a appka se
//    chová jako dřív.
import type { Radek } from './offlineDotaz';
import { nactiJson, smaz, ulozJson } from './uloziste';

const DB_NAME = 'pivovar-kopie';
const DB_VERSION = 1;
const STORE = 'tabulky';
/** Souhrn pro obrazovku (kdy a co se stáhlo) — v localStorage, ať je k dispozici hned bez čekání na IndexedDB. */
export const KLIC_STAVU_KOPIE = 'pivovar_offline_kopie_stav_v1';
/** Událost okna: kopie se změnila (stáhla se, smazala se). */
export const UDALOST_KOPIE = 'pivovar:offline-kopie';

export type KopieTabulky = {
  /** Celé řádky tabulky tak, jak je vrátil server. */
  rows: Radek[];
  /** Kdy se stahování téhle tabulky ZAČALO (ms). Zápisy po tomhle čase v kopii být nemusí. */
  t: number;
  /** Komu kopie patří (id přihlášeného uživatele). */
  uzivatel: string;
};

export type StavKopie = {
  /** Kdy se naposledy povedlo stáhnout VŠECHNY tabulky (ms), nebo null. */
  uplneT: number | null;
  /** Kdy se naposledy povedlo stáhnout aspoň něco (ms), nebo null. */
  posledniT: number | null;
  uzivatel: string | null;
  /** Kolik tabulek kopie drží a kolik řádků dohromady. */
  tabulek: number;
  radku: number;
  /** Tabulky, které se při posledním pokusu nestáhly (zůstala starší kopie, nebo žádná). */
  nestazene: string[];
};

const PRAZDNY_STAV: StavKopie = { uplneT: null, posledniT: null, uzivatel: null, tabulek: 0, radku: 0, nestazene: [] };

let dbPromise: Promise<IDBDatabase | null> | null = null;
function otevri(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function transakce<T>(rezim: IDBTransactionMode, prace: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return otevri().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const t = db.transaction(STORE, rezim);
        const req = prace(t.objectStore(STORE));
        let vysledek: T | null = null;
        req.onsuccess = () => { vysledek = (req.result as T) ?? null; if (rezim === 'readonly') resolve(vysledek); };
        req.onerror = () => resolve(null);
        // Zápis je hotový až s koncem transakce — dřív by „uloženo" mohlo předběhnout disk.
        if (rezim !== 'readonly') {
          t.oncomplete = () => resolve(vysledek);
          t.onerror = () => resolve(null);
          t.onabort = () => resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

/** Paměť: tabulka → kopie, nebo null = v úložišti není. Čte se z IndexedDB jen jednou. */
const pamet = new Map<string, KopieTabulky | null>();
let uzivatelKopie: string | null = null;

const jeKopie = (v: unknown): v is KopieTabulky =>
  !!v && typeof v === 'object' && Array.isArray((v as KopieTabulky).rows)
  && typeof (v as KopieTabulky).t === 'number' && typeof (v as KopieTabulky).uzivatel === 'string';

/**
 * Kdo je teď přihlášený (nastavuje přihlášení v lib/auth.tsx). Bez něj se z kopie neodpovídá:
 * kopie patří konkrétnímu účtu.
 */
export function nastavUzivateleKopie(uzivatel: string | null): void {
  uzivatelKopie = uzivatel;
}
export function uzivatelKopieTed(): string | null {
  return uzivatelKopie;
}

/** Kopie tabulky pro přihlášeného uživatele, nebo null (není, nebo patří jinému účtu). */
export async function nactiKopii(tabulka: string): Promise<KopieTabulky | null> {
  if (!uzivatelKopie) return null;
  let k = pamet.get(tabulka);
  if (k === undefined) {
    const ulozena = await transakce<unknown>('readonly', (s) => s.get(tabulka));
    k = jeKopie(ulozena) ? ulozena : null;
    // Mezitím mohla doběhnout čerstvější kopie ze stahování — ta má přednost.
    if (pamet.get(tabulka) === undefined) pamet.set(tabulka, k);
    else k = pamet.get(tabulka) ?? null;
  }
  return k && k.uzivatel === uzivatelKopie ? k : null;
}

/** Uloží čerstvě staženou tabulku (do paměti hned, na disk na pozadí). Vrací, jestli se povedl zápis na disk. */
export async function ulozKopii(tabulka: string, kopie: KopieTabulky): Promise<boolean> {
  pamet.set(tabulka, kopie);
  const ok = await transakce<IDBValidKey>('readwrite', (s) => s.put(kopie, tabulka));
  return ok !== null;
}

/** Smaže celou kopii (odhlášení, „vymazat data v telefonu"). */
export async function smazKopie(): Promise<void> {
  pamet.clear();
  smaz(KLIC_STAVU_KOPIE);
  await transakce<undefined>('readwrite', (s) => s.clear());
  oznamZmenuKopie();
}

export function stavKopie(): StavKopie {
  const s = nactiJson<Partial<StavKopie> | null>(KLIC_STAVU_KOPIE, null);
  if (!s || typeof s !== 'object') return { ...PRAZDNY_STAV };
  return {
    uplneT: typeof s.uplneT === 'number' ? s.uplneT : null,
    posledniT: typeof s.posledniT === 'number' ? s.posledniT : null,
    uzivatel: typeof s.uzivatel === 'string' ? s.uzivatel : null,
    tabulek: typeof s.tabulek === 'number' ? s.tabulek : 0,
    radku: typeof s.radku === 'number' ? s.radku : 0,
    nestazene: Array.isArray(s.nestazene) ? s.nestazene.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function ulozStavKopie(stav: StavKopie): void {
  ulozJson(KLIC_STAVU_KOPIE, stav);
  oznamZmenuKopie();
}

function oznamZmenuKopie(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(UDALOST_KOPIE));
  } catch { /* starý prohlížeč bez konstruktoru Event — obrazovka si stav přečte při dalším vykreslení */ }
}

/** „dnes 10:42" / „včera 18:05" / „25. 11. 7:30" — pro pruh „bez signálu" a Nastavení. */
export function popisCasuKopie(t: number | null, ted: number = Date.now()): string | null {
  if (t === null || !Number.isFinite(t)) return null;
  const d = new Date(t);
  const n = new Date(ted);
  const cas = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const pulnoc = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dni = Math.round((pulnoc(n) - pulnoc(d)) / 86_400_000);
  if (dni === 0) return `dnes ${cas}`;
  if (dni === 1) return `včera ${cas}`;
  return `${d.getDate()}. ${d.getMonth() + 1}. ${cas}`;
}

/** Věta do pruhu „data nejsou ze serveru": jak stará je kopie dat v telefonu — nebo že tam ještě není a co s tím. */
export function vetaOKopii(stav: Pick<StavKopie, 'uplneT' | 'posledniT'>, ted: number = Date.now()): string {
  const cas = popisCasuKopie(stav.uplneT ?? stav.posledniT, ted);
  return cas
    ? `Kopie dat v telefonu: ${cas}.`
    : 'V telefonu zatím není kopie dat — otevři aplikaci jednou se signálem a nech ji chvíli otevřenou.';
}

/** Jen pro testy: zapomene paměť i otevřenou databázi. */
export function zapomenKopiiProTesty(): void {
  pamet.clear();
  uzivatelKopie = null;
  dbPromise = null;
}
