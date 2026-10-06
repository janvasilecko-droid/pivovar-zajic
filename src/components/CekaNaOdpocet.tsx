// ⏳ Upozornění: objednávky se závozem do dneška, které ještě nejsou odečtené.
// ---------------------------------------------------------------------------
// Z provozu 5. 10. 2026: „odpočet musí být co nejdřív, nebo tam musí být
// nějaké upozornění, že proběhne — já teď počítám inventuru a logicky mi to
// nesedí, když se neodečetly objednávky z víkendu." Objednávky zapsané
// v pondělí se závozem v sobotu čekaly na hodinový odpočet (v :05).
//
// Databáze je od migrace 20261231250000_odpocet_hned_pri_zapisu odečítá hned
// při zápisu, takže tahle
// karta má být skoro pořád schovaná. Je tu pro chvíli, než se migrace pustí,
// a pro případ, že by okamžitý odpočet selhal — a tlačítkem jde odpočet
// dohnat hned (stejná funkce, kterou volá hodinový běh).
import { useCallback, useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { supabase, useRealtime } from '../lib/supabase';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';
import { businessDateISO } from '../lib/businessDate';
import { polozkyBezOdpoctu, type PolozkaBezOdpoctu } from '../lib/zavozSync';
import { chyba, uspech, varovani } from '../lib/toast';
import { zalogujANahlas } from '../lib/chybyHlaseni';

const den = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${m}.`; };

export default function CekaNaOdpocet({ jmenoPiva, jmenoObalu, className = '' }: {
  jmenoPiva: (id: string) => string;
  jmenoObalu: (id: string) => string;
  /** Odsazení od okolí — každá obrazovka má jiné rozestupy. */
  className?: string;
}) {
  const [cekaji, setCekaji] = useState<PolozkaBezOdpoctu[]>([]);
  const [bezi, setBezi] = useState(false);

  const nacti = useCallback(async () => {
    try {
      const [{ data: ord }, { data: oi }, { data: zd }] = await Promise.all([
        nactiSdilenouTabulku('orders'),
        nactiSdilenouTabulku('order_items'),
        nactiSdilenouTabulku('zavoz_deductions'),
      ]);
      setCekaji(polozkyBezOdpoctu((ord as any[]) ?? [], (oi as any[]) ?? [], (zd as any[]) ?? [], businessDateISO()));
    } catch (e) {
      // Jen upozornění — když se nenačte, obrazovka pod ním funguje dál.
      zalogujANahlas('[CekaNaOdpocet] načtení selhalo', e);
    }
  }, []);

  useEffect(() => { void nacti(); }, [nacti]);
  useRealtime(['orders', 'order_items', 'zavoz_deductions'], () => { void nacti(); });

  async function odecistTed() {
    setBezi(true);
    try {
      const { data, error } = await supabase.rpc('run_today_zavoz_deductions');
      if (error) throw error;
      const pocet = Number(data ?? 0);
      // Před 1:00 v noci databáze neodečítá (hodinový běh čeká na nový den).
      if (pocet > 0) uspech(`Odečteno ze skladu: ${pocet} ${pocet === 1 ? 'položka' : pocet < 5 ? 'položky' : 'položek'}.`);
      else varovani('Nic se neodečetlo — zkus to znovu za chvíli (v noci do 1:00 odpočet neběží).');
      await nacti();
    } catch (e) {
      chyba(e);
    } finally {
      setBezi(false);
    }
  }

  if (cekaji.length === 0) return null;
  const ks = cekaji.reduce((a, p) => a + p.quantity, 0);
  return (
    <div role="status" className={`rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2 ${className}`}>
      <div className="flex items-start gap-2 text-amber-950">
        <Hourglass className="ikona-text shrink-0 mt-0.5" />
        <div className="text-sm font-bold">
          Čeká na odpočet ze skladu: {cekaji.length} {cekaji.length === 1 ? 'položka' : cekaji.length < 5 ? 'položky' : 'položek'} ({ks} ks)
          se závozem do dneška. Sklad i inventura je zatím počítají jako skladem.
        </div>
      </div>
      <ul className="text-xs font-semibold text-amber-950 space-y-0.5 pl-6 list-disc">
        {cekaji.slice(0, 8).map((p) => (
          <li key={p.order_item_id}>
            {den(p.denZavozu)} · {p.place_name} · {p.quantity}× {jmenoObalu(p.package_id)} {jmenoPiva(p.beer_id)}
          </li>
        ))}
        {cekaji.length > 8 && <li>… a {cekaji.length - 8} dalších</li>}
      </ul>
      <button type="button" className="btn-primary w-full min-h-[48px]" onClick={odecistTed} disabled={bezi}>
        {bezi ? 'Odečítám…' : 'Odečíst teď'}
      </button>
    </div>
  );
}
