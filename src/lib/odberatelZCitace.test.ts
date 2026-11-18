import { describe, it, expect } from 'vitest';
import { odberatelZCitace, stojiZaHledani, type ZpravaSOdberatelem } from './odberatelZCitace';

const zprava = (o: Partial<ZpravaSOdberatelem> & { id: string }): ZpravaSOdberatelem => ({
  created_at: '2026-09-17T08:00:00Z', message_text: 'Radek na čtvrtek 4x50 12sv', ...o,
});

describe('odberatelZCitace', () => {
  // Přesně ta zpráva z provozu 17. 9. 2026.
  const odpoved = {
    id: 'odpoved',
    created_at: '2026-09-17T09:00:00Z',
    message_text: '60x0,5l. Grep a 40x0,5l. Citrón',
    quoted_text: 'Radek na čtvrtek',
  };

  it('vezme odběratele z citované zprávy', () => {
    const drivejsi = [zprava({ id: 'radek', parsed_place_id: 'p1', parsed_place_name: 'Radek' })];
    expect(odberatelZCitace(odpoved, drivejsi)).toMatchObject({ placeId: 'p1', placeName: 'Radek' });
  });

  it('do vysvětlivky vrátí začátek citované zprávy', () => {
    const drivejsi = [zprava({ id: 'radek', parsed_place_name: 'Radek' })];
    expect(odberatelZCitace(odpoved, drivejsi)?.zCitace).toContain('Radek na čtvrtek');
  });

  it('bez citované zprávy nic nevymýšlí', () => {
    expect(odberatelZCitace(odpoved, [zprava({ id: 'jina', message_text: 'Úplně jiná zpráva' })])).toBeNull();
  });

  it('citovaná zpráva bez odběratele taky nic nedá', () => {
    expect(odberatelZCitace(odpoved, [zprava({ id: 'radek' })])).toBeNull();
  });

  it('ignorovaná zpráva téhož znění odběratele nepřebije', () => {
    const drivejsi = [
      zprava({ id: 'ignorovana', created_at: '2026-09-17T08:30:00Z', status: 'ignored', parsed_place_name: 'Špatný' }),
      zprava({ id: 's', created_at: '2026-09-17T08:00:00Z', imported_order_id: 'o1', parsed_place_name: 'Radek' }),
    ];
    expect(odberatelZCitace(odpoved, drivejsi)?.placeName).toBe('Radek');
  });

  // Stejně jako u napojení na objednávku: citovaná je NEJNOVĚJŠÍ zpráva
  // téhož znění, i když z ní ještě není objednávka (čeká na schválení).
  it('přednost má nejnovější zpráva, i když z ní ještě není objednávka', () => {
    const drivejsi = [
      zprava({ id: 'nova', created_at: '2026-09-17T08:30:00Z', status: 'parsed', parsed_place_id: 'p-radek', parsed_place_name: 'Radek' }),
      zprava({ id: 'stara', created_at: '2026-09-10T08:00:00Z', status: 'imported', imported_order_id: 'o1', parsed_place_name: 'Jiný' }),
    ];
    expect(odberatelZCitace(odpoved, drivejsi)).toMatchObject({ placeId: 'p-radek', placeName: 'Radek' });
  });

  it('nejnovější zpráva odběratele nemá (ještě se nepřečetla) → pomůže starší téhož znění', () => {
    const drivejsi = [
      zprava({ id: 'nova', created_at: '2026-09-17T08:30:00Z', status: 'pending' }),
      zprava({ id: 'stara', created_at: '2026-09-10T08:00:00Z', status: 'imported', imported_order_id: 'o1', parsed_place_name: 'Radek' }),
    ];
    expect(odberatelZCitace(odpoved, drivejsi)?.placeName).toBe('Radek');
  });

  it('starší zprávy téhož znění se na odběrateli neshodnou → pole zůstane prázdné', () => {
    const drivejsi = [
      zprava({ id: 'nova', created_at: '2026-09-17T08:30:00Z', status: 'pending' }),
      zprava({ id: 'a', created_at: '2026-09-10T08:00:00Z', status: 'imported', imported_order_id: 'o1', parsed_place_name: 'Radek' }),
      zprava({ id: 'b', created_at: '2026-09-03T08:00:00Z', status: 'imported', imported_order_id: 'o2', parsed_place_name: 'Maneo' }),
    ];
    expect(odberatelZCitace(odpoved, drivejsi)).toBeNull();
  });
});

describe('stojiZaHledani', () => {
  it('hledá se jen u odpovědi bez odběratele', () => {
    expect(stojiZaHledani({ quoted_text: 'Radek na čtvrtek' })).toBe(true);
  });

  it('když AI odběratele našla, citace se neptáme', () => {
    expect(stojiZaHledani({ quoted_text: 'Radek', parsed_place_name: 'Maneo' })).toBe(false);
    expect(stojiZaHledani({ quoted_text: 'Radek', parsed_place_id: 'p1' })).toBe(false);
  });

  it('zpráva, která není odpověď, se neřeší', () => {
    expect(stojiZaHledani({})).toBe(false);
    expect(stojiZaHledani({ quoted_text: '  ' })).toBe(false);
    expect(stojiZaHledani({ quoted_text: 'ok' })).toBe(false);
  });
});
