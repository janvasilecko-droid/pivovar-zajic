// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ChybaVyberu, cislo, DRUHY_SUROVIN, FAZE_KROKU, filtrujVarky, filtrZArgumentu, HODNOTY_VARKY, ODVOZENE, odchylka, odvozenaHodnota,
  porovnaniText, porovnejVarky, prehledVarek, seznamVarekText, souhrnVarky, vyberProPorovnani, type RecepturaData, type VarkaData,
} from './varky-popisy';
import { spocitej } from './vypocty/zaklad';
import { najdiVypocet } from './vypocty/katalog';
import { INSTRUKCE, NASTROJE } from './mcp';

// Vymyšlené várky — žádná skutečná data.
const SQL = readFileSync('bible/supabase/migrations/20261111010000_bible_varky.sql', 'utf8');
const R1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const V1 = 'bbbbbbbb-1111-2222-3333-000000000001';
const V2 = 'bbbbbbbb-1111-2222-3333-000000000002';
const V3 = 'bbbbbbbb-1111-2222-3333-000000000003';

const receptura: RecepturaData = {
  id: R1, nazev: 'Světlý ležák 11', styl: 'český ležák', cil_objem_hl: 10, cil_stupnovitost: 11.2, cil_alkohol: 4.6, cil_ibu: 30, cil_barva_ebc: null,
  suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180, jednotka: 'kg' }, { druh: 'chmel', nazev: 'Žatecký', mnozstvi: 1200, jednotka: 'g', kdy: '60 min' }],
  kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota_c: 52, minut: 15 }],
  poznamka: null,
};
const v = (id: string, datum: string, hodnoty: Record<string, number>, navic: Partial<VarkaData> = {}): VarkaData => ({
  id, receptura_id: R1, cislo: id.slice(-1), pivo: 'Světlý ležák 11', datum_varu: datum, hodnoty, poznamka: null, ...navic,
});

describe('katalog hodnot várky', () => {
  it('klíče, rozsahy a celá čísla přesně odpovídají SQL (bible_katalog_hodnot_varky)', () => {
    const sql = [...SQL.matchAll(/\('([a-z0-9_]+)', (-?[\d.]+), (-?[\d.]+), (true|false)\)/g)].map((m) => ({
      klic: m[1], min: Number(m[2]), max: Number(m[3]), cele: m[4] === 'true',
    }));
    expect(sql.length).toBe(HODNOTY_VARKY.length);
    expect(HODNOTY_VARKY.map((h) => ({ klic: h.klic, min: h.min, max: h.max, cele: h.cele === true }))).toEqual(sql);
  });

  it('druhy surovin a fáze kroků odpovídají SQL kontrolám', () => {
    expect(SQL).toContain(`v_druh NOT IN (${DRUHY_SUROVIN.map((d) => `'${d.id}'`).join(', ')})`);
    expect(SQL).toContain(`v_faze NOT IN (${FAZE_KROKU.map((f) => `'${f.id}'`).join(', ')})`);
  });

  it('číslo pro člověka: čárka, bez zbytečných nul, skutečné minus', () => {
    expect(cislo(11.3, 2)).toBe('11,3');
    expect(cislo(180, 1)).toBe('180');
    expect(cislo(-1.25, 1)).toBe('−1,3');
    expect(cislo(-0.001, 2)).toBe('0');
    expect(odchylka(11.3, 11.2, 2)).toBe('+0,1');
    expect(odchylka(10.4, 10.4, 2)).toBe('0');
    expect(odchylka(9.6, 10, 2)).toBe('−0,4');
    expect(odchylka(null, 10, 2)).toBeNull();
  });
});

