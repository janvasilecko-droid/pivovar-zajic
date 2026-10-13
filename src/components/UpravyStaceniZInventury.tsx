// 🧾 Úpravy stáčení z inventury — odkud se odečetlo a kam se doplnilo.
// ---------------------------------------------------------------------------
// Z provozu 13. 10. 2026: manko se odečte rovnou ze stočených sudů a chybějící
// stočení se přičte k poslednímu dni měsíce, ale stopa se uloží bokem, ať se
// na ni dá později podívat. Je to jen deník — do výpočtu skladu ani do Excelu
// se nezapočítává.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';

type Uprava = {
  id: string; created_at: string; entry_date: string; beer_name: string | null; package_label: string | null;
  druh: 'odecteno' | 'doplneno'; kusu: number | string; zdroje: { entry_date: string; pred: number; po: number }[] | null;
};
const kratce = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export function UpravyStaceniZInventury({ mesic }: { mesic: string }) {
  const [radky, setRadky] = useState<Uprava[]>([]);
  const [otevreno, setOtevreno] = useState(false);

  useEffect(() => {
    let zruseno = false;
    void (async () => {
      try {
        const { data, error } = await fetchAllRows<Uprava>('stoceni_upravy', 'id,created_at,entry_date,beer_name,package_label,druh,kusu,zdroje').eq('mesic', mesic);
        if (!zruseno && !error) setRadky(((data ?? []) as Uprava[]).sort((a: Uprava, b: Uprava) => b.created_at.localeCompare(a.created_at)));
      } catch { /* tabulka ještě nemusí existovat (migrace) */ }
    })();
    return () => { zruseno = true; };
  }, [mesic]);

  if (radky.length === 0) return null;
  return (
    <section aria-label="Úpravy stáčení z inventury" className="rounded-xl bg-sky-100 p-3">
      <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setOtevreno((o) => !o)} aria-expanded={otevreno}>
        <History size={16} className="shrink-0 text-sky-900" />
        <span className="flex-1 text-sm font-black text-neutral-950">Úpravy z inventury ({radky.length})</span>
        {otevreno ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {otevreno && (
        <ul className="mt-2 space-y-2">
          {radky.map((u) => (
            <li key={u.id} className="rounded-lg bg-white/70 p-2 text-xs font-semibold text-neutral-900">
              <div className="flex justify-between gap-2 font-black">
                <span>{u.beer_name} {String(u.package_label ?? '').trim()}</span>
                <span className={u.druh === 'odecteno' ? 'text-rose-800' : 'text-emerald-800'}>{u.druh === 'odecteno' ? '−' : '+'}{Number(u.kusu)} ks</span>
              </div>
              <div className="text-neutral-700">
                {u.druh === 'odecteno'
                  ? `odečteno ze stočených sudů (${(u.zdroje ?? []).map((z) => `${kratce(z.entry_date)}: ${z.pred} → ${z.po}`).join(', ') || 'bez zdroje'})`
                  : `doplněno ke dni ${kratce(u.entry_date)}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
