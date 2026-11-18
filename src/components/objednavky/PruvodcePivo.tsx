// 🧭 Průvodce objednávkou — krok 2: které pivo.
// ---------------------------------------------------------------------------
// Dlaždice piv jako ve Fasování a Lahvích (BeerTileGrid): klepnutí na pivo
// otevře krokové zadávání obalu a počtu (KrokoveZadavani — velké pole, pět
// nejčastějších čísel). Rozepsané pivo se na dlaždici rozbalí do „2×50, 1×30".
// Poslední objednávku odběratele jde zopakovat jedním klepnutím (to uměl i starý
// formulář), ať se stálý odběratel nezadává pokaždé od nuly.
import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { BeerTileGrid } from '../BeerTileGrid';
import { serazPodleNaposled } from '../../lib/naposledyPouzite';
import { oznam } from '../../lib/toast';
import {
  datumKratce, pocetSlov, popisObalu, posledniObjednavka, stitekPiva, zopakujPolozky, type KonceptObjednavky,
} from '../../lib/objednavkaPruvodce';
import type { DataPruvodce, ZmenaKonceptu } from './pruvodceTypy';

export function PruvodcePivo({ data, koncept, zmen, naposledPiva, otevriPivo }: {
  data: DataPruvodce;
  koncept: KonceptObjednavky;
  zmen: ZmenaKonceptu;
  /** Naposledy použitá piva (nejnovější první) — jdou na začátek. */
  naposledPiva: string[];
  otevriPivo: (beerId: string) => void;
}) {
  const { beers, packages, orders, items } = data;
  const razena = useMemo(() => serazPodleNaposled(beers, (b) => b.id, naposledPiva), [beers, naposledPiva]);

  const posledni = useMemo(
    () => posledniObjednavka(orders, koncept.placeId, koncept.placeName),
    [orders, koncept.placeId, koncept.placeName],
  );
  const polozky = posledni ? (items[posledni.id] ?? []).filter((i) => i.quantity > 0) : [];

  function zopakuj() {
    const { radky, vynechano } = zopakujPolozky(polozky, beers, packages);
    zmen((k) => ({ ...k, radky }));
    if (vynechano > 0) {
      oznam(`${pocetSlov(vynechano, 'položka', 'položky', 'položek')} z poslední objednávky už v nabídce není — zkontroluj souhrn.`);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display font-black text-2xl text-neutral-900 dark:text-neutral-100">Které pivo?</h2>

      {koncept.radky.length === 0 && polozky.length > 0 && posledni && (
        <div className="rounded-2xl border border-neutral-200 bg-white dark:bg-neutral-800 dark:border-neutral-700 p-3 space-y-2">
          <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
            Poslední objednávka ({datumKratce(posledni.order_date)}):{' '}
            <span className="font-semibold text-neutral-600 dark:text-neutral-300">
              {polozky.map((i) => {
                const obal = packages.find((p) => p.id === i.package_id);
                return `${i.quantity}× ${i.beer_name ?? '?'} ${obal ? popisObalu(obal) : (i.package_label ?? '')}`.trim();
              }).join(', ')}
            </span>
          </p>
          <button type="button" onClick={zopakuj} className="btn-ghost w-full">
            <Zap size={16} aria-hidden="true" /> Zopakovat tyhle položky
          </button>
        </div>
      )}

      {razena.length === 0 ? (
        <p className="text-sm font-semibold text-neutral-600">V katalogu nejsou žádná aktivní piva.</p>
      ) : (
        <BeerTileGrid
          beers={razena}
          onSelect={(b) => otevriPivo(b.id)}
          summaryFor={(b) => {
            const label = stitekPiva(koncept.radky, b.id, packages, beers);
            return { filled: label !== '', label };
          }}
        />
      )}
    </div>
  );
}