describe('odvozené hodnoty — jen ze zapsaných údajů, výpočetním modulem', () => {
  const vytezek = ODVOZENE.find((o) => o.klic === 'vytezek_pct')!;
  const prokvaseni = ODVOZENE.find((o) => o.klic === 'prokvaseni_pct')!;
  const alkohol = ODVOZENE.find((o) => o.klic === 'alkohol_vypocet_obj')!;
  const odpar = ODVOZENE.find((o) => o.klic === 'odpar_pct')!;

  it('varní výtěžek = výpočet z Výpočtové laboratoře (korekce 0,96)', () => {
    const r = odvozenaHodnota(vytezek, { mladina_objem_hl: 10.4, mladina_p: 11.3, sypani_kg: 180 });
    const lab = spocitej(najdiVypocet('varni_vytezek')!, { v: 10.4, e: 11.3, s: 180, k: 0.96 }).vysledky[0].hodnota;
    expect(r).toEqual({ hodnota: lab });
    // Nezávisle (SG 11,3 °P ≈ 1,0454): 1040 L · 0,96 · 1,0454 · 0,113 / 180 ≈ 65,5 %.
    expect(lab).toBeCloseTo(65.5, 0);
  });

  it('prokvašení a alkohol podle Ballinga (nezávisle přepočteno)', () => {
    const h = { mladina_p: 11.3, pivo_zdanlivy_p: 2.4 };
    expect((odvozenaHodnota(prokvaseni, h) as { hodnota: number }).hodnota).toBeCloseTo(78.76, 2);
    expect((odvozenaHodnota(alkohol, h) as { hodnota: number }).hodnota).toBeCloseTo(4.78, 1);
  });

  it('odpar z horkých objemů; větší mladina než sladina se odmítne', () => {
    expect((odvozenaHodnota(odpar, { sladina_objem_hl: 11.5, mladina_objem_hl: 10.4 }) as { hodnota: number }).hodnota).toBeCloseTo(9.565, 3);
    expect(odvozenaHodnota(odpar, { sladina_objem_hl: 10, mladina_objem_hl: 10.4 })).toEqual({ chyba: 'Objem mladiny je větší než objem sladiny — zkontroluj zápis.' });
  });

  it('chybný zápis se ukáže u várky i v porovnání', () => {
    const p = porovnejVarky([
      v(V1, '2026-11-03', { sladina_objem_hl: 10, mladina_objem_hl: 10.4 }),
      v(V2, '2026-11-04', { sladina_objem_hl: 11.5, mladina_objem_hl: 10.4 }),
    ], []);
    expect(p.chybi[0].polozky).toContain('Odpar při chmelovaru: Objem mladiny je větší než objem sladiny — zkontroluj zápis.');
    expect(p.radky.find((r) => r.klic === 'odpar_pct')!.hodnoty[0]).toBeNull();
  });

  it('chybějící vstupy se vyjmenují, nesmyslné se odmítnou — nic se nedopočítá', () => {
    expect(odvozenaHodnota(vytezek, { mladina_p: 11.3 })).toEqual({ chybi: ['mladina_objem_hl', 'sypani_kg'] });
    expect(odvozenaHodnota(prokvaseni, { mladina_p: 3, pivo_zdanlivy_p: 4 })).toEqual({ chyba: 'Zdánlivý extrakt piva musí být menší než původní extrakt mladiny.' });
  });
});

