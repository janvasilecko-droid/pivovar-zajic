// 🚧 Pojistka: napočítaná inventura se ukládá ke KONCI měsíce.
//
// Fyzická i schválená inventura popisuje závěr měsíce, ale ukládala se k jeho
// PRVNÍMU dni. Skladová kniha ji bere jako reset stavu a přičítá k ní pohyby
// od toho data dál — k napočítanému stavu tedy přičetla ještě celý inventovaný
// měsíc. Srpen 2026, 12° Světlá 50 l: napočítány 4 sudy, Sklad z nich udělal
// 4 + 95 − 77 − 25 = −3, zatímco Inventura ze zapsaného počátku 11 vyšla na 4.
//
// Chybu nebylo vidět na obrazovce inventury (ta počítá z jiného konce) ani
// v testech skladové knihy (ty datum dostanou zadané). Vidět je jen tady:
// v tom jediném řádku, který datum zápisu vyrábí.
//
// „Počáteční stav" naopak popisuje RÁNO prvního dne a k prvnímu dni patří —
// proto se hlídá obojí, ať se to při další úpravě neprohodí.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ZDROJ = readFileSync('src/screens/InventoryScreen.tsx', 'utf8');

/** Tělo funkce daného jména — od otevírací složené závorky po její pár. */
function teloFunkce(jmeno: string): string {
  const zacatek = ZDROJ.indexOf(`function ${jmeno}(`);
  expect(zacatek, `funkce ${jmeno} v InventoryScreen.tsx neexistuje`).toBeGreaterThan(-1);
  const otevirajici = ZDROJ.indexOf('{', ZDROJ.indexOf(')', zacatek));
  let hloubka = 0;
  for (let i = otevirajici; i < ZDROJ.length; i++) {
    if (ZDROJ[i] === '{') hloubka++;
    else if (ZDROJ[i] === '}') { hloubka--; if (hloubka === 0) return ZDROJ.slice(otevirajici, i + 1); }
  }
  throw new Error(`konec funkce ${jmeno} se nenašel`);
}

describe('datum, ke kterému se inventura zapisuje', () => {
  it('fyzická inventura jde na poslední den měsíce', () => {
    const telo = teloFunkce('handleSaveActualStock');
    expect(telo).toContain('datumDoplnku(currentMonth)');
    expect(telo).not.toContain(`currentMonth + '-01'`);
  });

  it('schválená inventura taky — a počáteční stav dalšího měsíce na první den', () => {
    const telo = teloFunkce('handleLockAndTransferNextMonth');
    expect(telo).toContain('const curEntryDate = datumDoplnku(currentMonth)');
    expect(telo).toContain(`const nextEntryDate = nextMonthKey + '-01'`);
  });

  it('počáteční stav zůstává na prvním dni měsíce', () => {
    const telo = teloFunkce('handleSaveInitialStock');
    expect(telo).toContain(`const entryDate = currentMonth + '-01'`);
    expect(telo).not.toContain('datumDoplnku');
  });
});
