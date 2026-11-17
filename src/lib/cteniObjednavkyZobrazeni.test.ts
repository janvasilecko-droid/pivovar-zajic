import { describe, it, expect } from 'vitest';
import {
  unikatniHlaseni,
  srozumitelnaChybaCteni,
  cekaNaCteni,
  popisPrectenychPolozek,
  popisMistaADne,
} from './cteniObjednavkyZobrazeni';

describe('unikatniHlaseni', () => {
  it('stejný text nechá jen jednou, i s jinými mezerami a velikostí písmen', () => {
    expect(unikatniHlaseni([
      'Položka 2×30 l se v originálu nenašla',
      '  položka 2×30 l se v originálu nenašla  ',
      'Jiná chyba',
      '',
      null,
    ])).toEqual([
      'Položka 2×30 l se v originálu nenašla',
      'Jiná chyba',
    ]);
  });
});

describe('srozumitelnaChybaCteni', () => {
  it('timeout a dump nepřekládá do okna jako technický text', () => {
    expect(srozumitelnaChybaCteni('AI request timed out')).toBe('Čtení trvalo moc dlouho. Zkuste znovu.');
    expect(srozumitelnaChybaCteni('TypeError: Cannot read properties of null\n    at parse (index.js:12)'))
      .toBe('Čtení se nepovedlo. Zkuste znovu.');
    expect(srozumitelnaChybaCteni('  ')).toBeNull();
  });

  it('krátkou srozumitelnou hlášku nechá', () => {
    expect(srozumitelnaChybaCteni('Fotka nedorazila.')).toBe('Fotka nedorazila.');
  });

  it('17. 11. 2026: „Parse API error: 546" (server čtení ukončil) není pro obsluhu — řekne se, že je čtení přetížené', () => {
    for (const kod of ['Parse API error: 546', 'Parse API error: 502', 'HTTP 546: {"code":"WORKER_LIMIT"}', 'HTTP 502: Gemini teď fotku nepřečetl', 'HTTP 504', 'HTTP 408']) {
      expect(srozumitelnaChybaCteni(kod), kod).toBe('Čtení je teď přetížené. Zkuste znovu za chvíli.');
    }
    // Číslo v běžné větě se za kód chyby nebere.
    expect(srozumitelnaChybaCteni('Objednávka 546 sudů?')).toBe('Objednávka 546 sudů?');
  });

  it('zpráva, která čeká na další pokus čtení: řekne, že se to zkouší samo, kdy naposledy a co jde udělat hned', () => {
    const poznamka = 'AI je teď přetížená — zkusí se znovu automaticky za pár minut. (pokus 2026-11-17T09:35:07.000Z)';
    expect(cekaNaCteni(poznamka)).toBe(true);
    expect(srozumitelnaChybaCteni(poznamka))
      .toBe('AI je teď přetížená — čtení se samo zkouší znovu každé 3 minuty (naposledy v 10:35). Nechceš čekat? Otevři zprávu a dej „Znovu parsovat“.');
    // Starší poznámka bez času pokusu.
    expect(srozumitelnaChybaCteni('AI je teď přetížená — zkusí se znovu automaticky za pár minut.'))
      .toBe('AI je teď přetížená — čtení se samo zkouší znovu každé 3 minuty. Nechceš čekat? Otevři zprávu a dej „Znovu parsovat“.');
    for (const jine of [null, '', 'Parse API error: 546', 'Fotka nedorazila.']) expect(cekaNaCteni(jine)).toBe(false);
  });

  it('značka „čte se" (server zprávu právě čte) se jako chyba neukazuje', () => {
    expect(srozumitelnaChybaCteni('Čte se (od 2026-11-17T09:35:07.000Z)')).toBeNull();
    expect(cekaNaCteni('Čte se (od 2026-11-17T09:35:07.000Z)')).toBe(false);
  });

  it('chyba po hodině opakování se ukáže celá (je to rada, co dál)', () => {
    const t = 'AI je přetížená a zprávu se nepodařilo přečíst ani po opakování (kód 546). Zkus později „Znovu parsovat“.';
    expect(srozumitelnaChybaCteni(t)).toBe(t);
  });
});

describe('popisPrectenychPolozek a popisMistaADne', () => {
  it('složí místo, den a položky pro náhled v seznamu', () => {
    const nahled = popisMistaADne({
      parsed_place_name: 'Seeberg',
      parsed_delivery_day: 'čtvrtek',
      parsed_delivery_date: '2026-10-29',
    });
    expect(nahled.misto).toBe('Seeberg');
    expect(nahled.den).toMatch(/^čtvrtek · 29\. ?10\. ?2026$/);
    expect(popisPrectenychPolozek([
      { qty: 4, beer_name: '12° Světlá', package_label: '30 l' },
      { qty: 2, beer_name: '11°', package_label: '50 l' },
    ])).toBe('4× 12° Světlá 30 l, 2× 11° 50 l');
  });
});
