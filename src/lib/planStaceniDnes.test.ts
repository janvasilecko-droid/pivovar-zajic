import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 🛡️ Hlídač: každý plán stáčení se skutečnou zásobou (currentStockMap) musí
// dostat dnešní datum (`dnes`). Bez něj computeKeggingPlan nevrátí do zásoby
// odpočet závozu zapsaný předem (cron ve 23:05 den před dovozem) a stočené
// kusy na dnešní nezavezenou objednávku chce stočit podruhé.
// 4. 11. 2026: Lahve ukazovaly „zbývá stočit" u stočených piv, protože jen
// tahle obrazovka datum nepředávala (KEG a „Co stočit" ano).

function soubory(dir: string): string[] {
  return readdirSync(dir).flatMap((jmeno) => {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) return soubory(cesta);
    return /\.(ts|tsx)$/.test(jmeno) && !/\.test\.(ts|tsx)$/.test(jmeno) ? [cesta] : [];
  });
}

/** Tělo volání `computeKeggingPlan({ … })` po párovou složenou závorku. */
function volani(text: string): string[] {
  const vysledek: string[] = [];
  let od = text.indexOf('computeKeggingPlan({');
  while (od >= 0) {
    const zacatek = text.indexOf('{', od);
    let hloubka = 0;
    let i = zacatek;
    for (; i < text.length; i += 1) {
      if (text[i] === '{') hloubka += 1;
      else if (text[i] === '}') { hloubka -= 1; if (hloubka === 0) break; }
    }
    vysledek.push(text.slice(zacatek, i + 1));
    od = text.indexOf('computeKeggingPlan({', i);
  }
  return vysledek;
}

describe('plán stáčení se zásobou dostává dnešní datum', () => {
  it('každé volání computeKeggingPlan s currentStockMap předává i dnes', () => {
    const chybi: string[] = [];
    let nalezeno = 0;
    for (const soubor of soubory(join(__dirname, '..'))) {
      if (soubor.endsWith('keggingPlan.ts')) continue;
      volani(readFileSync(soubor, 'utf8')).forEach((telo) => {
        if (!/\bcurrentStockMap\b/.test(telo)) return;
        nalezeno += 1;
        if (!/\bdnes\s*:/.test(telo)) chybi.push(soubor.replace(/^.*\/src\//, 'src/'));
      });
    }
    expect(nalezeno).toBeGreaterThanOrEqual(4); // KEG ×2, Lahve, usePlanStaceni
    expect(chybi, `Plán bez dnes: ${chybi.join(', ')}`).toEqual([]);
  });
});
