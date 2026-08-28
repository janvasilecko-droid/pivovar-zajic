import { useState, useEffect, useMemo } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { AlertTriangle, Calendar, CalendarDays, Check, CheckCircle2, Droplet, Droplets, Flame, FlaskConical, Phone, Plus, RefreshCw, ShieldAlert, Sparkles, Tag, Trash2, User, Wrench, X } from 'lucide-react';
import { oznam, potvrd } from '../lib/toast';
import { IkonaVycep } from '../components/ikony';

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
  phone?: string;
  deposit_czk?: number;
  is_returned?: boolean;
  returned_at?: string;
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
  const [resPhone, setResPhone] = useState('');
  const [resDeposit, setResDeposit] = useState<number | ''>(2000);
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
    if (!newTapName.trim()) { oznam('Zadejte název výčepu.'); return; }

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

  async function handleDeleteTap(id: string) {
    if (!(await potvrd('Opravdu smazat tento výčep z evidenci?'))) return;
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
    if (!resTapId) { oznam('Vyberte výčep.'); return; }
    if (!resCustomer.trim()) { oznam('Zadejte zákazníka / odběratele.'); return; }
    if (resDateTo < resDateFrom) { oznam('Konec rezervace nesmí být před začátkem.'); return; }

    if (!isTapAvailable(resTapId, resDateFrom, resDateTo)) {
      oznam('Tento výčep je v tomto termínu již zarezervovaný!');
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
      phone: resPhone.trim() || undefined,
      deposit_czk: typeof resDeposit === 'number' ? resDeposit : undefined,
      is_returned: false,
      note: resNote.trim() || undefined,
    };

    saveReservations([...reservations, newRes]);
    setShowResModal(false);
    setResCustomer('');
    setResPhone('');
    setResNote('');
  }

  async function handleDeleteReservation(id: string) {
    if (!(await potvrd('Opravdu smazat tuto rezervaci?'))) return;
    saveReservations(reservations.filter((r) => r.id !== id));
  }

  function handleToggleReturnReservation(res: TapReservation) {
    const nextReturned = !res.is_returned;
    const updated = reservations.map((r) => {
      if (r.id !== res.id) return r;
      return {
        ...r,
        is_returned: nextReturned,
        returned_at: nextReturned ? new Date().toISOString() : undefined,
      };
    });
    saveReservations(updated);

    // Pokud byl výčep vrácen, nastavíme jeho stav sanitace na 'dirty_beer'
    if (nextReturned) {
      updateSanitation(res.tap_id, {
        status: 'dirty_beer',
      });
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Flame size={18} />
            <span>Půjčovna & Sanitace výčepů</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <IkonaVycep className="ikona-text" /> <span>Půjčovna výčepních zařízení & Sanitace</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Evidence výčepů (1–6 kohouty), sanitace louhem/vodou a rezervační kalendář pro zápůjčky.
          </p>
        </div>

        <button
          onClick={() => setShowAddTapModal(true)}
          className="btn-primary !rounded !bg-amber-500 !text-neutral-950 font-black text-xs flex items-center gap-1.5 shadow-md"
        >
          <Plus size={16} /> Přidat výčepní zařízení
        </button>
      </div>

      {/* 🚰 SEZNAM VÝČEPŮ A STAV ČISTOTY */}
      <div className="space-y-4">
        <h2 className="text-sm font-display font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
          <span><IkonaVycep className="ikona-text" /> Výčepní zařízení v pivovaru ({taps.length})</span>
        </h2>

        {taps.length === 0 ? (
          <EmptyState text="Zatím nemáte přidané žádné výčepy." icon={IkonaVycep} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {taps.map((t) => {
              const isDirty = t.status === 'dirty_beer';
              const needsLouh = t.status === 'needs_louh';
              const isClean = t.status === 'clean';

              return (
                <div
                  key={t.id}
                  className={`card p-5 rounded border-2 transition-all shadow-sm space-y-4 flex flex-col justify-between ${
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
                        <span className="px-2.5 py-0.5 rounded-full bg-neutral-900 text-amber-300 font-extrabold text-[11px] uppercase tracking-wider inline-block mt-1">
                          {t.tap_type === 'jednokohout' ? 'Jednokohout' : t.tap_type === 'dvojkohout' ? 'Dvojkohout' : t.tap_type === 'trojkohout' ? 'Trojkohout' : 'Šestikohout'}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteTap(t.id)} className="text-neutral-400 hover:text-rose-600 p-1" title="Smazat výčep">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Stav čistoty odznáček */}
                    <div className="p-3 rounded border text-xs font-bold space-y-1 bg-white/90">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500 font-medium">Stav čistoty:</span>
                        {isClean && <span className="text-emerald-700 font-black flex items-center gap-1"><CheckCircle2 size={14} /> Čisté & Opláchnuté</span>}
                        {isDirty && <span className="text-rose-700 font-black flex items-center gap-1"><ShieldAlert size={14} /> V trubkách je pivo</span>}
                        {needsLouh && <span className="text-amber-800 font-black flex items-center gap-1"><AlertTriangle size={14} /> Nutný louh</span>}
                      </div>

                      <div className="pt-2 border-t border-neutral-100 text-[11px] text-neutral-700 space-y-1 font-mono">
                        <div className="flex justify-between">
                          <span><Droplet className="ikona-text" /> Oplach vodou:</span>
                          <strong>{t.last_water_rinse || 'Zatím neproveden'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span><FlaskConical className="ikona-text" /> Louhování:</span>
                          <strong>{t.last_louh_sanitation || 'Zatím neprovedeno'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span><Wrench className="ikona-text" /> Rozebrané kohouty:</span>
                          <strong className={t.taps_disassembled ? 'text-emerald-700' : 'text-rose-600'}>
                            {t.taps_disassembled
                              ? <><Check className="ikona-text" /> Ano</>
                              : <><X className="ikona-text" /> Ne</>}
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
                      className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-2xs flex items-center justify-center gap-1"
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
                      className="px-2.5 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black shadow-2xs flex items-center justify-center gap-1"
                      title="Provést sanitaci louhem"
                    >
                      <RefreshCw size={13} /> Louh <FlaskConical className="ikona-text" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📅 REZERVAČNÍ KALENDÁŘ VÝČEPŮ */}
      <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 flex-wrap gap-2">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <Calendar className="text-amber-600" size={20} />
            <span>Rezervace a výpůjčky výčepů ({reservations.length})</span>
          </h3>

          <button
            onClick={() => {
              if (taps.length > 0) setResTapId(taps[0].id);
              setShowResModal(true);
            }}
            className="btn-primary !rounded !py-1.5 !px-3.5 text-xs font-black shadow-2xs flex items-center gap-1"
          >
            + Nová výpůjčka / rezervace
          </button>
        </div>

        {reservations.length === 0 ? (
          <EmptyState text="Žádné aktivní rezervace výčepů." icon={CalendarDays} />
        ) : (
          <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {reservations.map((r) => {
              const isOverdue = !r.is_returned && r.date_to < todayStr;
              const isReturned = r.is_returned;
              return (
                <div key={r.id} className={`rounded border p-3 space-y-2 ${isOverdue ? 'bg-rose-50/60 border-rose-200' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-neutral-950">{r.tap_name}</span>
                    {isReturned ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 font-black text-[11px] border border-emerald-300"><Check className="ikona-text" /> Vráceno</span>
                    ) : isOverdue ? (
                      <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[11px] animate-pulse"><AlertTriangle className="ikona-text" /> Po termínu</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 font-black text-[11px] border border-amber-300">Půjčeno</span>
                    )}
                  </div>
                  <div className="font-mono font-bold text-xs text-amber-950">
                    {new Date(r.date_from).toLocaleDateString('cs-CZ')} – {new Date(r.date_to).toLocaleDateString('cs-CZ')}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-xs text-neutral-900">{r.customer_name}</div>
                      {r.phone && <a href={`tel:${r.phone}`} className="text-xs text-sky-700 font-bold hover:underline"><Phone className="ikona-text" /> {r.phone}</a>}
                    </div>
                    {r.deposit_czk ? <span className="font-mono font-bold text-xs text-neutral-700 shrink-0">{r.deposit_czk.toLocaleString('cs-CZ')} Kč</span> : null}
                  </div>
                  {r.note && <div className="text-xs text-neutral-600 font-medium">{r.note}</div>}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleReturnReservation(r)}
                      className={`flex-1 min-h-[40px] px-3 py-2 rounded text-xs font-black transition ${
                        r.is_returned ? 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xs'
                      }`}
                    >
                      {r.is_returned ? 'Zrušit vrácení' : <><Check className="ikona-text" /> Vrátit</>}
                    </button>
                    <button onClick={() => handleDeleteReservation(r.id)} className="w-10 h-10 grid place-items-center rounded hover:bg-rose-100 text-rose-600 transition shrink-0" title="Smazat rezervaci">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Stav</th>
                  <th>Výčep</th>
                  <th>Od – Do</th>
                  <th>Zákazník</th>
                  <th>Kauce</th>
                  <th>Poznámka</th>
                  <th className="text-right">Akce</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const isOverdue = !r.is_returned && r.date_to < todayStr;
                  const isReturned = r.is_returned;

                  return (
                    <tr key={r.id} className={`hover:bg-neutral-50/80 transition-colors ${isOverdue ? 'bg-rose-50/60' : ''}`}>
                      <td>
                        {isReturned ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-950 font-black text-[11px] border border-emerald-300">
                            <Check className="ikona-text" /> Vráceno
                          </span>
                        ) : isOverdue ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[11px] animate-pulse">
                            <AlertTriangle className="ikona-text" /> Po termínu
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 font-black text-[11px] border border-amber-300">
                            Půjčeno
                          </span>
                        )}
                      </td>
                      <td className="font-black text-xs text-neutral-950">{r.tap_name}</td>
                      <td className="font-mono font-bold text-xs text-amber-950 whitespace-nowrap">
                        {new Date(r.date_from).toLocaleDateString('cs-CZ')} – {new Date(r.date_to).toLocaleDateString('cs-CZ')}
                      </td>
                      <td>
                        <div className="font-black text-xs text-neutral-900">{r.customer_name}</div>
                        {r.phone && (
                          <a href={`tel:${r.phone}`} className="text-[11px] text-sky-700 font-bold hover:underline">
                            <Phone className="ikona-text" /> {r.phone}
                          </a>
                        )}
                      </td>
                      <td className="font-mono font-bold text-xs text-neutral-700">
                        {r.deposit_czk ? `${r.deposit_czk.toLocaleString('cs-CZ')} Kč` : '—'}
                      </td>
                      <td className="text-[11px] text-neutral-600 font-medium">{r.note || '—'}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleReturnReservation(r)}
                            className={`px-2.5 py-1 rounded text-[11px] font-black transition ${
                              r.is_returned
                                ? 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300'
                                : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-2xs'
                            }`}
                          >
                            {r.is_returned ? 'Zrušit vrácení' : <><Check className="ikona-text" /> Vrátit</>}
                          </button>
                          <button onClick={() => handleDeleteReservation(r.id)} className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition" title="Smazat rezervaci">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* MODAL NOVÝ VÝČEP */}
      {showAddTapModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Přidat výčepní zařízení</h3>
              <button onClick={() => setShowAddTapModal(false)} className="text-neutral-400 font-bold" title="Zavřít"><X size={18} /></button>
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
                  <option value="jednokohout">Jednokohout</option>
                  <option value="dvojkohout">Dvojkohout</option>
                  <option value="trojkohout">Trojkohout</option>
                  <option value="sestikohout">Šestikohout (akce)</option>
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
                <button type="button" onClick={() => setShowAddTapModal(false)} className="btn-secondary text-xs font-bold">Zrušit</button>
                <button type="submit" className="btn-primary !rounded text-xs font-black">Uložit výčep</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NOVÁ REZERVACE */}
      {showResModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Vytvořit výpůjčku výčepu</h3>
              <button onClick={() => setShowResModal(false)} className="text-neutral-400 font-bold" title="Zavřít"><X size={18} /></button>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    placeholder="+420 777..."
                    value={resPhone}
                    onChange={(e) => setResPhone(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Vratná kauce (Kč)</label>
                  <input
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                    min="0"
                    step="500"
                    placeholder="2000"
                    value={resDeposit}
                    onChange={(e) => setResDeposit(e.target.value ? Number(e.target.value) : '')}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka</label>
                <input
                  type="text"
                  placeholder="Volitelná poznámka k zápůjčce"
                  value={resNote}
                  onChange={(e) => setResNote(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setShowResModal(false)} className="px-4 py-2 rounded bg-neutral-100 font-bold text-xs">Zrušit</button>
                <button type="submit" className="px-4 py-2 rounded bg-amber-500 font-black text-xs">Zarezervovat</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
