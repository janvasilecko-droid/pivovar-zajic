// 🚦 Chodí zprávy z WhatsAppu, nebo ne?
// ---------------------------------------------------------------------------
// Audit se dřív ptal jen na tep mostu: „ozývá se?" Jenže 1. 9. 2026 most
// hlásil `pripojeno: true` a „spojení navázáno", tep měl minutu starý — a
// přesto celý den nedorazila ani jedna zpráva. Zelený nápis „Most běží a je
// spojený s WhatsAppem" tak tvrdil pravý opak toho, co se dělo.
//
// Tep mostu totiž říká jen to, že běží PROCES. Neříká nic o tom, jestli jím
// něco proteklo. Jediný poctivý důkaz, že příjem funguje, je zpráva, která
// opravdu dorazila — deník příjmu (`whatsapp_prijem_log`).
//
// Vyhodnocují se proto obě věci zvlášť a nejhorší případ je ten, který dřív
// nikde nesvítil: most běží, ale nic nechodí.

import { pracovniHodiny } from './whatsappTicho';

/** Po kolika minutách bez tepu je most považovaný za spící/mrtvý. */
export const TEP_MINUT = 5;
/** Po kolika PRACOVNÍCH hodinách ticha je ticho podezřelé. */
export const TICHO_PRACOVNICH_HODIN = 8;

export type UrovenPrijmu = 'ok' | 'pozor' | 'chyba';

export type StavPrijmu = {
  /** Běží proces mostu (čerstvý tep)? */
  mostBezi: boolean;
  /** Minut od posledního tepu; null = tep nikdy nebyl. */
  mostMinut: number | null;
  /** Hlásí most spojení s WhatsAppem? */
  mostPripojen: boolean;
  /** Kdy naposledy DORAZILA zpráva (ISO); null = nikdy. */
  posledniZprava: string | null;
  /** Pracovních hodin od poslední doručené zprávy. */
  hodinTicha: number | null;
  uroven: UrovenPrijmu;
  /** Co se děje — jedna věta. */
  hlaska: string;
  /** Co s tím — jedna věta. */
  rada: string;
};

export function stavPrijmu(
  tepNaposledy: string | null | undefined,
  mostPripojen: boolean,
  posledniZprava: string | null | undefined,
  ted: Date,
): StavPrijmu {
  const tep = tepNaposledy ? new Date(tepNaposledy) : null;
  const mostMinut = tep && !Number.isNaN(tep.getTime())
    ? Math.floor((ted.getTime() - tep.getTime()) / 60000)
    : null;
  const mostBezi = mostMinut !== null && mostMinut < TEP_MINUT;

  const zprava = posledniZprava ? new Date(posledniZprava) : null;
  const platnaZprava = zprava && !Number.isNaN(zprava.getTime()) ? zprava : null;
  const hodinTicha = platnaZprava ? pracovniHodiny(platnaZprava, ted) : null;
  const dlouhoTicho = hodinTicha !== null && hodinTicha >= TICHO_PRACOVNICH_HODIN;

  const zaklad = {
    mostBezi, mostMinut, mostPripojen,
    posledniZprava: platnaZprava ? platnaZprava.toISOString() : null,
    hodinTicha,
  };

  // Nejdůležitější případ a dřív nikde neviditelný: proces žije, ale nic jím
  // neteče. Zelená „most běží" tady byla přímo zavádějící.
  if (mostBezi && dlouhoTicho) {
    return {
      ...zaklad,
      uroven: 'chyba',
      hlaska: `Most běží, ale ${hodinTicha} pracovních hodin nedorazila žádná zpráva`,
      rada: 'Most sám o sobě nestačí — zkontroluj telefon: běží Tasker na pozadí, má přístup k oznámením a nerestartoval se?',
    };
  }

  if (!mostBezi) {
    return {
      ...zaklad,
      uroven: platnaZprava && !dlouhoTicho ? 'pozor' : 'chyba',
      hlaska: mostMinut === null ? 'Most se nikdy neozval' : 'Most se neozývá',
      rada: 'Zprávy se živě nedoručují — přijdou až při dalším připojení. Bezplatný Render uspí instanci po ~15 minutách nečinnosti.',
    };
  }

  if (!mostPripojen) {
    return {
      ...zaklad,
      uroven: 'pozor',
      hlaska: 'Most běží, ale nemá spojení s WhatsAppem',
      rada: 'Nech most znovu navázat spojení; do té doby se nic nedoručí.',
    };
  }

  if (!platnaZprava) {
    return {
      ...zaklad,
      uroven: 'pozor',
      hlaska: 'Most běží, ale zatím nikdy nic nedorazilo',
      rada: 'U čerstvě zapojeného mostu je to normální — ozve se, až přijde první objednávka.',
    };
  }

  return {
    ...zaklad,
    uroven: 'ok',
    hlaska: 'Příjem funguje — zprávy chodí',
    rada: hodinTicha === 0
      ? 'Poslední zpráva dorazila právě teď.'
      : `Poslední zpráva dorazila před ${hodinTicha} pracovními hodinami.`,
  };
}
