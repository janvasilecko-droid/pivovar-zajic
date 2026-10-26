import { describe, expect, it } from 'vitest';
import { cilSklepa, subTabTanku } from './cilTanku';

describe('cilSklepa', () => {
  it('z kódu tanku vrátí ležáckou záložku a id (klik na C7)', () => {
    expect(cilSklepa(subTabTanku('c7-id'))).toEqual({ zalozka: 'lezacke', tankId: 'c7-id' });
  });

  it('běžná záložka sklepa tank nevybírá', () => {
    expect(cilSklepa('spilka')).toEqual({ zalozka: 'spilka', tankId: null });
    expect(cilSklepa(undefined)).toEqual({ zalozka: 'lezacke', tankId: null });
  });
});
