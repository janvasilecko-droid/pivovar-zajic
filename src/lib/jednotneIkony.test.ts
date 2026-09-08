/**
 * 🎨 Jedna věc = jedna ikona, napříč všemi obrazovkami.
 *
 * Sud měl v aplikaci dvě podoby: vlastní `IkonaSud` (KEG, sanitace kegů,
 * dlaždice na ploše) a lucide `Cylinder` (Stáčení v HACCP, deník KEGů,
 * kalkulačka sudů, konto sudů u odběratelů, přepínač KEG v Lahvích). Lahev
 * podobně: `IkonaLahev` vs. `Wine`. Člověk se pak nemůže naučit „takhle
 * vypadá sud" a musí každou obrazovku číst od začátku.
 *
 * Test hlídá jen náhradu za VLASTNÍ ikonu, kterou aplikace má. Kde vlastní
 * ikona neexistuje, se lucide používá dál a nic se nevynucuje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * lucide ikona → čím se má nahradit.
 *
 * Dva důvody, proč tu něco je:
 *  1. Aplikace pro tu věc má VLASTNÍ ikonu (sud, lahev) — lucide je nezná
 *     a náhražky vypadaly jinak, než co znamenají.
 *  2. Dvě lucide ikony znamenají TOTÉŽ a používaly se obě. Změřeno
 *     5. 9. 2026: „upravit" se kreslilo třemi ikonami — Pencil 15×,
 *     Edit3 7×, PenLine 2×. Člověk se pak nemůže naučit „takhle vypadá
 *     upravit" a musí každou obrazovku číst od začátku. Vítězí ta
 *     nejpoužívanější, ne ta „hezčí".
 */
const NAHRADIT: Record<string, string> = {
  Cylinder: 'IkonaSud',
  Edit3: 'Pencil',
};

/**
 * Kde je lucide ikona v pořádku i tak. Každá výjimka potřebuje důvod —
 * `ikony.tsx` je samotná definice a náhledová stránka kreslí vymyšlená
 * data mimo aplikaci.
 */
const VYJIMKY = [
  'src/components/ikony.tsx',
];

function zdrojoveSoubory(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...zdrojoveSoubory(c)); continue; }
    if (!/\.tsx$/.test(j) || /\.test\.tsx$/.test(j)) continue;
    out.push(c);
  }
  return out;
}

describe('jednotné ikony', () => {
  it('pro sud se používá IkonaSud, ne lucide Cylinder', () => {
    const nalezy: string[] = [];
    for (const soubor of zdrojoveSoubory('src')) {
      const cesta = soubor.replace(/\\/g, '/');
      if (VYJIMKY.includes(cesta)) continue;
      const zdroj = readFileSync(soubor, 'utf8');
      for (const [lucide, vlastni] of Object.entries(NAHRADIT)) {
        // Hledá se POUŽITÍ v JSX (`<Cylinder`) i předání jako hodnota
        // (`icon: Cylinder`) — samotný import bez použití nikomu nevadí,
        // ale ani ten by tu po úklidu zůstat neměl.
        const re = new RegExp(`<${lucide}[\\s/>]|icon:\\s*${lucide}\\b`, 'g');
        for (const m of zdroj.matchAll(re)) {
          const radek = zdroj.slice(0, m.index).split('\n').length;
          nalezy.push(`${cesta}:${radek} → ${m[0].trim()} (použij ${vlastni})`);
        }
      }
    }
    expect(nalezy).toEqual([]);
  });
});
