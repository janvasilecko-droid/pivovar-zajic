import { useState, useEffect, useMemo } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { Flame, Plus, Trash2, Calendar, CheckCircle2, AlertTriangle, Droplets, Wrench, RefreshCw, ShieldAlert, Sparkles, User, Tag } from 'lucide-react';

export type TapSanitationStatus = 'clean' | 'dirty_beer' | 'needs_louh';

export type TapEquipment = {
  id: string;
  name: string;           // e.g. Výčep #1 - Pygmy 25
  tap_type: 'jednokohout' | 'dvojkohout' | 'trojkohout' | 'sestikohout' | string;
  status: TapSanitationStatus;
  last_water_rinse?: string; // Datum/čas oplachu vodou
  last_louh_sanitation?: string; // Datum/čas sanitace louhem
  taps_disassembled?: boolean; // Rozebrané kohouty
  note?: string;
};

export type TapReservation = {
  id: string;
  tap_id: string;
  tap_name: string;
  date_from: string;      // YYYY-MM-DD
  date_to: string;        // YYYY-MM-DD
  customer_name: string;  // Odběratel / Jméno
  note?: string;
  order_id?: string;
};

export default function VycepyScreen() {
  const [taps, setTaps] = useState<TapEquipment[]>(() => {
    try {
      const saved = localStorage.getItem('vycepy_equipment_v1');
      return saved ? JSON.parse(saved) : [
        { id: 't1', name: 'Výčep #1 — Lindr Pygmy 25', tap_type: 'jednokohout', status: 'clean', last_water_rinse: '2026-07-26 18:00', last_louh_sanitation: '2026-07-20 10:00', taps_disassembled: true },
        { id: 't2', name: 'Výčep #2 — Kontaktní Dvojkohout 50', tap_type: 'dvojkohout', status: 'dirty_beer', last_water_rinse: '2026-07-22 15:00', last_louh_sanitation: '2026-07-15 12:00', taps_disassembled: false },
        { id: 't3', name: 'Výčep #3 — Trojkohout Master', tap_type: 'trojkohout', status: 'needs_louh', last_water_rinse: '2026-07-18 09:00', last_louh_sanitation: '2026-07-01 11:00', taps_disassembled: false },
        { id: 't4', name: 'Výčep #4 — Šestikohout na akce', tap_type: 'sestikohout', status: 'clean', last_water_rinse: '2026-07-28 12:00', last_louh_sanitation: '2026-07-22 16:00', taps_disassembled: true },
      ];
    } catch { return []; }
  });

  const [reservations, setReservations] = useState<TapReservation[]>(() => {
    try {
      const saved = localStorage.getItem('vycepy_reservations_v1');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [showAddTapModal, setShowAddTapModal] = useState(false);
  const [showResModal, setShowResModal] = useState(false);

  // New Tap Form
  const [newTapName, setNewTapName] = useState('');
  const [newTapType, setNewTapType] = useState<'jednokohout' | 'dvojkohout' | 'trojkohout' | 'sestikohout'>('jednokohout');
  const [newTapNote, setNewTapNote] = useState('');

  // New Reservation Form
  const [resTapId, setResTapId] = useState('');
  const [resDateFrom, setResDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [resDateTo, setResDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [resCustomer, setResCustomer] = useState('');
  const [resNote, setResNote] = useState('');

  function saveTaps(newTaps: TapEquipment[]) {
    setTaps(newTaps);
    localStorage.setItem('vycepy_equipment_v1', JSON.stringify(newTaps));
  }

  function saveReservations(newRes: TapReservation[]) {
    setReservations(newRes);
    localStorage.setItem('vycepy_reservations_v1', JSON.stringify(newRes));
  }

  function handleAddTap(e: React.FormEvent) {
    e.preventDefault();
    if (!newTapName.trim()) { alert('Zadejte název výčepu.'); return; }

    const newT: TapEquipment = {
      id: crypto.randomUUID(),
      name: newTapName.trim(),
      tap_type: newTapType,
      status: 'clean',
      last_water_rinse: new Date().toLocaleDateString('cs-CZ') + ' ' + new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
      taps_disassembled: true,
      note: newTapNote.trim() || undefined,
    };

    saveTaps([...taps, newT]);
    setShowAddTapModal(false);
    setNewTapName('');
    setNewTapNote('');
  }

  function handleDeleteTap(id: string) {
    if (!confirm('Opravdu smazat tento výčep z evidenci?')) return;
    saveTaps(taps.filter((t) => t.id !== id));
  }

  // Update sanitation states
  function updateSanitation(tapId: string, patch: Partial<TapEquipment>) {
    const next = taps.map((t) => {
      if (t.id !== tapId) return t;
      return { ...t, ...patch };
    });
    saveTaps(next);
  }

  // Check availability
  function isTapAvailable(tapId: string, fromDate: string, toDate: string, excludeResId?: string): boolean {
    return !reservations.some((r) => {
      if (r.id === excludeResId) return false;
      if (r.tap_id !== tapId) return false;
      return fromDate <= r.date_to && toDate >= r.date_from;
    });
  }

  function handleAddReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!resTapId) { alert('Vyberte výčep.'); return; }
    if (!resCustomer.trim()) { alert('Zadejte zákazníka / odběratele.'); return; }
    if (resDateTo < resDateFrom) { alert('Konec rezervace nesmí být před začátkem.'); return; }

    if (!isTapAvailable(resTapId, resDateFrom, resDateTo)) {
      alert('❌ Tento výčep je v tomto termínu již zarezervovaný!');
      return;
    }

    const tap = taps.find((t) => t.id === resTapId);
    const newRes: TapReservation = {
      id: crypto.randomUUID(),
      tap_id: resTapId,
      tap_name: tap?.name ?? 'Výčep',
      date_from: resDateFrom,
      date_to: resDateTo,
      customer_name: resCustomer.trim(),
      note: resNote.trim() || undefined,
    };

    saveReservations([newRes, ...reservations]);
    setShowResModal(false);
    setResCustomer('');
    setResNote('');
    alert(`✅ Rezervace výčepu "${tap?.name}" vytvořena!`);
  }

  function handleDeleteReservation(id: string) {
    if (!confirm('Smazat tuto rezervaci výčepu?')) return;
    saveReservations(reservations.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded-3xl border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Flame size={18} />
            <span>Pivovarské výčepy & Sanitace</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>🍺 Výčepy, Sanitace & Rezervační kalendář</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Přehled čistoty výčepů (oplach vodou, sanitace louhem, rozebrané kohouty) a rezervace jednokohoutů, dvojkohoutů, trojkohoutů a šestikohoutů pro hospody a akce.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddTapModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Plus size={16} /> Přidat výčep
          </button>

          <button
            onClick={() => {
              if (taps.length > 0) setResTapId(taps[0].id);
              setShowResModal(true);
            }}
            className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Calendar size={16} /> Vytvořit rezervaci
          </button>
        </div>
      </div>

      {/* 🍺 EVIDOVANÉ VÝČEPY A JEJICH ČISTOTA */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <span>Vozový výčepní park ({taps.length})</span>
          </h3>
        </div>

        {taps.length === 0 ? (
          <EmptyState text="Zatím nemáš zadané žádné výčepy." icon="🍺" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {taps.map((t) => {
              const isDirty = t.status === 'dirty_beer';
              const needsLouh = t.status === 'needs_louh';
              const isClean = t.status === 'clean';

              return (
                <div
                  key={t.id}
                  className={`card p-5 rounded-3xl border-2 transition-all shadow-sm space-y-4 flex flex-col justify-between ${
                    isDirty
                      ? 'bg-rose-50 border-rose-300'
                      : needsLouh
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-white border-emerald-300'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-display font-black text-base text-neutral-950 block">{t.name}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-neutral-900 text-amber-300 font-extrabold text-[10px] uppercase tracking-wider inline-block mt-1">
                          {t.tap_type === 'jednokohout' ? '🚰 Jednokohout' : t.tap_type === 'dvojkohout' ? '🚰🚰 Dvojkohout' : t.tap_type === 'trojkohout' ? '🚰🚰🚰 Trojkohout' : '🚰🚰🚰🚰🚰🚰 Šestikohout'}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteTap(t.id)} className="text-neutral-400 hover:text-rose-600 p-1" title="Smazat výčep">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Stav čistoty odznáček */}
                    <div className="p-3 rounded-2xl border text-xs font-bold space-y-1 bg-white/90">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 font-medium">Stav čistoty:</span>
                        {isClean && <span className="text-emerald-700 font-black flex items-center gap-1"><CheckCircle2 size={14} /> Čisté & Opláchnuté</span>}
                        {isDirty && <span className="text-rose-700 font-black flex items-center gap-1"><ShieldAlert size={14} /> V trubkách je pivo (Nutno vyčistit!)</span>}
                        {needsLouh && <span className="text-amber-800 font-black flex items-center gap-1"><AlertTriangle size={14} /> Nutná sanitace louhem</span>}
                      </div>

                      <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-700 space-y-1 font-mono">
                        <div className="flex justify-between">
                          <span>💧 Oplach vodou:</span>
                          <strong>{t.last_water_rinse || 'Zatím neproveden'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>🧪 Louhování:</span>
                          <strong>{t.last_louh_sanitation || 'Zatím neprovedeno'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>🔧 Rozebrané kohouty:</span>
                          <strong className={t.taps_disassembled ? 'text-emerald-700' : 'text-rose-600'}>
                            {t.taps_disassembled ? '✓ Ano (Vyčištěné)' : '✕ Ne'}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tlačítka pro změnu sanitace */}
                  <div className="pt-2 border-t border-neutral-200 grid grid-cols-2 gap-1.5 text-xs font-bold">
                    <button
                      onClick={() => updateSanitation(t.id, {
                        status: 'clean',
                        last_water_rinse: new Date().toLocaleDateString('cs-CZ') + ' ' + new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                        taps_disassembled: true
                      })}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-2xs flex items-center justify-center gap-1"
                      title="Provést Oplach vodou a zaznamenat čistotu"
                    >
                      <Droplets size={13} /> Opláchnuto
                    </button>

                    <button
                      onClick={() => updateSanitation(t.id, {
                        status: 'clean',
                        last_louh_sanitation: new Date().toLocaleDateString('cs-CZ') + ' ' + new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                        taps_disassembled: true
                      })}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black shadow-2xs flex items-center justify-center gap-1"
                      title="Provést sanitaci louhem"
                    >
                      <RefreshCw size={13} /> Louh 🧪
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📅 REZERVAČNÍ KALENDÁŘ VÝČEPŮ */}
      <div className="card p-6 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <Calendar className="text-amber-600" size={20} />
            <span>Rezervace výčepních zařízení ({reservations.length})</span>
          </h3>

          <button
            onClick={() => {
              if (taps.length > 0) setResTapId(taps[0].id);
              setShowResModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-amber-500 text-neutral-950 font-black text-xs shadow-2xs flex items-center gap-1"
          >
            + Nová rezervace výčepu
          </button>
        </div>

        {reservations.length === 0 ? (
          <EmptyState text="Žádné aktivní rezervace výčepů." icon="📅" />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Výčep</th>
                  <th>Od</th>
                  <th>Do</th>
                  <th>Odběratel</th>
                  <th>Poznámka</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="font-black text-[11px] text-neutral-950">{r.tap_name}</td>
                    <td className="font-mono font-bold text-[11px] text-amber-950 whitespace-nowrap">{new Date(r.date_from).toLocaleDateString('cs-CZ')}</td>
                    <td className="font-mono font-bold text-[11px] text-amber-950 whitespace-nowrap">{new Date(r.date_to).toLocaleDateString('cs-CZ')}</td>
                    <td className="font-black text-[11px] text-neutral-900">{r.customer_name}</td>
                    <td className="text-[11px] text-neutral-600 font-medium">{r.note || '—'}</td>
                    <td className="text-right">
                      <button onClick={() => handleDeleteReservation(r.id)} className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600 transition" title="Smazat rezervaci">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL NOVÝ VÝČEP */}
      {showAddTapModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Přidat výčepní zařízení</h3>
              <button onClick={() => setShowAddTapModal(false)} className="text-neutral-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddTap} className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Název výčepu</label>
                <input
                  type="text"
                  required
                  placeholder="Např. Výčep #4 — Lindr Pygmy 25"
                  value={newTapName}
                  onChange={(e) => setNewTapName(e.target.value)}
                  className="input font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Typ výčepu</label>
                <select
                  value={newTapType}
                  onChange={(e) => setNewTapType(e.target.value as any)}
                  className="input font-bold text-xs"
                >
                  <option value="jednokohout">🚰 Jednokohout</option>
                  <option value="dvojkohout">🚰🚰 Dvojkohout</option>
                  <option value="trojkohout">🚰🚰🚰 Trojkohout</option>
                  <option value="sestikohout">🚰🚰🚰🚰🚰🚰 Šestikohout (akce)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka</label>
                <input
                  type="text"
                  placeholder="Volitelná poznámka k výčepu"
                  value={newTapNote}
                  onChange={(e) => setNewTapNote(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setShowAddTapModal(false)} className="px-4 py-2 rounded-xl bg-neutral-100 font-bold text-xs">Zrušit</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-amber-500 font-black text-xs">Uložit výčep</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NOVÁ REZERVACE */}
      {showResModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Vytvořit rezervaci výčepu</h3>
              <button onClick={() => setShowResModal(false)} className="text-neutral-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddReservation} className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Vyberte výčep</label>
                <select
                  value={resTapId}
                  onChange={(e) => setResTapId(e.target.value)}
                  className="input font-bold text-xs"
                >
                  {taps.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.tap_type})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum OD</label>
                  <input type="date" required value={resDateFrom} onChange={(e) => setResDateFrom(e.target.value)} className="input font-mono font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum DO</label>
                  <input type="date" required value={resDateTo} onChange={(e) => setResDateTo(e.target.value)} className="input font-mono font-bold text-xs" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Odběratel / Zákazník</label>
                <input
                  type="text"
                  required
                  placeholder="Např. Hospoda U Zajíce / Jan Novák"
                  value={resCustomer}
                  onChange={(e) => setResCustomer(e.target.value)}
                  className="input font-bold text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka k rezervaci</label>
                <input
                  type="text"
                  placeholder="Volitelné"
                  value={resNote}
                  onChange={(e) => setResNote(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setShowResModal(false)} className="px-4 py-2 rounded-xl bg-neutral-100 font-bold text-xs">Zrušit</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-amber-500 font-black text-xs">Zarezervovat</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
