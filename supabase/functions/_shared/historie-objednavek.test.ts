// Historie objednávek jako kontext pro čtení zprávy — viz hlavička
// historie-objednavek.ts. Testy hlídají hlavně tu hranici, kterou historie
// nesmí překročit: rozhoduje mezi výklady, položky nedoplňuje.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { odberateleOdesilatele, obvykleBere, blokHistorie, nactiHistorii } from './historie-objednavek';

describe('odberateleOdesilatele', () => {
  it('spočítá, pro koho odesílatel objednával, a seřadí od nejčastějšího', () => {
    const vysledek = odberateleOdesilatele([
      { place_name: 'Lužec' },
      { place_name: 'Duck and Dog' },
      { place_name: 'Lužec' },
      { place_name: 'Lužec' },
    ]);
    expect(vysledek).toEqual([
      { jmeno: 'Lužec', pocet: 3 },
      { jmeno: 'Duck and Dog', pocet: 1 },
    ]);
  });

  it('objednávky bez odběratele se nepočítají', () => {
    expect(odberateleOdesilatele([{ place_name: null }, { place_name: '   ' }])).toEqual([]);
  });
});

describe('obvykleBere', () => {
  it('množství je MEDIÁN, ne součet — jinak by z pěti objednávek vyšel obří závoz', () => {
    const polozky = [2, 4, 4, 4, 30].map((quantity) => ({
      place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity,
    }));
    expect(obvykleBere(polozky)).toEqual(['4× KEG 50l 12° Světlá']);
  });

  it('nejdřív to, co odběratel bere nejčastěji', () => {
    const polozky = [
      { place_name: 'Lužec', beer_name: '11° Světlá', package_label: 'KEG 30l', quantity: 1 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 },
    ];
    expect(obvykleBere(polozky)[0]).toBe('4× KEG 50l 12° Světlá');
  });

  it('položky bez piva, bez obalu nebo s nulovým množstvím se ignorují', () => {
    expect(obvykleBere([
      { place_name: 'Lužec', beer_name: null, package_label: 'KEG 50l', quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: null, quantity: 4 },
      { place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 0 },
    ])).toEqual([]);
  });

  it('vypíše nejvýš šest druhů, ať prompt nenaroste o celý sklad', () => {
    const polozky = Array.from({ length: 12 }, (_, i) => ({
      place_name: 'Lužec', beer_name: `pivo ${i}`, package_label: 'KEG 50l', quantity: 1,
    }));
    expect(obvykleBere(polozky).length).toBe(6);
  });
});

describe('blokHistorie', () => {
  const jeden = {
    odesilatel: 'Bednář',
    objednavkyOdesilatele: [{ place_name: 'Lužec' }, { place_name: 'Lužec' }],
    polozkyPodleOdberatele: {},
  };

  it('prázdný řetězec, když není co říct — prázdný nadpis jen ubírá pozornost', () => {
    expect(blokHistorie({ odesilatel: 'Bednář', objednavkyOdesilatele: [], polozkyPodleOdberatele: {} })).toBe('');
    expect(blokHistorie({ odesilatel: null, objednavkyOdesilatele: [{ place_name: 'Lužec' }], polozkyPodleOdberatele: {} })).toBe('');
  });

  it('vyjmenuje odběratele odesílatele i s počty', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('Bednář');
    expect(blok).toContain('Lužec (2×)');
  });

  it('když posílal vždy jen pro jednoho, řekne to — ale pořád nabádá k dotazu', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('skoro jistě on');
    expect(blok).toContain('zeptej se');
  });

  it('u víc odběratelů se „skoro jistě on" neobjeví', () => {
    const blok = blokHistorie({
      ...jeden,
      objednavkyOdesilatele: [{ place_name: 'Lužec' }, { place_name: 'Duck and Dog' }],
    });
    expect(blok).not.toContain('skoro jistě on');
  });

  it('vždycky nese zákaz doplňovat položky z historie', () => {
    const blok = blokHistorie(jeden);
    expect(blok).toContain('NENÍ k doplňování položek');
    expect(blok).toContain('Co je napsané ve zprávě, má vždycky přednost');
  });

  it('vypíše, co odběratelé berou obvykle', () => {
    const blok = blokHistorie({
      ...jeden,
      polozkyPodleOdberatele: {
        'Lužec': [{ place_name: 'Lužec', beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 4 }],
      },
    });
    expect(blok).toContain('Lužec: 4× KEG 50l 12° Světlá');
  });
});

