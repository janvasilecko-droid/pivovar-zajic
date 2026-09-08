import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatistikaVystav from './StatistikaVystav';

// recharts měří kontejner přes ResizeObserver, který jsdom nemá. Bez něj se
// grafy nevykreslí (mají nulovou velikost), ale zbytek obrazovky — čísla,
// tabulky, žebříček — se vykreslit MUSÍ. Přesně to se tu ověřuje.
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

const OBALY = [
  { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'lahev', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
];
const PIVA = [{ id: 'b11', name: '11° Světlá' }, { id: 'b12', name: '12° Polotmavá' }];

const kegging = [
  { entry_date: '2026-08-25', beer_id: 'b11', package_id: 'keg30', quantity: 20 }, // 600 l
  { entry_date: '2026-07-15', beer_id: 'b12', package_id: 'keg30', quantity: 10 }, // 300 l
];
const bottling = [
  { entry_date: '2026-08-26', beer_id: 'b11', package_id: 'lahev', quantity: 400 }, // 200 l
];
const orders = [
  { id: 'o1', place_name: 'Hospoda U Lípy', delivery_date: '2026-08-28', order_date: '2026-08-24', status: 'nova' },
];
const orderItems = [{ order_id: 'o1', package_id: 'keg30', quantity: 3 }];

function vykresli() {
  return render(
    <StatistikaVystav
      bottlingRows={bottling}
      keggingRows={kegging}
      obaly={OBALY}
      piva={PIVA}
      orders={orders}
      orderItems={orderItems}
      dnes="2026-08-27"
      obdobi="mesic"
      onObdobi={vi.fn()}
    />,
  );
}

describe('Statistika — Výstav', () => {
  it('výstav bere JEN sudy — lahve se do něj nepřičítají', () => {
    vykresli();
    // Srpen: 20 sudů × 30 l = 600 l = 6 hl. Lahvování (400 × 0,5 l = 200 l)
    // se NEpřičítá — lahvuje se z už stočených sudů, jinak by se tentýž
    // objem počítal dvakrát a vyšlo by 8 hl.
    expect(screen.getByText('Tento měsíc')).toBeTruthy();
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('8').length).toBe(0);
  });

  it('lahvování se ukazuje zvlášť a řekne, jaký je to podíl výstavu', () => {
    vykresli();
    expect(screen.getByText('Přestočeno do lahví')).toBeTruthy();
    // 200 l ze 600 l výstavu = 33 %.
    expect(screen.getByText(/33 % výstavu/)).toBeTruthy();
  });

  it('ukáže rozpad podle piv i podle obalů, ne jen barevný graf', () => {
    vykresli();
    // Barva sama nesmí nést informaci — u každé výseče je popisek i číslo.
    expect(screen.getAllByText('11° Světlá').length).toBeGreaterThan(0);
    expect(screen.getAllByText('KEG 30 l').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lahev 0,5 l').length).toBeGreaterThan(0);
  });

  it('žebříček odběratelů bere den závozu', () => {
    vykresli();
    expect(screen.getByText('Hospoda U Lípy')).toBeTruthy();
    // 3 sudy × 30 l = 90 l = 0,9 hl
    expect(screen.getByText('0,9 hl')).toBeTruthy();
  });

  it('prázdné období nespadne, jen to řekne', () => {
    render(
      <StatistikaVystav
        bottlingRows={[]} keggingRows={[]} obaly={OBALY} piva={PIVA}
        orders={[]} orderItems={[]} dnes="2026-08-27" obdobi="tyden" onObdobi={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/V tomhle období se nic nestočilo/).length).toBe(2);
    expect(screen.getByText(/V tomhle období se nelahvovalo/)).toBeTruthy();
    expect(screen.getByText(/V tomhle období není žádná objednávka/)).toBeTruthy();
  });
});

describe('barvy grafu podle motivu', () => {
  it('barvaZMotivu vezme hodnotu proměnné, ne napsaný odstín', async () => {
    // Graf kreslí do SVG přes atributy fill/stroke, kde třídy nefungují —
    // hodnota musí být řetězec. Dřív tu byly odstíny natvrdo, takže
    // v tmavém režimu zůstala mřížka světlá, popisky os tmavé (na tmavém
    // pozadí neviditelné) a koláč byl obtažený bílou.
    document.documentElement.style.setProperty('--ink-neutral-500', '10 20 30');
    const { barvaZMotivu } = await import('./StatistikaVystav');
    expect(barvaZMotivu('--ink-neutral-500', '#000')).toBe('rgb(10 20 30)');
  });

  it('bez proměnné vrátí zálohu, takže graf nezmizí', async () => {
    const { barvaZMotivu } = await import('./StatistikaVystav');
    expect(barvaZMotivu('--tahle-neexistuje', '#abcdef')).toBe('#abcdef');
  });
});
