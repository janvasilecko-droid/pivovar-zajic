// Párování toho, co AI přečte z fotky, na katalog piv a obalů.
// Zadání 22. 9. 2026: „dával jsem číst z fotky fasování obchod a četlo to
// špatně … ať to čte přesně."
import { describe, it, expect } from 'vitest';
import { pivoZFotky, obalZFotky, radkyZFotky } from './fotkaPolozky';

const PIVA = [
  { id: 'b-12sv', name: '12° Světlá', degree: '12°' },
  { id: 'b-12tm', name: '12° Tmavá', degree: '12°' },
  { id: 'b-10de', name: '10° Desítka', degree: '10°' },
  { id: 'b-summ', name: 'Summer Ale', degree: null },
];

const OBALY = [
  { id: 'p-keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'p-keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'p-lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'p-lah033', label: 'Lahev 0,33l', kind: 'bottle', volume_l: 0.33 },
  { id: 'p-pet15', label: 'PET 1,5l', kind: 'pet', volume_l: 1.5 },
];

describe('pivoZFotky', () => {
  it('najde pivo podle přesného jména', () => {
    expect(pivoZFotky({ beer_name: '12° Světlá' }, PIVA)?.id).toBe('b-12sv');
  });

  it('najde pivo i podle části jména a bez diakritiky', () => {
    expect(pivoZFotky({ beer_name: 'summer ale' }, PIVA)?.id).toBe('b-summ');
    expect(pivoZFotky({ beer_name: 'Desitka' }, PIVA)?.id).toBe('b-10de');
  });

  it('při shodě části jména rozhodne stupeň — světlá vs. tmavá', () => {
    // „12 tmava" musí sednout na tmavou, i když obě jsou dvanáctky.
    expect(pivoZFotky({ beer_name: 'Tmavá', degree: '12°' }, PIVA)?.id).toBe('b-12tm');
  });

  it('holý stupeň bere až jako poslední možnost', () => {
    expect(pivoZFotky({ degree: '10°' }, PIVA)?.id).toBe('b-10de');
  });

  it('co se nepozná, zůstane prázdné — radši nic než špatné pivo', () => {
    expect(pivoZFotky({ beer_name: 'Ležák z jiného pivovaru' }, PIVA)).toBeUndefined();
    expect(pivoZFotky({}, PIVA)).toBeUndefined();
  });
});

describe('obalZFotky', () => {
  it('sedne na přesný popisek', () => {
    expect(obalZFotky({ package_label: 'KEG 30l' }, OBALY)?.id).toBe('p-keg30');
  });

  it('pozná objem s desetinnou čárkou i tečkou', () => {
    expect(obalZFotky({ package_label: '0,5 l' }, OBALY)?.id).toBe('p-lah05');
    expect(obalZFotky({ package_label: '0.33l' }, OBALY)?.id).toBe('p-lah033');
  });

  it('vezme objem z původního řádku, když popisek chybí', () => {
    expect(obalZFotky({ raw_line: '6x0,5 svetla' }, OBALY)?.id).toBe('p-lah05');
    expect(obalZFotky({ raw_line: '4x50' }, OBALY)?.id).toBe('p-keg50');
  });

  it('počet před křížkem nepovažuje za objem', () => {
    // „24x0,5" = 24 kusů půllitrů, ne obal o 24 litrech (24 v katalogu není).
    expect(obalZFotky({ raw_line: '24x0,5' }, OBALY)?.id).toBe('p-lah05');
  });

  it('zúžený katalog nepustí obal z jiné obrazovky', () => {
    const jenSudy = OBALY.filter((p) => p.kind === 'keg');
    // „30" ve stáčení sudů je KEG 30l; mezi lahvemi by nemělo co chytit.
    expect(obalZFotky({ raw_line: '2x30' }, jenSudy)?.id).toBe('p-keg30');
    const jenLahve = OBALY.filter((p) => p.kind !== 'keg');
    expect(obalZFotky({ raw_line: '2x30' }, jenLahve)).toBeUndefined();
  });

  it('neznámý obal zůstane prázdný', () => {
    expect(obalZFotky({ package_label: 'sud 25l' }, OBALY)).toBeUndefined();
  });
});

describe('radkyZFotky', () => {
  it('udělá z položek řádky s ID a počtem', () => {
    const radky = radkyZFotky(
      [
        { beer_name: '12° Světlá', package_label: '0,5 l', quantity: 24, raw_line: '24x0,5 12sv' },
        { beer_name: 'Summer Ale', package_label: null, quantity: '6', raw_line: '6x0,33 summer' },
      ],
      PIVA,
      OBALY,
    );
    expect(radky).toEqual([
      { beerId: 'b-12sv', pkgId: 'p-lah05', qty: '24' },
      { beerId: 'b-summ', pkgId: 'p-lah033', qty: '6' },
    ]);
  });

  it('nesmyslný počet se nepřenese', () => {
    const radky = radkyZFotky([{ beer_name: '12° Světlá', package_label: '0,5 l', quantity: 0 }], PIVA, OBALY);
    expect(radky[0].qty).toBe('');
  });

  it('zúžení obalů platí pro celou dávku', () => {
    const radky = radkyZFotky(
      [{ beer_name: '10° Desítka', raw_line: '4x50', quantity: 4 }],
      PIVA,
      OBALY,
      (o) => o.kind === 'keg',
    );
    expect(radky[0]).toEqual({ beerId: 'b-10de', pkgId: 'p-keg50', qty: '4' });
  });
});
