#!/usr/bin/env node
/**
 * 🏷️ Hlídač popisků tlačítek (aria-label).
 *
 * DVĚ pravidla, obě z konkrétní chyby:
 *
 * 1. Ikonové tlačítko musí mít popisek. `title` nestačí — na dotyku se
 *    nezobrazí NIKDY, takže šest ikon vedle sebe na kartě objednávky je pro
 *    nového člověka hádanka a pro odečítač obrazovky prázdné tlačítko.
 *    (5. 9. 2026: title 323×, aria-label 51×.)
 *
 * 2. Tlačítko S TEXTEM aria-label mít NESMÍ. Popisek přístupné jméno
 *    NAHRAZUJE, takže z tlačítka „Mám všech 3" se pro odečítač stane
 *    „Odškrtnout celou položku" a viditelný text zmizí. Tuhle chybu jsem
 *    při hromadném doplňování popisků udělal na 53 místech a spadl na ní
 *    test plánu stáčení, který tlačítko hledá podle textu.
 *
 * Použití:
 *   node scripts/zkontroluj-popisky.mjs           kontrola (CI)
 *   node scripts/zkontroluj-popisky.mjs --vypis   vypíše, co kde je
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Kolik tlačítek s textem smí mít aria-label. Musí být nula. */
const ZAKLAD = 0;
function soubory(dir){const out=[];for(const j of readdirSync(dir)){const c=join(dir,j);if(statSync(c).isDirectory()){out.push(...soubory(c));continue;}if(!/\.tsx$/.test(j)||/\.test\.tsx$/.test(j))continue;out.push(c);}return out;}
// Vrátí [začátek značky, konec značky, konec celého prvku včetně </button>]
function tlacitka(z){
  const out=[];let i=0;
  while((i=z.indexOf('<button',i))!==-1){
    let j=i+7,hl=0,ret=null,samo=false;
    for(;j<z.length;j++){const c=z[j];
      if(ret){if(c===ret&&z[j-1]!=='\\')ret=null;continue;}
      if(c==='"'||c==="'"||c==='`'){ret=c;continue;}
      if(c==='{')hl++;else if(c==='}')hl--;
      else if(c==='>'&&hl===0){samo=z[j-1]==='/';break;}
    }
    const konecZnacky=j+1;
    let konecPrvku=konecZnacky;
    if(!samo){
      // najdi odpovídající </button> se započítáním vnořených
      let hloubka=1,k=konecZnacky;
      while(hloubka>0&&k<z.length){
        const dalsiOtev=z.indexOf('<button',k), dalsiZav=z.indexOf('</button>',k);
        if(dalsiZav===-1)break;
        if(dalsiOtev!==-1&&dalsiOtev<dalsiZav){hloubka++;k=dalsiOtev+7;}
        else{hloubka--;k=dalsiZav+9;}
      }
      konecPrvku=k;
    }
    out.push({od:i,konecZnacky,konecPrvku});i=konecZnacky;
  }
  return out;
}
/** Má tlačítko viditelný text? (písmena mimo značky a mimo ikony) */
function maText(vnitrek){
  let t=vnitrek
    .replace(/<[^>]*>/g,' ')          // pryč se značkami
    .replace(/\{\/\*[\s\S]*?\*\/\}/g,' '); // pryč s komentáři
  // Výrazy {…} počítáme jako text, pokud nejsou jen ikona/podmínka bez textu
  return /[\p{L}]/u.test(t.replace(/\s+/g,' ').trim());
}
const spatne = [];
for (const f of soubory(join(KOREN, 'src'))) {
  const z = readFileSync(f, 'utf8');
  for (const { od, konecZnacky, konecPrvku } of tlacitka(z)) {
    const znacka = z.slice(od, konecZnacky);
    if (!/\saria-label="/.test(znacka)) continue;
    const vnitrek = z.slice(konecZnacky, Math.max(konecZnacky, konecPrvku - 9));
    if (!maText(vnitrek)) continue;
    spatne.push(`${relative(KOREN, f)}:${z.slice(0, od).split('\n').length}`);
  }
}

if (process.argv.includes('--vypis')) spatne.forEach((s) => console.log(s));

if (spatne.length > ZAKLAD) {
  console.error(
    `Popisky: ${spatne.length} tlačítek má aria-label i viditelný text.\n` +
    'aria-label přístupné jméno NAHRAZUJE — u tlačítka s textem ho odeber\n' +
    '(text stačí), popisek patří jen tam, kde je samotná ikona.\n' +
    'Výpis: node scripts/zkontroluj-popisky.mjs --vypis',
  );
  process.exit(1);
}
console.log('Popisky: žádné tlačítko s textem nemá aria-label navíc.');
