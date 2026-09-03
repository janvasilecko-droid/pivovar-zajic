import { describe, it, expect } from 'vitest';
import { kusy, litry, hektolitry, litryJakoHl, koruny, procenta, objem, rozdilKusy } from './cisla';

/** Nezlomitelná mezera — v testech se musí porovnávat přesně ona. */
const NBSP = ' ';

describe('formát čísel a jednotek', () => {
  it('jednotka je vždy, a s nezlomitelnou mezerou', () => {
    // Zlomitelná mezera by na konci řádku rozdělila „30" a „l" — jednotka
    // by pak visela na dalším řádku a číslo by se dalo přečíst špatně.
    expect(kusy(12)).toBe(`12${NBSP}ks`);
    expect(litry(30)).toBe(`30${NBSP}l`);
    expect(hektolitry(12.5)).toBe(`12,5${NBSP}hl`);
    expect(koruny(1250)).toBe(`1${NBSP}250${NBSP}Kč`);
    expect(procenta(62)).toBe(`62${NBSP}%`);
  });

  it('tisíce se oddělují — 12 000 l se musí poznat od 1 200 l', () => {
    expect(litry(12000)).toBe(`12${NBSP}000${NBSP}l`);
    expect(litry(1200)).toBe(`1${NBSP}200${NBSP}l`);
  });

  it('litry celé, hektolitry na jednu desetinu', () => {
    expect(litry(1249.6)).toBe(`1${NBSP}250${NBSP}l`);
    expect(hektolitry(12)).toBe(`12,0${NBSP}hl`);
    expect(hektolitry(12.44)).toBe(`12,4${NBSP}hl`);
  });

  it('kusy jsou celé — půl sudu neexistuje', () => {
    expect(kusy(2.4)).toBe(`2${NBSP}ks`);
    expect(kusy(2.6)).toBe(`3${NBSP}ks`);
  });

  it('nečitelná hodnota je nula, nikdy „NaN"', () => {
    // Z databáze umí přijít null nebo numeric jako text. „NaN ks" na
    // obrazovce je horší než nula: vypadá jako porucha appky.
    expect(kusy(null)).toBe(`0${NBSP}ks`);
    expect(kusy(undefined)).toBe(`0${NBSP}ks`);
    expect(kusy('nic')).toBe(`0${NBSP}ks`);
    expect(litry('30')).toBe(`30${NBSP}l`);
    expect(hektolitry(Infinity)).toBe(`0,0${NBSP}hl`);
  });

  it('litry na hektolitry dělí stem na jednom místě', () => {
    expect(litryJakoHl(1250)).toBe(`12,5${NBSP}hl`);
    expect(litryJakoHl(0)).toBe(`0,0${NBSP}hl`);
  });

  it('objem si vybere jednotku podle velikosti', () => {
    expect(objem(450)).toBe(`450${NBSP}l`);
    expect(objem(999)).toBe(`999${NBSP}l`);
    expect(objem(1000)).toBe(`10,0${NBSP}hl`);
    expect(objem(12500)).toBe(`125,0${NBSP}hl`);
    // I záporný objem (schodek) se řídí velikostí, ne znaménkem.
    expect(objem(-1500)).toBe(`-15,0${NBSP}hl`);
  });

  it('rozdíl nese znaménko i u plusu', () => {
    // „+3 ks" a „3 ks" znamenají něco jiného; u inventury je to rozdíl
    // mezi přebytkem a stavem.
    expect(rozdilKusy(3)).toBe(`+3${NBSP}ks`);
    expect(rozdilKusy(-3)).toBe(`-3${NBSP}ks`);
    expect(rozdilKusy(0)).toBe(`0${NBSP}ks`);
  });
});
