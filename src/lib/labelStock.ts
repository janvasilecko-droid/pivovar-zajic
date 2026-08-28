import { fetchAllRows, supabase } from './supabase';

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

// Stočení, které NEspotřebovává standardní etikety (jde do vlastních etiket
// odběratele, nebo se lepí jinak/vůbec) — pozná se podle poznámky u zápisu
// stočení, ať to jde zapsat rovnou při stáčení bez nové evidence navíc:
//   - "bez etiket" v poznámce → obecná výjimka, jakákoliv velikost/pivo.
//   - "bedny" nebo "sklo" v poznámce U OBALU 0,33l → láhve pro Lužec, ten má
//     vlastní etikety (viz zadání uživatele).
export function isExemptFromLabels(note: string | null | undefined, volumeL: number | null | undefined): boolean {
  const n = (note ?? '').toLowerCase();
  if (n.includes('bez etiket')) return true;
  if (volumeL === 0.33 && (n.includes('bedny') || n.includes('sklo'))) return true;
  return false;
}

// Zůstatek etiket = nakoupeno (label_purchases v Supabase) − stočeno (bottling),
// bez stočení vyňatého poznámkou (viz isExemptFromLabels výše).
// Počítá se jen pro piva, u kterých byl vůbec zadaný nákup etiket (purchased > 0),
// aby se needosazoval "kritický" stav pivům, která etikety nikdy nedostala.
export async function fetchLabelBalances(): Promise<LabelBalance[]> {
  const [beersRes, purchasesRes, bottlingRes, packagesRes] = await Promise.all([
    supabase.from('beers').select('name').eq('is_active', true),
    supabase.from('label_purchases').select('beer_name, quantity'),
    fetchAllRows('bottling', 'beer_name, quantity, note, package_id'),
    supabase.from('packages').select('id, volume_l'),
  ]);

  const purchases = (purchasesRes.data as { beer_name: string; quantity: number }[]) ?? [];
  const bottling = (bottlingRes.data as { beer_name: string; quantity: number; note: string | null; package_id: string | null }[]) ?? [];
  const packages = (packagesRes.data as { id: string; volume_l: number }[]) ?? [];
  const volumeByPackageId = new Map(packages.map((p) => [p.id, Number(p.volume_l)]));

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
        .filter((b) => !isExemptFromLabels(b.note, b.package_id ? volumeByPackageId.get(b.package_id) : null))
        .reduce((s, b) => s + Number(b.quantity || 0), 0);
      const balance = purchased - used;
      return { beer_name: name, purchased, used, balance, isLow: purchased > 0 && balance < LABELS_LOW_STOCK_THRESHOLD };
    })
    .sort((a, b) => a.balance - b.balance);
}
