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

  it('přednost má zpráva, ze které vznikla objednávka', () => {
    const drivejsi = [
      zprava({ id: 'bez', parsed_place_name: 'Špatný' }),
      zprava({ id: 's', imported_order_id: 'o1', parsed_place_name: 'Radek' }),
    ];
    expect(odberatelZCitace(odpoved, drivejsi)?.placeName).toBe('Radek');
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
