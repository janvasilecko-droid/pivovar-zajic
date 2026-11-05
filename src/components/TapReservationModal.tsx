import { AlertTriangle, Check, CheckCircle2, X, XCircle } from 'lucide-react';
import { useState, useEffect, type ReactNode } from 'react';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';
import { jeVycepVolny, type TapTypeHint } from '../lib/tapReservations';
import { nactiRezervace, nactiVycepy, ulozRezervaci } from '../lib/vycepyData';
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
  /** Called when reservation is confirmed — až když je rezervace uložená v databázi */
  onConfirm: (reservation: TapReservation) => void;
  /** Called when user cancels / closes without reserving */
  onSkip: () => void;
};

/**
 * Který výčep se předvybere: ten, který k objednávce už rezervovaný je; jinak
 * volný požadovaného typu; jinak první volný. Nic volného → nic (obsluha změní
 * termín) — dřív se předvybral obsazený a až potvrzení vyhlásilo chybu.
 */
function predvybranyVycep(
  taps: TapEquipment[], reservations: TapReservation[], moje: TapReservation | undefined,
  od: string, doDne: string, hint: TapTypeHint | undefined,
): string {
  if (moje && taps.some((t) => t.id === moje.tap_id)) return moje.tap_id;
  const volny = (t: TapEquipment) => jeVycepVolny(t.id, od, doDne, reservations, moje?.id);
  const shoda = hint ? taps.find((t) => t.tap_type === hint && volny(t)) : undefined;
  return (shoda ?? taps.find(volny))?.id ?? '';
}

