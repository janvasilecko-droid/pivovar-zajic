import { useState, useEffect } from 'react';
import { CellarTank, Beer, CellarTankCycle } from '../lib/supabase';
import { AlertTriangle, BarChart3, Calendar, CheckCircle2, Clock, Plus, ShieldAlert, Sparkles } from 'lucide-react';

export type PlannedBatch = {
  id: string;
  tankId: string;
  beerName: string;
  volumeHl: number;
  startDate: string; // ISO date string (YYYY-MM-DD)
  targetDays: number;
  note?: string;
};

export function TankOccupancyPlanner({
  tanks,
  beers,
  cycles,
}: {
  tanks: CellarTank[];
  beers: Beer[];
  cycles: CellarTankCycle[];
}) {
  const [plannedBatches, setPlannedBatches] = useState<PlannedBatch[]>(() => {
    try {
      const saved = localStorage.getItem('cellar_planned_brews_data');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState('');
  const [selectedBeerName, setSelectedBeerName] = useState('');
  const [volumeHl, setVolumeHl] = useState('10');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetDays, setTargetDays] = useState('30');
  const [note, setNote] = useState('');

  // Uložení plánované várky
  function handleAddPlannedBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTankId || !selectedBeerName) return;

    const newBatch: PlannedBatch = {
      id: `planned_${Date.now()}`,
      tankId: selectedTankId,
      beerName: selectedBeerName,
      volumeHl: Number(volumeHl) || 10,
      startDate,
      targetDays: Number(targetDays) || 30,
      note,
    };

    const updated = [newBatch, ...plannedBatches];
    setPlannedBatches(updated);
    localStorage.setItem('cellar_planned_brews_data', JSON.stringify(updated));
    setShowAddModal(false);
    setNote('');
  }

  function handleRemovePlannedBatch(id: string) {
    const updated = plannedBatches.filter((b) => b.id !== id);
    setPlannedBatches(updated);
    localStorage.setItem('cellar_planned_brews_data', JSON.stringify(updated));
  }

  // Funkce pro získání doporučené doby ležení podle pivního stylu
  function getRecommendedLageringDays(beerName: string): number {
    const name = beerName.toLowerCase();
    if (name.includes('10') || name.includes('výčepní')) return 21;
    if (name.includes('11') || name.includes('12') || name.includes('ležák')) return 30;
    if (name.includes('13') || name.includes('14') || name.includes('speciál')) return 40;
    if (name.includes('ipa') || name.includes('apa')) return 14;
    return 30;
  }

  // Vypočte dny ležení a datum dokončení
  const today = new Date();

  // ---- Detekce kolizí obsazenosti ----
  // Konec intervalu je dnem, kdy se tank uvolní (exkluzivní) — [start, end).
  function addDays(dateStr: string, days: number): Date {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d;
  }
  function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
    return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
  }

  // Pro každý tank s pivem: odhadovaný den uvolnění (start + doporučená doba ležení).
  const tankFreeDate = new Map<string, Date>();
  tanks.forEach((t) => {
    const hasBeer = t.status === 'active' || t.status === 'filling' || Number(t.current_volume_l) > 0;
    if (!hasBeer) return;
    const startDateObj = t.started_at ? new Date(t.started_at) : new Date();
    const days = getRecommendedLageringDays(t.current_beer_name ?? '');
    const freeDate = new Date(startDateObj);
    freeDate.setDate(freeDate.getDate() + days);
    tankFreeDate.set(t.id, freeDate);
  });

  // Množina ID naplánovaných várek, které kolidují buď se současnou obsazeností tanku,
  // nebo s jinou naplánovanou várkou na stejném tanku.
  const conflictingBatchIds = new Set<string>();
  plannedBatches.forEach((pb) => {
    const pbStart = addDays(pb.startDate, 0);
    const pbEnd = addDays(pb.startDate, pb.targetDays);

    const tankFree = tankFreeDate.get(pb.tankId);
    if (tankFree && pbStart.getTime() < tankFree.getTime()) {
      conflictingBatchIds.add(pb.id);
    }

    plannedBatches.forEach((other) => {
      if (other.id === pb.id || other.tankId !== pb.tankId) return;
      const otherStart = addDays(other.startDate, 0);
      const otherEnd = addDays(other.startDate, other.targetDays);
      if (rangesOverlap(pbStart, pbEnd, otherStart, otherEnd)) {
        conflictingBatchIds.add(pb.id);
        conflictingBatchIds.add(other.id);
      }
    });
  });

  // Kolize pro tank+datum vybrané v modalu "Naplánovat várku" — varování před uložením.
  function checkNewBatchConflict(tankId: string, startDateStr: string, days: number): string | null {
    if (!tankId || !startDateStr) return null;
    const newStart = addDays(startDateStr, 0);
    const newEnd = addDays(startDateStr, days);

    const tankFree = tankFreeDate.get(tankId);
    if (tankFree && newStart.getTime() < tankFree.getTime()) {
      const t = tanks.find((x) => x.id === tankId);
      return `${t?.label ?? 'Tank'} bude podle odhadu obsazený do ${tankFree.toLocaleDateString('cs-CZ')} — várka od ${newStart.toLocaleDateString('cs-CZ')} se s tím překrývá.`;
    }
    const conflict = plannedBatches.find((other) => {
      if (other.tankId !== tankId) return false;
      const otherStart = addDays(other.startDate, 0);
      const otherEnd = addDays(other.startDate, other.targetDays);
      return rangesOverlap(newStart, newEnd, otherStart, otherEnd);
    });
    if (conflict) {
      return `Koliduje s už naplánovanou várkou "${conflict.beerName}" (od ${new Date(conflict.startDate).toLocaleDateString('cs-CZ')}) na stejném tanku.`;
    }
    return null;
  }

  const newBatchConflict = checkNewBatchConflict(selectedTankId, startDate, Number(targetDays) || 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="card p-6 bg-gradient-to-r from-amber-500/15 via-amber-100/40 to-white border-2 border-amber-300 rounded space-y-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 font-black flex items-center justify-center text-2xl shadow-md shrink-0">
              <Calendar className="ikona-text" />
            </div>
            <div>
              <h2 className="text-xl font-display font-black text-neutral-950">Plánovač obsazenosti tanků & Harmonogram ležení</h2>
              <p className="text-xs text-neutral-600 font-bold">Přehled zrání v tankách, predikce stáčení a rezervace pro nové várky</p>
            </div>
          </div>

          <button
            onClick={() => {
              if (tanks.length > 0) setSelectedTankId(tanks[0].id);
              if (beers.length > 0) {
                setSelectedBeerName(beers[0].name);
                setTargetDays(String(getRecommendedLageringDays(beers[0].name)));
              }
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-2"
          >
            <Plus size={18} />
            <span>Naplánovat várku na tank</span>
          </button>
        </div>
      </div>

      {conflictingBatchIds.size > 0 && (
        <div className="flex items-center gap-2 p-3.5 rounded bg-rose-50 border-2 border-rose-300 text-sm font-black text-rose-800">
          <ShieldAlert size={18} className="text-rose-600 shrink-0" />
          <span><AlertTriangle className="ikona-text" /> {conflictingBatchIds.size} naplánovaných várek koliduje s obsazeností tanku — viz označené várky níže.</span>
        </div>
      )}

      {/* Gantt Overview Table */}
      <div className="card p-6 bg-white border border-neutral-200/90 rounded shadow-sm space-y-4">
        <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
          <span><BarChart3 className="ikona-text" /> Vizuální časová osa obsazenosti ležáckých a kvasných tanků</span>
        </h3>

        <div className="space-y-4">
          {tanks.map((t) => {
            const isSpilka = t.label.toLowerCase().includes('spilka');
            const hasBeer = t.status === 'active' || t.status === 'filling' || (Number(t.current_volume_l) > 0);
            const beerName = t.current_beer_name ?? '— Bez piva —';

            // Výpočet dnů ležení
            const startDateObj = t.started_at ? new Date(t.started_at) : new Date();
            const daysInTank = t.started_at ? Math.max(0, Math.floor((today.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24))) : 0;
            const targetDaysCount = getRecommendedLageringDays(beerName);
            const progressPct = hasBeer ? Math.min(100, Math.round((daysInTank / targetDaysCount) * 100)) : 0;

            const endDateObj = new Date(startDateObj);
            endDateObj.setDate(endDateObj.getDate() + targetDaysCount);
            const endDateStr = endDateObj.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

            const isReady = hasBeer && (daysInTank >= targetDaysCount || progressPct >= 100);

            // Plánované rezervace pro tento tank
            const plannedForThisTank = plannedBatches.filter((b) => b.tankId === t.id);

            return (
              <div
                key={t.id}
                className={`p-4 rounded border-2 transition-all ${
                  !hasBeer
                    ? 'bg-neutral-50 border-neutral-200'
                    : isReady
                    ? 'bg-emerald-50/80 border-emerald-300 shadow-xs'
                    : 'bg-amber-50/60 border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-sm text-neutral-900">{t.label}</span>
                    <span className="text-xs font-bold text-neutral-500">({(t.capacity_l / 100).toFixed(0)} hl)</span>
                    {isSpilka && <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-950 text-[11px] font-black">Spilka CCT</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    {!hasBeer ? (
                      <span className="chip bg-neutral-200 text-neutral-700 text-xs">⚪ Volno / Pripraveno</span>
                    ) : isReady ? (
                      <span className="chip bg-emerald-500 text-white font-black text-xs animate-pulse">
                        🟢 Připraveno ke stočení (Leží {daysInTank} dní)
                      </span>
                    ) : (
                      <span className="chip bg-amber-500 text-neutral-950 font-black text-xs">
                        🟡 Zrání: {daysInTank} z {targetDaysCount} dní (Stoční cca {endDateStr})
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar for Fermentation / Lagering */}
                {hasBeer ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold font-mono">
                      <span className="text-neutral-900">{beerName} ({(Number(t.current_volume_l) / 100).toFixed(1)} hl)</span>
                      <span className={isReady ? 'text-emerald-700 font-black' : 'text-amber-800'}>
                        {progressPct}% ({daysInTank} / {targetDaysCount} dní)
                      </span>
                    </div>

                    <div className="w-full bg-neutral-200 h-3.5 rounded-full overflow-hidden p-0.5 border border-neutral-300">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isReady ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-500'
                        }`}
                        style={{ width: `${Math.max(progressPct, 5)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-medium text-neutral-400 italic">Tank je volný pro novou várku z varny.</div>
                )}

                {/* Scheduled future batches on this tank */}
                {plannedForThisTank.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-neutral-200/80 space-y-1">
                    <span className="text-[11px] font-black uppercase text-amber-900 tracking-wider">Naplánované budoucí várky:</span>
                    {plannedForThisTank.map((pb) => {
                      const isConflicting = conflictingBatchIds.has(pb.id);
                      return (
                        <div key={pb.id} className={`flex items-center justify-between p-2 rounded bg-white border text-xs font-mono ${isConflicting ? 'border-rose-400 ring-1 ring-rose-300' : 'border-amber-300'}`}>
                          <div>
                            {isConflicting && (
                              <div className="flex items-center gap-1 text-rose-700 font-black text-[11px] mb-0.5">
                                <ShieldAlert size={12} /> Kolize obsazenosti tanku
                              </div>
                            )}
                            <strong className="text-neutral-900">{pb.beerName}</strong> ({pb.volumeHl} hl) — Plnění od {new Date(pb.startDate).toLocaleDateString('cs-CZ')} (Doba ležení {pb.targetDays} dní)
                          </div>
                          <button
                            onClick={() => handleRemovePlannedBatch(pb.id)}
                            className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                          >
                            ✕ Zrušit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Planned Batch Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span><Plus className="ikona-text" /> Naplánovat novou várku na tank</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleAddPlannedBatch} className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Cílový tank</label>
                <select
                  value={selectedTankId}
                  onChange={(e) => setSelectedTankId(e.target.value)}
                  className="input font-bold text-xs"
                >
                  {tanks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({(t.capacity_l / 100).toFixed(0)} hl) — {t.status === 'empty' ? 'Volný' : t.current_beer_name ?? 'Aktivní'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Pivo (Druh / Značka)</label>
                <select
                  value={selectedBeerName}
                  onChange={(e) => {
                    setSelectedBeerName(e.target.value);
                    setTargetDays(String(getRecommendedLageringDays(e.target.value)));
                  }}
                  className="input font-bold text-xs"
                >
                  {beers.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Objem (hl)</label>
                  <input
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                    step="0.5"
                    value={volumeHl}
                    onChange={(e) => setVolumeHl(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum napuštění</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Doporučená doba ležení (Dny)</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  value={targetDays}
                  onChange={(e) => setTargetDays(e.target.value)}
                  className="input font-mono font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka sládka (Volitelně)</label>
                <input
                  type="text"
                  placeholder="Např. čerstvé kvasnice šarže 24"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input font-medium text-xs"
                />
              </div>

              {newBatchConflict && (
                <div className="flex items-start gap-2 p-3 rounded bg-rose-50 border border-rose-300 text-xs font-bold text-rose-800">
                  <ShieldAlert size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  <span><AlertTriangle className="ikona-text" /> {newBatchConflict}</span>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
                >
                  Uložit do plánu zrání
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
