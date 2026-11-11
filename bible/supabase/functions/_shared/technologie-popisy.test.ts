// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DRUHY_ZARIZENI, hodnotaParametru, SABLONY_PARAMETRU, technologieText, type ProfilPivovaru } from './technologie-popisy';
import { INSTRUKCE, NASTROJE } from './mcp';

const PIV = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('profil pivovaru pro Clauda (etapa 7)', () => {
  it('druhy zařízení odpovídají SQL kontrole a každý má šablonu', () => {
    expect(DRUHY_ZARIZENI.map((d) => d.id)).toEqual([
      'varna', 'nadoba_varny', 'tank_kvasny', 'tank_lezacky', 'tank_jiny', 'cerpadlo', 'potrubi', 'vymenik', 'chlazeni', 'filtr', 'staceni', 'cip', 'jine',
    ]);
    for (const d of DRUHY_ZARIZENI) expect(Array.isArray(SABLONY_PARAMETRU[d.id])).toBe(true);
  });

  it('hodnota parametru: desetinná čárka, jednotka jen u čísla, text zvlášť', () => {
    expect(hodnotaParametru({ nazev: 'Objem', hodnota: 7.5, jednotka: 'hl', zdroj: 'sklep' })).toBe('7,5 hl');
    expect(hodnotaParametru({ nazev: 'Materiál', text: 'nerez', jednotka: 'hl', zdroj: 'odhad' })).toBe('nerez');
    expect(hodnotaParametru({ nazev: 'Typ', hodnota: 2, text: 'odstředivé', zdroj: 'stitek' })).toBe('2 — odstředivé');
  });

  it('bez profilu to řekne a nic nedomýšlí', () => {
    const t = technologieText({ pivovary: [], pivovar_id: null, zarizeni: [], postupy: [] });
    expect(t).toMatch(/Profil pivovaru zatím není vyplněný/);
    expect(t).toMatch(/nedomýšlej/);
  });

  it('údaje provozu odliší od literatury, u parametru řekne zdroj, seskupí podle druhu', () => {
    const p: ProfilPivovaru = {
      pivovary: [
        { id: PIV, nazev: 'Pivovar Zajíc', popis: 'Dvounádobová varna', hlavni: true },
        { id: 'bbbbbbbb-1111-2222-3333-444444444444', nazev: 'Pobočka', popis: null, hlavni: false },
      ],
      pivovar_id: PIV,
      zarizeni: [
        { id: '1', druh: 'tank_lezacky', nazev: 'Tank 1', pocet: 1, parametry: [{ nazev: 'Objem užitný', hodnota: 75, jednotka: 'hl', zdroj: 'sklep' }], poznamka: null },
        { id: '2', druh: 'tank_kvasny', nazev: 'Spilka 1', pocet: 1, parametry: [{ nazev: 'Materiál', text: 'nerez', zdroj: 'odhad' }], poznamka: 'Otevřená' },
        { id: '3', druh: 'cerpadlo', nazev: 'Čerpadlo mladiny', pocet: 2, parametry: [], poznamka: null },
      ],
      postupy: [{ id: '4', nazev: 'CIP spilky', oblast: 'L', kroky: '1. Předplach', zdroj: 'vlastní praxe' }],
    };
    const t = technologieText(p);
    expect(t).toMatch(/^# Pivovar Zajíc — parametry provozu/);
    expect(t).toMatch(/KONKRÉTNÍHO PROVOZU.*ne literatura/);
    expect(t).toMatch(/Další pivovary v bibli: Pobočka \(pivovar_id=bbbbbbbb-/);
    expect(t).toMatch(/Popis provozu: Dvounádobová varna/);
    expect(t).toMatch(/- Objem užitný: 75 hl \[zdroj: ze Sklepa v appce\]/);
    expect(t).toMatch(/- Materiál: nerez \[zdroj: odhad\]/);
    expect(t).toMatch(/- Čerpadlo mladiny \(2 ks\)/);
    expect(t).toMatch(/Poznámka: Otevřená/);
    expect(t).toMatch(/### CIP spilky \(oblast L\) — zdroj: vlastní praxe\n1\. Předplach/);
    // Pořadí podle druhu: kvasné tanky před ležáckými, čerpadla za nimi.
    expect(t.indexOf('## Kvasné tanky')).toBeLessThan(t.indexOf('## Ležácké tanky'));
    expect(t.indexOf('## Ležácké tanky')).toBeLessThan(t.indexOf('## Čerpadla'));
  });

  it('konektor nabízí nástroj profil_pivovaru a instrukce ho oddělují od knih', () => {
    const n = NASTROJE.find((x) => x.name === 'profil_pivovaru');
    expect(n?.description).toMatch(/ne literatura/);
    expect(INSTRUKCE).toMatch(/profil_pivovaru/);
    expect(INSTRUKCE).toMatch(/co v profilu chybí, nedomýšlej/);
  });
});
