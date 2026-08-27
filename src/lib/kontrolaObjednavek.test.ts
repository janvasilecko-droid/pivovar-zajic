import { describe, it, expect } from 'vitest';
import { tichoUOdberatelu, vypadkyPrijmu, pokrytiTydne, type Zprava } from './kontrolaObjednavek';

const zprava = (kdo: string, den: string, hodina = '09:00'): Zprava => ({
  id: `${kdo}-${den}`, sender_name: kdo, created_at: `${den}T${hodina}:00.000Z`, status: 'imported',
});

/** Pravidelný odesílatel — každých `krok` dní od `od`, `kolik` zpráv. */
function rada(kdo: string, od: string, krok: number, kolik: number): Zprava[] {
  const out: Zprava[] = [];
  const d = new Date(od + 'T09:00:00Z');
  for (let i = 0; i < kolik; i++) {
    out.push(zprava(kdo, d.toISOString().slice(0, 10)));
    d.setUTCDate(d.getUTCDate() + krok);
  }
  return out;
}

describe('ticho u pravidelného odběratele', () => {
  const ted = new Date('2026-08-27T09:00:00Z');

  it('najde toho, kdo psal každý týden a teď tři týdny nic', () => {
    // Poslední zpráva 2026-08-03, tedy 24 dní ticha při obvyklých 7.
    const v = tichoUOdberatelu(rada('Hospoda U Lípy', '2026-06-01', 7, 10), ted);
    expect(v).toHaveLength(1);
    expect(v[0].odesilatel).toBe('Hospoda U Lípy');
    expect(v[0].obvykleDnu).toBe(7);
    expect(v[0].tichoDnu).toBeGreaterThanOrEqual(20);
  });

  it('kdo psal minulý týden, není podezřelý', () => {
    const v = tichoUOdberatelu(rada('Restaurace Zámek', '2026-07-06', 7, 8), ted);
    expect(v).toEqual([]);
  });

  it('bez historie mlčí — z jedné dvou zpráv se rytmus určit nedá', () => {
    const v = tichoUOdberatelu([zprava('Nový podnik', '2026-01-05'), zprava('Nový podnik', '2026-01-12')], ted);
    expect(v).toEqual([]);
  });

  it('u toho, kdo píše obden, se pár dní ticha nehlásí', () => {
    // Obvykle 2 dny; poslední zpráva 5 dní zpátky — pod týdenní hranicí.
    const v = tichoUOdberatelu(rada('Denní pisatel', '2026-08-04', 2, 10), ted);
    expect(v).toEqual([]);
  });

  it('řadí od nejpodezřelejšího — poměřuje se vlastním rytmem, ne absolutně', () => {
    const v = tichoUOdberatelu(
      [...rada('Týdenní', '2026-06-01', 7, 10), ...rada('Měsíční', '2026-01-05', 30, 6)],
      ted,
    );
    // Týdenní mlčí 24 dní při rytmu 7 (3,4×), měsíční 84 dní při rytmu 30 (2,8×).
    expect(v[0].odesilatel).toBe('Týdenní');
  });

  it('zprávy bez odesílatele nebo s rozbitým datem se přeskočí', () => {
    const rozbite: Zprava[] = [
      { id: '1', sender_name: null, created_at: '2026-01-01T09:00:00Z', status: 'imported' },
      { id: '2', sender_name: '  ', created_at: '2026-01-02T09:00:00Z', status: 'imported' },
      { id: '3', sender_name: 'X', created_at: 'nesmysl', status: 'imported' },
    ];
    expect(tichoUOdberatelu(rozbite, ted)).toEqual([]);
  });
});

describe('výpadky příjmu', () => {
  it('najde okno, kdy nepřišlo nic podstatně dýl než obvykle', () => {
    // Zprávy po dvou hodinách, pak třídenní díra.
    const zpravy: Zprava[] = [];
    const d = new Date('2026-08-01T08:00:00Z');
    for (let i = 0; i < 12; i++) {
      zpravy.push(zprava('Kdokoli', d.toISOString().slice(0, 10), d.toISOString().slice(11, 16)));
      d.setUTCHours(d.getUTCHours() + 2);
    }
    d.setUTCDate(d.getUTCDate() + 3);
    for (let i = 0; i < 5; i++) {
      zpravy.push(zprava('Kdokoli', d.toISOString().slice(0, 10), d.toISOString().slice(11, 16)));
      d.setUTCHours(d.getUTCHours() + 2);
    }
    const v = vypadkyPrijmu(zpravy);
    expect(v).toHaveLength(1);
    expect(v[0].hodin).toBeGreaterThanOrEqual(70);
  });

  it('plynulý provoz nehlásí nic', () => {
    const zpravy: Zprava[] = [];
    const d = new Date('2026-08-01T08:00:00Z');
    for (let i = 0; i < 30; i++) {
      zpravy.push(zprava('Kdokoli', d.toISOString().slice(0, 10), d.toISOString().slice(11, 16)));
      d.setUTCHours(d.getUTCHours() + 3);
    }
    expect(vypadkyPrijmu(zpravy)).toEqual([]);
  });

  it('z hrstky zpráv se výpadek určovat nedá', () => {
    expect(vypadkyPrijmu([zprava('A', '2026-01-01'), zprava('A', '2026-03-01')])).toEqual([]);
  });
});

describe('pokrytí týdne', () => {
  const objednavky = [
    // Minulý týden (17.–23. 8.) objednali tři.
    { id: '1', place_name: 'Hospoda A', delivery_date: '2026-08-19', order_date: '2026-08-17', status: 'vyrizeno_zavoz' },
    { id: '2', place_name: 'Hospoda B', delivery_date: '2026-08-20', order_date: '2026-08-17', status: 'vyrizeno_zavoz' },
    { id: '3', place_name: 'Hospoda C', delivery_date: '2026-08-21', order_date: '2026-08-18', status: 'vyrizeno_zavoz' },
    // Tenhle týden (24.–30. 8.) zatím jen A a nováček D.
    { id: '4', place_name: 'Hospoda A', delivery_date: '2026-08-26', order_date: '2026-08-24', status: 'nova' },
    { id: '5', place_name: 'Hospoda D', delivery_date: '2026-08-28', order_date: '2026-08-24', status: 'nova' },
  ];

  it('vyjmenuje, kdo objednal minulý týden a tenhle ne', () => {
    const v = pokrytiTydne(objednavky, '2026-08-24');
    expect(v.chybi.map((x) => x.odberatel)).toEqual(['Hospoda B', 'Hospoda C']);
    expect(v.noviTentoTyden).toEqual(['Hospoda D']);
  });

  it('rozhoduje den závozu, ne den zadání', () => {
    // Objednávka zadaná 17. 8., ale s závozem 26. 8. patří do TOHOTO týdne.
    const v = pokrytiTydne(
      [{ id: 'x', place_name: 'Hospoda E', delivery_date: '2026-08-26', order_date: '2026-08-17', status: 'nova' }],
      '2026-08-24',
    );
    expect(v.chybi).toEqual([]);
    expect(v.noviTentoTyden).toEqual(['Hospoda E']);
  });

  it('stornované objednávky se nepočítají — jinak by chyběl, kdo si to rozmyslel', () => {
    const v = pokrytiTydne(
      [...objednavky, { id: '6', place_name: 'Hospoda B', delivery_date: '2026-08-27', order_date: '2026-08-24', status: 'storno' }],
      '2026-08-24',
    );
    expect(v.chybi.map((x) => x.odberatel)).toContain('Hospoda B');
  });
});
