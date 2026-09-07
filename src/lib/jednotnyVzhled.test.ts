// 🎨 Pojistka na jednotný vzhled.
//
// Aplikace měla dvě sady barev, které znamenaly totéž a vypadaly jinak
// (amber vs warning, rose vs danger/red, emerald vs success/green,
// sky vs blue, neutral vs slate/gray, violet vs purple). Stejný stav proto
// svítil na různých obrazovkách jinou barvou — a tmavý režim tu druhou sadu
// vůbec neznal, takže ji nepřebarvoval.
//
// Sjednoceno bylo 466 tříd naráz. Bez téhle pojistky by se rozdíl vrátil
// první nově napsanou obrazovkou, protože Tailwind zná `bg-green-500`
// i bez toho, aby byla v nastavení.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Barvy, které aplikace nepoužívá — pro každou je náhrada se stejným významem. */
const ZAKAZANE_BARVY: Record<string, string> = {
  success: 'emerald', green: 'emerald',
  danger: 'rose', red: 'rose',
  warning: 'amber',
  accent: 'primary',
  blue: 'sky',
  purple: 'violet',
  slate: 'neutral', gray: 'neutral',
  zinc: 'neutral', stone: 'neutral',
  amberBeer: 'amber', teal: 'emerald',
  lime: 'emerald', cyan: 'sky', yellow: 'amber', orange: 'primary',
};

const PREDPONY = ['bg', 'text', 'border', 'from', 'to', 'via', 'ring', 'divide', 'placeholder', 'decoration', 'outline', 'caret', 'fill', 'stroke'];

function zdrojoveSoubory(dir: string): string[] {
  const out: string[] = [];
  for (const j of readdirSync(dir)) {
    const c = join(dir, j);
    if (statSync(c).isDirectory()) { out.push(...zdrojoveSoubory(c)); continue; }
    if (/\.tsx?$/.test(j) && !/\.test\./.test(j)) out.push(c);
  }
  return out;
}

describe('barvy', () => {
  it('používá se jen jedna sada — žádná druhá pro tentýž význam', () => {
    const re = new RegExp(`\\b(${PREDPONY.join('|')})-(${Object.keys(ZAKAZANE_BARVY).join('|')})-(\\d{2,3})\\b`, 'g');
    const nalezy: string[] = [];

    for (const soubor of zdrojoveSoubory('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      for (const m of zdroj.matchAll(re)) {
        const radek = zdroj.slice(0, m.index).split('\n').length;
        nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → ${m[0]} (použij ${m[1]}-${ZAKAZANE_BARVY[m[2]]}-${m[3]})`);
      }
    }

    expect(nalezy).toEqual([]);
  }, 20000);
});

describe('velikost písma', () => {
  it('nic není menší než 11 px', () => {
    // Menší se v pivovaru na telefonu nepřečte — ve vlhku, přes brýle,
    // s odleskem. Nejvíc drobného písma bylo zrovna v Historii, Inventuře
    // a Skladu, tedy tam, kde se čtou čísla.
    const nalezy: string[] = [];

    for (const soubor of zdrojoveSoubory('src')) {
      const zdroj = readFileSync(soubor, 'utf8');
      for (const m of zdroj.matchAll(/text-\[(\d+)px\]/g)) {
        if (Number(m[1]) >= 11) continue;
        const radek = zdroj.slice(0, m.index).split('\n').length;
        nalezy.push(`${soubor.replace(/\\/g, '/')}:${radek} → ${m[0]}`);
      }
    }

    expect(nalezy).toEqual([]);
  });
});

// 👆 Nejmenší cíl pro prst.
//
// Ve sklepě se aplikace ovládá palcem, často v rukavici. Pravidlo appky je
// 44 px — jenže dvacet jedna tlačítek si velikost zadávalo samo přes
// `min-h-[36px]` / `min-h-[40px]` a pravidlo je minulo (nejvíc v Kalendáři
// a v Objednávkách). Test hlídá, že se menší číslo nevrátí.
describe('cíle pro prst', () => {
  it('žádné tlačítko si nezadává výšku ani šířku pod 44 px', () => {
    const re = /min-[hw]-\[(\d+)px\]/g;
    const nalezy: string[] = [];
    for (const p of zdrojoveSoubory('src')) {
      const s = readFileSync(p, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        if (Number(m[1]) >= 44) continue;
        // Pravidlo platí pro to, na co se klepe. Odznáček s počtem zpráv
        // ani řádek s trendem prstem nikdo netrefuje.
        const okoli = s.slice(Math.max(0, m.index - 400), m.index);
        const zacatek = Math.max(okoli.lastIndexOf(String.fromCharCode(60)), 0);
        const znacka = okoli.slice(zacatek);
        if (!/^<button|onClick=/.test(znacka) && !/<button[^>]*$/.test(okoli)) continue;
        const radek = s.slice(0, m.index).split('\n').length;
        nalezy.push(`${p.split(/[\/]/).join('/').replace(/.*\/src\//, 'src/')}:${radek} — ${m[0]}`);
      }
    }
    expect(nalezy, `Cíle menší než 44 px:\n${nalezy.join('\n')}`).toEqual([]);
  });
});