function Obal({ titulek, sirsi, onSkip, children }: { titulek: ReactNode; sirsi?: boolean; onSkip: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded ${sirsi ? 'max-w-lg' : 'max-w-md'} w-full p-6 space-y-4 shadow-2xl border border-neutral-200`}>
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">{titulek}</h3>
          <button onClick={onSkip} className="text-neutral-400 font-bold" title="Zavřít" aria-label="Zavřít"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TapReservationModal({ orderDate, customerName, orderId, tapTypeHint, onConfirm, onSkip }: Props) {
  // Výčepy a rezervace se čtou z DATABÁZE (datová vrstva se při výpadku signálu
  // sama vrátí k poslední kopii). Dřív okno četlo jen kopii v prohlížeči a bez ní
  // nabídlo čtyři vymyšlené výčepy, které databáze nezná.
  const [stav, setStav] = useState<'nacitam' | 'ok' | 'chyba'>('nacitam');
  const [taps, setTaps] = useState<TapEquipment[]>([]);
  const [reservations, setReservations] = useState<TapReservation[]>([]);
  const [selectedTapId, setSelectedTapId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState(orderDate);
  const [dateTo, setDateTo] = useState(orderDate);
  const [customer, setCustomer] = useState(customerName);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Jednou při otevření. Termín, objednávka ani typ se za otevřeného okna
  // nemění; kdyby se načítalo znovu, přepsalo by to, co obsluha už vyplnila.
  useEffect(() => {
    let zruseno = false;
    void (async () => {
      try {
        const [v, r] = await Promise.all([nactiVycepy(), nactiRezervace()]);
        if (zruseno) return;
        // Objednávka už rezervaci má (uložila se dřív, třeba automaticky): okno ji
        // upravuje, nezakládá druhou.
        const moje = orderId ? r.find((x) => x.order_id === orderId) : undefined;
        const od = moje?.date_from ?? orderDate;
        const doDne = moje?.date_to ?? orderDate;
        setTaps(v);
        setReservations(r);
        setDateFrom(od);
        setDateTo(doDne);
        if (moje?.note) setNote(moje.note);
        setSelectedTapId(predvybranyVycep(v, r, moje, od, doDne, tapTypeHint));
        setStav('ok');
      } catch (e) {
        console.warn('Rezervace výčepu: načtení selhalo', e);
        if (!zruseno) setStav('chyba');
      }
    })();
    return () => { zruseno = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vlastní rezervace téhle objednávky se do obsazenosti nepočítá — jinak by její
  // výčep vypadal jako „Rezervováno“ a šel by jen přesunout jinam.
  const moje = orderId ? reservations.find((r) => r.order_id === orderId) : undefined;
  const jeVolny = (t: TapEquipment) => jeVycepVolny(t.id, dateFrom, dateTo, reservations, moje?.id);

  async function handleConfirm() {
    setErr(null);
    if (!selectedTapId) { setErr('Vyberte výčep.'); return; }
    if (!customer.trim()) { setErr('Zadejte odběratele.'); return; }
    if (dateTo < dateFrom) { setErr('Konec rezervace nesmí být před začátkem.'); return; }

    setSaving(true);
    try {
      // Okno mohlo být otevřené dlouho a výčep mezitím zamluvil někdo na jiném
      // zařízení — těsně před zápisem se proto čte znovu.
      const cerstve = await nactiRezervace();
      const mojeCerstva = orderId ? cerstve.find((r) => r.order_id === orderId) : undefined;
      if (!jeVycepVolny(selectedTapId, dateFrom, dateTo, cerstve, mojeCerstva?.id)) {
        setReservations(cerstve);
        setErr('Tento výčep je v tomto termínu již zarezervovaný!');
        return;
      }

      const tap = taps.find((t) => t.id === selectedTapId);
      // Existující rezervaci objednávky přepisuji, ne zakládám druhou (unikátní
      // index na order_id by ji odmítl) — a telefon, kauce i stav vrácení zůstanou.
      const reservation: TapReservation = {
        ...(mojeCerstva ?? {}),
        id: mojeCerstva?.id ?? crypto.randomUUID(),
        tap_id: selectedTapId,
        tap_name: tap?.name ?? 'Výčep',
        date_from: dateFrom,
        date_to: dateTo,
        customer_name: customer.trim(),
        note: note.trim() || `Automaticky z objednávky${orderId ? ` #${orderId.slice(0, 8)}` : ''}`,
        order_id: orderId,
      };

      const chyba = await ulozRezervaci(reservation);
      if (chyba) {
        setErr('Rezervaci se nepodařilo uložit: ' + chyba);
        return;
      }
      onConfirm(reservation);
    } catch (e) {
      setErr('Rezervaci se nepodařilo uložit: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (stav === 'nacitam') {
    return (
      <Obal titulek={<><IkonaVycep className="ikona-text" /> Rezervace výčepu</>} onSkip={onSkip}>
        <p className="text-sm text-neutral-600" role="status">Načítám výčepy…</p>
      </Obal>
    );
  }

  // Nepodařilo se načíst NEBO nic není založené — dvě různé věci, jedno okno se
  // zavíracím tlačítkem. „Žádné výčepy“ se nesmí tvrdit, když se jen nenačetly.
  if (stav === 'chyba' || taps.length === 0) {
    return (
      <Obal titulek={<><IkonaVycep className="ikona-text" /> Rezervace výčepu</>} onSkip={onSkip}>
        {stav === 'chyba'
          ? <p className="text-sm text-rose-700 font-bold" role="alert">Výčepy se nepodařilo načíst. Zkuste to za chvíli znovu.</p>
          : <p className="text-sm text-neutral-600">Nemáte vytvořené žádné výčepy. Nejprve je přidejte v sekci Výčepy.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onSkip} className="px-4 py-2 rounded bg-neutral-100 font-bold text-xs">Zavřít</button>
        </div>
      </Obal>
    );
  }

  const volnych = taps.filter(jeVolny).length;

  return (
    <Obal
      sirsi
      onSkip={onSkip}
      titulek={<>
        <span><IkonaVycep className="ikona-text" /></span>
        <span>Rezervace výčepu k objednávce</span>
      </>}
    >
      <p className="text-xs text-neutral-500 font-medium">
        V poznámce objednávky jste zmínil výčep. Vyberte zařízení a potvrďte rezervaci.
      </p>

      <div className="space-y-3">
        {/* Výběr výčepu */}
        <div>
          <label className="block text-xs font-black text-neutral-700 mb-1.5">Vyberte výčepní zařízení</label>
          {volnych === 0 ? (
            <div className="mb-2 px-3 py-2 rounded bg-rose-50 border border-rose-200 text-udaj font-bold text-rose-800">
              <AlertTriangle className="ikona-text" /> Všechny výčepy jsou v tomto termínu rezervované — změňte termín.
            </div>
          ) : volnych < taps.length && (
            <div className="mb-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-udaj font-bold text-amber-800">
              <AlertTriangle className="ikona-text" /> Některé výčepy jsou v tomto termínu rezervované — ostatní jsou k dispozici.
            </div>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {taps.map((t) => {
              const available = jeVolny(t);
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
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-neutral-900 text-amber-300 font-extrabold text-udaj uppercase">
                        {t.tap_type === 'jednokohout' ? '1K' : t.tap_type === 'dvojkohout' ? '2K' : t.tap_type === 'trojkohout' ? '3K' : '6K'}
                      </span>
                    </div>
                    {!available && <span className="text-udaj font-bold text-rose-600"><XCircle className="ikona-text" /> Rezervováno</span>}
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
        <div className="text-sm text-rose-700 bg-rose-500/10 rounded px-3 py-2 font-bold" role="alert">{err}</div>
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
          disabled={saving}
          className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
        >
          <CheckCircle2 className="ikona-text" /> {saving ? 'Ukládám…' : 'Zarezervovat výčep'}
        </button>
      </div>
    </Obal>
  );
}
