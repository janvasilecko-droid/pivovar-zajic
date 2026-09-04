import { describe, it, expect } from 'vitest';
import { souhrnDne } from './souhrnDne';
import type { Movement, MovementKind } from './stockLedger';

const DNES = '2026-09-03';

function p(kind: MovementKind, qty: number, date = DNES): Movement {
  return { date, beer_id: 'b1', package_id: 'p1', qty, kind };
}

describe('souhrnDne', () => {
  it('sečte pohyby po druzích a spočítá zápisy', () => {
    const s = souhrnDne([p('kegovani', 40), p('kegovani', 20), p('zavoz', -15)], DNES);
    const keg = s.radky.find((r) => r.kind === 'kegovani')!;
    expect(keg.kusu).toBe(60);
    expect(keg.zapisu).toBe(2);
    expect(keg.smer).toBe('pribylo');
    expect(s.radky.find((r) => r.kind === 'zavoz')!.smer).toBe('ubylo');
  });

  it('sečte přírůstky a úbytky zvlášť', () => {
    const s = souhrnDne([p('kegovani', 60), p('staceni', 240), p('zavoz', -15), p('odpis', -3)], DNES);
    expect(s.pribyloCelkem).toBe(300);
    expect(s.ubyloCelkem).toBe(18);
  });

  it('řadí od největšího — to dělalo největší část práce', () => {
    const s = souhrnDne([p('odpis', -3), p('staceni', 240), p('zavoz', -15)], DNES);
    expect(s.radky.map((r) => r.kind)).toEqual(['staceni', 'zavoz', 'odpis']);
  });

  it('pohyby jiných dnů se nepočítají', () => {
    const s = souhrnDne([p('kegovani', 40, '2026-09-02'), p('zavoz', -15, '2026-09-04')], DNES);
    expect(s.prazdny).toBe(true);
    expect(s.radky).toEqual([]);
  });

  it('INVENTURA se do souhrnu nepočítá — je to reset, ne pohyb', () => {
    // Sečíst napočítaný stav (třeba 400 ks) s výdeji by dalo číslo, které
    // nic neznamená.
    const s = souhrnDne([p('inventura', 400), p('zavoz', -15)], DNES);
    expect(s.radky).toHaveLength(1);
    expect(s.radky[0].kind).toBe('zavoz');
    expect(s.pribyloCelkem).toBe(0);
  });

  it('nulové pohyby se přeskočí — prázdný řádek nic neříká', () => {
    const s = souhrnDne([p('odpis', 0), p('zavoz', -0)], DNES);
    expect(s.prazdny).toBe(true);
  });

  it('dorovnání jde podle ZNAMÉNKA, ne podle druhu', () => {
    // Ruční dorovnání umí sklad zvednout i snížit; kdyby mělo pevný směr,
    // souhrn by u minusového dorovnání tvrdil, že pivo přibylo.
    const plus = souhrnDne([p('dorovnani', 5)], DNES);
    expect(plus.radky[0].smer).toBe('pribylo');
    const minus = souhrnDne([p('dorovnani', -5)], DNES);
    expect(minus.radky[0].smer).toBe('ubylo');
  });

  it('prázdný den je označený jako prázdný, ne jako nuly', () => {
    const s = souhrnDne([], DNES);
    expect(s.prazdny).toBe(true);
    expect(s.pribyloCelkem).toBe(0);
    expect(s.ubyloCelkem).toBe(0);
    expect(s.datum).toBe(DNES);
  });

  it('popis je česky, ne kód druhu', () => {
    const s = souhrnDne([p('sud_na_lahve', -6)], DNES);
    expect(s.radky[0].popis).toBe('Sud spotřebován na lahve');
  });
});
