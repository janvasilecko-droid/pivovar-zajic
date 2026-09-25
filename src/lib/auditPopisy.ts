// 🔎 Co která kontrola auditu objednávek hledá — lidsky.
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: „nechápu logiku auditu objednávek." Audit dělá šest
// různých kontrol, ale v okně z nich byly jen zkratky a čísla — „Neshody s WA:
// 3", „rozjetých odpočtů: 1". Kdo tu appku nepsal, z toho nepozná, co se
// kontrolovalo, proč na tom záleží ani co má dělat.
//
// Popisy jsou schválně TADY, ne rozeseté v JSX: používá je okno auditu
// i návod k použití, a je na jednom místě vidět, že audit je šest kontrol —
// ne jeden nesrozumitelný součet.
//
// Pravidlo pro texty: `co` je název, kterému rozumí stáčeč, `znamena` říká,
// co nález znamená v provozu, `coSTim` říká, co se s tím dělá. Žádné
// „nesrovnalost v evidenci" — konkrétní věta, ne úřední šiml.

export type KlicKontroly =
  | 'items_dup' | 'wa_mismatch' | 'order_dup' | 'unprocessed' | 'odpocty' | 'prislo';

export type PopisKontroly = {
  klic: KlicKontroly;
  /** Název na dlaždici. */
  co: string;
  /** Co se počítá — doplní se za číslo („3 objednávky"). */
  jednotka: string;
  /** Co nález znamená. */
  znamena: string;
  /** Co s tím má člověk udělat. */
  coSTim: string;
};

/**
 * Pořadí je podle NALÉHAVOSTI, ne podle toho, jak se to programovalo:
 * nahoře je to, co rovnou křiví čísla ve skladu a v objednávkách, dole to,
 * co je spíš podnět ke kontrole.
 */
export const KONTROLY_AUDITU: PopisKontroly[] = [
  {
    klic: 'items_dup',
    co: 'Totéž pivo dvakrát v jedné objednávce',
    jednotka: 'objednávek',
    znamena: 'V jedné objednávce je stejné pivo a obal na dvou řádcích — třeba 2× „12° Světlá 50l". Objednávka pak říká víc kusů, než odběratel chtěl, a stáčí se zbytečně.',
    coSTim: 'Otevři objednávku a řádky sluč do jednoho, nebo ten navíc smaž.',
  },
  {
    klic: 'odpocty',
    co: 'Sklad nesedí se zavezenou objednávkou',
    jednotka: 'objednávek',
    znamena: 'Objednávka se po závozu upravila, ale ze skladu se odepsalo původní množství. Sklad tím ukazuje jiné číslo, než co doopravdy odjelo.',
    coSTim: 'Klepni na „Srovnat odpočet" — appka odpočet dorovná na to, co je teď v objednávce.',
  },
  {
    klic: 'wa_mismatch',
    co: 'Objednávka nesedí s WhatsApp zprávou',
    jednotka: 'objednávek',
    znamena: 'Objednávka vznikla z WhatsApp zprávy, ale nesouhlasí s jejím textem. Zpráva mohla být přečtená špatně.',
    coSTim: 'Porovnej s původní zprávou vedle a objednávku oprav. Když je správně objednávka (zákazník to pak upřesnil), nech ji být.',
  },
  {
    klic: 'unprocessed',
    co: 'Zpráva s pivem, ze které není objednávka',
    jednotka: 'zpráv',
    znamena: 'Ve WhatsApp zprávě je pivo, ale žádná objednávka z ní nevznikla. Buď propadla, nebo ji nikdo nepotvrdil.',
    coSTim: 'Otevři zprávu a objednávku založ — nebo zprávu ignoruj, když objednávka není.',
  },
  {
    klic: 'order_dup',
    co: 'Jeden odběratel, dvě objednávky v týdnu',
    jednotka: 'odběratelů',
    znamena: 'Stejný odběratel má v jednom týdnu víc objednávek s podobnými položkami. Často je to omyl — jedna se zadala dvakrát.',
    coSTim: 'Projdi obě. Když se opravdu veze dvakrát týdně, je to v pořádku a nech je; jinak jednu zruš.',
  },
  {
    klic: 'prislo',
    co: 'Nepřišlo něco, o čem nevíme?',
    jednotka: 'podezření',
    znamena: 'Jediná kontrola, která hledá to, co v aplikaci NENÍ: zprávy odmítnuté při příjmu, výpadky spojení s WhatsAppem a odběratele, kteří pravidelně píšou a teď mlčí.',
    coSTim: 'Podívej se na WhatsApp, jestli tam zpráva doopravdy je. Když ano, zadej objednávku ručně.',
  },
];

export const popisKontroly = (klic: KlicKontroly): PopisKontroly =>
  KONTROLY_AUDITU.find((k) => k.klic === klic)!;

/** Věta nahoře v okně — k čemu audit vůbec je. */
export const K_CEMU_AUDIT =
  'Audit projde objednávky a WhatsApp zprávy a hledá šest druhů nesrovnalostí, '
  + 'které se samy neopraví. Nic nemění — jen ukáže, co je potřeba projít.';

/** Závěr nahoře: buď je čisto, nebo kolik věcí čeká. */
export function zaverAuditu(pocetNalezu: number, pocetObjednavek: number): string {
  if (pocetNalezu === 0) {
    return `Všechno sedí — ${pocetObjednavek} objednávek prošlo bez nálezu.`;
  }
  const veci = pocetNalezu === 1 ? 'věc' : pocetNalezu <= 4 ? 'věci' : 'věcí';
  return `${pocetNalezu} ${veci} k projití. Projdi je odshora — nahoře je to, co křiví čísla.`;
}
