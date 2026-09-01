// 🚧 Pojistka: realtime nesmí zhasnout obrazovku.
//
// Obrazovka, která se při načítání schová za spinner (`if (loading) return
// <Spinner />`), se přitom celá ODMOUNTUJE. Prohlížeč u prázdného obsahu
// srazí odrolování na nulu, takže se po návratu člověk ocitne úplně nahoře.
//
// U prvního načtení to nevadí. Zabolí to, když stejný loader dostane
// `useRealtime`: po každém vlastním zápisu dorazí za 400 ms událost o tomtéž
// zápisu, obrazovka zhasne a odrolování je pryč. Z provozu: „když kliknu
// odečíst, vrací mě to vždycky nahoru" — a to i poté, co si obrazovka pozici
// hlídala kotvou (lib/drzPozici.ts). Kotva doběhla dřív než realtime.
//
// Správně je předat tichou variantu: `useRealtime([...], () => load(true))`.
// Data se přenačtou, obsah zůstane vykreslený a pozice se nehne.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
 * Druhý argument `useRealtime(...)` — buď holé jméno funkce, nebo výraz.
 * Holé jméno znamená, že se volá bez parametrů, tedy v „hlasitém" režimu.
 */
/** Tělo funkce od otevírací složené závorky po její pár. */
function teloFunkce(zdroj: string, otevirajici: number): string {
  let hloubka = 0;
  for (let i = otevirajici; i < zdroj.length; i++) {
    if (zdroj[i] === '{') hloubka++;
    else if (zdroj[i] === '}') { hloubka--; if (hloubka === 0) return zdroj.slice(otevirajici, i + 1); }
  }
  return zdroj.slice(otevirajici);
}

function realtimeCallbacky(zdroj: string): { radek: number; callback: string }[] {
  const out: { radek: number; callback: string }[] = [];
  const re = /useRealtime\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(zdroj)) !== null) {
    // Projít argumenty se sledováním hloubky závorek a najít čárku na hloubce 1.
    let hloubka = 0;
    let i = m.index + m[0].length - 1;
    let carka = -1;
    for (; i < zdroj.length; i++) {
      const z = zdroj[i];
      if (z === '(' || z === '[' || z === '{') hloubka++;
      else if (z === ')' || z === ']' || z === '}') { hloubka--; if (hloubka === 0) break; }
      else if (z === ',' && hloubka === 1 && carka < 0) carka = i;
    }
    if (carka < 0) continue;
    out.push({
      radek: zdroj.slice(0, m.index).split('\n').length,
      callback: zdroj.slice(carka + 1, i).trim(),
    });
  }
  return out;
}

describe('realtime nezhasíná obrazovku', () => {
  it('obrazovka se spinnerem nedává realtime loader, který spinner rozsvítí', () => {
    const nalezy: string[] = [];

    for (const soubor of souboryVeZdroji('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      // Týká se jen obrazovek, které se za načítání schovávají celé.
      if (!/if\s*\(loading\)\s*return\s*<Spinner/.test(zdroj)) continue;

      for (const { radek, callback } of realtimeCallbacky(zdroj)) {
        // Výraz (šipková funkce s argumentem) je v pořádku — tam si autor
        // režim zvolil. Problém je holé jméno funkce: zavolá se bez parametrů.
        if (!/^[A-Za-z_$][\w$]*$/.test(callback)) continue;

        // Rozsvítí ten loader spinner? Hledá se `setLoading(true)` uvnitř něj.
        const def = new RegExp(`(?:async\\s+)?function\\s+${callback}\\s*\\(([^)]*)\\)\\s*\\{`).exec(zdroj);
        if (!def) continue;
        // Tělo se ohraničí párováním složených závorek. Pevný počet znaků
        // přetekl za konec funkce a bral setLoading(true) z toho, co leželo
        // za ní — KnihaJizdScreen tím hlásil chybu, která tam není.
        const telo = teloFunkce(zdroj, def.index + def[0].length - 1);
        // Stačí, že tam setLoading(true) JE. Že ho loader má schovaný za
        // `if (!tiche)`, nepomůže: volá se bez argumentů, takže `tiche` je
        // undefined, podmínka platí a spinner naskočí. Právě takhle vypadala
        // původní chyba v Inventuře.
        if (!/setLoading\(true\)/.test(telo)) continue;

        nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → useRealtime(..., ${callback}) rozsvítí spinner`);
      }
    }

    expect(nalezy).toEqual([]);
  });
});
