// Typy sdílené okny průvodce zadáním objednávky (ObjednavkaPruvodce.tsx a jeho kroky).
import type { Beer, Package, Place } from '../../lib/supabase';
import type { KonceptObjednavky } from '../../lib/objednavkaPruvodce';
import type { Order, OrderItem } from './spolecne';

/** Výsledek uložení: obrazovka Objednávky ukládá stejnou cestou jako starý formulář. */
export type VysledekUlozeni = { stav: 'ulozeno' } | { stav: 'chyba'; text: string };

/** Co průvodce potřebuje znát o katalogu a o dosavadních objednávkách. */
export type DataPruvodce = {
  places: Place[];
  /** Jen aktivní piva v pořadí katalogu. */
  beers: Beer[];
  packages: Package[];
  orders: Order[];
  items: Record<string, OrderItem[]>;
  /** Dnešek v pražském čase (YYYY-MM-DD). */
  dnes: string;
};

/** Změna konceptu — kroky ji nikdy nepíšou přímo, vždy přes tuhle funkci. */
export type ZmenaKonceptu = (zmena: (k: KonceptObjednavky) => KonceptObjednavky) => void;

/** Rozdělení malých sudů po řádcích objednávky (lib/maleSudy.ts): kolik řádek pokryjí a kolik ne. */
export type PrideleniMalychSudu = Map<string, { kryto: number; chybi: number }>;
