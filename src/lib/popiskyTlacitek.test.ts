// 🔊 Pojistka na tlačítka, kde je vidět jen ikona.
//
// Aplikace jich měla třicet: křížek zavírající okno, fajfka ukládající
// množství, šipky na rádiu. Kdo je vidí, ví, co dělají. Kdo je nevidí —
// čtečka obrazovky, hlasové ovládání — dostal jen „tlačítko". A `title`
// nestačí: na dotykovém displeji se bublina nikdy neukáže a čtečky ho
// podle nastavení klidně přeskočí.
//
// Test hlídá jediné pravidlo: tlačítko bez viditelného textu musí mít
// `aria-label`. Nový křížek bez popisku shodí testy dřív, než se nasadí.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function obrazovky(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...obrazovky(c)); continue; }
    if (/\.tsx$/.test(j) && !/\.test\./.test(j)) out.push(c);
  }
  return out;
}

/**
 * Vrátí popisy tlačítek, u kterých je uvnitř jen komponenta (ikona),
 * žádný text ani JSX výraz s textem — a chybí `aria-label`.
 */
function tlacitkaBezPopisku(soubor: string): string[] {
  const s = readFileSync(soubor, 'utf8');
  const nalezy: string[] = [];
  const re = /<button\b([^>]*?)>([\s\S]{0,220}?)<\/button>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const [, atributy, obsah] = m;
    if (/aria-label/.test(atributy)) continue;
    // Text mimo značky a mimo JSX výrazy. Výraz `{stav ? 'A' : 'B'}` bere
    // test jako viditelný popisek — jinak by hlásil desítky planých nálezů.
    const holy = obsah.replace(/<[^>]*>/g, ' ').replace(/\{[^{}]*\}/g, ' ');
    if (holy.replace(/\s+/g, ' ').trim().length > 0) continue;
    if (/\{[^{}]*\}/.test(obsah)) continue;
    if (!/<[A-Z]\w*/.test(obsah)) continue; // uvnitř není ani ikona
    const radek = s.slice(0, m.index).split('\n').length;
    nalezy.push(`${soubor.replace(/\\/g, '/').replace(/.*\/src\//, 'src/')}:${radek}`);
  }
  return nalezy;
}

describe('popisky tlačítek', () => {
  it('tlačítko jen s ikonou má aria-label', () => {
    const nalezy = obrazovky('src').flatMap(tlacitkaBezPopisku);
    expect(nalezy, `Tlačítka bez viditelného textu a bez aria-label:\n${nalezy.join('\n')}`).toEqual([]);
  });
});
