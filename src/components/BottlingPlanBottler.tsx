import { AlertTriangle, Calendar, ClipboardList, MessageCircle, Plus } from 'lucide-react';
// 📋 Úkoly na stáčení — pohled pro stáčeče v zápisu stáčení (BottlingScreen).
// Zobrazuje úkoly (dnes + připravované + zpožděné), umožňuje je „naplnit"
// do formuláře zápisu (onFill) a přepnout na „hotovo".
import { useMemo } from 'react';
import { Beer, Package, beerBg } from '../lib/supabase';
import { BottlingPlan, planLines, setPlanStatus, maKegovouCast, maLahvovouCast } from '../lib/bottlingPlans';
import { IkonaSud } from '../components/ikony';
import { chyba } from '../lib/toast';
import { IkonaLahev } from '../components/ikony';

type Props = {
  plans: BottlingPlan[];
  /** Které úkoly ukázat — u sudů se lahvová část skryje a naopak. */
  druh?: 'lahve' | 'kegy';
  beers: Beer[];
  packages: Package[];
  isManager: boolean;
  onChanged: () => void;
  onFill: (plan: BottlingPlan) => void;
};

const STATUS_CHIP: Record<string, string> = {
  planned: 'bg-amber-100 text-amber-900 border-amber-300',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  cancelled: 'bg-neutral-100 text-neutral-500 border-neutral-300',
};

const STATUS_TEXT: Record<string, string> = {
  planned: '⏳ Naplánováno',
  done: '✓ Hotovo',
  cancelled: '✕ Zrušeno',
};

function PlanItem({
  plan,
  beers,
  packages,
  isManager,
  isToday,
  isLate,
  onFill,
  onChanged,
  druh,
}: {
  plan: BottlingPlan;
  druh: 'lahve' | 'kegy';
  beers: Beer[];
  packages: Package[];
  isManager: boolean;
  isToday: boolean;
  isLate: boolean;
  onFill: (plan: BottlingPlan) => void;
  onChanged: () => void;
}) {
  const beer = beers.find((b) => b.id === plan.beer_id);
  const lines = planLines(plan, packages, druh);

  async function handleDone() {
    const { error } = await setPlanStatus(plan.id, 'done');
    if (error) chyba(error.message);
    else onChanged();
  }

  return (
    <div
      className={`rounded border-2 p-3 shadow-2xs ${
        isLate ? 'border-rose-300 bg-rose-50/90' : isToday ? 'border-amber-300 bg-amber-50/90' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-6 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
          <div className="min-w-0">
            <span className="text-sm font-black text-neutral-950 truncate">{beer?.name || '—'}</span>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {lines.map((l, i) => (
                <span key={i} className="text-[11px] font-bold bg-white border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700 whitespace-nowrap">
                  {l.label} × {l.qty}
                </span>
              ))}
              {lines.length === 0 && <span className="text-[11px] text-neutral-400 italic">bez obalů</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {isToday && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950">DNES</span>}
          {isLate && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">POZDĚ</span>}
          {plan.planned_date && (
            <span className="text-[11px] font-bold text-neutral-500 bg-neutral-100 rounded px-2 py-1 whitespace-nowrap">
              <Calendar className="ikona-text" /> {plan.planned_date}
            </span>
          )}
        </div>
      </div>

      {plan.note && <p className="text-[11px] text-neutral-600 mt-1.5 leading-snug"><MessageCircle className="ikona-text" /> {plan.note}</p>}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        <span className={`text-[11px] font-black px-2 py-1 rounded border ${STATUS_CHIP[plan.status] || ''}`}>
          {STATUS_TEXT[plan.status] || plan.status}
        </span>
        <div className="flex-1" />
        {plan.status === 'planned' && (
          <>
            <button
              type="button"
              onClick={() => onFill(plan)}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition shadow-sm"
            >
              <Plus className="ikona-text" /> Naplnit do zápisu
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[11px] font-black transition shadow-sm"
            >
              ✓ Hotovo
            </button>
          </>
        )}
        {plan.status === 'done' && isManager && (
          <button
            type="button"
            onClick={() => setPlanStatus(plan.id, 'planned').then(({ error }) => { if (error) chyba(error.message); else onChanged(); })}
            className="px-3 py-1.5 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-[11px] font-black transition"
          >
            ↩️ Zpět
          </button>
        )}
      </div>
    </div>
  );
}


export function BottlingPlanBottler({ plans, beers, packages, isManager, onChanged, onFill, druh = 'lahve' }: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const groups = useMemo(() => {
    // Stáčeč sudů nemá koukat na úkoly, které jsou čistě lahvové, a naopak —
    // jinak by se v seznamu probíral cizí prací.
    const active = plans
      .filter((p) => p.status !== 'cancelled')
      .filter((p) => (druh === 'kegy' ? maKegovouCast(p) : maLahvovouCast(p)));
    return {
      late: active.filter((p) => p.status === 'planned' && p.planned_date < todayStr),
      today: active.filter((p) => p.planned_date === todayStr),
      upcoming: active.filter((p) => p.planned_date > todayStr),
    };
  }, [plans, todayStr, druh]);

  const total = groups.late.length + groups.today.length + groups.upcoming.length;

  return (
    <div className="card p-3 mb-5 border-2 border-amber-300/80 bg-white">
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <span className="font-display font-black text-amber-950 text-xs flex items-center gap-1.5">
          <ClipboardList className="ikona-text" /> {druh === 'kegy' ? 'Úkoly ke stočení sudů' : 'Úkoly ke stočení lahví'}
          {groups.today.length > 0 && (
            <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 animate-pulse">DNES: {groups.today.length}</span>
          )}
        </span>
        <span className="text-[11px] font-bold text-amber-900/60">
          {total === 0 ? 'nic k dispozici 🎉' : `${total} ${total === 1 ? 'úkol' : total < 5 ? 'úkoly' : 'úkolů'}`}
        </span>
      </div>

      {total === 0 && (
        <p className="text-xs text-neutral-500 py-1">
          Žádné úkoly ke stočení. Když je admin/sládek/šéf zadá, objeví se tady zvýrazněné.{' '}
          {druh === 'kegy' ? <IkonaSud className="ikona-text" /> : <IkonaLahev className="ikona-text" />}
        </p>
      )}

      {groups.late.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="text-[11px] font-black text-rose-700 uppercase tracking-wide"><AlertTriangle className="ikona-text" /> Zpožděné úkoly</div>
          {groups.late.map((p) => (
            <PlanItem key={p.id} plan={p} beers={beers} packages={packages} isManager={isManager} isToday={false} isLate onFill={onFill} onChanged={onChanged} druh={druh} />
          ))}
        </div>
      )}

      {groups.today.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="text-[11px] font-black text-amber-700 uppercase tracking-wide"><Calendar className="ikona-text" /> Na dnes</div>
          {groups.today.map((p) => (
            <PlanItem key={p.id} plan={p} beers={beers} packages={packages} isManager={isManager} isToday isLate={false} onFill={onFill} onChanged={onChanged} druh={druh} />
          ))}
        </div>
      )}

      {groups.upcoming.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-black text-neutral-500 uppercase tracking-wide">📆 Připravované</div>
          {groups.upcoming.map((p) => (
            <PlanItem key={p.id} plan={p} beers={beers} packages={packages} isManager={isManager} isToday={false} isLate={false} onFill={onFill} onChanged={onChanged} druh={druh} />
          ))}
        </div>
      )}
    </div>
  );
}
