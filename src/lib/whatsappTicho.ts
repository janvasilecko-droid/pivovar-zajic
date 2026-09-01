// 📵 Přestaly chodit WhatsApp zprávy?
// ---------------------------------------------------------------------------
// Zprávy do aplikace posílá Tasker z telefonu. Když přestane (restart telefonu,
// odebraná oprávnění, vypnutá aplikace na pozadí), webhook nedostane nic a
// v appce to vypadá úplně normálně — odznak jen zamrzne na starém čísle.
// Přesně to se stalo 1. 9. 2026: odznak ukazoval 5, ale posledních 22 hodin
// nedorazilo nic a dvě odeslané objednávky se do aplikace vůbec nedostaly.
//
// Tichý výpadek příjmu objednávek je drahý, takže se hlásí. Pozor ale na plané
// poplachy: přes víkend se nepíše a v pondělí ráno je ticho normální. Počítají
// se proto jen PRACOVNÍ hodiny (po–pá, 7:00–20:00) a práh je nastavený
// benevolentně — radši ohlásit později než každé pondělí.

/** Od kolika pracovních hodin ticha se ozvat. Zhruba dva pracovní dny. */
export const TICHO_HODIN = 24;

const OD_HODINY = 7;
const DO_HODINY = 20;

/** Pracovní hodiny (po–pá, 7–20) mezi dvěma okamžiky. */
export function pracovniHodiny(od: Date, doKdy: Date): number {
  if (!(od < doKdy)) return 0;
  let hodin = 0;
  const kurzor = new Date(od.getTime());
  // Po hodinových krocích: kratší úsek než hodina nikoho nezajímá a je to
  // odolnější než počítání přes půlnoci, víkendy a přechody na letní čas.
  while (kurzor < doKdy) {
    const den = kurzor.getDay();
    const h = kurzor.getHours();
    if (den >= 1 && den <= 5 && h >= OD_HODINY && h < DO_HODINY) hodin += 1;
    kurzor.setTime(kurzor.getTime() + 3600000);
  }
  return hodin;
}

export type TichoWhatsApp = {
  /** Poslední přijatá zpráva (ISO), null = nikdy nic nedorazilo. */
  posledni: string | null;
  /** Pracovních hodin od poslední zprávy. */
  hodinTicha: number;
  /** Má se to nahlásit? */
  varovat: boolean;
};

/**
 * Jak dlouho nic nedorazilo.
 *
 * Když ještě nikdy nic nepřišlo, nevaruje se — čerstvě nasazená appka bez
 * historie není porucha a hlásit ji hned při prvním spuštění by naučilo
 * upozornění ignorovat.
 */
export function tichoWhatsApp(posledniISO: string | null | undefined, ted: Date): TichoWhatsApp {
  if (!posledniISO) return { posledni: null, hodinTicha: 0, varovat: false };
  const od = new Date(posledniISO);
  if (Number.isNaN(od.getTime())) return { posledni: null, hodinTicha: 0, varovat: false };
  const hodinTicha = pracovniHodiny(od, ted);
  return { posledni: posledniISO, hodinTicha, varovat: hodinTicha >= TICHO_HODIN };
}
