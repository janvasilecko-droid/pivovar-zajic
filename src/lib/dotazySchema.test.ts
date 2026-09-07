// 🛡️ Dotazy v kódu proti skutečnému schématu databáze.
//
// PROČ TENHLE TEST EXISTUJE: 7. 9. 2026 se ukázalo, že souhrn dne na ploše
// nepočítal ani stáčení KEG, ani závozy — dva dotazy si žádaly sloupce,
// které v těch tabulkách nejsou (`kegging.kegs_used` je sloupec bottling,
// `zavoz_deductions.deducted_date` se jmenuje deduct_date). Supabase na to
// odpoví chybou, aplikace ji jen zaloguje a ukáže nulu. Nikdo si toho
// nevšiml, protože nula je věrohodné číslo.
//
// Test čte `src/lib/schemaDB.json` — otisk sloupců z produkční databáze
// (jak ho vyrobit, je popsáno v README, sekce Databázové migrace). Otisk se
// obnovuje po migracích, které přidávají sloupce; když se zapomene, test
// spadne na nově přidaném sloupci a připomene to.
//
// CO SE ZÁMĚRNĚ NEKONTROLUJE: vnořené výběry (`items:order_items(...)`),
// hvězdička a dotazy skládané z proměnných. Cílem je chytit překlep
// v názvu sloupce, ne postavit vlastní SQL analyzátor.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import schema from './schemaDB.json';

const SLOUPCE = schema as Record<string, string[]>;

function zdrojoveSoubory(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...zdrojoveSoubory(c)); continue; }
    if (/\.tsx?$/.test(j) && !/\.test\./.test(j)) out.push(c);
  }
  return out;
}

type Nalez = { soubor: string; radek: number; tabulka: string; sloupec: string };

/** Rozdělí seznam sloupců; vrátí null, když je v něm něco, čemu test nerozumí. */
function sloupceZVyberu(vyber: string): string[] | null {
  if (vyber.includes('*') || vyber.includes('(') || vyber.includes(':')) return null;
  return vyber.split(',').map((s) => s.trim()).filter(Boolean);
}

function zkontrolujSoubor(soubor: string): Nalez[] {
  const zdroj = readFileSync(soubor, 'utf8');
  const radky = zdroj.split('\n');
  const nalezy: Nalez[] = [];

  const pridej = (tabulka: string, vyber: string, index: number) => {
    const sloupce = sloupceZVyberu(vyber);
    if (!sloupce) return;
    const znam = SLOUPCE[tabulka];
    if (!znam) return; // pohled nebo tabulka mimo otisk — o té se nehádáme
    const radek = zdroj.slice(0, index).split('\n').length;
    for (const s of sloupce) {
      if (!znam.includes(s)) nalezy.push({ soubor: soubor.replace(/\\/g, '/'), radek, tabulka, sloupec: s });
    }
  };

  // fetchAllRows('tabulka', 'a,b,c')
  for (const m of zdroj.matchAll(/fetchAllRows(?:<[^>]*>)?\(\s*'([a-z_0-9]+)'\s*,\s*'([^']*)'/g)) {
    pridej(m[1], m[2], m.index ?? 0);
  }
  // .from('tabulka')…select('a,b,c') — select bývá na témže nebo dalším řádku
  for (const m of zdroj.matchAll(/\.from\(\s*'([a-z_0-9]+)'\s*\)/g)) {
    const tabulka = m[1];
    const zbytek = zdroj.slice(m.index ?? 0, (m.index ?? 0) + 400);
    const sel = zbytek.match(/\.select\(\s*'([^']*)'/);
    if (sel) pridej(tabulka, sel[1], m.index ?? 0);
  }
  void radky;
  return nalezy;
}

describe('dotazy proti schématu databáze', () => {
  it('žádný dotaz nesahá na sloupec, který v tabulce není', () => {
    const nalezy = zdrojoveSoubory('src').flatMap(zkontrolujSoubor);
    const popis = nalezy.map((n) => `${n.soubor}:${n.radek} → ${n.tabulka}.${n.sloupec} neexistuje`);
    expect(popis).toEqual([]);
  }, 20000);

  it('otisk schématu je použitelný (má hlavní tabulky)', () => {
    // Kdyby otisk zůstal prázdný, test výš by procházel vždycky a nic nehlídal.
    for (const t of ['orders', 'order_items', 'kegging', 'bottling', 'zavoz_deductions', 'inventory']) {
      expect(SLOUPCE[t]?.length ?? 0).toBeGreaterThan(3);
    }
  });
});
