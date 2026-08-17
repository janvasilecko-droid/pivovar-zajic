import { supabase } from './supabase';

// Sdílená hranice "kriticky málo etiket" — dřív byla natvrdo (a nekonzistentně)
// zapsaná zvlášť v SkloPromoScreen (200), Dashboard (200) a
// CriticalMaterialAlertModal (100). Jedno místo pravdy, ať se to nerozjede.
export const LABELS_LOW_STOCK_THRESHOLD = 100;

export type LabelBalance = {
  beer_name: string;
  purchased: number;
  used: number;
  balance: number;
  isLow: boolean;
};

// Zůstatek etiket = nakoupeno (label_purchases v Supabase) − stočeno (bottling).
// Počítá se jen pro piva, u kterých byl vůbec zadaný nákup etiket (purchased > 0),
// aby se needosazoval "kritický" stav pivům, která etikety nikdy nedostala.
export async function fetchLabelBalances(): Promise<LabelBalance[]> {
  const [beersRes, purchasesRes, bottlingRes] = await Promise.all([
    supabase.from('beers').select('name').eq('is_active', true),
    supabase.from('label_purchases').select('beer_name, quantity'),
    supabase.from('bottling').select('beer_name, quantity'),
  ]);

  const purchases = (purchasesRes.data as { beer_name: string; quantity: number }[]) ?? [];
  const bottling = (bottlingRes.data as { beer_name: string; quantity: number }[]) ?? [];

  const beerNames = new Set<string>(((beersRes.data as { name: string }[]) ?? []).map((b) => b.name));
  purchases.forEach((p) => { if (p.beer_name) beerNames.add(p.beer_name); });

  return [...beerNames]
    .map((name) => {
      const norm = name.toLowerCase().trim();
      const purchased = purchases
        .filter((p) => p.beer_name?.toLowerCase().trim() === norm)
        .reduce((s, p) => s + Number(p.quantity || 0), 0);
      const used = bottling
        .filter((b) => b.beer_name?.toLowerCase().trim() === norm)
        .reduce((s, b) => s + Number(b.quantity || 0), 0);
      const balance = purchased - used;
      return { beer_name: name, purchased, used, balance, isLow: purchased > 0 && balance < LABELS_LOW_STOCK_THRESHOLD };
    })
    .sort((a, b) => a.balance - b.balance);
}
