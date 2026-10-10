// Statistiky prodeje obchodu z uzávěrky 2/2873 (10. 10. 2026).
import { describe, it, expect } from 'vitest';
import { isoTyden, prodejPoObdobich, prodejPoPivech, prodejPoZbozi, souhrnObdobi, type VstupStatistiky } from './obchodStatistika';
import { UCTENKA_2873 } from '../../supabase/functions/_shared/uzaverka.fixture';

// Zboží z účtenky: pivo, pokud název začíná „Pivo"; ostatní bez vazby.
const zbozi = UCTENKA_2873.radky.map((r) => ({
  kod: r.kod, nazev: r.nazev,
  beer_id: /^pivo/i.test(r.nazev) ? (/12° světlá/.test(r.nazev) ? 'b12s' : 'bX') : null,
  package_id: /^pivo/i.test(r.nazev) ? (/sud 30l/.test(r.nazev) ? 'k30' : /PET 1,5l/.test(r.nazev) ? 'p15' : /PET 1l/.test(r.nazev) ? 'p1' : /0,5l/.test(r.nazev) ? 'l05' : 'l033') : null,
}));
const obaly = [
  { id: 'k30', volume_l: 30 }, { id: 'p15', volume_l: 1.5 }, { id: 'p1', volume_l: 1 }, { id: 'l05', volume_l: 0.5 }, { id: 'l033', volume_l: 0.33 },
];
const radky = (uzaverka_id: string, nasobek = 1) => UCTENKA_2873.radky.map((r) => ({
  uzaverka_id, kod: r.kod, nazev: r.nazev, mnozstvi: r.mnozstvi * nasobek, cena: r.cena, celkem: (r.celkem ?? 0) * nasobek,
}));

const v: VstupStatistiky = {
  zbozi, obaly,
  piva: [{ id: 'b12s', name: '12° Světlá' }, { id: 'bX', name: 'Ostatní piva' }],
  uzaverky: [
    { id: 'u1', datum_od: '2026-10-10', datum_do: '2026-10-10', trzba: 20675 },
    { id: 'u2', datum_od: '2026-10-12', datum_do: '2026-10-12', trzba: 41350 },
    { id: 'u3', datum_od: '2026-09-30', datum_do: '2026-09-30', trzba: 1000 }, // bez řádků → tržba z hlavičky
  ],
  radky: [...radky('u1'), ...radky('u2', 2)],
};

describe('isoTyden', () => {
  it('10. 10. 2026 je 41. týden, 12. 10. 42.; přelom roku', () => {
    expect(isoTyden('2026-10-10')).toEqual([2026, 41]);
    expect(isoTyden('2026-10-12')).toEqual([2026, 42]);
    expect(isoTyden('2026-01-01')).toEqual([2026, 1]);
    expect(isoTyden('2027-01-01')).toEqual([2026, 53]);
  });
});

describe('prodejPoObdobich', () => {
  it('po dnech: tržba z účtenky, kusy a litry jen piv', () => {
    const dny = prodejPoObdobich(v, 'den');
    expect(dny.map((d) => d.klic)).toEqual(['2026-10-12', '2026-10-10', '2026-09-30']);
    const d10 = dny.find((d) => d.klic === '2026-10-10')!;
    expect(d10.trzba).toBe(20675);
    expect(d10.popis).toBe('so 10. 10.');
    // 9 sudů 30 l + 23 lahví (18 × 0,5 l, 5 × 0,33 l) + 33 PET 1 l + 37 PET 1,5 l
    expect(d10.ks).toBe(9 + 23 + 33 + 37);
    expect(d10.litry).toBe(Math.round((9 * 30 + 18 * 0.5 + 5 * 0.33 + 33 + 37 * 1.5) * 10) / 10);
  });

  it('po měsících a týdnech', () => {
    expect(prodejPoObdobich(v, 'mesic').map((o) => [o.klic, o.uzaverek])).toEqual([['2026-10', 2], ['2026-09', 1]]);
    expect(prodejPoObdobich(v, 'mesic').find((o) => o.klic === '2026-09')!.trzba).toBe(1000);
    expect(prodejPoObdobich(v, 'tyden').map((o) => o.klic)).toEqual(['2026-W42', '2026-W41', '2026-W40']);
  });

  it('omezení na období', () => {
    expect(prodejPoObdobich(v, 'den', '2026-10-01', '2026-10-11').map((d) => d.klic)).toEqual(['2026-10-10']);
  });
});

describe('prodejPoZbozi a prodejPoPivech', () => {
  it('nejvíc prodávané první, ostatní zboží bez litrů', () => {
    const z = prodejPoZbozi(v, '2026-10-10', '2026-10-10');
    expect(z[0]).toMatchObject({ kod: '11147', ks: 14, trzba: 1666 });
    const limo = z.find((x) => x.kod === '15117')!;
    expect(limo).toMatchObject({ jePivo: false, litry: 0, ks: 5, trzba: 225 });
  });

  it('po pivech: 12° Světlá ze sudu, lahví i PET dohromady', () => {
    const p = prodejPoPivech(v, '2026-10-10', '2026-10-10');
    const s = p.find((x) => x.beerId === 'b12s')!;
    // 10242 sud 1× + 11000 0,33 1× + 11001 0,5 7× + 11141 PET 1l 13× + 11147 PET 1,5l 14× = 36 ks
    expect(s.ks).toBe(1 + 1 + 7 + 13 + 14);
    expect(s.litry).toBe(Math.round((30 + 0.33 + 3.5 + 13 + 21) * 10) / 10);
    expect(s.trzba).toBe(1455 + 35 + 336 + 1092 + 1666);
  });
});

describe('souhrnObdobi', () => {
  it('tržba celkem a z toho ostatní zboží', () => {
    const s = souhrnObdobi(v, '2026-10-10', '2026-10-10');
    expect(s.trzba).toBe(20675);
    expect(s.uzaverek).toBe(1);
    // ostatní: 140 + 25 + 90 + 225 + 217 + 298
    expect(s.trzbaOstatni).toBe(140 + 25 + 90 + 225 + 217 + 298);
  });
});
