// 📅 Za které měsíce chybí inventura.
// ---------------------------------------------------------------------------
// Nikde nesvítilo, že se inventura dlouho nedělala — člověk to zjistil, až
// když čísla nesedla. Přesně z toho vznikl schodek přes dva tisíce kusů
// v srpnu 2026: srpen nebyl uzavřený a sklad se tiše propadal dál.
//
// POZOR na datum: inventura ZA červenec je uložená na 2026-07-01, tedy na
// PRVNÍ den měsíce, který pokrývá — ne na den, kdy ji někdo napočítal (ta
// červencová vznikla 5. 8.). Počítat stáří ve dnech od entry_date proto
// nedává smysl: inventura zadaná naprosto včas vypadá hned v den zadání jako
// měsíc stará. Počítáme tedy MĚSÍCE, které nejsou uzavřené — a přesně tak o
// tom uvažuje i obsluha („když se udělá 31. 8., tak je to za 8. měsíc").

/** Od kolika neuzavřených měsíců je to naléhavé. */
export const NALEHAVE_OD_MESICU = 2;

/** Pojistka proti nekonečnému výčtu, kdyby v datech byl prehistorický záznam. */
const MAX_MESICU = 24;

export type StariInventury = {
  /** Poslední napočítaný měsíc ve tvaru YYYY-MM, null = žádný není. */
  posledniMesic: string | null;
  /** Měsíce (YYYY-MM) bez inventury, od nejstaršího. Běžící měsíc se nepočítá. */
  chybejiciMesice: string[];
  /** Má se to připomenout? */
  pripomenout: boolean;
  /** Je to naléhavé? */
  naléhavé: boolean;
};

/** Řádek inventury tak, jak ho vrací databáze. */
export type InventurniRadek = { entry_date: string; note?: string | null };

/**
 * Napočítaný stav, ne převedený počáteční.
 *
 * „Počáteční stav" na 1. 8. je kopie červencové inventury — stejných 19 řádků,
 * stejných 321 kusů. Kdyby se počítal jako inventura za srpen, tvrdil by, že
 * srpen je uzavřený, aniž by kdokoli cokoli spočítal. Právě tím schodek roste.
 */
function jeNapocitana(note: string | null | undefined): boolean {
  const n = (note || '').toLowerCase();
  if (n.includes('počáteční') || n.includes('pocatecni')) return false;
  return n.includes('fyzick') || n.includes('schválen') || n.includes('schvalen');
}

/** Následující měsíc: '2026-07' → '2026-08'. */
function dalsiMesic(klic: string): string {
  const [y, m] = klic.split('-').map(Number);
  return m >= 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Které měsíce nemají inventuru a jestli je načase.
 *
 * Běžící měsíc se nepočítá — ten se dá uzavřít, až skončí. V polovině srpna
 * s poslední inventurou za červenec je tedy ticho; ozve se 1. 9., kdy je srpen
 * za námi a nikdo ho nespočítal.
 */
export function stariInventury(radky: InventurniRadek[], dnesISO: string): StariInventury {
  let posledniMesic: string | null = null;
  for (const r of radky) {
    if (!r.entry_date || !jeNapocitana(r.note)) continue;
    const k = r.entry_date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    if (!posledniMesic || k > posledniMesic) posledniMesic = k;
  }

  const bezici = dnesISO.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(bezici)) {
    return { posledniMesic, chybejiciMesice: [], pripomenout: false, naléhavé: false };
  }

  if (!posledniMesic) {
    // Žádná inventura vůbec — připomenout, ale ne jako naléhavé: u čerstvě
    // rozjeté evidence je to normální stav, ne zanedbání.
    return { posledniMesic: null, chybejiciMesice: [], pripomenout: true, naléhavé: false };
  }

  const chybejiciMesice: string[] = [];
  let m = dalsiMesic(posledniMesic);
  while (m < bezici && chybejiciMesice.length < MAX_MESICU) {
    chybejiciMesice.push(m);
    m = dalsiMesic(m);
  }

  return {
    posledniMesic,
    chybejiciMesice,
    pripomenout: chybejiciMesice.length > 0,
    naléhavé: chybejiciMesice.length >= NALEHAVE_OD_MESICU,
  };
}
