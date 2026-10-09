// 🛢️ Stáčení lahví bez zdrojového sudu — upozornění v Pohybech s možností
// sud rovnou doplnit (9. 10. 2026: „nevidím tam 3× 50 ze stáčení lahví").
// Zapíše se do řádků TÉ dávky stáčení (stejné created_at) — skladová kniha
// pak sud odečte jako „Sud spotřebován na lahve", stejně jako při zápisu
// ve Stáčení lahví.
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { jeSud } from '../lib/inventoryFix';
import { chyba, uspech } from '../lib/toast';
import type { DavkaBezSudu } from '../lib/kontrolaPohybu';

type Obal = { id: string; label?: string | null; kind?: string | null; volume_l?: number | string | null };

export function DoplnitZdrojSudu({ davky, obaly, piva, vychoziObal, onUlozeno }: {
  davky: DavkaBezSudu[];
  obaly: Obal[];
  piva: { id: string; name: string }[];
  /** Vybraný obal ve filtru — když je to sud, předvyplní se. */
  vychoziObal?: string;
  onUlozeno: () => void;
}) {
  const sudy = obaly.filter((o) => jeSud(o.kind, o.label)).sort((a, b) => Number(b.volume_l) - Number(a.volume_l));
  const vychozi = sudy.find((o) => o.id === vychoziObal)?.id ?? sudy.find((o) => Number(o.volume_l) === 50)?.id ?? sudy[0]?.id ?? '';
  const [volby, setVolby] = useState<Record<string, { obal: string; pocet: string }>>({});
  const [uklada, setUklada] = useState<string | null>(null);
  if (davky.length === 0) return null;
  const jmenoPiva = new Map(piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((o) => [o.id, String(o.label ?? '')]));

  async function uloz(d: DavkaBezSudu) {
    const v = volby[d.klic] ?? { obal: vychozi, pocet: '' };
    const pocet = Math.round(Number(v.pocet));
    const obal = sudy.find((o) => o.id === v.obal);
    if (!obal || !(pocet > 0) || !d.created_at) { chyba('Vyber sud a zadej počet sudů.'); return; }
    setUklada(d.klic);
    try {
      const { error } = await supabase.from('bottling')
        .update({ kegs_used: pocet, kegs_used_package_id: obal.id, source_volume_l: pocet * Number(obal.volume_l) })
        .eq('entry_date', d.datum).eq('beer_id', d.beer_id).eq('created_at', d.created_at);
      if (error) throw error;
      uspech(`Doplněno: ${pocet}× ${obal.label} — sklad sudů je odečte.`);
      onUlozeno();
    } catch (e: any) {
      chyba('Sud se nepodařilo doplnit: ' + (e?.message || e));
    } finally {
      setUklada(null);
    }
  }

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-3 space-y-2">
      <p className="text-sm font-black text-rose-900">
        Stáčení lahví bez zdrojového sudu — sudy se ze skladu neodečetly ({davky.length})
      </p>
      {davky.map((d) => {
        const v = volby[d.klic] ?? { obal: vychozi, pocet: '' };
        const nastav = (zmena: Partial<{ obal: string; pocet: string }>) => setVolby((m) => ({ ...m, [d.klic]: { ...v, ...zmena } }));
        return (
          <div key={d.klic} className="rounded border border-rose-200 bg-white p-2 space-y-2">
            <p className="text-xs font-bold text-neutral-900">
              {d.datum.slice(8, 10)}. {d.datum.slice(5, 7)}. · {jmenoPiva.get(d.beer_id) ?? 'pivo'} · {d.lahve.map((l) => `${l.kusu}× ${jmenoObalu.get(l.package_id) ?? '?'}`).join(', ')}
            </p>
            {d.created_at ? (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Sud, ze kterého se stáčelo" className="input !w-auto min-h-[44px]" value={v.obal} onChange={(e) => nastav({ obal: e.target.value })}>
                  {sudy.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <input aria-label="Počet sudů" inputMode="numeric" className="input !w-20 text-center min-h-[44px]" placeholder="ks" value={v.pocet} onChange={(e) => nastav({ pocet: e.target.value.replace(/[^0-9]/g, '') })} />
                <button type="button" className="btn-primary min-h-[44px] !text-xs" disabled={uklada === d.klic} onClick={() => uloz(d)}>
                  {uklada === d.klic ? 'Ukládám…' : 'Odečíst sudy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-neutral-700">Starší zápis — sud doplň přes tužku u řádku ve Stáčení lahví.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
