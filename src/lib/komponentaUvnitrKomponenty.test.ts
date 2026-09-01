// 🚧 Pojistka: komponenta se nesmí deklarovat uvnitř jiné komponenty.
//
// `function Panel() {...}` napsaná uvnitř obrazovky vzniká při KAŽDÉM
// překreslení znovu, takže má pokaždé jinou identitu. React ji proto nepovažuje
// za tutéž komponentu — celý její podstrom zahodí a postaví znovu.
//
// Navenek to vypadá, že prvek nereaguje: políčko ztratí kurzor po každé
// napsané číslici a rozepsaná hodnota se nikam nedostane. Z provozu:
// „když dám odečíst ze skladu, tak se nic nestane." Panel byl v pořádku, jen
// se po každém stisku klávesy postavil od nuly.
//
// Správně jsou dvě cesty:
//   • zavolat ji jako obyčejnou funkci — `{vykresliPanel(d)}` místo
//     `<Panel d={d} />`; JSX se vloží do stromu rodiče a nic se nezahazuje,
//   • nebo komponentu vytáhnout ven z rodiče a předat data přes props.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function souboryVeZdroji(dir: string): string[] {
  const out: string[] = [];
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { out.push(...souboryVeZdroji(cesta)); continue; }
    if (!/\.tsx$/.test(jmeno) || /\.test\.tsx$/.test(jmeno)) continue;
    out.push(cesta);
  }
  return out;
}

describe('komponenta se nedeklaruje uvnitř jiné komponenty', () => {
  it('žádná vnořená komponenta se nevykresluje jako JSX', () => {
    const nalezy: string[] = [];

    for (const soubor of souboryVeZdroji('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      const radky = zdroj.split('\n');

      radky.forEach((radek, i) => {
        // Deklarace funkce s VELKÝM písmenem a ODSAZENÍM = vnořená uvnitř
        // jiné funkce. Na nulovém odsazení je to komponenta na úrovni
        // souboru, a ta je v pořádku.
        const m = /^\s+(?:export\s+)?(?:async\s+)?function\s+([A-Z]\w*)\s*\(/.exec(radek);
        if (!m) return;
        const jmeno = m[1];
        // Odsazená funkce může být taky argument forwardRef() nebo memo() —
        // tam je odsazení jen tvarem zápisu, ne vnořením do komponenty.
        // Pozná se podle toho, co stojí na řádku nad ní.
        const predchozi = radky.slice(0, i).reverse().find((x) => x.trim() !== '') ?? '';
        if (/\b(forwardRef|memo)\s*[<(]/.test(predchozi) || /\b(forwardRef|memo)\s*[<(]/.test(radek)) return;
        // Vadí to teprve tehdy, když se používá jako JSX prvek. Funkce, která
        // jen vrací JSX a volá se závorkami, problém nemá.
        const jakoJsx = new RegExp(`<${jmeno}[\\s/>]`);
        if (!jakoJsx.test(zdroj)) return;
        nalezy.push(`${soubor.replace(/\\/g, '/')}:${i + 1} → <${jmeno}/> se deklaruje uvnitř jiné komponenty`);
      });
    }

    expect(nalezy).toEqual([]);
  });
});
