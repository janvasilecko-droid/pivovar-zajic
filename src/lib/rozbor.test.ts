import { describe, expect, it } from 'vitest';
import { radkyRozboru } from './rozbor';

const piva = [{ id: 'tm', name: 'Tmavé' }, { id: 'sv', name: '12° Světlá' }];
const obaly = [{ id: 'l033', label: 'Lahev 0,33 l' }, { id: 'k50', label: 'KEG 50l' }];

describe('Rozbor', () => {
  it('ukáže i stočené lahve bez objednávky (9. 10. 2026)', () => {
    const r = radkyRozboru({
      planSudy: [{ key: 'sv__k50', beer_id: 'sv', beer_name: '12° Světlá', package_id: 'k50', package_label: 'KEG 50l', ordered: 4, missing: 1 }],
      planLahve: [],
      kegging: [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k50', quantity: 3 }, { entry_date: '2026-10-01', beer_id: 'sv', package_id: 'k50', quantity: 9 }],
      bottling: [{ entry_date: '2026-10-07', beer_id: 'tm', package_id: 'l033', quantity: 100 }],
      od: '2026-10-05',
      doDne: '2026-10-11',
      zasoba: new Map([['tm__l033', 100], ['sv__k50', 2]]),
      piva,
      obaly,
    });
    expect(r).toEqual([
      expect.objectContaining({ key: 'sv__k50', stoceno: 3, objednano: 4, stocit: 1, skladem: 2, lahve: false }),
      expect.objectContaining({ key: 'tm__l033', beer_name: 'Tmavé', package_label: 'Lahev 0,33 l', stoceno: 100, objednano: 0, stocit: 0, skladem: 100, lahve: true }),
    ]);
  });
});
