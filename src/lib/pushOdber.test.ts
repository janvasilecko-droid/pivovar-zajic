import { describe, it, expect } from 'vitest';
import { klicNaBajty, popisZarizeni, stavPushu } from './pushOdber';

describe('klicNaBajty', () => {
  it('přeloží base64url na bajty', () => {
    // "Ahoj" = QWhvag== ; v base64url bez doplňků.
    expect(Array.from(klicNaBajty('QWhvag'))).toEqual([65, 104, 111, 106]);
  });

  it('rozumí znakům - a _ (base64url), ne jen + a /', () => {
    // Prohlížeč jinak odmítne klíč nicneříkající chybou.
    const a = klicNaBajty('-_8');
    expect(Array.from(a)).toEqual([251, 255]);
  });

  it('délka odpovídá VAPID klíči (65 bajtů)', () => {
    const klic = 'B'.repeat(87);
    expect(klicNaBajty(klic).length).toBe(65);
  });
});

describe('stavPushu', () => {
  const zaklad = { podporovano: true, povoleni: 'default' as NotificationPermission, klicNastaven: true, prihlasen: false };

  it('bez podpory prohlížeče se nedá nic', () => {
    const s = stavPushu({ ...zaklad, podporovano: false });
    expect(s.muzeZapnout).toBe(false);
    expect(s.popis).toMatch(/neumí/);
  });

  it('bez serverového klíče to ŘEKNE, nemlčí', () => {
    // Mlčící vypnutý zvonek vypadá jako rozbitá funkce.
    const s = stavPushu({ ...zaklad, klicNastaven: false });
    expect(s.muzeZapnout).toBe(false);
    expect(s.popis).toMatch(/VAPID/);
  });

  it('zakázaná upozornění se nedají zapnout z appky', () => {
    const s = stavPushu({ ...zaklad, povoleni: 'denied' });
    expect(s.muzeZapnout).toBe(false);
    expect(s.popis).toMatch(/nastavení prohlížeče/);
  });

  it('zakázaná upozornění jdou aspoň odhlásit, když odběr existuje', () => {
    // Odběr, na který nikdy nic nedojde, nemá zůstat viset v databázi.
    expect(stavPushu({ ...zaklad, povoleni: 'denied', prihlasen: true }).muzeVypnout).toBe(true);
  });

  it('přihlášené zařízení jde vypnout, ne znovu zapnout', () => {
    const s = stavPushu({ ...zaklad, prihlasen: true });
    expect(s.muzeVypnout).toBe(true);
    expect(s.muzeZapnout).toBe(false);
  });

  it('připravený a nepřihlášený stav nabídne zapnutí', () => {
    expect(stavPushu(zaklad).muzeZapnout).toBe(true);
  });
});

describe('popisZarizeni', () => {
  it('pozná telefon a prohlížeč', () => {
    expect(popisZarizeni('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('Android · Chrome');
    expect(popisZarizeni('Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/605')).toBe('iPhone/iPad · Safari');
  });

  it('neznámé zařízení nedá prázdný řetězec', () => {
    expect(popisZarizeni('nějaká lednička')).toBe('neznámé zařízení · prohlížeč');
  });
});
