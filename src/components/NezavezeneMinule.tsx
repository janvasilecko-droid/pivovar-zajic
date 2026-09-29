// 🧹 Nezavezené objednávky z minulých dnů — ranní úklid jedním klepnutím.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026 (návrh 4 po dni zadávání): staré objednávky, které
// nikdo neoznačil jako zavezené, visely v hlídání malých sudů („chybí přes
// 100 sudů") i v nakládce. Tady se ukážou objednávky se závozem za posledních
// 14 dní, které nejsou zavezené ani zrušené, a jde s nimi hned něco udělat:
//   • Zavezeno — opravdu odjela, jen se to neodškrtlo,
//   • Na dnes — pojede dnes,
//   • Zrušit — už nepojede; odepsané se ruší s vrácením na sklad dnešním
//     dnem (lib/zruseniObjednavky.ts), ať se nerozhodí uzavřený týden.
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { dayKeyFromISO } from '../lib/keggingPlan';
import { jeVyrizena } from '../lib/stavyObjednavek';
import { zrusOdepsaneSVracenim, type PolozkaProNazev } from '../lib/zruseniObjednavky';
import { chyba, oznam } from '../lib/toast';

type Obj = {
  id: string; place_name: string | null; delivery_date: string | null; order_date: string;
  status: string; is_delivered: boolean; note: string | null;
};

export function NezavezeneMinule({ onZmena, vychoziRozbaleno = false }: {
  /** Po změně (ať si obrazovka znovu načte objednávky). */
  onZmena?: () => void;
  vychoziRozbaleno?: boolean;
}) {
  const [objednavky, setObjednavky] = useState<Obj[]>([]);
  const [polozky, setPolozky] = useState<Record<string, (PolozkaProNazev & { quantity: number })[]>>({});
  const [rozbaleno, setRozbaleno] = useState(vychoziRozbaleno);
  const [pracuje, setPracuje] = useState<string | null>(null);

  async function nacti() {
    const dnes = businessDateISO();
    const od = new Date(dnes + 'T00:00:00Z');
    od.setUTCDate(od.getUTCDate() - 14);
    const { data } = await fetchAllRows<Obj>('orders', 'id,place_name,delivery_date,order_date,status,is_delivered,note')
      .eq('is_delivered', false)
      .neq('status', 'storno')
      .gte('delivery_date', od.toISOString().slice(0, 10))
      .lt('delivery_date', dnes);
    const o = ((data ?? []) as Obj[]).filter((x) => !jeVyrizena(x.status))
      .sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)));
    setObjednavky(o);
    if (o.length) {
      const { data: its } = await fetchAllRows<any>('order_items', 'order_id,beer_id,beer_name,package_id,package_label,quantity')
        .in('order_id', o.map((x) => x.id));
      const m: Record<string, any[]> = {};
      for (const i of (its ?? []) as any[]) (m[i.order_id] ??= []).push(i);
      setPolozky(m);
    }
  }
  useEffect(() => { nacti().catch(() => {}); }, []);
  useRealtime(['orders'], () => { nacti().catch(() => {}); });

  if (objednavky.length === 0) return null;

  async function proved(o: Obj, akce: 'zavezeno' | 'dnes' | 'zrusit') {
    setPracuje(o.id);
    try {
      if (akce === 'zavezeno') {
        const { error } = await supabase.from('orders').update({ is_delivered: true, delivered_at: new Date().toISOString() }).eq('id', o.id);
        if (error) throw new Error(error.message);
      } else if (akce === 'dnes') {
        const dnes = businessDateISO();
        const { error } = await supabase.from('orders').update({ delivery_day: dayKeyFromISO(dnes), delivery_date: dnes }).eq('id', o.id);
        if (error) throw new Error(error.message);
        oznam(`${o.place_name ?? 'Objednávka'} → dnes`);
      } else {
        const vysledek = await zrusOdepsaneSVracenim([o], polozky, true);
        if (vysledek === 0) return;
        if (vysledek === null) {
          const { error } = await supabase.rpc('set_order_status', { p_order_id: o.id, p_status: 'storno' });
          if (error) throw new Error(error.message);
        }
      }
      setObjednavky((arr) => arr.filter((x) => x.id !== o.id));
      onZmena?.();
    } catch (e: any) {
      chyba('Nepovedlo se: ' + (e?.message || e));
    } finally {
      setPracuje(null);
    }
  }

  const datum = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '?';

  return (
    <section className="rounded border-2 border-amber-400 bg-amber-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setRozbaleno((r) => !r)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={rozbaleno}
      >
        <span className="font-display font-black text-amber-950 flex items-center gap-2 min-w-0">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="truncate">Nezavezeno z minulých dnů</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums">{objednavky.length}</span>
          {rozbaleno ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {rozbaleno && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs font-bold text-amber-950">
            Tyhle objednávky měly jet a nejsou označené jako zavezené. Dokud tu visí, drží sudy i nakládku.
          </p>
          {objednavky.map((o) => {
            const its = polozky[o.id] ?? [];
            const kusu = its.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
            return (
              <div key={o.id} className="bg-white rounded border border-amber-300 p-2.5 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-black text-sm text-neutral-950 truncate">{o.place_name ?? 'Bez odběratele'}</span>
                  <span className="text-xs font-bold text-neutral-600 shrink-0">{datum(o.delivery_date)} · {kusu} ks</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button type="button" disabled={pracuje === o.id} onClick={() => proved(o, 'zavezeno')} className="btn-zalozka text-xs flex-1">
                    <Check size={14} /> Zavezeno
                  </button>
                  <button type="button" disabled={pracuje === o.id} onClick={() => proved(o, 'dnes')} className="btn-zalozka text-xs flex-1">
                    <CalendarDays size={14} /> Dnes
                  </button>
                  <button type="button" disabled={pracuje === o.id} onClick={() => proved(o, 'zrusit')} className="btn-zalozka text-xs flex-1">
                    <X size={14} /> Zrušit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
