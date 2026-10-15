/**
 * Zámek proti zápisu ze zastaralého načtení (lib/nacitani.ts).
 *
 * Testuje se to, co se v provozu opravdu stalo: dvě přenačtení naráz (jedno
 * z otevření obrazovky, druhé z realtime události po cizím zápisu) a mobilní
 * připojení, které je nevrátí v pořadí, v jakém odešla.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePosledniNacteni, prvniChyba, sNejvyseCasem } from './nacitani';

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

// 15. 10. 2026: „občas se nechce načíst sklad" — jediný zaseknutý dotaz nechal
// obrazovku s kostrou „načítám" navždy. Strop na čekání z toho udělá chybu
// s tlačítkem „Zkusit znovu".
describe('sNejvyseCasem', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('hotový slib projde beze změny', async () => {
    await expect(sNejvyseCasem(Promise.resolve(42), 1000, 'moc dlouho')).resolves.toBe(42);
  });

  it('slib, který se nedočká, se po stropu odmítne se zadanou zprávou', async () => {
    vi.useFakeTimers();
    const zaseknuty = new Promise<number>(() => {});
    const vysledek = sNejvyseCasem(zaseknuty, 45_000, 'Načítání trvá moc dlouho.');
    const cekam = expect(vysledek).rejects.toThrow('Načítání trvá moc dlouho.');
    await vi.advanceTimersByTimeAsync(45_000);
    await cekam;
  });

  it('před stropem se neodmítne', async () => {
    vi.useFakeTimers();
    let hotovo: 'ne' | 'ok' | 'chyba' = 'ne';
    let dokonci!: (v: number) => void;
    const pomaly = new Promise<number>((r) => { dokonci = r; });
    sNejvyseCasem(pomaly, 45_000, 'moc dlouho').then(() => { hotovo = 'ok'; }, () => { hotovo = 'chyba'; });
    await vi.advanceTimersByTimeAsync(44_000);
    expect(hotovo).toBe('ne');
    dokonci(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(hotovo).toBe('ok');
  });

  it('chyba původního slibu se předá dál a časovač se uklidí', async () => {
    vi.useFakeTimers();
    await expect(sNejvyseCasem(Promise.reject(new Error('spojení spadlo')), 45_000, 'moc dlouho'))
      .rejects.toThrow('spojení spadlo');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('po úspěchu nezůstane žádný běžící časovač', async () => {
    vi.useFakeTimers();
    await sNejvyseCasem(Promise.resolve('ok'), 45_000, 'moc dlouho');
    expect(vi.getTimerCount()).toBe(0);
  });
});
