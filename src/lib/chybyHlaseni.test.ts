import { describe, it, expect } from 'vitest';
import {
  popisChyby, pripravHlaseni, klicChyby, maSePoslat, chybiTabulka,
  MAX_STACK, MAX_ZPRAVA, OKNO_MS,
} from './chybyHlaseni';
import { APP_VERSION } from './version';

describe('popisChyby', () => {
  it('přečte zprávu z Error', () => {
    expect(popisChyby(new Error('Tank neexistuje'))).toBe('Tank neexistuje');
  });

  it('zvládne i to, co Error není', () => {
    // V JS se dá hodit cokoliv a v praxi se to děje — `throw 'text'`
    // z cizí knihovny nebo odmítnutý promise s objektem.
    expect(popisChyby('spadlo to')).toBe('spadlo to');
    expect(popisChyby({ message: 'z objektu' })).toBe('z objektu');
    expect(popisChyby({ stav: 500 })).toBe('{"stav":500}');
    expect(popisChyby(undefined)).toBe('Neznámá chyba');
    expect(popisChyby(null)).toBe('null');
  });

  it('Error bez zprávy vrátí aspoň jméno, ne prázdno', () => {
    const e = new TypeError('');
    expect(popisChyby(e)).toBe('TypeError');
  });

  it('objekt, který se nedá serializovat, nespadne', () => {
    const kruh: any = {};
    kruh.self = kruh;
    expect(popisChyby(kruh)).toBe('Neznámá chyba (objekt)');
  });
});

describe('pripravHlaseni', () => {
  it('nese verzi aplikace — to je při hledání příčiny první otázka', () => {
    const h = pripravHlaseni('boundary', new Error('bum'), 'orders', 'Android');
    expect(h.app_version).toBe(APP_VERSION);
    expect(h.obrazovka).toBe('orders');
    expect(h.druh).toBe('boundary');
  });

  it('zkrátí dlouhý stack i zprávu', () => {
    const e = new Error('x'.repeat(MAX_ZPRAVA + 200));
    e.stack = 'y'.repeat(MAX_STACK + 5000);
    const h = pripravHlaseni('unhandled', e);
    expect(h.zprava.length).toBe(MAX_ZPRAVA + 1); // + výpustka
    expect(h.stack!.length).toBe(MAX_STACK + 1);
  });

  it('chybějící údaje jsou null, ne prázdný text', () => {
    const h = pripravHlaseni('rejection', 'spadlo');
    expect(h.stack).toBeNull();
    expect(h.obrazovka).toBeNull();
    expect(h.user_agent).toBeNull();
  });
});

describe('klicChyby a maSePoslat', () => {
  it('stejná chyba na stejné obrazovce má stejný klíč', () => {
    const a = klicChyby({ druh: 'boundary', zprava: 'bum', obrazovka: 'orders' });
    const b = klicChyby({ druh: 'boundary', zprava: 'bum', obrazovka: 'orders' });
    const c = klicChyby({ druh: 'boundary', zprava: 'bum', obrazovka: 'cellar' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('poprvé se pošle, v okně už ne, po okně znovu', () => {
    // Bez tohohle by jedna smyčka v renderu vyrobila tisíce řádků za minutu.
    expect(maSePoslat(undefined, 1000)).toBe(true);
    expect(maSePoslat(1000, 1000 + OKNO_MS - 1)).toBe(false);
    expect(maSePoslat(1000, 1000 + OKNO_MS)).toBe(true);
  });
});

describe('chybiTabulka', () => {
  it('pozná chybějící tabulku podle kódu i podle textu', () => {
    // Migrace se pouští ručně, takže tabulka nějakou dobu neexistuje.
    // Tehdy se hlášení musí jen zahodit, ne nic hlásit uživateli.
    expect(chybiTabulka({ code: '42P01' })).toBe(true);
    expect(chybiTabulka({ code: 'PGRST205' })).toBe(true);
    expect(chybiTabulka({ message: 'Could not find the table "app_errors"' })).toBe(true);
    expect(chybiTabulka({ message: 'relation "app_errors" does not exist' })).toBe(true);
  });

  it('jinou chybu za chybějící tabulku nevydává', () => {
    expect(chybiTabulka({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(chybiTabulka(null)).toBe(false);
    expect(chybiTabulka(undefined)).toBe(false);
  });
});
