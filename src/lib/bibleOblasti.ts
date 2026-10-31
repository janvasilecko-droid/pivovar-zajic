// 📚 Tematické oblasti Pivovarské bible (A–T) — přesně podle zadání majitele
// z 30. 10. 2026, bod 3 „Odborné tematické knihovny". Písmeno se ukládá
// u dokumentu (bible_dokumenty.oblasti) a později u pasáží; databáze přijme
// jen tahle písmena (CHECK v bible/supabase/migrations/20261101000000_bible_zaklad.sql).

export type BibleOblast = { kod: string; nazev: string };

export const BIBLE_OBLASTI: readonly BibleOblast[] = [
  { kod: 'A', nazev: 'Sladařství a suroviny' },
  { kod: 'B', nazev: 'Chemie a úprava vody' },
  { kod: 'C', nazev: 'Šrotování a příprava sladu' },
  { kod: 'D', nazev: 'Rmutování a enzymatické procesy' },
  { kod: 'E', nazev: 'Scezování a vyslazování' },
  { kod: 'F', nazev: 'Chmelovar' },
  { kod: 'G', nazev: 'Chlazení mladiny' },
  { kod: 'H', nazev: 'Kvašení a kvasinky' },
  { kod: 'I', nazev: 'Zrání a ležení' },
  { kod: 'J', nazev: 'Filtrace a stabilizace' },
  { kod: 'K', nazev: 'Stáčení a balení' },
  { kod: 'L', nazev: 'CIP, sanitace a hygiena' },
  { kod: 'M', nazev: 'Mikrobiologie' },
  { kod: 'N', nazev: 'Laboratorní analýzy' },
  { kod: 'O', nazev: 'Pivovarská zařízení a konstrukce' },
  { kod: 'P', nazev: 'Čerpadla, potrubí a hydraulika' },
  { kod: 'Q', nazev: 'Automatizace a řízení' },
  { kod: 'R', nazev: 'Energetika a tepelná technika' },
  { kod: 'S', nazev: 'Ekonomika pivovaru' },
  { kod: 'T', nazev: 'Řešení technologických problémů' },
];

const PODLE_KODU = new Map(BIBLE_OBLASTI.map((o) => [o.kod, o]));

export function nazevOblasti(kod: string): string {
  return PODLE_KODU.get(kod)?.nazev ?? kod;
}

/** Jen platná písmena, bez opakování, v abecedním pořadí (jak je chce databáze). */
export function platneOblasti(kody: readonly string[]): string[] {
  return [...new Set(kody.map((k) => k.trim().toUpperCase()))].filter((k) => PODLE_KODU.has(k)).sort();
}
