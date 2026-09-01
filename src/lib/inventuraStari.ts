// 📅 Jak dávno se dělala inventura.
// ---------------------------------------------------------------------------
// Nikde nesvítilo, že se inventura dlouho nedělala — člověk to zjistil, až
// když čísla nesedla. Přesně z toho vznikl schodek přes dva tisíce kusů
// v srpnu 2026: srpen nebyl uzavřený a sklad se tiše propadal dál.
//
// Tichý schodek roste právě z tohohle a čím dřív je vidět, tím míň se ho
// nasčítá.

/** Po kolika dnech se inventura začne připomínat. Dělá se měsíčně. */
export const PRIPOMENOUT_PO_DNECH = 40;
/** Kdy už je to naléhavé. */
export const NALEHAVE_PO_DNECH = 60;

export type StariInventury = {
  /** Datum poslední napočítané inventury (YYYY-MM-DD), null = žádná není. */
  posledni: string | null;
  /** Kolik dní od ní uplynulo; null když žádná není. */
  dni: number | null;
  /** Má se to připomenout? */
  pripomenout: boolean;
  /** Je to naléhavé (dvojnásobek běžného intervalu)? */
  naléhavé: boolean;
};

/** Řádek inventury tak, jak ho vrací databáze. */
export type InventurniRadek = { entry_date: string; note?: string | null };

/** Napočítaný stav, ne převedený počáteční — ten se dělá automaticky. */
function jeNapocitana(note: string | null | undefined): boolean {
  const n = (note || '').toLowerCase();
  return n.includes('fyzick') || n.includes('schválen') || n.includes('schvalen');
}

/**
 * Kdy se naposledy dělala SKUTEČNÁ inventura a jestli je načase další.
 *
 * Počítají se jen napočítané inventury (fyzická / schválená). „Počáteční
 * stav" se převádí automaticky z minulého měsíce, takže by upozornění umlčel,
 * aniž by někdo cokoli spočítal.
 */
export function stariInventury(
  radky: InventurniRadek[],
  dnesISO: string,
  pripomenoutPoDnech: number = PRIPOMENOUT_PO_DNECH,
): StariInventury {
  let posledni: string | null = null;
  for (const r of radky) {
    if (!r.entry_date || !jeNapocitana(r.note)) continue;
    const d = r.entry_date.slice(0, 10);
    if (!posledni || d > posledni) posledni = d;
  }

  if (!posledni) {
    // Žádná inventura vůbec — připomenout, ale ne jako "naléhavé": u čerstvě
    // rozjeté evidence je to normální stav, ne zanedbání.
    return { posledni: null, dni: null, pripomenout: true, naléhavé: false };
  }

  const a = Date.parse(`${posledni}T00:00:00Z`);
  const b = Date.parse(`${dnesISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { posledni, dni: null, pripomenout: false, naléhavé: false };
  }
  const dni = Math.round((b - a) / 86400000);
  return {
    posledni,
    dni,
    pripomenout: dni >= pripomenoutPoDnech,
    naléhavé: dni >= NALEHAVE_PO_DNECH,
  };
}
