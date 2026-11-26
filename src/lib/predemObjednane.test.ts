// 📅 Předem objednané (26. 11. 2026, majitel ke zprávě „Na 18.12…“): „…aplikace to musí nastavit ten datum
// a upozornit v pondělí týden kdy to má být stočený." Data i jména jsou vymyšlená (repozitář je veřejný).
import { describe, it, expect } from 'vitest';
import { predemObjednane, radkyUpozorneni, PREDSTIH_DNI } from './predemObjednane';

const PONDELI = '2026-12-14'; // týden 14.–20. 12. 2026

const obj = (id: string, zadano: string, zavoz: string | null, nad: Record<string, unknown> = {}) => ({
  id, order_date: zadano, delivery_date: zavoz, place_name: 'Hospoda U Lípy', status: 'nova', is_delivered: false, ...nad,
});
const pol = (order_id: string, beer_id: string, package_id: string, quantity: number) => ({ order_id, beer_id, package_id, quantity });

describe('predemObjednane — kdo se tenhle týden vozí z dřívějška', () => {
  const predem = obj('o1', '2026-11-25', '2026-12-18'); // zpráva z 25. 11. na pátek 18. 12.
  const polozky = [pol('o1', 'b12', 'k20', 1), pol('o2', 'b11', 'k50', 3)];

  it('objednávka z 25. 11. na pátek 18. 12. se ukáže v pondělí 14. 12. s dnem a položkami', () => {
    const v = predemObjednane([predem], polozky, PONDELI);
    expect(v).toEqual([{
      id: 'o1', misto: 'Hospoda U Lípy', datum: '2026-12-18', den: 'pa',
      polozky: [{ beer_id: 'b12', package_id: 'k20', quantity: 1 }],
    }]);
  });

  it('platí celý týden — i ve čtvrtek a v neděli, ale ne ten předchozí ani následující', () => {
    for (const dnes of ['2026-12-14', '2026-12-16', '2026-12-18', '2026-12-20']) {
      expect(predemObjednane([predem], polozky, dnes), dnes).toHaveLength(1);
    }
    expect(predemObjednane([predem], polozky, '2026-12-13')).toHaveLength(0); // neděle předchozího týdne
    expect(predemObjednane([predem], polozky, '2026-12-21')).toHaveLength(0); // pondělí dalšího týdne
    expect(predemObjednane([predem], polozky, '2026-11-26')).toHaveLength(0); // dnes: ještě tři týdny
  });

  it(`předem je od ${PREDSTIH_DNI} dní: pátek na příští středu (5 dní) ani 6 dní ne, přesně 7 ano`, () => {
    expect(predemObjednane([obj('a', '2026-12-11', '2026-12-16')], [], PONDELI)).toHaveLength(0); // pá → st
    expect(predemObjednane([obj('b', '2026-12-10', '2026-12-16')], [], PONDELI)).toHaveLength(0); // 6 dní
    expect(predemObjednane([obj('c', '2026-12-09', '2026-12-16')], [], PONDELI)).toHaveLength(1); // 7 dní
    expect(PREDSTIH_DNI).toBe(7);
  });

  it('zrušená, zavezená i vyřízená objednávka se neukazuje', () => {
    expect(predemObjednane([obj('s', '2026-11-25', '2026-12-18', { status: 'storno' })], [], PONDELI)).toEqual([]);
    expect(predemObjednane([obj('d', '2026-11-25', '2026-12-18', { is_delivered: true })], [], PONDELI)).toEqual([]);
    expect(predemObjednane([obj('v', '2026-11-25', '2026-12-18', { status: 'vyrizeno_zavoz' })], [], PONDELI)).toEqual([]);
  });

  it('datum s časem se čte, chybějící nebo rozbité datum objednávku jen přeskočí', () => {
    expect(predemObjednane([obj('t', '2026-11-25T11:54:54+00:00', '2026-12-18T00:00:00+00:00')], [], PONDELI)).toHaveLength(1);
    expect(predemObjednane([obj('n1', '2026-11-25', null)], [], PONDELI)).toEqual([]);
    expect(predemObjednane([obj('n2', '', '2026-12-18')], [], PONDELI)).toEqual([]);
    expect(predemObjednane([obj('n3', '2026-11-25', 'brzy')], [], PONDELI)).toEqual([]);
  });

  it('řadí podle dne závozu a pak podle jména místa; položky patří jen své objednávce', () => {
    const v = predemObjednane([
      obj('x', '2026-11-20', '2026-12-18', { place_name: 'Pivnice U Mostu' }),
      obj('y', '2026-11-20', '2026-12-16', { place_name: 'Zahrádka' }),
      obj('z', '2026-11-20', '2026-12-18', { place_name: 'Čepovna' }),
    ], [pol('x', 'b12', 'k50', 2), pol('z', 'b11', 'k30', 1)], PONDELI);
    expect(v.map((o) => o.misto)).toEqual(['Zahrádka', 'Čepovna', 'Pivnice U Mostu']);
    expect(v.find((o) => o.id === 'x')!.polozky).toEqual([{ beer_id: 'b12', package_id: 'k50', quantity: 2 }]);
    expect(v.find((o) => o.id === 'y')!.polozky).toEqual([]);
  });

  it('množství z textu se přečte jako číslo', () => {
    const v = predemObjednane([predem], [{ order_id: 'o1', beer_id: 'b12', package_id: 'k20', quantity: '2' as unknown as number }], PONDELI);
    expect(v[0].polozky[0].quantity).toBe(2);
  });
});

describe('radkyUpozorneni — kdo, kdy a co', () => {
  it('„Hospoda U Lípy · pá 18. 12. — 1× 20l 12° Světlá, 2× 50l Jantar“', () => {
    const [r] = radkyUpozorneni([{
      id: 'o1', misto: 'Hospoda U Lípy', datum: '2026-12-18', den: 'pa',
      polozky: [{ beer_id: 'b12', package_id: 'k20', quantity: 1 }, { beer_id: 'bj', package_id: 'k50', quantity: 2 }],
    }], (id) => (id === 'b12' ? '12° Světlá' : 'Jantar'), (id) => (id === 'k20' ? '20l' : '50l'));
    expect(r).toEqual({ id: 'o1', misto: 'Hospoda U Lípy', kdy: 'pá 18. 12.', co: '1× 20l 12° Světlá, 2× 50l Jantar' });
  });

  it('nulové množství se nevypisuje, objednávka bez položek to řekne', () => {
    const [r] = radkyUpozorneni([{
      id: 'o1', misto: 'Hospoda U Lípy', datum: '2026-12-16', den: 'st',
      polozky: [{ beer_id: 'b12', package_id: 'k20', quantity: 0 }],
    }], () => 'pivo', () => 'obal');
    expect(r).toMatchObject({ kdy: 'st 16. 12.', co: 'bez položek' });
  });
});
