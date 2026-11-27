/**
 * Kdo drží data v paměti (lib/sdilenaData.ts), potřebuje vědět, kdy už
 * neplatí. Tenhle modul je jen „nástěnka" bez závislostí: supabase.ts sem
 * hlásí zápisy a realtime události, sdilenaData.ts si je čte. Zvlášť proto,
 * aby se supabase.ts a sdilenaData.ts nemusely importovat navzájem.
 */

const verze = new Map<string, number>();
let verzeVseho = 0;

/** Aktuální „verze" tabulky — změní se při každém zneplatnění. */
export function verzeTabulky(tabulka: string): string {
  return `${verzeVseho}:${verze.get(tabulka) ?? 0}`;
}

/**
 * Tabulky načítané VNOŘENĚ v jiné (akce + akce_items v jednom dotazu):
 * změna vnořené tabulky musí zneplatnit i tu nadřazenou.
 */
export const NADRAZENE: Record<string, string[]> = {
  akce_items: ['akce'],
  // Týdenní inventura se do skladové knihy dostává jako řádky `inventory`
  // (sdilenaData.ts → tydenniJakoInventura).
  tydenni_inventura: ['inventory'],
};

/**
 * Kdo chce vědět HNED, že se tabulka změnila (kopie pro práci bez signálu — lib/offlineKopie.ts — si ji stáhne
 * znovu). `null` = nevíme která, tedy všechny. Posluchač nesmí nic shodit: zneplatnění se volá uprostřed zápisů.
 *
 * Posluchači se dozvědí jen o SKUTEČNÝCH změnách (vlastní zápis, cizí zápis přes realtime). Zneplatnění „pro
 * jistotu" (minutová pojistka obrazovek, návrat do appky, obnovené spojení) jim nechodí — kopie by se jinak
 * stahovala každou minutu znovu, i když se nic nezměnilo, a zbytečně jedla mobilní data.
 */
type Posluchac = (tabulka: string | null) => void;
const posluchaci = new Set<Posluchac>();

/** Přihlásí posluchače změn; vrací funkci, která ho odhlásí. */
export function priZneplatneni(posluchac: Posluchac): () => void {
  posluchaci.add(posluchac);
  return () => { posluchaci.delete(posluchac); };
}

function oznam(tabulka: string | null): void {
  posluchaci.forEach((p) => { try { p(tabulka); } catch { /* posluchač nesmí rozbít zápis */ } });
}

/**
 * Data tabulky se změnila (vlastní zápis, cizí zápis přes realtime…). `zmena = false`: jen pro jistotu —
 * paměť se zahodí, ale posluchačům změn se nic neříká.
 */
export function zneplatniTabulku(tabulka: string, zmena: boolean = true): void {
  for (const t of [tabulka, ...(NADRAZENE[tabulka] ?? [])]) {
    verze.set(t, (verze.get(t) ?? 0) + 1);
  }
  if (zmena) oznam(tabulka);
}

/** Nevíme, co se změnilo (RPC, edge funkce, návrat do appky…) — všechno. `zmena` jako u `zneplatniTabulku`. */
export function zneplatniVse(zmena: boolean = true): void {
  verzeVseho++;
  if (zmena) oznam(null);
}

/** Tabulka se změnila a paměť si už zahodil ten, kdo to zjistil — jen dát vědět posluchačům. */
export function ohlasZmenuTabulky(tabulka: string): void {
  oznam(tabulka);
}
