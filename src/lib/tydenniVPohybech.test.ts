import { describe, expect, it } from 'vitest';
import { radkyTydenniInventury } from './tydenniVPohybech';

const pohyby: any[] = [
  { date: '2026-10-05', beer_id: 'sv', package_id: 'k50', qty: 18, kind: 'kegovani' },
  { date: '2026-10-07', beer_id: 'sv', package_id: 'k50', qty: -12, kind: 'zavoz' },
  { date: '2026-10-10', beer_id: 'sv', package_id: 'k50', qty: -2, kind: 'zavoz' },
];

describe('týdenní inventura v Pohybech', () => {
  it('ukáže napočítáno, čekáno při počítání, stav k tomu dni a teď', () => {
    const r = radkyTydenniInventury({
      zaznamy: [
        { tyden_od: '2026-10-05', tyden_do: '2026-10-11', beer_id: 'sv', package_id: 'k50', ocekavano: 6, napocitano: 5, updated_at: '2026-10-09T15:00:00Z' },
        { tyden_od: '2026-09-28', tyden_do: '2026-10-04', beer_id: 'sv', package_id: 'k50', ocekavano: 1, napocitano: 1, updated_at: '2026-10-02T10:00:00Z' },
        { tyden_od: '2026-10-05', tyden_do: '2026-10-11', beer_id: 'tm', package_id: 'k50', ocekavano: 0, napocitano: 3, updated_at: '2026-10-09T15:00:00Z' },
      ],
      pohyby, od: '2026-10-05', doDne: '2026-10-11', beerId: 'sv', dnes: '2026-10-11',
      denPodleCasu: (iso) => iso.slice(0, 10),
    });
    expect(r).toEqual([expect.objectContaining({ den: '2026-10-09', napocitano: 5, ocekavano: 6, rozdil: -1, kDniPocitani: 6, ted: 4 })]);
  });
});

describe('rozepsané počty (neuložené)', () => {
  it('ukáže rozepsaný počet s rozdílem proti skladu teď, uložený má přednost', () => {
    const r = radkyTydenniInventury({
      zaznamy: [{ tyden_od: '2026-10-05', tyden_do: '2026-10-11', beer_id: 'sv', package_id: 'k50', ocekavano: 6, napocitano: 5, updated_at: '2026-10-09T15:00:00Z' }],
      pohyby, od: '2026-10-05', doDne: '2026-10-11', dnes: '2026-10-11', denPodleCasu: (i) => i.slice(0, 10),
      koncepty: { '2026-10-05': { sv__k50: '9', tm__k50: '3', 'x__y': '' } },
    });
    expect(r.map((x) => [x.beer_id, x.napocitano, x.rozepsano, x.ocekavano])).toEqual([['sv', 5, false, 6], ['tm', 3, true, null]]);
    expect(r[1]).toEqual(expect.objectContaining({ ted: 0, rozdil: 3 }));
  });
});
