// 🧾 Zápisy do databáze posílají jen sloupce, které v ní opravdu jsou.
//
// Nalezeno 13. 9. 2026 porovnáním s vygenerovanými typy (database.types.ts):
// „Dorovnat" v týdenní inventuře posílalo do inventory_adjustments sloupec
// `note`, který tabulka nemá (má `reason`) — každé dorovnání by skončilo
// chybou. Stejný druh chyby jako Beer.short_name, které se roky neukládalo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zaznamDorovnani, zaznamKontroly, type TydenniRadek } from './tydenniInventura';

/** Sloupce z bloku Insert dané tabulky ve vygenerovaných typech. */
function sloupceInsert(tabulka: string): string[] {
  // Na Windows git soubor rozbalí s CRLF — bez sjednocení by se nenašlo nic.
  const typy = readFileSync('src/lib/database.types.ts', 'utf8').replace(/\r\n/g, '\n');
  const zacatek = typy.indexOf(`\n      ${tabulka}: {\n`);
  expect(zacatek, `tabulka ${tabulka} v database.types.ts`).toBeGreaterThan(-1);
  const insert = typy.indexOf('        Insert: {', zacatek);
  const konec = typy.indexOf('\n        }', insert);
  return [...typy.slice(insert, konec).matchAll(/^ {10}(\w+)\??:/gm)].map((m) => m[1]);
}

const radek: TydenniRadek = {
  klic: 'k', beer_id: 'b', beer_name: 'Ležák', package_id: 'p', package_label: 'KEG 50l',
  ocekavano: 10, napocitano: 8, rozdil: -2, pohybuVTydnu: 5, sud: true,
};
const obdobi = { od: '2026-09-07', do: '2026-09-13', doPocitani: '2026-09-13' } as Parameters<typeof zaznamDorovnani>[1];

describe('zápisy odpovídají schématu databáze', () => {
  it('dorovnání z týdenní inventury (inventory_adjustments)', () => {
    const sloupce = sloupceInsert('inventory_adjustments');
    expect(Object.keys(zaznamDorovnani(radek, obdobi)).filter((k) => !sloupce.includes(k))).toEqual([]);
    expect(zaznamDorovnani(radek, obdobi).reason).toMatch(/Dorovnání z inventury/);
  });

  it('záznam o týdenní kontrole (tydenni_inventura)', () => {
    const sloupce = sloupceInsert('tydenni_inventura');
    expect(Object.keys(zaznamKontroly(radek, obdobi, null)).filter((k) => !sloupce.includes(k))).toEqual([]);
  });
});
