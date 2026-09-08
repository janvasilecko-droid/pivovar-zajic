import { describe, it, expect } from 'vitest';
import { kolikPosunout, jeZapisovaci } from './nadKlavesnici';

describe('posun nad klávesnici', () => {
  it('políčko celé nad klávesnicí se neposouvá', () => {
    // Displej 800, klávesnice ubrala 400 → vidět je horních 400.
    expect(kolikPosunout(100, 140, 400)).toBe(0);
  });

  it('políčko schované pod klávesnicí se posune přesně o chybějící kus', () => {
    // Spodek v 450, vidět je do 400, rezerva 24 → chybí 74.
    expect(kolikPosunout(410, 450, 400)).toBe(74);
  });

  it('těsně nad hranicí se posune o rezervu', () => {
    // Spodek přesně na hranici — bez rezervy by políčko sedělo na klávesnici.
    expect(kolikPosunout(360, 400, 400)).toBe(24);
  });

  it('vysoké textové pole neuteče vršek nad obrazovku', () => {
    // Pole vysoké 300 px začíná v 50, končí v 350; vidět je do 200.
    // Chybí 174, ale posunout se smí jen o 26, jinak zmizí začátek pole.
    expect(kolikPosunout(50, 350, 200)).toBe(26);
  });

  it('políčko utečené nad horní okraj se vrátí zpátky dolů', () => {
    expect(kolikPosunout(-60, -20, 400)).toBe(-60);
  });

  it('pozná, do čeho se píše', () => {
    const textarea = { nodeName: 'TEXTAREA' } as unknown as Element;
    const cislo = { nodeName: 'INPUT', type: 'number' } as unknown as Element;
    const zaskrtavatko = { nodeName: 'INPUT', type: 'checkbox' } as unknown as Element;
    const tlacitko = { nodeName: 'BUTTON', isContentEditable: false } as unknown as Element;

    expect(jeZapisovaci(textarea)).toBe(true);
    expect(jeZapisovaci(cislo)).toBe(true);
    expect(jeZapisovaci(zaskrtavatko)).toBe(false);
    expect(jeZapisovaci(tlacitko)).toBe(false);
    expect(jeZapisovaci(null)).toBe(false);
  });
});
