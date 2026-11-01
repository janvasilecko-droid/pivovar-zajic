// 🛢️ Štítek dlaždice Malé sudy na ploše — spočítá se mimo start appky
// (HomeScreen ho načte dynamicky), text musí zůstat stejný jako dřív.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

let souhrn: unknown[] = [];
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: { s10: 8 }, zapocitatPlne: new Set(), zadanoKdy: {} }),
  useHlidaniMalychSudu: () => ({ souhrn, nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));

import MaleSudyStitek, { stitekMalychSudu } from './MaleSudyStitek';

const s = (mame: number, objednano: number, nad = 0) => ({ package_id: 'p', mame, objednano, nad });

describe('štítek dlaždice Malé sudy', () => {
  it('volné = prázdné teď minus otevřené objednávky; chybějící mají přednost; bez počtu nic', () => {
    expect(stitekMalychSudu([s(2, 0), s(0, 0)])).toBe('volné 2 ks');
    expect(stitekMalychSudu([s(4, 1), s(1, 3, 2)])).toBe('⚠ 2 ks nemá sud');
    expect(stitekMalychSudu([])).toBeUndefined();
  });

  it('komponenta nic nekreslí a pošle štítek ploše', () => {
    souhrn = [s(2, 0)];
    const onStitek = vi.fn();
    const { container } = render(<MaleSudyStitek onStitek={onStitek} />);
    expect(container.innerHTML).toBe('');
    expect(onStitek).toHaveBeenLastCalledWith('volné 2 ks');
  });
});
