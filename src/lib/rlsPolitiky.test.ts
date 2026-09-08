/**
 * 🔐 Pojistka: omezení oprávnění nesmí stát vedle politiky, která pouští všechny.
 *
 * PostgreSQL spojuje více POVOLUJÍCÍCH (permissive) politik pro tutéž operaci
 * přes OR — stačí, aby prošla jedna. Když se tedy k tabulce přidá nová
 * politika s kontrolou `user_can_edit_module(...)`, ale původní
 * `WITH CHECK (true)` u ní zůstane, nová nic nevynucuje.
 *
 * Přesně to se v projektu stalo: čtyři migrace (20261128, 20261204, 20261206,
 * 20261208) přidaly kontrolu oprávnění k zápisu, ale politiky z července 2026
 * nikdo nezrušil. Vynucení tedy od začátku nefungovalo a nešlo to poznat —
 * appka se chovala správně, protože omezení hlídalo i UI. Poznalo by se to
 * až tak, že by někdo poslal REST požadavek mimo aplikaci.
 *
 * Test čte migrace jako PostgreSQL: přehraje je v pořadí, drží aktuální
 * stav politik (CREATE přidá, DROP odebere) a na konci se ptá, jestli
 * u nějaké tabulky nestojí u téže operace omezená a otevřená zároveň.
 *
 * Čtení (SELECT) se schválně nekontroluje — data se v pivovaru čtou
 * společně a omezovat je není záměr.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SLOZKA = 'supabase/migrations';

type Politika = { operace: string; otevrena: boolean; jmeno: string; migrace: string };

/** Operace, kde na oprávnění záleží. SELECT je schválně mimo. */
const ZAPISOVE = new Set(['INSERT', 'UPDATE', 'DELETE', 'ALL']);

function prehrajMigrace(): Map<string, Politika> {
  // Klíč je „tabulka|jméno politiky" — stejně, jako to vidí databáze.
  const stav = new Map<string, Politika>();
  const soubory = readdirSync(SLOZKA).filter((f) => f.endsWith('.sql')).sort();

  for (const soubor of soubory) {
    const sql = readFileSync(join(SLOZKA, soubor), 'utf8');

    for (const m of sql.matchAll(/DROP POLICY IF EXISTS\s+"?([^"\n;]+?)"?\s+ON\s+(?:public\.)?(\w+)/gi)) {
      stav.delete(`${m[2].toLowerCase()}|${m[1].trim().toLowerCase()}`);
    }

    for (const m of sql.matchAll(/CREATE POLICY\s+"?([^"\n]+?)"?\s+ON\s+(?:public\.)?(\w+)([\s\S]*?)(?=;)/gi)) {
      const jmeno = m[1].trim();
      const tabulka = m[2].toLowerCase();
      const telo = m[3];
      const operace = (telo.match(/FOR\s+(\w+)/i)?.[1] ?? 'ALL').toUpperCase();
      // `USING (true)` / `WITH CHECK (true)` = pustí každého přihlášeného.
      const otevrena = /(USING|WITH CHECK)\s*\(\s*true\s*\)/i.test(telo);
      stav.set(`${tabulka}|${jmeno.toLowerCase()}`, { operace, otevrena, jmeno, migrace: soubor });
    }
  }
  return stav;
}

describe('politiky oprávnění (RLS)', () => {
  it('u žádné tabulky nestojí omezený zápis vedle otevřeného', () => {
    const stav = prehrajMigrace();

    // tabulka+operace → seznam politik
    const podle = new Map<string, Politika[]>();
    for (const [klic, p] of stav) {
      if (!ZAPISOVE.has(p.operace)) continue;
      const tabulka = klic.split('|')[0];
      const k = `${tabulka}|${p.operace}`;
      podle.set(k, [...(podle.get(k) ?? []), p]);
    }

    const prebijene: string[] = [];
    for (const [k, sez] of podle) {
      const maOmezeni = sez.some((p) => !p.otevrena);
      const otevrene = sez.filter((p) => p.otevrena);
      if (maOmezeni && otevrene.length) {
        for (const p of otevrene) prebijene.push(`${k} ← ${p.jmeno} (${p.migrace})`);
      }
    }

    // Kdyby to spadlo: nová migrace musí starou otevřenou politiku ZRUŠIT
    // (DROP POLICY IF EXISTS), ne ji jen obejít novou omezenou.
    expect(prebijene).toEqual([]);
  });

  it('kontrola oprávnění u zápisu vůbec existuje', () => {
    // Pojistka na opačnou chybu: kdyby někdo „vyřešil" test tím, že omezené
    // politiky smaže, zůstalo by prázdno — a test výš by prošel.
    const stav = prehrajMigrace();
    const omezene = [...stav.values()].filter((p) => ZAPISOVE.has(p.operace) && !p.otevrena);
    expect(omezene.length).toBeGreaterThan(50);
  });
});
