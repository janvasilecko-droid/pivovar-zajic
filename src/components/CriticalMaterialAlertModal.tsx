import { useState, useEffect } from 'react';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fetchLabelBalances, LabelBalance } from '../lib/labelStock';
import { Check, CheckCircle2, ShieldAlert, Siren } from 'lucide-react';

type LowItem = {
  name: string;
  type: 'etiketa' | 'lahev';
  balance: number;
};

export function CriticalMaterialAlertModal() {
  const { profile } = useAuth();
  const [criticalItems, setCriticalItems] = useState<LowItem[]>([]);
  const [allLabelBalances, setAllLabelBalances] = useState<LabelBalance[]>([]);
  const [acknowledged, setAcknowledged] = useState<boolean>(true);

  useEffect(() => {
    const role = (profile?.role || '').toLowerCase().trim();
    const name = (profile?.display_name || '').toLowerCase().trim();
    const email = (profile?.id || '').toLowerCase();
    const isEligible = !profile || role === 'admin' || role === 'sef' || role === 'sladek' || role === 'boss' || role === 'manager' || name.includes('sladek') || name.includes('sef') || name.includes('admin') || email.includes('vasilecko');

    if (!isEligible) {
      setAcknowledged(true);
      return;
    }

    Promise.all([
      fetchLabelBalances(),
      supabase.from('packages').select('label,kind'),
      fetchAllRows('bottling', 'beer_name,package_label,quantity'),
    ]).then(([labelBalances, pRes, botRes]) => {
      const pkgs = (pRes.data as any[]) ?? [];
      const bot = (botRes.data as any[]) ?? [];

      let bottlePurchases: any[] = [];
      try {
        bottlePurchases = JSON.parse(localStorage.getItem('bottles_purchases') || '[]');
      } catch {}

      setAllLabelBalances(labelBalances.filter((l) => l.purchased > 0));

      const items: LowItem[] = [];

      labelBalances.filter((l) => l.isLow).forEach((l) => {
        items.push({ name: `Etikety "${l.beer_name}"`, type: 'etiketa', balance: l.balance });
      });

      pkgs.filter((p) => p.kind !== 'keg').forEach((p) => {
        const inB = bottlePurchases.filter((bp) => bp.package_label?.toLowerCase().trim() === p.label?.toLowerCase().trim()).reduce((s, bp) => s + Number(bp.quantity || 0), 0);
        if (inB > 0) {
          const usedB = bot.filter((bd) => bd.package_label?.toLowerCase().trim() === p.label?.toLowerCase().trim()).reduce((s, bd) => s + Number(bd.quantity || 0), 0);
          const bal = inB - usedB;
          if (bal < 100) {
            items.push({ name: `Prázdné lahve "${p.label}"`, type: 'lahev', balance: bal });
          }
        }
      });

      setCriticalItems(items);

      if (items.length > 0) {
        const ackKey = `ack_critical_material_${items.map((i) => `${i.name}_${i.balance}`).join('_')}`;
        const hasAck = sessionStorage.getItem(ackKey) === 'true';
        setAcknowledged(hasAck);
      } else {
        setAcknowledged(true);
      }
    });
  }, [profile]);

  function handleConfirm() {
    const ackKey = `ack_critical_material_${criticalItems.map((i) => `${i.name}_${i.balance}`).join('_')}`;
    sessionStorage.setItem(ackKey, 'true');
    setAcknowledged(true);
  }

  if (acknowledged || criticalItems.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
      <div className="bg-white rounded max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-rose-600 relative overflow-hidden">
        <div className="h-3 w-full bg-rose-600 absolute top-0 left-0 right-0" />

        <div className="flex items-start gap-4 pt-2">
          <div className="w-14 h-14 rounded bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg animate-pulse">
            <ShieldAlert size={34} />
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-700">
              <span>POVINNÉ UPOZORNĚNÍ PRO ADMINA, ŠÉFA A SLÁDKA</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              <Siren className="ikona-text" /> KRITICKÝ STAV MATERIÁLU (&lt; 100 ks)!
            </h2>
            <p className="text-xs font-bold text-neutral-500 mt-0.5">
              Role: <strong className="text-neutral-800 uppercase">{profile?.role || 'Sládek / Admin'}</strong>
            </p>
          </div>
        </div>

        <div className="p-5 rounded bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3">
          <div className="font-black text-xs uppercase text-rose-900 flex items-center gap-1.5 border-b border-rose-200 pb-2">
            <span>U následujících položek zbývá méně než 100 ks:</span>
          </div>
          <div className="space-y-2">
            {criticalItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded bg-white border border-rose-200 shadow-2xs font-mono">
                <span className="font-black text-xs text-neutral-900">{item.name}</span>
                <span className="px-2.5 py-1 rounded bg-rose-600 text-white font-black text-xs">
                  Zbývá JEN {item.balance} ks!
                </span>
              </div>
            ))}
          </div>
        </div>

        {allLabelBalances.length > 0 && (
          <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-2 max-h-56 overflow-y-auto">
            <div className="font-black text-[11px] uppercase text-neutral-600 flex items-center gap-1.5 border-b border-neutral-200 pb-1.5">
              <span>Přehled etiket u ostatních druhů piva:</span>
            </div>
            <div className="space-y-1.5">
              {allLabelBalances.map((l) => (
                <div key={l.beer_name} className="flex items-center justify-between px-1 font-mono text-[11px]">
                  <span className="font-bold text-neutral-800">{l.beer_name}</span>
                  <span className={`font-black ${l.isLow ? 'text-rose-600' : 'text-emerald-700'}`}>{l.balance} ks</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-4 px-6 rounded bg-rose-600 hover:bg-rose-500 text-white font-black text-base transition shadow-xl hover:shadow-rose-600/30 active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-rose-300"
          >
            <CheckCircle2 size={24} />
            <span><Check className="ikona-text" /> Potvrzuji, že beru na vědomí kritický stav (&lt; 100 ks)</span>
          </button>
          <p className="text-center text-[11px] font-bold text-neutral-400">
            Před pokračováním do aplikace musíte výslovně potvrdit přečtení této výstrahy.
          </p>
        </div>
      </div>
    </div>
  );
}
