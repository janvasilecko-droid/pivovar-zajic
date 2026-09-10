import { describe, it, expect } from 'vitest';
import { sliceByRange } from './supabase';

// 🐛 Regrese k bugu nalezenému 10. 9. 2026: offline odpověď (serveCached)
// ignorovala offset/limit z .range() a vždycky vrátila CELOU tabulku.
// fetchAllRows pak u tabulky nad 1000 řádků (orders, order_items,
// fasovani…) nikdy nedostal stránku kratší než PAGE a smyčku zastavila až
// pojistka na 500 000 nasbíraných řádcích — appka offline "neviděla data"
// a zadávání vypadalo, že nefunguje.
describe('sliceByRange', () => {
  const radky = Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}`, n: i }));

  it('ořízne podle offset/limit z .range() (supabase-js posílá jako URL parametry)', () => {
    const prvniStranka = sliceByRange(radky, new URLSearchParams('select=*&offset=0&limit=1000'));
    expect(prvniStranka).toHaveLength(1000);
    expect(prvniStranka[0].id).toBe('r0');
    expect(prvniStranka[999].id).toBe('r999');

    const druhaStranka = sliceByRange(radky, new URLSearchParams('select=*&offset=1000&limit=1000'));
    expect(druhaStranka).toHaveLength(500);
    expect(druhaStranka[0].id).toBe('r1000');
  });

  it('druhá stránka je kratší než PAGE, takže fetchAllRows smyčku správně ukončí', () => {
    const PAGE = 1000;
    const druhaStranka = sliceByRange(radky, new URLSearchParams('offset=1000&limit=1000'));
    expect(druhaStranka.length).toBeLessThan(PAGE);
  });

  it('bez offset/limit vrátí všechny řádky beze změny (dotaz bez .range())', () => {
    expect(sliceByRange(radky, new URLSearchParams('select=*'))).toHaveLength(1500);
  });

  it('malá tabulka pod PAGE — jedna stránka obsahuje všechno', () => {
    const malo = radky.slice(0, 42);
    const stranka = sliceByRange(malo, new URLSearchParams('offset=0&limit=1000'));
    expect(stranka).toHaveLength(42);
  });
});
