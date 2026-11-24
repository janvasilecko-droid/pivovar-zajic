// 📚 Z čeho AI sládek čerpá — přehled knih v chatu.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: chatbot „má i databáze knih Kunze, Košař, možná přibudou
// další". V chatu proto vidět, které knihy knihovna má a které z nich už AI sládek
// opravdu zná: odpovídá jen z knih zpracovaných (hotovo / ke kontrole); nahraná,
// ale nezpracovaná kniha čeká a AI z ní zatím nic neví (zadání, bod 6: netvrdit,
// že AI knihu zná, dokud nebyla zpracována). Čisté funkce bez sítě.
import { JAZYK_POPIS, STAV_POPIS, jeZpracovany, type StavDokumentu } from './bibleKnihovna';
import type { BibleDokument } from './bibleKnihovnaApi';

export type KnihaProChat = {
  id: string;
  nazev: string;
  /** Autor · rok · jazyk · počet stran — jen co je známé. */
  popis: string;
  stav: StavDokumentu;
  stavText: string;
  /** Zpracovaná: AI z ní odpovídá. */
  zpracovana: boolean;
};

export type PrehledKnih = { zpracovane: KnihaProChat[]; ostatni: KnihaProChat[] };

type VstupKnihy = Pick<BibleDokument, 'id' | 'nazev' | 'autor' | 'rok' | 'jazyk' | 'stav' | 'stran_celkem' | 'postup'>;

/** Pořadí nezpracovaných: nejdřív to, co se právě děje, chyby a pozastavené nakonec. */
const PORADI_OSTATNICH: Readonly<Record<StavDokumentu, number>> = {
  zpracovava: 0, ceka: 1, nahrava: 2, pozastaveno: 3, chyba: 4, hotovo: 5, ke_kontrole: 5,
};

const podleNazvu = (a: KnihaProChat, b: KnihaProChat) => a.nazev.localeCompare(b.nazev, 'cs');

function popisKnihy(d: VstupKnihy): string {
  const stran = d.stran_celkem ?? d.postup?.stran ?? null;
  return [
    d.autor?.trim() || null,
    d.rok ? String(d.rok) : null,
    d.jazyk ? JAZYK_POPIS[d.jazyk] : null,
    stran != null ? `${stran} stran` : null,
  ].filter(Boolean).join(' · ');
}

/** Knihy z knihovny rozdělené na zpracované (AI z nich odpovídá) a ostatní (čekají, chyba…). */
export function prehledKnih(dokumenty: readonly VstupKnihy[]): PrehledKnih {
  const knihy: KnihaProChat[] = dokumenty.map((d) => ({
    id: d.id,
    nazev: d.nazev.trim() || 'Bez názvu',
    popis: popisKnihy(d),
    stav: d.stav,
    stavText: STAV_POPIS[d.stav],
    zpracovana: jeZpracovany(d.stav),
  }));
  return {
    zpracovane: knihy.filter((k) => k.zpracovana).sort(podleNazvu),
    ostatni: knihy.filter((k) => !k.zpracovana).sort((a, b) => PORADI_OSTATNICH[a.stav] - PORADI_OSTATNICH[b.stav] || podleNazvu(a, b)),
  };
}

/** „1 kniha", „3 knihy", „5 knih". */
export function pocetKnih(n: number): string {
  return `${n} ${n === 1 ? 'kniha' : n >= 2 && n <= 4 ? 'knihy' : 'knih'}`;
}

/** Jedna řádka nad seznamem: kolik knih AI zná a kolik ještě čeká. */
export function souhrnKnih(p: PrehledKnih): string {
  const cekaji = p.ostatni.length > 0 ? ` · ještě nezpracováno: ${p.ostatni.length}` : '';
  if (p.zpracovane.length === 0) return p.ostatni.length === 0 ? 'knihovna je zatím prázdná' : `zatím žádná zpracovaná kniha${cekaji}`;
  return `${pocetKnih(p.zpracovane.length)}${cekaji}`;
}
