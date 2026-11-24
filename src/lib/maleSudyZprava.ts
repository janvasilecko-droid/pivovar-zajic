// 🛢️📱 Text SMS s počtem malých sudů (záložka Malé sudy, tlačítko „Odeslat Radkovi").
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: „u položky malé sudy udělej tlačítko odeslat Radkovi, přes bránu
// telefonu se mu pošle sms s počtem malých sudů … sms se odešle od toho, kdo dá odeslat sms,
// ve tvaru: čau, malé sudy, datum a počet, například 20l: 2x, 15l: 0, 10l: 1."
// Počet je přesně velké číslo, které záložka u obalu ukazuje (prázdné sudy: naklikané minus
// odjeté objednávky). Obaly bez zadaného čísla se berou jako 0 — stejně jako ve hlídání
// objednávek („ostatní malé sudy bez čísla se pak berou jako 0").
import { proHledani } from './hledani';

export type SudProSms = {
  /** Objem sudu v litrech (20, 15, 10 …). */
  objem: number;
  /** Kolik prázdných sudů toho objemu je — velké číslo na kartě obalu. */
  pocet: number;
};

/** „20", „7,5" — česká desetinná čárka. */
function objemText(objem: number): string {
  return String(objem).replace('.', ',');
}

/** „2026-11-24" → „24. 11."; cokoli jiného → ''. */
function datumKratce(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : '';
}

/**
 * Text SMS: „Čau, malé sudy 24. 11.: 20l: 2x, 15l: 0x, 10l: 1x". Od největšího sudu, jako na
 * kartách; nula se píše taky (Radek se dozví i to, že nějaký sud nemáme). Bez sudů vrátí ''.
 */
export function textSmsMaleSudy(sudy: readonly SudProSms[], dnes: string): string {
  const casti = [...sudy]
    .sort((a, b) => b.objem - a.objem)
    .map((s) => `${objemText(s.objem)}l: ${s.pocet}x`);
  if (casti.length === 0) return '';
  const kdy = datumKratce(dnes);
  return `Čau, malé sudy${kdy ? ` ${kdy}` : ''}: ${casti.join(', ')}`;
}

/** Komu SMS patří: jméno a telefon z karty odběratele. */
export type PrijemceSms = { jmeno: string; telefon: string | null };

/**
 * Radek z číselníku odběratelů — jméno bez ohledu na velikost písmen a diakritiku. Kdyby jich bylo víc
 * (dvakrát zapsaný), vezme se ten s telefonem. Žádný Radek → null (SMS se otevře bez příjemce).
 */
export function prijemceMaleSudy(odberatele: readonly { name?: string | null; phone?: string | null }[]): PrijemceSms | null {
  const radkove = odberatele.filter((o) => proHledani(o.name) === 'radek');
  if (radkove.length === 0) return null;
  const radek = radkove.find((o) => (o.phone ?? '').trim()) ?? radkove[0];
  return { jmeno: (radek.name ?? '').trim() || 'Radek', telefon: (radek.phone ?? '').trim() || null };
}
