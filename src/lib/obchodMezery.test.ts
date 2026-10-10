// Mezery v uzávěrkách obchodu (10. 10. 2026): sklad se počítá z uzávěrek, chybějící den = sklad ukazuje víc.
import { describe, it, expect } from 'vitest';
import { dnyMezery, mezeryUzaverek, textMezery } from './obchodMezery';

const u = (od: string, do_: string, stredisko: string | null = '2') => ({ datum_od: od, datum_do: do_, stredisko });

describe('mezeryUzaverek', () => {
  it('týdenní uzávěrka a pak denní bez mezery = žádná mezera', () => {
    const m = mezeryUzaverek({
      uzaverky: [u('2026-10-05', '2026-10-11'), u('2026-10-12', '2026-10-12')],
      zavreno: [],
      dnes: '2026-10-13',
    });
    expect(m).toEqual([]);
  });

  it('chybějící dny mezi uzávěrkami jsou mezera', () => {
    const m = mezeryUzaverek({
      uzaverky: [u('2026-10-01', '2026-10-02'), u('2026-10-06', '2026-10-09')],
      zavreno: [],
      dnes: '2026-10-10',
    });
    expect(m).toEqual([{ od: '2026-10-03', do: '2026-10-05', dnu: 3, stredisko: '2' }]);
  });

  it('dny od poslední uzávěrky do včerejška jsou mezera, dnešek ne (uzávěrka se dělá večer)', () => {
    const m = mezeryUzaverek({ uzaverky: [u('2026-10-01', '2026-10-07')], zavreno: [], dnes: '2026-10-10' });
    expect(m).toEqual([{ od: '2026-10-08', do: '2026-10-09', dnu: 2, stredisko: '2' }]);
  });

  it('před první uzávěrkou se nic nehlídá', () => {
    const m = mezeryUzaverek({ uzaverky: [u('2026-10-08', '2026-10-09')], zavreno: [], dnes: '2026-10-10' });
    expect(m).toEqual([]);
  });

  it('bez jediné uzávěrky nejsou žádné mezery (není od čeho počítat)', () => {
    expect(mezeryUzaverek({ uzaverky: [], zavreno: [], dnes: '2026-10-10' })).toEqual([]);
  });

  it('den označený jako zavřeno mezeru zavře; mezera se rozdělí', () => {
    const m = mezeryUzaverek({
      uzaverky: [u('2026-10-01', '2026-10-02'), u('2026-10-07', '2026-10-09')],
      zavreno: [{ datum: '2026-10-04' }],
      dnes: '2026-10-10',
    });
    expect(m.map((x) => [x.od, x.do])).toEqual([['2026-10-03', '2026-10-03'], ['2026-10-05', '2026-10-06']]);
  });

  it('každé středisko se hlídá zvlášť — uzávěrka jedné pokladny nepokryje druhou', () => {
    const m = mezeryUzaverek({
      uzaverky: [u('2026-10-01', '2026-10-09', '1'), u('2026-10-01', '2026-10-05', '2')],
      zavreno: [],
      dnes: '2026-10-10',
    });
    expect(m).toEqual([{ od: '2026-10-06', do: '2026-10-09', dnu: 4, stredisko: '2' }]);
  });

  it('uzávěrky bez střediska se berou jako jedna pokladna a mezera nese stredisko null', () => {
    const m = mezeryUzaverek({ uzaverky: [u('2026-10-01', '2026-10-03', null)], zavreno: [], dnes: '2026-10-06' });
    expect(m).toEqual([{ od: '2026-10-04', do: '2026-10-05', dnu: 2, stredisko: null }]);
  });

  it('staré mezery mimo okno se neukazují, mezera zasahující do okna se ořízne', () => {
    const uzaverky = [u('2026-01-01', '2026-01-10'), u('2026-10-01', '2026-10-09')];
    const vOkne = mezeryUzaverek({ uzaverky, zavreno: [], dnes: '2026-10-10', oknoDni: 62 });
    // 62 dní před 10. 10. je 9. 8. — mezera (11. 1.–30. 9.) se ořízne na 9. 8.–30. 9.
    expect(vOkne).toEqual([{ od: '2026-08-09', do: '2026-09-30', dnu: 53, stredisko: '2' }]);
    expect(mezeryUzaverek({ uzaverky: [u('2026-01-01', '2026-01-10'), u('2026-02-01', '2026-02-05')], zavreno: [], dnes: '2026-10-10', oknoDni: 30 })).toEqual([
      { od: '2026-09-10', do: '2026-10-09', dnu: 30, stredisko: '2' },
    ]);
  });

  it('uzávěrka s obráceným obdobím se ignoruje a nezacyklí', () => {
    const m = mezeryUzaverek({ uzaverky: [u('2026-10-05', '2026-10-01')], zavreno: [], dnes: '2026-10-08' });
    expect(m).toEqual([{ od: '2026-10-05', do: '2026-10-07', dnu: 3, stredisko: '2' }]);
  });
});

describe('textMezery a dnyMezery', () => {
  it('krátký zápis období', () => {
    expect(textMezery({ od: '2026-10-03', do: '2026-10-03' })).toBe('3. 10.');
    expect(textMezery({ od: '2026-10-03', do: '2026-10-05' })).toBe('3.–5. 10.');
    expect(textMezery({ od: '2026-09-30', do: '2026-10-02' })).toBe('30. 9.–2. 10.');
  });

  it('dny mezery včetně obou krajů, přes přelom měsíce', () => {
    expect(dnyMezery({ od: '2026-09-30', do: '2026-10-02' })).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });
});
