// 🧭 Sud nesmí spadnout mezi lahve (a naopak).
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: „u stáčení lahví mi to ukazuje nějaké blbosti,
// co chybí stočit nějakých 6×30 tmavá — tam to má ukazovat jen lahve."
//
// Příčina: filtry obalů se ptaly jen na `packages.kind`. Obal „KEG 30l",
// který nemá `kind` vyplněný (starší obaly ho nemají), pak podmínkou
// `kind !== 'keg'` prošel jako LAHEV. Aplikace přitom o té nespolehlivosti
// věděla — `jeSud()` v inventoryFix.ts se dívá i na popisek a Orders.tsx si
// obaly řadí taky přes popisek — jen to plánování stáčení nepoužívalo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeKeggingPlan } from './keggingPlan';
import { jeSud } from './inventoryFix';

const beers = [{ id: 'b1', name: '11° Tmavá' }];
const packages = [
  // Sud se VŠÍM všudy — takhle má vypadat správně vyplněný obal.
  { id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  // Sud BEZ vyplněného druhu — přesně ten, co propadl mezi lahve.
  { id: 'sud30', label: 'KEG 30l', kind: '', volume_l: 30 },
  { id: 'lahev', label: '0,5l', kind: 'bottle', volume_l: 0.5 },
];
const orders = [{ id: 'o1', status: 'nova', delivery_day: 'po', delivery_date: '2026-09-14', is_delivered: false }];
const orderItems = [
  { order_id: 'o1', beer_id: 'b1', package_id: 'sud30', quantity: 6 },
  { order_id: 'o1', beer_id: 'b1', package_id: 'lahev', quantity: 20 },
];

const plan = (jeCilovyObal: (kind: string, label?: string | null) => boolean) =>
  computeKeggingPlan({
    beers, packages, orders, orderItems,
    keggingRows: [], fasovaniRows: [], prodejnaRows: [], writeoffsRows: [],
    weekKey: '2026-38', jeCilovyObal,
  } as any).flatMap((d) => d.items);

describe('obal se nesmí splést s druhou obrazovkou', () => {
  it('sud bez vyplněného druhu se do LAHVÍ nedostane', () => {
    const lahve = plan((kind, label) => !jeSud(kind, label));
    expect(lahve.map((i) => i.package_id)).not.toContain('sud30');
  });

  it('…a v SUDECH naopak být musí — jinak by se ztratil úplně', () => {
    const sudy = plan((kind, label) => jeSud(kind, label));
    expect(sudy.map((i) => i.package_id)).toContain('sud30');
  });

  it('lahev zůstává u lahví a mezi sudy nejde', () => {
    expect(plan((kind, label) => !jeSud(kind, label)).map((i) => i.package_id)).toContain('lahev');
    expect(plan((kind, label) => jeSud(kind, label)).map((i) => i.package_id)).not.toContain('lahev');
  });
});

describe('filtry obalů se ptají i na popisek, nejen na kind', () => {
  // Samotný `kind !== 'keg'` je ta chyba. Kdyby se někam vrátil, spadne to tu,
  // ne až u někoho ve stáčení.
  const soubory = [
    'src/screens/BottlingScreen.tsx',
    'src/components/CoStocitOkno.tsx',
    'src/screens/Kegging.tsx',
  ];

  it('nikde se druh obalu nerozhoduje jen podle kind', () => {
    const nalezy = soubory.filter((cesta) => /kind\s*!==?\s*'keg'/.test(readFileSync(cesta, 'utf8')));
    expect(nalezy, 'rozhoduje jen podle kind — použij jeSud(kind, label)').toEqual([]);
  });
});
