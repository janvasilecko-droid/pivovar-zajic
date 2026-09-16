// 🕛 Pojistka: „dnešek“ se nesmí počítat přes UTC.
//
// `new Date().toISOString()` je VŽDYCKY v UTC. Ořezané na samotné datum
// (`.slice(0, 10)` nebo `.split('T')[0]`) nebo na měsíc (`.slice(0, 7)`) z
// toho udělá „dnešek podle Greenwiche“ — v Praze (UTC+1 v zimě, UTC+2 v
// létě) je kolem půlnoci reálně už jiný den, než tohle vrátí. Přesně tahle
// chyba už appku trápila (viz commit „Další případy chyby s časovou zónou“,
// 15. 9. 2026) a 16. 9. 2026 se při hledání dalších chyb našlo dalších 48
// míst se stejným vzorcem — tenhle test má zajistit, že se nevrátí.
//
// Správně je `businessDateISO()` z lib/businessDate.ts — počítá pražský
// kalendářní den bez ohledu na to, v jaké časové zóně běží prohlížeč nebo
// server (viz jeho vlastní testy, businessDate.test.ts).
//
// Plné časové razítko (`new Date().toISOString()` BEZ ořezání na datum) je
// v pořádku — to správně JE v UTC, to je smysl ukládat časová razítka v UTC.
// Tenhle test hlídá jen ořezanou verzi, která se tváří jako kalendářní den.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function zdrojoveSoubory(dir: string): string[] {
  const out: string[] = [];
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { out.push(...zdrojoveSoubory(cesta)); continue; }
    if (!/\.tsx?$/.test(jmeno) || /\.test\.tsx?$/.test(jmeno)) continue;
    out.push(cesta);
  }
  return out;
}

describe('žádný "dnešek" počítaný přes UTC', () => {
  it('new Date().toISOString() ořezané na datum/měsíc — místo toho businessDateISO()', () => {
    const vzor = /new Date\(\)\.toISOString\(\)\.(?:slice\(0, ?(?:7|10)\)|split\(['"]T['"]\)\[0\])/g;
    const nalezy: string[] = [];

    for (const soubor of zdrojoveSoubory('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      for (const m of zdroj.matchAll(vzor)) {
        const radek = zdroj.slice(0, m.index).split('\n').length;
        nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → ${m[0]}`);
      }
    }

    expect(nalezy).toEqual([]);
  });
});
