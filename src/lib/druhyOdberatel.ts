// 🔍 Odhad jména DRUHÉHO odběratele z textu WhatsApp zprávy, která
// popisuje víc odběratelů najednou — např.
//   "Chmeloun\n4x30l 12sv\n\nSluhy\n10x30l desitka"
// Jméno na první řádce bloku odděleného prázdným řádkem, kterej ještě není
// ten první (už známý) odběratel a nevypadá jako položka (obsahuje číslo).
//
// Je to jen NÁVRH pro SplitOrderModal (z provozu 15. 9. 2026: „rovnou tam
// přidej toho odběratele, pokud ve zprávě byl") — obsluha ho může přepsat
// nebo smazat, nic se tím nezakládá samo.
const bezDiakritiky = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Vypadá řádek spíš jako položka (množství/obal), než jako jméno odběratele? */
function vypadaJakoPolozka(radek: string): boolean {
  return /\d/.test(radek);
}

export function uhodniDruhehoOdberatele(
  text: string | null | undefined,
  prvniOdberatel: string | null | undefined,
): string | null {
  if (!text) return null;
  const bloky = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (bloky.length < 2) return null;

  const prvniNorm = bezDiakritiky(prvniOdberatel || '');
  for (const blok of bloky) {
    const prvniRadek = blok.split('\n')[0]?.trim();
    if (!prvniRadek) continue;
    if (prvniRadek.length < 2 || prvniRadek.length > 40) continue;
    if (vypadaJakoPolozka(prvniRadek)) continue;
    if (prvniNorm && bezDiakritiky(prvniRadek) === prvniNorm) continue;
    return prvniRadek;
  }
  return null;
}
