/**
 * Zámek proti zápisu ze zastaralého načtení (lib/nacitani.ts).
 *
 * Testuje se to, co se v provozu opravdu stalo: dvě přenačtení naráz (jedno
 * z otevření obrazovky, druhé z realtime události po cizím zápisu) a mobilní
 * připojení, které je nevrátí v pořadí, v jakém odešla.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePosledniNacteni, prvniChyba } from './nacitani';

describe('usePosledniNacteni', () => {
  it('starší načtení už nesmí zapisovat, když mezitím začalo novější', () => {
    const { result } = renderHook(() => usePosledniNacteni());
    const smiPrvni = result.current();
    const smiDruhe = result.current();
    // Druhé (novější) načtení zapsat smí, první ne — i kdyby se vrátilo až po něm.
    expect(smiDruhe()).toBe(true);
    expect(smiPrvni()).toBe(false);
  });

  it('jediné načtení zapsat smí', () => {
    const { result } = renderHook(() => usePosledniNacteni());
    expect(result.current()()).toBe(true);
  });

  it('po odpojení komponenty nezapisuje nikdo', () => {
    const { result, unmount } = renderHook(() => usePosledniNacteni());
    const smiZapsat = result.current();
    unmount();
    expect(smiZapsat()).toBe(false);
  });
});

describe('prvniChyba', () => {
  it('vrátí text první chyby', () => {
    expect(prvniChyba({ error: null }, { error: { message: 'nejde to' } }, { error: { message: 'a tohle taky ne' } }))
      .toBe('nejde to');
  });

  it('bez chyby vrátí null', () => {
    expect(prvniChyba({ error: null }, {}, null, undefined)).toBeNull();
  });

  it('prázdná zpráva se nepočítá jako chyba', () => {
    // Supabase vrací u některých selhání `error` s prázdnou zprávou; z takové
    // hlášky by uživatel nic neměl a jen by zakryla prázdný stav.
    expect(prvniChyba({ error: { message: '' } })).toBeNull();
  });
});
