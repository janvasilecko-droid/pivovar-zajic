// 🔌 Nástroj `vypocet` konektoru Claude — výpočty modulu jako text pro model.
// Zásada 2 architektury: čísla počítá výpočetní modul, ne model.
import { MimoRozsah, formatuj, spocitej, type Definice, type Vysledek } from './zaklad.ts';
import { VYPOCTY, najdiVypocet } from './katalog.ts';

/** Chyba vstupu, kterou má model vidět a opravit (konektor ji vrátí jako isError). */
export class ChybaVypoctu extends Error {}

const cislo = (n: number) => String(n).replace('.', ',');

function popisVstupu(d: Definice): string {
  const radky = d.vstupy.map((v) => `  - ${v.id}: ${v.nazev}${v.jednotka ? ` [${v.jednotka}]` : ''}, ${cislo(v.min)}–${cislo(v.max)}, výchozí ${cislo(v.vychozi)}`);
  if (d.seznam) {
    radky.push(`  - radky (${d.seznam.nazev}, ${d.seznam.minRadku}–${d.seznam.maxRadku} řádků), každý řádek: `
      + d.seznam.polozky.map((p) => `${p.id} (${p.nazev}${p.jednotka ? ` [${p.jednotka}]` : ''}, ${cislo(p.min)}–${cislo(p.max)})`).join(', '));
  }
  return radky.join('\n');
}

/** Seznam výpočtů (bez id) nebo výsledek výpočtu jako čitelný text. */
export function vypocetText(args: Record<string, unknown>): string {
  if (args.id === undefined || args.id === null || args.id === '') {
    return 'Dostupné výpočty (zavolej vypocet s id, vstupy {id_vstupu: číslo} a případně radky [...]):\n\n'
      + VYPOCTY.map((d) => `• ${d.id} — ${d.nazev}: ${d.popis}\n${popisVstupu(d)}`).join('\n\n');
  }
  const d = najdiVypocet(args.id);
  if (!d) throw new ChybaVypoctu(`Neznámý výpočet „${String(args.id)}". Seznam vrátí vypocet bez id.`);
  const vstupy = args.vstupy && typeof args.vstupy === 'object' ? args.vstupy as Record<string, unknown> : {};
  const radky = d.seznam ? { [d.seznam.id]: Array.isArray(args.radky) ? args.radky : [] } : {};
  let v: Vysledek;
  try {
    v = spocitej(d, vstupy, radky);
  } catch (e) {
    if (e instanceof MimoRozsah) throw new ChybaVypoctu(`${e.message}\nVstupy výpočtu ${d.id}:\n${popisVstupu(d)}`);
    throw e;
  }
  const radek = (x: { nazev: string; hodnota: number; jednotka: string; mist: number }) => `${x.nazev}: ${formatuj(x)}`;
  return [
    `# ${d.nazev}`,
    `Výsledek: ${v.vysledky.map(radek).join('; ')}`,
    `Vstupy: ${v.vstupy.map(radek).join('; ')}`,
    `Vzorec:\n${v.vzorec.map((r) => `  ${r}`).join('\n')}`,
    v.mezikroky.length ? `Mezikroky: ${v.mezikroky.map(radek).join('; ')}` : '',
    `Předpoklady: ${v.predpoklady.join(' ')}`,
    `Rozsah platnosti: ${v.rozsah}`,
    `Nejistota: ${v.nejistota}`,
    `Zdroj vzorce: ${v.zdroj}`,
    'Výsledek spočítal výpočetní modul Pivovarské bible — čísla opiš, nepřepočítávej. Kde je vzorec v knihách, najde hledej_v_knihach.',
  ].filter(Boolean).join('\n');
}
