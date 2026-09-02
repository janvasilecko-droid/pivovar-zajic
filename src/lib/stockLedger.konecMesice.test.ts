// 📅 Napočítaná inventura je ZÁVĚR měsíce, ne jeho počátek.
// ---------------------------------------------------------------------------
// Fyzická i schválená inventura se ukládala k PRVNÍMU dni měsíce, který
// popisuje. Skladová kniha ji ale bere jako reset stavu a přičítá k ní pohyby
// OD toho data dál — takže k napočítanému stavu přičetla ještě celý inventovaný
// měsíc. Srpen 2026, 12° Světlá 50 l: napočítány 4 sudy, Sklad z nich udělal
// 4 + 95 − 77 − 25 = −3, kdežto Inventura počítala od zapsaného počátku 11 a
// vyšla taky na 4. Dvě strany téhož měsíce si přímo odporovaly a 29 z 56
// kombinací pivo × obal svítilo v mínusu.
//
// Od té doby se napočítaný stav ukládá k POSLEDNÍMU dni měsíce (datumDoplnku)
// a stockAsOf ho čte jako závěr toho dne: co se ten den stalo, v napočítaném
// čísle už je.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildMovements, expectedForMonth, stockAsOf, stockAtStartOfDay, stockForMonth } from './stockLedger';

const PACKAGES = [{ id: 'keg50', kind: 'keg', volume_l: 50 }];
const KLIC = 'b__keg50';

// Skutečná srpnová data 12° Světlé v 50l sudech.
const srpen = {
  inventoryRows: [
    { beer_id: 'b', package_id: 'keg50', entry_date: '2026-08-01', quantity: 11, note: 'Počáteční stav' },
    { beer_id: 'b', package_id: 'keg50', entry_date: '2026-08-31', quantity: 4, note: 'Fyzická inventura' },
  ],
  keggingRows: [{ beer_id: 'b', package_id: 'keg50', entry_date: '2026-08-10', quantity: 95 }],
  zavozDeductionRows: [{ beer_id: 'b', package_id: 'keg50', deduct_date: '2026-08-20', quantity: 77 }],
  bottlingRows: [
    // Sudy spotřebované na stáčení lahví — 25 ks.
    { beer_id: 'b', package_id: 'keg50', entry_date: '2026-08-25', quantity: 0, kegs_used: 25, kegs_used_package_id: 'keg50' },
  ],
  packages: PACKAGES,
};

describe('napočítaná inventura na konci měsíce', () => {
  it('Sklad ukáže napočítané číslo, ne napočítané PLUS celý měsíc', () => {
    // Dřív: 4 + 95 − 77 − 25 = −3.
    expect(stockAsOf(buildMovements(srpen), '2026-09-02').get(KLIC)?.qty).toBe(4);
  });

  it('Inventura počítá od zapsaného počátku a dojde ke stejné čtyřce', () => {
    // Obě strany téhož měsíce si musí odpovídat — to je celý smysl opravy.
    expect(expectedForMonth(buildMovements(srpen), '2026-08').get(KLIC)?.qty).toBe(4);
  });

  it('stáčení doplněné z inventury se nezapočítá podruhé', () => {
    // Doplněk se datuje na poslední den měsíce (datumDoplnku) — na stejný den
    // jako napočítaný stav. Kdyby se pohyby toho dne přičetly, srovnaný rozdíl
    // by ve skladu naskočil dvakrát.
    const sDoplnkem = {
      ...srpen,
      keggingRows: [
        ...srpen.keggingRows,
        { beer_id: 'b', package_id: 'keg50', entry_date: '2026-08-31', quantity: 3, note: 'Doplněno z inventury 2026-08' },
      ],
    };
    expect(stockAsOf(buildMovements(sDoplnkem), '2026-09-02').get(KLIC)?.qty).toBe(4);
  });

  it('zářijové pohyby se ale přičítají dál', () => {
    const seZarim = {
      ...srpen,
      zavozDeductionRows: [
        ...srpen.zavozDeductionRows,
        { beer_id: 'b', package_id: 'keg50', deduct_date: '2026-09-01', quantity: 1 },
      ],
    };
    expect(stockAsOf(buildMovements(seZarim), '2026-09-02').get(KLIC)?.qty).toBe(3);
  });

  it('počáteční stav dalšího měsíce vychází z napočítané čtyřky', () => {
    // Tohle čte computeInitialStockForMonth na obrazovce Inventura.
    expect(stockAtStartOfDay(buildMovements(srpen), '2026-09-01').get(KLIC)?.qty).toBe(4);
  });
});

describe('„Počáteční stav" si drží ranní chování', () => {
  // Počáteční stav popisuje RÁNO prvního dne — co se ten den stočí nebo vydá,
  // teprve přijde. Kdyby se choval jako závěr dne, spadl by pod stůl celý
  // první den měsíce.
  const prvniDen = {
    inventoryRows: [{ beer_id: 'b', package_id: 'keg50', entry_date: '2026-09-01', quantity: 4, note: 'Počáteční stav' }],
    keggingRows: [{ beer_id: 'b', package_id: 'keg50', entry_date: '2026-09-01', quantity: 6 }],
    packages: PACKAGES,
  };

  it('stáčení z prvního dne se k počátku přičte', () => {
    expect(stockAsOf(buildMovements(prvniDen), '2026-09-01').get(KLIC)?.qty).toBe(10);
  });
});

describe('Sklad a Inventura ukazují tentýž měsíc stejně', () => {
  // Sloupce Skladu se čtou jako „počáteční + stočeno − výdeje = stav", což je
  // rozpad měsíce. Dřív je stavěl stockAsOf, který sčítá pohyby OD POSLEDNÍ
  // INVENTURY — a jakmile napočítaný stav sedí na posledním dni měsíce, nezbyl
  // by v inventovaném měsíci žádný pohyb: samé nuly a napočítané číslo.
  it('pohyby měsíce zůstanou vidět i po uložené inventuře', () => {
    const sklad = stockForMonth(buildMovements(srpen), '2026-08').get(KLIC)!;
    expect(sklad.byKind.kegovani).toBe(95);
    expect(sklad.byKind.zavoz).toBe(-77);
    expect(sklad.byKind.sud_na_lahve).toBe(-25);
  });

  it('sloupce sedí s Inventurou kus na kus', () => {
    const mv = buildMovements(srpen);
    expect(stockForMonth(mv, '2026-08').get(KLIC)!.byKind)
      .toEqual(expectedForMonth(mv, '2026-08', true).get(KLIC)!.byKind);
  });

  it('a počátek taky, když je „Počáteční stav" za měsíc zapsaný', () => {
    const mv = buildMovements(srpen);
    expect(stockForMonth(mv, '2026-08').get(KLIC)!.baselineQty)
      .toBe(expectedForMonth(mv, '2026-08').get(KLIC)!.baselineQty);
  });

  it('Sklad si tabulku opravdu staví z měsíčního rozpadu', () => {
    // Pojistka proti návratu k stockAsOf — chyba by se projevila až tím, že
    // Sklad ukáže jiná čísla než Inventura, což z testů knihovny vidět není.
    const zdroj = readFileSync('src/screens/Stock.tsx', 'utf8');
    expect(zdroj).toContain('stockForMonth(');
    expect(zdroj).not.toContain('stockAsOf(');
  });
});
