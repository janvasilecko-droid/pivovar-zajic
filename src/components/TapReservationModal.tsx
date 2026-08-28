import { AlertTriangle, Check, CheckCircle2, X, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';
import type { TapTypeHint } from '../lib/tapReservations';
import { IkonaVycep } from '../components/ikony';

type Props = {
  /** Date from the order (YYYY-MM-DD) */
  orderDate: string;
  /** Customer / place name from the order */
  customerName: string;
  /** Order ID to link the reservation */
  orderId?: string;
  /** Optional tap type hint detected from the note (jednokohout/dvojkohout/trojkohout) */
  tapTypeHint?: TapTypeHint;
  /** Called when reservation is confirmed */
  onConfirm: (reservation: TapReservation) => void;
  /** Called when user cancels / closes without reserving */
  onSkip: () => void;
};

function loadTaps(): TapEquipment[] {
  try {
    const saved = localStorage.getItem('vycepy_equipment_v1');
    return saved ? JSON.parse(saved) : [
      { id: 't1', name: 'Výčep #1 — Lindr Pygmy 25', tap_type: 'jednokohout', status: 'clean' },
      { id: 't2', name: 'Výčep #2 — Kontaktní Dvojkohout 50', tap_type: 'dvojkohout', status: 'clean' },
      { id: 't3', name: 'Výčep #3 — Trojkohout Master', tap_type: 'trojkohout', status: 'clean' },
      { id: 't4', name: 'Výčep #4 — Šestikohout na akce', tap_type: 'sestikohout', status: 'clean' },
    ];
  } catch { return []; }
}

function loadReservations(): TapReservation[] {
  try {
    const saved = localStorage.getItem('vycepy_reservations_v1');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function isTapAvailable(tapId: string, date: string, reservations: TapReservation[]): boolean {
  return !reservations.some((r) =>
    r.tap_id === tapId && date >= r.date_from && date <= r.date_to
  );
}

export function TapReservationModal({ orderDate, customerName, orderId, tapTypeHint, onConfirm, onSkip }: Props) {
  const [taps] = useState<TapEquipment[]>(loadTaps);
  const [reservations] = useState<TapReservation[]>(loadReservations);
  const [selectedTapId, setSelectedTapId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(orderDate);
  const [dateTo, setDateTo] = useState(orderDate);
  const [customer, setCustomer] = useState(customerName);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Auto-select first available tap, preferring one matching the requested type
  useEffect(() => {
    if (!selectedTapId && taps.length > 0) {
      const matching = tapTypeHint
        ? taps.find((t) => t.tap_type === tapTypeHint && isTapAvailable(t.id, orderDate, reservations))
        : undefined;
      const firstAvail = matching ?? taps.find((t) => isTapAvailable(t.id, orderDate, reservations));
      setSelectedTapId(firstAvail?.id ?? taps[0].id);
    }
  }, [taps, reservations, orderDate, selectedTapId, tapTypeHint]);

  function handleConfirm() {
    setErr(null);
    if (!selectedTapId) { setErr('Vyberte výčep.'); return; }
    if (!customer.trim()) { setErr('Zadejte odběratele.'); return; }
    if (dateTo < dateFrom) { setErr('Konec rezervace nesmí být před začátkem.'); return; }

    if (!isTapAvailable(selectedTapId, dateFrom, reservations) ||
        !isTapAvailable(selectedTapId, dateTo, reservations)) {
      setErr('Tento výčep je v tomto termínu již zarezervovaný!');
      return;
    }

    const tap = taps.find((t) => t.id === selectedTapId);
    const reservation: TapReservation = {
      id: crypto.randomUUID(),
      tap_id: selectedTapId,
      tap_name: tap?.name ?? 'Výčep',
      date_from: dateFrom,
      date_to: dateTo,
      customer_name: customer.trim(),
      note: note.trim() || `Automaticky z objednávky${orderId ? ` #${orderId.slice(0, 8)}` : ''}`,
      order_id: orderId,
    };

    // Save to localStorage
    try {
      const existing = loadReservations();
      const next = [reservation, ...existing];
      localStorage.setItem('vycepy_reservations_v1', JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save reservation:', e);
    }

    onConfirm(reservation);
  }

  if (taps.length === 0) {
    return (
      <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded max-w-md w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="font-display font-black text-lg text-neutral-900"><IkonaVycep className="ikona-text" /> Rezervace výčepu</h3>
            <button onClick={onSkip} className="text-neutral-400 font-bold" title="Zavřít"><X size={18} /></button>
          </div>
          <p className="text-sm text-neutral-600">Nemáte vytvořené žádné výčepy. Nejprve je přidejte v sekci Výčepy.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onSkip} className="px-4 py-2 rounded bg-neutral-100 font-bold text-xs">Zavřít</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <span><IkonaVycep className="ikona-text" /></span>
            <span>Rezervace výčepu k objednávce</span>
          </h3>
          <button onClick={onSkip} className="text-neutral-400 font-bold" title="Zavřít"><X size={18} /></button>
        </div>

        <p className="text-xs text-neutral-500 font-medium">
          V poznámce objednávky jste zmínil výčep. Vyberte zařízení a potvrďte rezervaci.
        </p>

        <div className="space-y-3">
          {/* Výběr výčepu */}
          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1.5">Vyberte výčepní zařízení</label>
            {taps.some((t) => !(isTapAvailable(t.id, dateFrom, reservations) && isTapAvailable(t.id, dateTo, reservations))) && (
              <div className="mb-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                <AlertTriangle className="ikona-text" /> Některé výčepy jsou v tomto termínu rezervované — ostatní jsou k dispozici.
              </div>
            )}
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {taps.map((t) => {
                const available = isTapAvailable(t.id, dateFrom, reservations) && isTapAvailable(t.id, dateTo, reservations);
                const isSelected = selectedTapId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!available}
                    onClick={() => setSelectedTapId(t.id)}
                    className={`w-full text-left p-3 rounded border-2 transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                        : available
                        ? 'border-neutral-200 bg-white hover:border-amber-300'
                        : 'border-neutral-200 bg-neutral-100 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-black text-sm text-neutral-900">{t.name}</span>
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-neutral-900 text-amber-300 font-extrabold text-[11px] uppercase">
                          {t.tap_type === 'jednokohout' ? '1K' : t.tap_type === 'dvojkohout' ? '2K' : t.tap_type === 'trojkohout' ? '3K' : '6K'}
                        </span>
                      </div>
                      {!available && <span className="text-[11px] font-bold text-rose-600"><XCircle className="ikona-text" /> Rezervováno</span>}
                      {isSelected && <span className="text-amber-600 font-black text-sm"><Check size={14} /></span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datum OD / DO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Datum OD</label>
              <input
                type="date"
                required
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input font-mono font-bold text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Datum DO</label>
              <input
                type="date"
                required
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input font-mono font-bold text-xs"
              />
            </div>
          </div>

          {/* Odběratel */}
          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Odběratel / Zákazník</label>
            <input
              type="text"
              required
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="input font-bold text-xs"
              placeholder="Jméno odběratele"
            />
          </div>

          {/* Poznámka */}
          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka k rezervaci</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input text-xs"
              placeholder="Volitelné"
            />
          </div>
        </div>

        {err && (
          <div className="text-sm text-rose-600 bg-rose-500/10 rounded px-3 py-2 font-bold">{err}</div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button
            onClick={onSkip}
            className="px-4 py-2.5 rounded bg-neutral-100 hover:bg-neutral-200 font-bold text-xs transition"
          >
            Přeskočit (nerezervovat)
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
          >
            <CheckCircle2 className="ikona-text" /> Zarezervovat výčep
          </button>
        </div>
      </div>
    </div>
  );
}
