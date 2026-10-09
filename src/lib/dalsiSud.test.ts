import { describe, it, expect } from 'vitest';
import { rozdelLahvePodleSudu } from './dalsiSud';

describe('rozdelLahvePodleSudu (9. 10. 2026: „přidej možnost přidat další volbu sudu")', () => {
  it('10° Desítka 6. 10.: 1× 50 l + 1× 20 l, lahve podle litrů a součty sedí', () => {
    const casti = rozdelLahvePodleSudu(
      [{ pkgId: 'l15', qty: 16 }, { pkgId: 'l1', qty: 38 }],
      [{ kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 }, { kegPkgId: 'k20', kegQty: 1, kegVolumeL: 20 }],
    )!;
    expect(casti).toEqual([
      { pkgId: 'l15', qty: 12, kegPkgId: 'k50', kegQty: 1, sourceL: 50 },
      { pkgId: 'l1', qty: 28, kegPkgId: 'k50', kegQty: 1, sourceL: 50 },
      { pkgId: 'l15', qty: 4, kegPkgId: 'k20', kegQty: 1, sourceL: 20 },
      { pkgId: 'l1', qty: 10, kegPkgId: 'k20', kegQty: 1, sourceL: 20 },
    ]);
    const soucet = (pkg: string) => casti.filter((c) => c.pkgId === pkg).reduce((s, c) => s + c.qty, 0);
    expect(soucet('l15')).toBe(16);
    expect(soucet('l1')).toBe(38);
  });

  it('jeden sud = beze změny, jen nese velikost', () => {
    expect(rozdelLahvePodleSudu([{ pkgId: 'l1', qty: 93 }], [{ kegPkgId: 'k50', kegQty: 3, kegVolumeL: 50 }]))
      .toEqual([{ pkgId: 'l1', qty: 93, kegPkgId: 'k50', kegQty: 3, sourceL: 150 }]);
  });

  it('každý sud dostane aspoň jednu lahev, jinak by se neodečetl', () => {
    const casti = rozdelLahvePodleSudu([{ pkgId: 'l1', qty: 3 }], [{ kegPkgId: 'k50', kegQty: 2, kegVolumeL: 50 }, { kegPkgId: 'k10', kegQty: 1, kegVolumeL: 10 }])!;
    expect(casti.map((c) => [c.kegPkgId, c.qty])).toEqual([['k50', 2], ['k10', 1]]);
  });

  it('míň lahví než sudů nejde rozdělit', () => {
    expect(rozdelLahvePodleSudu([{ pkgId: 'l1', qty: 1 }], [{ kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 }, { kegPkgId: 'k20', kegQty: 1, kegVolumeL: 20 }])).toBeNull();
  });
});
