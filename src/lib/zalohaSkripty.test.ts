// 🔐 Šifrovaná záloha — skripty jsou čisté .mjs pro Node (běží v GitHub
// Actions), proto se volají skutečným Node, ne přes transformaci vitestu.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function node(kod: string): unknown {
  const vystup = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `
      import * as s from './scripts/lib/sifraZalohy.mjs';
      import * as t from './scripts/lib/zalohaTabulky.mjs';
      const zkus = (fn) => { try { return { ok: fn() }; } catch (e) { return { chyba: e.message }; } };
      console.log(JSON.stringify(${kod}));
    `],
    { encoding: 'utf8' },
  );
  return JSON.parse(vystup.trim().split('\n').pop()!);
}

describe('šifrování zálohy', () => {
  it('co se zašifruje, jde se správným heslem přečíst', () => {
    const r = node(`(() => { const o = s.zasifruj('{"ahoj":"světe"}', 'dlouhé-heslo-123'); return [s.desifruj(o, 'dlouhé-heslo-123'), o.includes('světe')]; })()`);
    expect(r).toEqual(['{"ahoj":"světe"}', false]);
  });

  it('špatné heslo i pozměněný soubor skončí chybou, ne nesmyslem', () => {
    const r = node(`(() => {
      const o = s.zasifruj('tajné', 'dlouhé-heslo-123');
      const upraveny = JSON.stringify({ ...JSON.parse(o), data: Buffer.from('jiný obsah').toString('base64') });
      return [zkus(() => s.desifruj(o, 'jiné-heslo-1234')), zkus(() => s.desifruj(upraveny, 'dlouhé-heslo-123'))];
    })()`) as { chyba?: string }[];
    expect(r[0].chyba).toMatch(/rozšifrovat/);
    expect(r[1].chyba).toMatch(/rozšifrovat/);
  });

  it('krátké nebo chybějící heslo se odmítne', () => {
    const r = node(`[zkus(() => s.zasifruj('x', 'kratke')), zkus(() => s.zasifruj('x', ''))]`) as { chyba?: string }[];
    expect(r[0].chyba).toMatch(/12 znaků/);
    expect(r[1].chyba).toMatch(/12 znaků/);
  });

  it('dvě šifrování téhož textu se liší (vlastní sůl a IV)', () => {
    expect(node(`s.zasifruj('stejné', 'dlouhé-heslo-123') === s.zasifruj('stejné', 'dlouhé-heslo-123')`)).toBe(false);
  });
});

describe('seznam zálohovaných tabulek', () => {
  const typy = readFileSync('src/lib/database.types.ts', 'utf8');
  const blok = typy.slice(typy.indexOf('    Tables: {'), typy.indexOf('    Views: {'));
  const vDatabazi = [...blok.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
  const { zalohovane, nezalohovat, odlozene, vazby } = node(
    `({ zalohovane: t.TABULKY.map(([n]) => n), nezalohovat: t.NEZALOHOVAT, odlozene: Object.keys(t.ODLOZENE_SLOUPCE), vazby: t.VAZBY.flatMap(([a,,c]) => [a, c]) })`,
  ) as { zalohovane: string[]; nezalohovat: string[]; odlozene: string[]; vazby: string[] };

  it('každá tabulka v databázi je buď zálohovaná, nebo vědomě vynechaná', () => {
    const zapomenute = vDatabazi.filter((t) => !zalohovane.includes(t) && !nezalohovat.includes(t));
    // Spadne-li to: novou tabulku přidej do scripts/lib/zalohaTabulky.mjs
    // (TABULKY ve správném pořadí, nebo NEZALOHOVAT s důvodem).
    expect(zapomenute).toEqual([]);
  });

  it('tajemství se nezálohují ani šifrovaně', () => {
    for (const t of ['app_secrets', 'whatsapp_session', 'push_odbery']) expect(zalohovane).not.toContain(t);
  });

  it('žádná tabulka není v seznamu dvakrát a odkazované tabulky existují', () => {
    expect(new Set(zalohovane).size).toBe(zalohovane.length);
    for (const t of [...odlozene, ...vazby]) expect(zalohovane).toContain(t);
  });

  it('rodiče jdou v pořadí obnovy před dětmi', () => {
    const i = (t: string) => zalohovane.indexOf(t);
    expect(i('orders')).toBeLessThan(i('order_items'));
    expect(i('order_items')).toBeLessThan(i('kegging'));
    expect(i('beers')).toBeLessThan(i('cellar_tanks'));
    expect(i('cellar_tanks')).toBeLessThan(i('cellar_batches'));
    expect(i('cellar_batches')).toBeLessThan(i('cellar_batch_mereni'));
    expect(i('akce')).toBeLessThan(i('akce_items'));
    expect(i('places')).toBeLessThan(i('orders'));
  });
});
