// 🔐 Šifrovaná záloha — skripty jsou čisté .mjs pro Node (běží v GitHub
// Actions), proto se volají skutečným Node, ne přes transformaci vitestu.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

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
  // Na Windows git soubor rozbalí s CRLF — `$` by pak před \r nesedělo.
  const typy = readFileSync('src/lib/database.types.ts', 'utf8').replace(/\r\n/g, '\n');
  const blok = typy.slice(typy.indexOf('    Tables: {'), typy.indexOf('    Views: {'));
  const vDatabazi = [...blok.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
  const { zalohovane, nezalohovat, odlozene, vazby, bible, nezalohovatBible, unikatni, pkBible } = node(
    `({ zalohovane: t.TABULKY.map(([n]) => n), nezalohovat: t.NEZALOHOVAT, odlozene: Object.keys(t.ODLOZENE_SLOUPCE), vazby: t.VAZBY.flatMap(([a,,c]) => [a, c]),
        bible: t.TABULKY_BIBLE.map(([n]) => n), nezalohovatBible: t.NEZALOHOVAT_BIBLE, unikatni: Object.keys(t.UNIKATNI_SLOUPCE),
        pkBible: Object.fromEntries(t.TABULKY_BIBLE.map(([n]) => [n, t.pk(n)])) })`,
  ) as { zalohovane: string[]; nezalohovat: string[]; odlozene: string[]; vazby: string[]; bible: string[]; nezalohovatBible: string[]; unikatni: string[]; pkBible: Record<string, string> };

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
    expect(new Set(bible).size).toBe(bible.length);
    for (const t of [...odlozene, ...vazby, ...unikatni]) expect([...zalohovane, ...bible]).toContain(t);
  });

  it('projekt bible má vlastní sadu: katalog, nastavení, náklady, migrace a ručně zadaná data — obsah knih ne', () => {
    expect([...bible].sort()).toEqual([
      'ai_naklady', 'bible_dokumenty', 'bible_nastaveni', 'bible_pivovary', 'bible_postupy_provozu', 'bible_problem_zjisteni',
      'bible_problemy', 'bible_receptury', 'bible_varky', 'bible_web_zdroje', 'bible_zarizeni', 'bible_zkusenosti', 'migrace_aplikovane',
    ]);
    expect(pkBible).toMatchObject({ migrace_aplikovane: 'nazev', bible_nastaveni: 'klic', bible_dokumenty: 'id', ai_naklady: 'id', bible_varky: 'id' });
    // Obsah knih, chat s citacemi, přehledy z knih a tajemství konektoru nikdy.
    for (const t of ['bible_strany', 'bible_pasaze', 'bible_kapitoly', 'bible_prehledy', 'bible_zpravy', 'bible_konverzace',
      'bible_mcp_klienti', 'bible_mcp_kody', 'bible_mcp_tokeny']) {
      expect(bible).not.toContain(t);
      expect(nezalohovatBible).toContain(t);
    }
    // Prázdné tabulky bible v hlavním projektu se do hlavní zálohy nepletou.
    for (const t of zalohovane) expect(t).not.toMatch(/^bible_|^ai_naklady$/);
  });

  describe('projekt bible podle migrací', () => {
    const migrace = readdirSync('bible/supabase/migrations').filter((j) => j.endsWith('.sql')).sort()
      .map((j) => readFileSync(`bible/supabase/migrations/${j}`, 'utf8').replace(/\r\n/g, '\n')).join('\n');
    // Tabulky z migrací a pro každou její odkazy (REFERENCES) a počítané sloupce (GENERATED).
    const tabulky = new Map<string, { odkazy: Set<string>; pocitane: Set<string> }>();
    for (const blok of migrace.split(/CREATE TABLE IF NOT EXISTS public\./).slice(1)) {
      const jmeno = /^(\w+)/.exec(blok)![1];
      const telo = blok.slice(0, blok.indexOf('\n);'));
      tabulky.set(jmeno, {
        odkazy: new Set([...telo.matchAll(/REFERENCES public\.(\w+)/g)].map((m) => m[1])),
        pocitane: new Set([...telo.matchAll(/^\s+(\w+) [^\n]*GENERATED ALWAYS/gm)].map((m) => m[1])),
      });
    }
    for (const m of migrace.matchAll(/ALTER TABLE public\.(\w+)\s+ADD COLUMN IF NOT EXISTS (\w+)([^;]*);/g)) {
      const t = tabulky.get(m[1]);
      if (!t) continue;
      for (const o of m[3].matchAll(/REFERENCES public\.(\w+)/g)) t.odkazy.add(o[1]);
      if (/GENERATED ALWAYS/.test(m[3])) t.pocitane.add(m[2]);
    }
    const { vynechat } = node('({ vynechat: t.VYNECHAT_SLOUPCE })') as { vynechat: Record<string, string[]> };

    it('každá tabulka bible je zálohovaná, nebo vědomě vynechaná (ne obojí)', () => {
      expect(tabulky.size).toBeGreaterThanOrEqual(25);
      const zapomenute = [...tabulky.keys()].filter((t) => !bible.includes(t) && !nezalohovatBible.includes(t));
      // Spadne-li to: novou tabulku bible přidej do scripts/lib/zalohaTabulky.mjs
      // (TABULKY_BIBLE v pořadí obnovy, nebo NEZALOHOVAT_BIBLE s důvodem).
      expect(zapomenute).toEqual([]);
      expect(bible.filter((t) => nezalohovatBible.includes(t))).toEqual([]);
      for (const t of [...bible, ...nezalohovatBible]) expect(tabulky.has(t)).toBe(true);
    });

    it('při obnově jdou rodiče před dětmi (odkazy z migrací)', () => {
      for (const t of bible) {
        for (const rodic of tabulky.get(t)!.odkazy) {
          if (rodic === t) continue; // vlastní odkaz řeší ODLOZENE_SLOUPCE
          expect(bible, `${t} odkazuje na ${rodic}`).toContain(rodic);
          expect(bible.indexOf(rodic), `${rodic} musí být v záloze před ${t}`).toBeLessThan(bible.indexOf(t));
        }
      }
    });

    it('sloupce, které počítá databáze, se do zálohy nepíšou (obnova by je zapsat nesměla)', () => {
      for (const t of bible) {
        expect([...(vynechat[t] ?? [])].sort(), t).toEqual([...tabulky.get(t)!.pocitane].sort());
      }
    });
  });

  it('počítané sloupce zmizí z řádku zálohy i obnovy', () => {
    expect(node(`t.bezVynechanych('bible_zkusenosti', { id: 'a', text: 'x', hledani: "'x'" })`)).toEqual({ id: 'a', text: 'x' });
    expect(node(`t.bezVynechanych('orders', { id: 'a', hledani: 1 })`)).toEqual({ id: 'a', hledani: 1 });
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

describe('přepínače skriptů záloh', () => {
  const zkus = (argv: string[]) => {
    const vystup = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { prectiArgumenty } from './scripts/lib/argumenty.mjs';
      try { console.log(JSON.stringify({ ok: prectiArgumenty(${JSON.stringify(argv)}, { hodnoty: ['sada', 'tabulka', 'datum'], prepinace: ['opravdu'] }) })); }
      catch (e) { console.log(JSON.stringify({ chyba: e.message })); }
    `], { encoding: 'utf8' });
    return JSON.parse(vystup.trim().split('\n').pop()!);
  };

  it('obě podoby hodnoty fungují', () => {
    expect(zkus(['--sada', 'bible', '--opravdu'])).toEqual({ ok: { sada: 'bible', opravdu: true } });
    expect(zkus(['--sada=bible', '--tabulka=orders'])).toEqual({ ok: { sada: 'bible', tabulka: 'orders' } });
  });

  it('chybějící hodnota ani neznámý přepínač nepropadnou tiše na výchozí sadu', () => {
    expect(zkus(['--opravdu', '--sada']).chyba).toMatch(/chybí hodnota/);
    expect(zkus(['--sada', '--opravdu']).chyba).toMatch(/chybí hodnota/);
    expect(zkus(['--sada=', '--opravdu']).chyba).toMatch(/chybí hodnota/);
    expect(zkus(['--Sada=bible']).chyba).toMatch(/Neznámý/);
    expect(zkus(['--saada', 'bible']).chyba).toMatch(/Neznámý přepínač/);
    expect(zkus(['bible']).chyba).toMatch(/Neznámý argument/);
    expect(zkus(['--opravdu=ano']).chyba).toMatch(/nebere hodnotu/);
  });

  it('obnova s nejasnými přepínači skončí chybou a nic nezapíše', () => {
    let vystup = '';
    try {
      execFileSync(process.execPath, ['scripts/obnov-ze-zalohy.mjs', '--sada', '--opravdu'], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      vystup = String((e as { stderr?: string }).stderr ?? '');
    }
    expect(vystup).toMatch(/Obnova se nespustila: Za --sada chybí hodnota/);
  });
});