// ── Načtení historie ──────────────────────────────────────────────────────
// Dotazy musí být na JEDNOM místě: čtení zprávy má dvě cesty (server
// whatsapp-auto-parse a klient „Přečíst znovu") a dvě kopie se vždycky
// rozešly — právě proto celý _shared/ vznikl.
describe('nactiHistorii', () => {
  /** Nejmenší mock Supabase, který zvládne řetězení dotazů. */
  const mockDb = (tabulky: Record<string, any[]>) => {
    const dotaz = (t: string) => {
      const api: any = {};
      for (const m of ['select', 'not', 'gte', 'order', 'limit', 'in']) {
        api[m] = () => api;
      }
      api.then = (resolve: any) => resolve({ data: tabulky[t] ?? [] });
      return api;
    };
    return { from: (t: string) => dotaz(t) };
  };

  const DNES = '2026-09-19T08:00:00Z';

  it('bez odesílatele nedělá nic', async () => {
    expect(await nactiHistorii(mockDb({}), { odesilatel: null, kdy: DNES }))
      .toEqual({ text: '', odberatele: [] });
    expect(await nactiHistorii(mockDb({}), { odesilatel: '  ', kdy: DNES }))
      .toEqual({ text: '', odberatele: [] });
  });

  it('bere jen zprávy tohohle odesílatele', async () => {
    const db = mockDb({
      whatsapp_incoming: [
        { imported_order_id: 'o1', participant_name: 'Bednář', sender_name: null },
        { imported_order_id: 'o2', participant_name: 'Někdo jiný', sender_name: null },
      ],
      orders: [{ id: 'o1', place_name: 'Lužec' }],
      order_items: [],
    });
    const { odberatele } = await nactiHistorii(db, { odesilatel: 'Bednář', kdy: DNES });
    expect(odberatele).toEqual(['Lužec']);
  });

  it('bez dřívějších objednávek vrací prázdno', async () => {
    const db = mockDb({ whatsapp_incoming: [], orders: [], order_items: [] });
    expect(await nactiHistorii(db, { odesilatel: 'Bednář', kdy: DNES }))
      .toEqual({ text: '', odberatele: [] });
  });

  it('sestaví blok do promptu i seznam odběratelů k ukotvení', async () => {
    const db = mockDb({
      whatsapp_incoming: [{ imported_order_id: 'o1', participant_name: 'Bednář', sender_name: null }],
      orders: [{ id: 'o1', place_name: 'Lužec' }],
      order_items: [
        { quantity: 4, beer_name: '12° Světlá', package_label: 'KEG 50l', orders: { place_name: 'Lužec' } },
      ],
    });
    const { text, odberatele } = await nactiHistorii(db, { odesilatel: 'Bednář', kdy: DNES });
    expect(odberatele).toEqual(['Lužec']);
    expect(text).toContain('Lužec: 4× KEG 50l 12° Světlá');
    expect(text).toContain('NENÍ k doplňování položek');
  });

  it('když dotaz selže, čte se bez historie — zpráva kvůli nápovědě propadnout nesmí', async () => {
    const rozbito = { from: () => { throw new Error('RLS'); } };
    await expect(nactiHistorii(rozbito, { odesilatel: 'Bednář', kdy: DNES }))
      .resolves.toEqual({ text: '', odberatele: [] });
  });
});

describe('obě cesty čtení berou tutéž historii', () => {
  const server = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
  const klient = readFileSync('src/lib/whatsappParser.ts', 'utf8');

  it('server i klient volají nactiHistorii', () => {
    expect(server).toMatch(/nactiHistorii\(supabase/);
    expect(klient).toMatch(/nactiHistorii\(supabase/);
  });

  it('ani jeden si nedrží vlastní kopii dotazů', () => {
    for (const [kde, zdroj] of [['server', server], ['klient', klient]] as const) {
      expect(zdroj, `${kde} si dotazuje whatsapp_incoming sám`).not.toMatch(/imported_order_id, participant_name/);
    }
  });

  it('oba mají historii jako poslední nápovědu na odběratele', () => {
    for (const [kde, zdroj] of [['server', server], ['klient', klient]] as const) {
      expect(zdroj, `${kde} nemá odberatelZHistorie`).toMatch(/odberatelZHistorie\(/);
      expect(zdroj, `${kde} neukotvuje podle citace`).toMatch(/ukotveniText/);
    }
  });
});
