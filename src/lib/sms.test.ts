// Odkaz `sms:` pro telefon (24. 11. 2026: „přes bránu telefonu se mu pošle sms…").
import { describe, expect, it } from 'vitest';
import { cisloProSms, odkazSms } from './sms';

describe('cisloProSms', () => {
  it('české devítimístné číslo dostane +420, mezery a pomlčky zmizí', () => {
    expect(cisloProSms('777123456')).toBe('+420777123456');
    expect(cisloProSms('777 123 456')).toBe('+420777123456');
    expect(cisloProSms('(777) 123-456')).toBe('+420777123456');
    expect(cisloProSms('  777.123.456 ')).toBe('+420777123456');
  });

  it('číslo s předvolbou zůstane: +420, 00420 i 420 bez plus', () => {
    expect(cisloProSms('+420 777 123 456')).toBe('+420777123456');
    expect(cisloProSms('00420777123456')).toBe('+420777123456');
    expect(cisloProSms('420777123456')).toBe('+420777123456');
  });

  it('cizí číslo s plusem se nepřepisuje', () => {
    expect(cisloProSms('+49 151 12345678')).toBe('+4915112345678');
    expect(cisloProSms('0049 151 12345678')).toBe('+4915112345678');
  });

  it('prázdné, krátké a nesmyslné číslo → bez příjemce', () => {
    expect(cisloProSms(null)).toBe('');
    expect(cisloProSms(undefined)).toBe('');
    expect(cisloProSms('')).toBe('');
    expect(cisloProSms('   ')).toBe('');
    expect(cisloProSms('12345')).toBe('');
    expect(cisloProSms('7771234567')).toBe(''); // 10 číslic bez předvolby: nevíme, čí je
    expect(cisloProSms('abc')).toBe('');
    expect(cisloProSms('+1234')).toBe('');
    expect(cisloProSms('+1234567890123456')).toBe(''); // víc než 15 číslic
  });
});

describe('odkazSms', () => {
  it('složí sms:číslo?&body=text a text zakóduje (mezery, diakritika, nový řádek)', () => {
    expect(odkazSms('777 123 456', 'Malé sudy: 20 l 5 ks\nDíky')).toBe(
      `sms:+420777123456?&body=${encodeURIComponent('Malé sudy: 20 l 5 ks\nDíky')}`,
    );
    expect(odkazSms('777 123 456', 'a b')).toContain('body=a%20b');
  });

  it('bez čísla otevře SMS bez příjemce', () => {
    expect(odkazSms(null, 'Ahoj')).toBe('sms:?&body=Ahoj');
    expect(odkazSms('', 'Ahoj')).toBe('sms:?&body=Ahoj');
    expect(odkazSms('12345', 'Ahoj')).toBe('sms:?&body=Ahoj');
  });

  it('znaky, které by rozbily odkaz (&, #, ?, %), jsou v textu zakódované', () => {
    const href = odkazSms(null, 'a&b #1 ?x 100%');
    expect(href).toBe('sms:?&body=a%26b%20%231%20%3Fx%20100%25');
  });
});
