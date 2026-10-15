// 🚧 Pojistka: žádná cesta, kudy se zakládá objednávka nebo řádek, nesmí
// zdvojení přehlédnout.
//
// 15. 10. 2026: „duplicitní objednávka nebo odečtení se nesmí opakovat."
// Sklad se odečítá po položkách objednávky, takže druhá objednávka se stejnými
// položkami odečte totéž podruhé. Hlídání proti zdvojení ale existovalo jen
// u jedné z pěti cest (WhatsApp) — ruční zadání, fotka i přidání řádku do
// uložené objednávky se nekontrolovaly vůbec. Aby se to nevrátilo ve chvíli,
// kdy někdo přidá šestou cestu (třeba import z Excelu), projde tenhle test
// zdrojáky a spočítá, kolik míst zakládá objednávku a kolik z nich se zeptá
// (lib/orderDuplicates.ts → najdiDuplicitniObjednavky).
//
// Když test spadne u nové cesty, jsou dvě správné reakce:
//   • před zápisem zavolat najdiDuplicitniObjednavky(...) a zeptat se přes
//     zeptejSeNaDuplicitu(...) (lib/duplicityDialog.ts) — skoro vždycky tahle,
//   • nebo cestu zapsat do VYJIMKY i s důvodem, proč zdvojení nehrozí
//     (třeba protože jen přesouvá už existující řádky).
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

/** Zápis do tabulky: `supabase.from('tabulka').insert(` i přes zalomení řádku. */
const zapisDoTabulky = (tabulka: string) => new RegExp(`from\\(\\s*'${tabulka}'\\s*\\)\\s*\\.\\s*insert\\(`, 'g');
const pocet = (zdroj: string, re: RegExp) => (zdroj.match(re) ?? []).length;

type Vyjimka = { soubor: string; kolik: number; duvod: string };

/** Zápisy nové objednávky, které zdvojení nehlídají, a proč to nevadí. */
const VYJIMKY_OBJEDNAVKY: Vyjimka[] = [
  {
    soubor: 'src/components/SplitOrderModal.tsx',
    kolik: 1,
    duvod: 'Rozdělení objednávky na dva odběratele jen PŘESUNE existující položky do nové objednávky (update order_id) — nic nepřibývá.',
  },
];

/** Zápisy řádků do už uložené objednávky, které zdvojení nehlídají, a proč to nevadí. */
const VYJIMKY_RADKY: Vyjimka[] = [
  {
    soubor: 'src/screens/BottlingScreen.tsx',
    kolik: 1,
    duvod: 'Přesun části řádku na jiný den: založí řádek na přesouvaných ks a o stejný počet zmenší původní — součet objednávky se nemění.',
  },
  {
    soubor: 'src/screens/Kegging.tsx',
    kolik: 1,
    duvod: 'Totéž pro sudy: přesun části řádku na jiný den, součet objednávky se nemění.',
  },
];

const vyjimka = (seznam: Vyjimka[], soubor: string) => seznam.find((v) => v.soubor === soubor)?.kolik ?? 0;

describe('zakládání objednávek je hlídané proti zdvojení', () => {
  const zdroje = souboryVeZdroji('src').map((soubor) => ({
    soubor: soubor.replace(/\\/g, '/'),
    zdroj: readFileSync(soubor, 'utf8'),
  }));

  it('každé místo, které zakládá novou objednávku, se před zápisem zeptá', () => {
    const nalezy: string[] = [];
    for (const { soubor, zdroj } of zdroje) {
      const zapisu = pocet(zdroj, zapisDoTabulky('orders'));
      if (zapisu === 0) continue;
      const hlidani = pocet(zdroj, /najdiDuplicitniObjednavky\(/g);
      const bezHlidani = zapisu - vyjimka(VYJIMKY_OBJEDNAVKY, soubor);
      if (hlidani < bezHlidani) {
        nalezy.push(`${soubor}: ${zapisu} zápisů do orders, z toho ${vyjimka(VYJIMKY_OBJEDNAVKY, soubor)} výjimek, ale jen ${hlidani}× najdiDuplicitniObjednavky(`);
      }
    }
    expect(nalezy).toEqual([]);
  });

  it('každé místo, které přidává řádky do uložené objednávky, se zeptá na řádek, který tam už je', () => {
    // Ke každé nové objednávce patří jeden zápis jejích řádků (kryje ho kontrola
    // celé objednávky výš). Co přebývá, jde do objednávky, která už existuje
    // (fotka, „Přidat položku") — a tam se hlídá jednotlivý řádek.
    const nalezy: string[] = [];
    for (const { soubor, zdroj } of zdroje) {
      const zapisuRadku = pocet(zdroj, zapisDoTabulky('order_items'));
      if (zapisuRadku === 0) continue;
      const zapisuObjednavek = pocet(zdroj, zapisDoTabulky('orders'));
      const doUlozene = Math.max(0, zapisuRadku - zapisuObjednavek) - vyjimka(VYJIMKY_RADKY, soubor);
      const hlidani = pocet(zdroj, /najdiZdvojeneRadky\(/g);
      if (hlidani < doUlozene) {
        nalezy.push(`${soubor}: ${doUlozene} zápisů řádků do uložené objednávky, ale jen ${hlidani}× najdiZdvojeneRadky(`);
      }
    }
    expect(nalezy).toEqual([]);
  });

  it('výjimky platí pro soubory, které existují a zápis tam opravdu je (seznam se nezanáší)', () => {
    for (const v of [...VYJIMKY_OBJEDNAVKY, ...VYJIMKY_RADKY]) {
      const nalez = zdroje.find((z) => z.soubor === v.soubor);
      expect(nalez, `${v.soubor} neexistuje`).toBeTruthy();
      const tabulka = VYJIMKY_OBJEDNAVKY.includes(v) ? 'orders' : 'order_items';
      expect(pocet(nalez!.zdroj, zapisDoTabulky(tabulka)), `${v.soubor}: výjimka pro ${tabulka} je větší než počet zápisů`).toBeGreaterThanOrEqual(v.kolik);
      expect(v.duvod.length).toBeGreaterThan(20);
    }
  });

  it('hlídání opravdu existuje tam, kde se čeká (kontrola, že regulární výrazy něco najdou)', () => {
    const orders = zdroje.find((z) => z.soubor === 'src/screens/Orders.tsx')!.zdroj;
    // pět cest: hromadný WhatsApp, schválení zprávy, ruční zadání, kopie objednávky, fotka
    expect(pocet(orders, zapisDoTabulky('orders'))).toBe(5);
    expect(pocet(orders, /najdiDuplicitniObjednavky\(/g)).toBe(5);
    expect(pocet(orders, /najdiZdvojeneRadky\(/g)).toBe(1);
    const detail = zdroje.find((z) => z.soubor === 'src/components/objednavky/OrderDetail.tsx')!.zdroj;
    expect(pocet(detail, zapisDoTabulky('order_items'))).toBe(1);
    expect(pocet(detail, /najdiZdvojeneRadky\(/g)).toBe(1);
  });
});
