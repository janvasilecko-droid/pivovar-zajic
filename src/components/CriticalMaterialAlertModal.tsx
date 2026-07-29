import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

type LowItem = {
  name: string;
  type: 'etiketa' | 'lahev';
  balance: number;
};

export function CriticalMaterialAlertModal() {
  const { profile } = useAuth();
  const [criticalItems, setCriticalItems] = useState<LowItem[]>([]);
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
      supabase.from('beers').select('name'),
      supabase.from('packages').select('label,kind'),
      supabase.from('bottling').select('beer_name,package_label,quantity'),
    ]).then(([bRes, pRes, botRes]) => {
      const beers = (bRes.data as any[]) ?? [];
      const pkgs = (pRes.data as any[]) ?? [];
      const bot = (botRes.data as any[]) ?? [];

      let labelPurchases: any[] = [];
      let bottlePurchases: any[] = [];
      try {
        labelPurchases = JSON.parse(localStorage.getItem('labels_purchases') || '[]');
        bottlePurchases = JSON.parse(localStorage.getItem('bottles_purchases') || '[]');
      } catch {}

      const items: LowItem[] = [];

      beers.forEach((b) => {
        const inL = labelPurchases.filter((lp) => lp.beer_name?.toLowerCase().trim() === b.name?.toLowerCase().trim()).reduce((s, lp) => s + Number(lp.quantity || 0), 0);
        if (inL > 0) {
          const usedL = bot.filter((bd) => bd.beer_name?.toLowerCase().trim() === b.name?.toLowerCase().trim()).reduce((s, bd) => s + Number(bd.quantity || 0), 0);
          const bal = inL - usedL;
          if (bal < 100) {
            items.push({ name: `Etikety "${b.name}"`, type: 'etiketa', balance: bal });
          }
        }
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
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-rose-600 relative overflow-hidden">
        <div className="h-3 w-full bg-rose-600 absolute top-0 left-0 right-0" />

        <div className="flex items-start gap-4 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-lg animate-pulse">
            <ShieldAlert size={34} />
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-700">
              <span>POVINNÉ UPOZORNĚNÍ PRO ADMINA, ŠÉFA A SLÁDKA</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              🚨 KRITICKÝ STAV MATERIÁLU (&lt; 100 ks)!
            </h2>
            <p className="text-xs font-bold text-neutral-500 mt-0.5">
              Role: <strong className="text-neutral-800 uppercase">{profile?.role || 'Sládek / Admin'}</strong>
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3">
          <div className="font-black text-xs uppercase text-rose-900 flex items-center gap-1.5 border-b border-rose-200 pb-2">
            <span>U následujících položek zbývá méně než 100 ks:</span>
          </div>
          <div className="space-y-2">
            {criticalItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white border border-rose-200 shadow-2xs font-mono">
                <span className="font-black text-xs text-neutral-900">{item.name}</span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-xs">
                  Zbývá JEN {item.balance} ks!
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-base transition shadow-xl hover:shadow-rose-600/30 active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-rose-300"
          >
            <CheckCircle2 size={24} />
            <span>✓ Potvrzuji, že beru na vědomí kritický stav (&lt; 100 ks)</span>
          </button>
          <p className="text-center text-[11px] font-bold text-neutral-400">
            Před pokračováním do aplikace musíte výslovně potvrdit přečtení této výstrahy.
          </p>
        </div>
      </div>
    </div>
  );
}
