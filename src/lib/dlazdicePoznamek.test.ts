// 📝 Dlaždice Poznámky ukazuje OBOJE — viz hlavička dlazdicePoznamek.ts.
// Z provozu 19. 9. 2026: „když jsem zadal poznámku, nepropsala se na tu
// dlaždici blokovou." Zapsal ji jako vzkaz celé směně a dlaždice o té
// přihrádce nevěděla.
import { describe, it, expect } from 'vitest';
import { pocetCekajicich, polozkyDlazdice } from './dlazdicePoznamek';

const osobni = (o: Partial<{ id: string; text: string; completed: boolean; important: boolean }>) => ({
  id: 'o1', text: 'moje', completed: false, important: false, ...o,
});
const vzkaz = (o: Partial<{ id: string; text: string; hotovo: boolean; dulezite: boolean }>) => ({
  id: 's1', text: 'došly korunky', hotovo: false, dulezite: false, ...o,
});

describe('polozkyDlazdice', () => {
  it('vzkaz celé směně se na dlaždici dostane — to byla ta chyba', () => {
    const p = polozkyDlazdice([], [vzkaz({})]);
    expect(p).toHaveLength(1);
    expect(p[0].text).toBe('došly korunky');
    expect(p[0].sdilena).toBe(true);
  });

  it('osobní poznámka tam zůstává taky', () => {
    const p = polozkyDlazdice([osobni({})], []);
    expect(p[0].sdilena).toBe(false);
  });

  it('vzkazy směně stojí nad osobními — týkají se všech', () => {
    const p = polozkyDlazdice([osobni({ text: 'moje' })], [vzkaz({ text: 'pro směnu' })]);
    expect(p.map((x) => x.text)).toEqual(['pro směnu', 'moje']);
  });

  it('důležité napřed, v obou přihrádkách', () => {
    const p = polozkyDlazdice(
      [osobni({ id: 'a', text: 'běžná' }), osobni({ id: 'b', text: 'důležitá', important: true })],
      [],
    );
    expect(p.map((x) => x.text)).toEqual(['důležitá', 'běžná']);
  });

  it('hotové padají dolů, ale nemizí — odškrtnutí jde vzít zpět', () => {
    const p = polozkyDlazdice(
      [osobni({ id: 'a', text: 'hotová', completed: true }), osobni({ id: 'b', text: 'čeká' })],
      [],
    );
    expect(p.map((x) => x.text)).toEqual(['čeká', 'hotová']);
    expect(p).toHaveLength(2);
  });

  it('sjednotí názvy polí — completed i hotovo znamenají totéž', () => {
    const p = polozkyDlazdice([osobni({ completed: true })], [vzkaz({ hotovo: true })]);
    expect(p.every((x) => x.hotovo)).toBe(true);
  });

  it('prázdno zůstane prázdnem', () => {
    expect(polozkyDlazdice([], [])).toEqual([]);
  });
});

describe('pocetCekajicich', () => {
  it('počítá jen nehotové, z obou přihrádek', () => {
    const p = polozkyDlazdice(
      [osobni({ id: 'a' }), osobni({ id: 'b', completed: true })],
      [vzkaz({ id: 'c' })],
    );
    expect(pocetCekajicich(p)).toBe(2);
  });
});

describe('plocha bere obě přihrádky', () => {
  const ZDROJ = () => require('node:fs').readFileSync('src/screens/HomeScreen.tsx', 'utf8');

  it('dlaždice se skládá společnou funkcí, ne vlastním filtrem', () => {
    expect(ZDROJ()).toMatch(/polozkyDlazdice\(homeNotes, sdilenePoznamky\)/);
  });

  it('odškrtnutí míří do té správné přihrádky', () => {
    // U vzkazu směně platí pro všechny, u osobní poznámky jen pro mě.
    expect(ZDROJ()).toMatch(/note\.sdilena[\s\S]{0,200}prepniHotovo/);
    expect(ZDROJ()).toMatch(/toggleHomeNote\(note\.id\)/);
  });

  it('plocha se dozví o změně vzkazů i od kolegy', () => {
    expect(ZDROJ()).toMatch(/SDILENE_POZNAMKY_ZMENA/);
    expect(ZDROJ()).toMatch(/useRealtime\(\['sdilene_poznamky'\]/);
  });
});