describe('porovnání várek', () => {
  const varky = [
    v(V2, '2026-11-10', { mladina_objem_hl: 10.1, mladina_p: 11.0, sypani_kg: 180 }),
    v(V1, '2026-11-03', { mladina_objem_hl: 10.4, mladina_p: 11.3, sypani_kg: 180, pivo_zdanlivy_p: 2.4 }, { poznamka: 'Pomalé scezování.' }),
    v(V3, '2026-11-05', { mladina_p: 11.4 }, { receptura_id: null }),
  ];

  it('od nejstarší; řádek jen u zapsané hodnoty; cíle receptury a odchylky; co chybí', () => {
    const p = porovnejVarky(varky, [receptura]);
    expect(p.varky.map((x) => x.id)).toEqual([V1, V3, V2]);
    expect(p.radky.map((r) => r.klic)).toEqual(['sypani_kg', 'mladina_objem_hl', 'mladina_p', 'pivo_zdanlivy_p', 'vytezek_pct', 'prokvaseni_pct', 'alkohol_vypocet_obj']);
    const mladina = p.radky.find((r) => r.klic === 'mladina_p')!;
    expect(mladina.hodnoty).toEqual([11.3, 11.4, 11.0]);
    // Várka 3 je bez receptury → bez cíle.
    expect(mladina.cile).toEqual([11.2, null, 11.2]);
    const vytezek = p.radky.find((r) => r.klic === 'vytezek_pct')!;
    expect(vytezek.hodnoty[1]).toBeNull();
    expect(p.chybi).toEqual([
      { varka: 'č. 3 · Světlý ležák 11 · 5. 11. 2026', polozky: [
        'Sypání (slad a suroviny)', 'Objem vyražené mladiny (horké)', 'Zdánlivý extrakt hotového piva',
        'Objem vyražené mladiny (horké), Sypání (slad a suroviny) → nejde spočítat varní výtěžek',
        'Zdánlivý extrakt hotového piva → nejde spočítat zdánlivé prokvašení',
        'Zdánlivý extrakt hotového piva → nejde spočítat alkohol (výpočet z extraktů)',
      ] },
      { varka: 'č. 2 · Světlý ležák 11 · 10. 11. 2026', polozky: [
        'Zdánlivý extrakt hotového piva',
        'Zdánlivý extrakt hotového piva → nejde spočítat zdánlivé prokvašení',
        'Zdánlivý extrakt hotového piva → nejde spočítat alkohol (výpočet z extraktů)',
      ] },
    ]);
    expect(p.poznamky.some((t) => t.startsWith('Varní výtěžek:'))).toBe(true);
    expect(p.poznamky).toContain('Várka bez receptury nemá cílové hodnoty — porovnává se jen s ostatními várkami.');
    // Sladinu neměří nikdo → odpar se řekne jednou, ne u každé várky.
    expect(p.radky.some((r) => r.klic === 'odpar_pct')).toBe(false);
    expect(p.nespocitano).toEqual([{ nazev: 'Odpar při chmelovaru', duvod: 'u žádné várky není zapsané: Objem sladiny před chmelovarem (horké)' }]);
  });

  it('text pro Clauda: jen uložené údaje, tabulka s cílem a odchylkou, receptura, chybí, poznámky', () => {
    const t = porovnaniText(porovnejVarky(varky, [receptura]), [receptura]);
    expect(t).toMatch(/^# Porovnání várek \(3\)/);
    expect(t).toMatch(/Pracuj JEN s nimi/);
    expect(t).toMatch(/označ je jako hypotézy, ne fakta/);
    expect(t).toContain('| Hodnota | č. 1 · Světlý ležák 11 · 3. 11. 2026 | č. 3 · Světlý ležák 11 · 5. 11. 2026 | č. 2 · Světlý ležák 11 · 10. 11. 2026 |');
    expect(t).toContain('| Extrakt mladiny (původní extrakt) | 11,3 °P (cíl 11,2, +0,1) | 11,4 °P | 11 °P (cíl 11,2, −0,2) |');
    expect(t).toContain('| Varní výtěžek (výpočet) |');
    expect(t).toContain('- Světlý ležák 11 (český ležák) — cíle: objem 10 hl, 11,2 °P, 4,6 % obj., 30 IBU');
    expect(t).toContain('  - Žatecký 1200 g, 60 min');
    expect(t).toContain('  - krok: Nástřik (52 °C, 15 min)');
    expect(t).toContain('- č. 1 · Světlý ležák 11 · 3. 11. 2026: Pomalé scezování.');
    expect(t).toMatch(/## Chybí \(nezapsáno — nedomýšlet\)/);
    expect(t).toContain('## Nejde spočítat u žádné várky\n- Odpar při chmelovaru: u žádné várky není zapsané: Objem sladiny před chmelovarem (horké)');
    expect(porovnaniText(porovnejVarky([], []))).toMatch(/Žádná várka k porovnání/);
  });

  it('souhrn várky do seznamu', () => {
    expect(souhrnVarky(varky[1])).toMatch(/^Extrakt mladiny \(původní extrakt\): 11,3 °P · Objem vyražené mladiny \(horké\): 10,4 hl · Zdánlivý extrakt hotového piva: 2,4 °P · Varní výtěžek: 65,\d % · zapsáno 4 z 30 hodnot$/);
  });
});

describe('přehled z databáze a výběr várek pro konektor', () => {
  it('přehled vynechá vadné řádky a neznámé hodnoty, nic nedoplní', () => {
    const p = prehledVarek({
      receptury: [{ id: R1, nazev: 'Ležák', cil_stupnovitost: 11.2, suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180 }, { druh: 'cukr', nazev: 'X' }], kroky: [{ faze: 'x', nazev: 'Y' }] }, { nazev: 'bez id' }],
      varky: [
        { id: V1, receptura_id: R1, cislo: '1', pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: { mladina_p: 11.3, vytezek: 70, sypani_kg: '180' } },
        { id: V2, pivo: 'Bez data' },
      ],
    });
    expect(p.receptury).toHaveLength(1);
    expect(p.receptury[0].suroviny).toEqual([{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180 }]);
    expect(p.receptury[0].kroky).toEqual([]);
    expect(p.receptury[0].cil_objem_hl).toBeNull();
    expect(p.varky).toHaveLength(1);
    expect(p.varky[0].hodnoty).toEqual({ mladina_p: 11.3 });
  });

  const varky = [
    v(V1, '2026-11-03', { mladina_p: 11.3 }),
    v(V2, '2026-11-10', { mladina_p: 11.0 }, { pivo: 'Tmavé 12' }),
    v(V3, '2026-11-05', { mladina_p: 11.4 }, { receptura_id: null }),
  ];

  it('filtr: pivo bez diakritiky, receptura, od–do; nejnovější první', () => {
    expect(filtrujVarky(varky, {}).map((x) => x.id)).toEqual([V2, V3, V1]);
    expect(filtrujVarky(varky, filtrZArgumentu({ pivo: 'tmave' })).map((x) => x.id)).toEqual([V2]);
    expect(filtrujVarky(varky, filtrZArgumentu({ receptura_id: R1.toUpperCase(), do: '2026-11-09' })).map((x) => x.id)).toEqual([V1]);
    expect(() => filtrZArgumentu({ od: '3. 11.' })).toThrow(ChybaVyberu);
    expect(() => filtrZArgumentu({ receptura_id: 'x' })).toThrow(ChybaVyberu);
  });

  it('výběr k porovnání: id várek (všechna musí existovat), jinak posledních N', () => {
    expect(vyberProPorovnani(varky, { varka_ids: [V1, V3] }).map((x) => x.id)).toEqual([V1, V3]);
    expect(() => vyberProPorovnani(varky, { varka_ids: [V1] })).toThrow(ChybaVyberu);
    expect(() => vyberProPorovnani(varky, { varka_ids: [V1, 'cccccccc-1111-2222-3333-444444444444'] })).toThrow(/v evidenci nejsou: cccccccc-/);
    expect(vyberProPorovnani(varky, { posledni: 2 }).map((x) => x.id)).toEqual([V2, V3]);
    expect(vyberProPorovnani(varky, {}).map((x) => x.id)).toEqual([V2, V3, V1]);
    expect(() => vyberProPorovnani(varky, { posledni: 1 })).toThrow(ChybaVyberu);
  });

  it('seznam pro Clauda: prázdná evidence se řekne; jinak várky s id a receptury', () => {
    expect(seznamVarekText({ receptury: [], varky: [] }, [], 30)).toMatch(/Evidence várek je zatím prázdná.*nedomýšlej/);
    const p = { receptury: [{ ...receptura, pivovar_id: null, zapsal: null, zapsal_jmeno: null, upraveno_at: null }], varky: varky.map((x) => ({ ...x, pivovar_id: null, zapsal: null, zapsal_jmeno: null, upraveno_at: null })) };
    const t = seznamVarekText(p, filtrujVarky(p.varky, {}), 2);
    expect(t).toMatch(/^# Várky \(2 z 3 vybraných, v evidenci celkem 3\)/);
    expect(t).toContain(`varka_id=${V2}`);
    expect(t).not.toContain(`varka_id=${V1}`);
    expect(t).toContain(`- Světlý ležák 11 (český ležák) — receptura_id=${R1}`);
  });

  it('konektor nabízí seznam_varek a porovnej_varky; instrukce: jen uložené údaje, příčiny jako hypotézy', () => {
    expect(NASTROJE.map((n) => n.name)).toEqual(expect.arrayContaining(['seznam_varek', 'porovnej_varky']));
    expect(INSTRUKCE).toMatch(/porovnej_varky: pracuj jen s uloženými údaji, co chybí, vyjmenuj/);
  });
});
