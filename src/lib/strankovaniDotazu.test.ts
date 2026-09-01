// 🚧 Pojistka proti tichému ořezání na 1000 řádků.
//
// Supabase vrátí na jeden dotaz nejvýš 1000 řádků a zbytek zahodí BEZ chyby.
// U rostoucích tabulek je to zákeřné: jakmile tabulka přeroste tisícovku,
// část dat se přestane počítat, sklad začne ukazovat nesmysly a nic nespadne.
// Přišlo by se na to až podle nesedící inventury, měsíce potom.
//
// Tahle past už tenhle projekt kousla dvakrát (srpen 2026: 68 dotazů, pak
// devět dotazů s .in()). Proto to nehlídá jen dobrá vůle, ale test: projde
// zdrojáky a najde dotaz na rostoucí tabulku, který se nestránkuje.
//
// Když test spadne u nového dotazu, jsou dvě správné reakce:
//   • načítat přes fetchAllRows(...)  — skoro vždycky tahle,
//   • nebo dotaz zapsat tak, aby byl prokazatelně omezený (count/head,
//     .limit(n), .maybeSingle()) — pak ho test pustí sám.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Tabulky, které v provozu porostou přes tisíc řádků. */
const ROSTOUCI = [
  'orders', 'order_items', 'kegging', 'bottling', 'fasovani', 'fasovani_private',
  'writeoffs', 'inventory', 'inventory_adjustments', 'zavoz_deductions',
  'keg_prefuk', 'akce', 'akce_items', 'keg_returns', 'keg_movements',
  'logbook_entries', 'zavoz_ukoly_hotovo', 'kegging_plan_checks',
];

/**
 * Dotazy, které se stránkovat nemusí, protože jsou omezené jinak. Každý
 * důvod je vypsaný — ať je při dalším čtení jasné, proč je výjimka v pořádku,
 * a ať se sem nedostane nic „protože to spadlo".
 */
const VYJIMKY: { soubor: string; duvod: RegExp }[] = [
  // Počítání bez řádků: `head: true` vrací jen číslo, žádná data.
  { soubor: '', duvod: /head:\s*true/ },
  // Výslovný strop — autor ví, kolik chce.
  { soubor: '', duvod: /\.limit\(/ },
  // Jeden řádek podle id.
  { soubor: '', duvod: /\.maybeSingle\(\)|\.single\(\)/ },
  // Zápis, který si nechá vrátit VLASTNÍ vložené řádky — `insert(...).select('id')`.
  // Tabulku to nečte; vrací se jen to, co právě vzniklo, takže víc řádků, než
  // kolik se vložilo, přijít nemůže. Používá se na vzetí zápisu zpět
  // (toastZpet v InventoryScreen) — id jsou jediná cesta, jak smazat právě
  // ten zápis a nic jiného.
  { soubor: '', duvod: /\.(insert|update|upsert|delete)\([\s\S]*\)\s*\.select\(/ },
];

function souboryVeZdroji(dir: string): string[] {
  const out: string[] = [];
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { out.push(...souboryVeZdroji(cesta)); continue; }
    if (!/\.tsx?$/.test(jmeno) || /\.test\.tsx?$/.test(jmeno)) continue;
    out.push(cesta);
  }
  return out;
}

/**
 * Najde `supabase.from('tabulka')` a vrátí kus textu za ním až po konec
 * příkazu — v něm se pak hledá, čím je dotaz omezený. Konec se pozná podle
 * středníku nebo čárky na konci řádku (dotazy uvnitř Promise.all).
 */
function dotazyNaTabulky(zdroj: string): { tabulka: string; retez: string }[] {
  const out: { tabulka: string; retez: string }[] = [];
  const re = /supabase\s*\.\s*from\(\s*'([a-z_]+)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(zdroj)) !== null) {
    const zbytek = zdroj.slice(m.index, m.index + 600);
    // Konec příkazu: první středník, nebo čárka následovaná koncem řádku.
    const konec = zbytek.search(/;|,\s*\n/);
    out.push({ tabulka: m[1], retez: konec > 0 ? zbytek.slice(0, konec) : zbytek });
  }
  return out;
}

/** Modifikátory, které fetchAllRows umí. Ostatní na něm za běhu spadnou. */
const UMI = new Set(['order', 'gte', 'lte', 'eq', 'neq', 'lt', 'gt', 'is', 'not', 'or', 'filter', 'in', 'then', 'catch']);

/**
 * Vypíše metody volané PŘÍMO na řetězu fetchAllRows(...) — ne to, co je
 * uvnitř argumentů. Bez hlídání hloubky závorek by se za chybu označilo
 * i `.in('order_id', ords.map(...))`, kde `.map` patří poli, ne dotazu.
 */
function metodyNaRetezu(zdroj: string, zavorka: number): string[] {
  // Nejdřív přeskočit argumenty samotného fetchAllRows(...) — co je v nich,
  // na dotaz nepatří.
  let hloubka = 0;
  let i = zavorka;
  for (; i < zdroj.length; i++) {
    if (zdroj[i] === '(') hloubka++;
    else if (zdroj[i] === ')') { hloubka--; if (hloubka === 0) { i++; break; } }
  }

  // Od téhle chvíle je řetěz na nulové hloubce; hlouběji jsou argumenty.
  const out: string[] = [];
  for (; i < zdroj.length; i++) {
    const z = zdroj[i];
    if (z === '(') { hloubka++; continue; }
    if (z === ')') { hloubka--; continue; }
    if (hloubka === 0 && (z === ';' || (z === ',' && /^\s*\n/.test(zdroj.slice(i + 1, i + 3))))) break;
    if (hloubka === 0 && z === '.') {
      const m = zdroj.slice(i + 1).match(/^([a-zA-Z]+)\(/);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

describe('fetchAllRows se volá jen s tím, co umí', () => {
  it('žádný řetěz nepoužívá modifikátor, který na něm spadne', () => {
    // TypeScript tohle nechytí — fetchAllRows vrací `any`, takže `.limit(300)`
    // projde překladem a spadne až ve chvíli, kdy uživatel otevře obrazovku.
    const nalezy: string[] = [];

    for (const soubor of souboryVeZdroji('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      const re = /fetchAllRows\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(zdroj)) !== null) {
        for (const metoda of metodyNaRetezu(zdroj, m.index + m[0].length - 1)) {
          if (UMI.has(metoda)) continue;
          const radek = zdroj.slice(0, m.index).split('\n').length;
          nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → .${metoda}()`);
        }
      }
    }

    expect(nalezy).toEqual([]);
  });
});

describe('dotazy na rostoucí tabulky se stránkují', () => {
  it('žádný nečeká na to, až tabulka přeroste tisícovku', () => {
    const nalezy: string[] = [];

    for (const soubor of souboryVeZdroji('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      for (const { tabulka, retez } of dotazyNaTabulky(zdroj)) {
        if (!ROSTOUCI.includes(tabulka)) continue;
        // Zápisy (insert/update/delete/upsert) limit řádků neřeší.
        if (!/\.select\(/.test(retez)) continue;
        if (VYJIMKY.some((v) => v.duvod.test(retez))) continue;

        const radek = zdroj.slice(0, zdroj.indexOf(retez)).split('\n').length;
        nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → ${tabulka}`);
      }
    }

    expect(nalezy).toEqual([]);
  });
});
