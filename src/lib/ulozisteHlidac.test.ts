// 💾 Pojistka na sáhnutí do úložiště prohlížeče napřímo.
//
// `localStorage.setItem` umí vyhodit výjimku ze tří důvodů: privátní režim
// Safari, plná kvóta a zakázané ukládání dat v nastavení. Když k tomu dojde
// uprostřed vykreslování, spadne celá obrazovka — a to jen proto, že si
// appka chtěla zapamatovat naposledy vybrané pivo. Takových nechráněných
// zápisů bylo v kódu 33.
//
// Od té doby se zapisuje jen přes `lib/uloziste.ts`. Test hlídá, že to tak
// zůstane: nový `localStorage.setItem` bez pojistky shodí testy dřív, než
// se nasadí.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Soubory, kde je sáhnutí napřímo v pořádku — a proč. */
const VYJIMKY: Record<string, string> = {
  'src/lib/uloziste.ts': 'tady ta pojistka bydlí',
  'src/lib/clearLocalData.ts': 'prochází celé úložiště přes localStorage.key(), zápis má přes uloziste',
};

function zdroje(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...zdroje(c)); continue; }
    if (/\.tsx?$/.test(j) && !/\.test\./.test(j)) out.push(c);
  }
  return out;
}

function nazev(p: string): string {
  return p.split(/[\\/]/).join('/').replace(/.*\/src\//, 'src/');
}

describe('úložiště prohlížeče', () => {
  it('zapisuje se jen přes lib/uloziste.ts', () => {
    const nalezy: string[] = [];
    for (const p of zdroje('src')) {
      const jmeno = nazev(p);
      if (VYJIMKY[jmeno]) continue;
      const radky = readFileSync(p, 'utf8').split('\n');
      radky.forEach((r, i) => {
        if (/localStorage\.(setItem|removeItem)\s*\(/.test(r)) nalezy.push(`${jmeno}:${i + 1}`);
      });
    }
    expect(nalezy, `Zápis do localStorage mimo lib/uloziste.ts (použij uloz/smaz):\n${nalezy.join('\n')}`).toEqual([]);
  });
});
