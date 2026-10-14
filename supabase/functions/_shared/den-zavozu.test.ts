// Z provozu 14. 10. 2026: „Hladík Dobřichovice bylo v objednávce na příští středu,
// to znamená příští středa, ne tenhle týden, mělo to nasadit na středu 21. 10.“
import { describe, it, expect } from 'vitest';
import { datumDne, datumPraha, textRikaPristiTyden } from './den-zavozu';

describe('textRikaPristiTyden', () => {
  it('skutečné zprávy z provozu', () => {
    expect(textRikaPristiTyden('Jakub Hladík z Dobřichovic, Podpultovky na pristi tyden na stredu prosim 1x30l 12sv, vcetne zalohy, ale bude vracet sud nejspis, uz se mu tam vezlo. Diky')).toBe(true);
    expect(textRikaPristiTyden('Na pristi tyden na utery bude Duck and Dog')).toBe(true);
    expect(textRikaPristiTyden('Michal z Fojtovic si pristi tyden ve ctvrtek prijede pro cca 500l 12sv')).toBe(true);
    expect(textRikaPristiTyden('Pro pivovar Louka, na pristi tyden utery po Norme\n20x50l desitka\n35Kc/litr')).toBe(true);
  });

  it('„příští“ přímo před názvem dne', () => {
    expect(textRikaPristiTyden('Hladík Dobřichovice na příští středu 1x30l 12sv')).toBe(true);
    expect(textRikaPristiTyden('na příštího pátku 3x30l')).toBe(true);
    expect(textRikaPristiTyden('příští pondělí prosím 2x50l')).toBe(true);
    expect(textRikaPristiTyden('v příštím týdnu ve čtvrtek')).toBe(true);
  });

  it('další pořadí slov a „za týden“', () => {
    expect(textRikaPristiTyden('ve čtvrtek příští týden, 2x30l')).toBe(true);
    expect(textRikaPristiTyden('za týden v úterý prosím 3x30l')).toBe(true);
    expect(textRikaPristiTyden('další týden ve středu')).toBe(true);
    expect(textRikaPristiTyden('v pondělí PŘÍŠTÍ TÝDEN 2x50l')).toBe(true);
  });

  it('bez dne v textu se „příští týden“ týká celé objednávky', () => {
    expect(textRikaPristiTyden('Radek na příští týden 3x0,5l. Grep a 2x0,5l. Citrón')).toBe(true);
    // Dne se to týká jen tam, kde nějaký den je — tady se z něj nic nepočítá.
    expect(textRikaPristiTyden('Budeme asi potrebovat pristi tyden')).toBe(true);
  });

  it('nic o příštím týdnu', () => {
    expect(textRikaPristiTyden('3x30l na středu')).toBe(false);
    expect(textRikaPristiTyden('Michal z Fojtovic zítra 2x30l')).toBe(false);
    expect(textRikaPristiTyden('příští měsíc na středu')).toBe(false);
    expect(textRikaPristiTyden('')).toBe(false);
    expect(textRikaPristiTyden(null)).toBe(false);
    expect(textRikaPristiTyden(undefined)).toBe(false);
  });

  it('příští týden jinde ve zprávě objednávku neposouvá (lepší o týden dřív než pozdě)', () => {
    expect(textRikaPristiTyden('Prosím 3x30l na středu. Fakturu pošlu příští týden.')).toBe(false);
    expect(textRikaPristiTyden('Neni, hlavne asi hodime az pristi tyden. Ve ctvrtek se nejspis nepojede a na zitra nestiham vsecko.')).toBe(false);
    expect(textRikaPristiTyden('3x30l na středu\nplatbu příští týden')).toBe(false);
  });
});

describe('datumDne', () => {
  it('Hladík: ve středu 14. 10. „na příští týden na středu“ = 21. 10.', () => {
    expect(datumDne('st', '2026-10-14', true)).toBe('2026-10-21');
  });

  it('v pondělí „na příští týden úterý“ = úterý příštího týdne, ne zítřek', () => {
    expect(datumDne('ut', '2026-10-12', true)).toBe('2026-10-20');
  });

  it('v pátek „na příští týden úterý“ — nejbližší úterý je už příští týden, nepřidává se nic', () => {
    expect(datumDne('ut', '2026-10-16', true)).toBe('2026-10-20');
  });

  it('v neděli patří středa už příštímu týdnu', () => {
    expect(datumDne('st', '2026-10-18', true)).toBe('2026-10-21');
  });

  it('bez „příští“ nejbližší takový den, dnešek včetně', () => {
    expect(datumDne('st', '2026-10-14')).toBe('2026-10-14');
    expect(datumDne('st', '2026-10-15')).toBe('2026-10-21');
    expect(datumDne('po', '2026-10-14')).toBe('2026-10-19');
  });

  it('přes hranici měsíce a roku', () => {
    expect(datumDne('st', '2026-10-28', true)).toBe('2026-11-04');
    expect(datumDne('ct', '2026-12-30', true)).toBe('2027-01-07');
  });

  it('víkendové dny a neznámý den', () => {
    expect(datumDne('ne', '2026-10-14', true)).toBe('2026-10-25');
    expect(datumDne('xx', '2026-10-14', true)).toBeNull();
    expect(datumDne('st', 'nesmysl', true)).toBeNull();
  });
});

describe('datumPraha', () => {
  it('kolem půlnoci UTC je v Praze už další den', () => {
    expect(datumPraha('2026-10-13T22:30:00Z')).toBe('2026-10-14');
    expect(datumPraha('2026-10-14T09:23:31Z')).toBe('2026-10-14');
  });
  it('neplatný nebo žádný okamžik = dnešek, ne chyba', () => {
    expect(datumPraha('nesmysl')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(datumPraha()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
