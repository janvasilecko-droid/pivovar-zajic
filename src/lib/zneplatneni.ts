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
};

/** Data tabulky se změnila (vlastní zápis, cizí zápis přes realtime…). */
export function zneplatniTabulku(tabulka: string): void {
  for (const t of [tabulka, ...(NADRAZENE[tabulka] ?? [])]) {
    verze.set(t, (verze.get(t) ?? 0) + 1);
  }
}

/** Nevíme, co se změnilo (RPC, edge funkce, návrat do appky…) — všechno. */
export function zneplatniVse(): void {
  verzeVseho++;
}
