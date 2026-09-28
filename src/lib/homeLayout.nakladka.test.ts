// Z provozu 28. 9. 2026: „dej možnost do závozu dát tam zaškrtávací pole
// přidat přehled na plochu."
import { describe, it, expect } from 'vitest';
import { jeNakladkaNaPlose, pouzijPozadavekNakladky, type HomeLayout } from './homeLayout';

const plocha = (pages: string[][]): HomeLayout => ({
  pages, overrides: { cellar: { w: 1, h: 1, x: 3, y: 0 } }, groups: {}, tileOpacity: 1, tileGap: 8,
  dock: [], hidden: ['nakladka'], fixedColors: {},
} as unknown as HomeLayout);

describe('přehled nakládky na ploše', () => {
  it('přidat = úplně nahoru na první stránku, přes celou šířku, ne schovaná', () => {
    const po = pouzijPozadavekNakladky(plocha([['orders_zavoz', 'cellar'], []]), 'pridat');
    expect(po.pages[0]).toEqual(['nakladka', 'orders_zavoz', 'cellar']);
    expect(po.overrides.nakladka).toMatchObject({ w: 3, h: 2 });
    expect(po.hidden).not.toContain('nakladka');
    // Stránka se seřadí znovu shora dolů — stará pozice zmizí.
    expect(po.overrides.cellar?.x).toBeUndefined();
  });

  it('přidat dvakrát ji nezdvojí', () => {
    const po = pouzijPozadavekNakladky(plocha([['cellar', 'nakladka']]), 'pridat');
    expect(po.pages.flat().filter((id) => id === 'nakladka')).toHaveLength(1);
  });

  it('odebrat ji z plochy sundá, ostatní nechá být', () => {
    const po = pouzijPozadavekNakladky(plocha([['nakladka', 'cellar']]), 'odebrat');
    expect(po.pages[0]).toEqual(['cellar']);
    expect(po.overrides.cellar?.x).toBe(3);
  });

  it('zaškrtávátko v Rozvozu ukazuje stav plochy i čekající požadavek', () => {
    expect(jeNakladkaNaPlose({ pages: [['nakladka']] })).toBe(true);
    expect(jeNakladkaNaPlose({ pages: [['cellar']] })).toBe(false);
    expect(jeNakladkaNaPlose({ pages: [['cellar']], nakladkaPozadavek: 'pridat' })).toBe(true);
    expect(jeNakladkaNaPlose({ pages: [['nakladka']], nakladkaPozadavek: 'odebrat' })).toBe(false);
    expect(jeNakladkaNaPlose(null)).toBe(false);
  });
});
