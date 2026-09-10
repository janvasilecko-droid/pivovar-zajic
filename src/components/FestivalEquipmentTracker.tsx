import { useEffect, useState } from 'react';
import { Calendar, ClipboardList, DollarSign, Download, CheckCircle2, Phone, Plus, Search, Tent, Truck, User } from 'lucide-react';
import { potvrd, chyba } from '../lib/toast';
import { supabase, useRealtime } from '../lib/supabase';
import { Kostra } from './ui';

type EquipmentItem = {
  id: string;
  name: string;
  category: 'chlazeni' | 'vycepni_stojan' | 'stan' | 'pivni_sety' | 'narážeč';
  serialCode: string;
  status: 'available' | 'borrowed' | 'maintenance';
  borrowerName?: string | null;
  borrowerPhone?: string | null;
  eventName?: string | null;
  borrowedAt?: string | null;
  expectedReturnAt?: string | null;
  depositKic?: number | null;
};

function zRadku(r: any): EquipmentItem {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    serialCode: r.serial_code ?? '',
    status: r.status,
    borrowerName: r.borrower_name,
    borrowerPhone: r.borrower_phone,
    eventName: r.event_name,
    borrowedAt: r.borrowed_at,
    expectedReturnAt: r.expected_return_at,
    depositKic: r.deposit_kic != null ? Number(r.deposit_kic) : null,
  };
}

export function FestivalEquipmentTracker() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [category, setCategory] = useState<EquipmentItem['category']>('chlazeni');
  const [serialCode, setSerialCode] = useState('');

  // Loan Modal
  const [loaningItem, setLoaningItem] = useState<EquipmentItem | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPhone, setBorrowerPhone] = useState('');
  const [eventName, setEventName] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [depositKic, setDepositKic] = useState('2000');

  // Vracení — aktivní řádek půjčky (festival_equipment_loans.id), abychom
  // u vrácení mohli zvlášť zaškrtnout "kauce vrácena".
  const [returningItem, setReturningItem] = useState<EquipmentItem | null>(null);
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [depositReturned, setDepositReturned] = useState(true);

  async function load() {
    const { data, error } = await supabase.from('festival_equipment').select('*').order('name');
    if (!error) setItems(((data as any[]) ?? []).map(zRadku));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['festival_equipment'], load);

  async function addItem() {
    if (!name.trim()) return;
    try {
      const { error } = await supabase.from('festival_equipment').insert({
        name: name.trim(),
        category,
        serial_code: serialCode || `EQ-${Math.floor(Math.random() * 9000 + 1000)}`,
        status: 'available',
      });
      if (error) throw error;
      setName('');
      setSerialCode('');
      setShowAddModal(false);
      void load();
    } catch (e) {
      chyba(e);
    }
  }

  async function confirmLoan() {
    if (!loaningItem || !borrowerName.trim()) return;
    const borrowedAt = new Date().toISOString().split('T')[0];
    const returnAt = expectedReturnAt || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
    const deposit = Number(depositKic) || 0;
    try {
      const { error: e1 } = await supabase.from('festival_equipment').update({
        status: 'borrowed',
        borrower_name: borrowerName.trim(),
        borrower_phone: borrowerPhone.trim() || null,
        event_name: eventName.trim() || null,
        borrowed_at: borrowedAt,
        expected_return_at: returnAt,
        deposit_kic: deposit,
        updated_at: new Date().toISOString(),
      }).eq('id', loaningItem.id);
      if (e1) throw e1;
      // Trvalý záznam půjčky — zůstane i po vrácení, na rozdíl od stavu
      // na festival_equipment, který se přepíše zpátky na "available".
      const { error: e2 } = await supabase.from('festival_equipment_loans').insert({
        equipment_id: loaningItem.id,
        borrower_name: borrowerName.trim(),
        borrower_phone: borrowerPhone.trim() || null,
        event_name: eventName.trim() || null,
        borrowed_at: borrowedAt,
        expected_return_at: returnAt,
        deposit_kic: deposit,
      });
      if (e2) throw e2;
      setLoaningItem(null);
      void load();
    } catch (e) {
      chyba(e);
    }
  }

  function openReturn(item: EquipmentItem) {
    setReturningItem(item);
    setDepositReturned(true);
    setActiveLoanId(null);
    // Najdi otevřenou (nevrácenou) půjčku k téhle položce, ať se dá
    // označit "kauce vrácena" u správného řádku historie.
    void supabase.from('festival_equipment_loans')
      .select('id')
      .eq('equipment_id', item.id)
      .is('returned_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setActiveLoanId((data as any)?.id ?? null));
  }

  async function confirmReturn() {
    if (!returningItem) return;
    if (!(await potvrd('Potvrdit vrácení festivalového vybavení z akce zpět na sklad?'))) return;
    try {
      const { error: e1 } = await supabase.from('festival_equipment').update({
        status: 'available',
        borrower_name: null,
        borrower_phone: null,
        event_name: null,
        borrowed_at: null,
        expected_return_at: null,
        deposit_kic: null,
        updated_at: new Date().toISOString(),
      }).eq('id', returningItem.id);
      if (e1) throw e1;
      if (activeLoanId) {
        const { error: e2 } = await supabase.from('festival_equipment_loans').update({
          returned_at: new Date().toISOString().split('T')[0],
          deposit_returned: depositReturned,
        }).eq('id', activeLoanId);
        if (e2) throw e2;
      }
      setReturningItem(null);
      void load();
    } catch (e) {
      chyba(e);
    }
  }

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.serialCode.toLowerCase().includes(query.toLowerCase()) ||
      (i.borrowerName && i.borrowerName.toLowerCase().includes(query.toLowerCase())) ||
      (i.eventName && i.eventName.toLowerCase().includes(query.toLowerCase()))
  );

  if (loading) return <Kostra />;

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-amber-950 via-neutral-900 to-neutral-950 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
              <Tent className="ikona-text" />
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-amber-400">
                Správa a zapůjčování festivalového vybavení
              </h3>
              <p className="text-xs text-neutral-300 font-medium">
                Evidence přenosných chlaďáků, párty stanů, výčepních stojanů, narážečů a pivních setů zapůjčených na akce.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-amber !rounded text-xs font-black px-4 py-2.5 shadow-md flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Přidat vybavení</span>
          </button>
        </div>

        <div className="relative pt-1">
          <Search className="absolute left-3.5 top-4 text-neutral-400" size={18} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 rounded bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-400 text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            placeholder="Hledat podle názevu, sériového čísla, festivalu nebo pořadatele…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Equipment List */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          {items.length === 0 ? 'Zatím žádné festivalové vybavení — přidej první tlačítkem nahoře.' : 'Nic nenalezeno.'}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <span className="text-udaj font-black uppercase tracking-wider bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-md border border-neutral-200">
                    Kód: {item.serialCode}
                  </span>
                  <h4 className="font-display font-black text-base text-neutral-900 mt-1">{item.name}</h4>
                </div>

                <span
                  className={`chip shrink-0 ${
                    item.status === 'available'
                      ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 font-extrabold'
                      : 'bg-amber-100 text-amber-950 border border-amber-300 font-extrabold'
                  }`}
                >
                  {item.status === 'available' ? 'Na skladě' : 'Zapůjčeno'}
                </span>
              </div>

              {item.status === 'borrowed' && (
                <div className="p-3 rounded bg-amber-50 border border-amber-200 mt-3 space-y-1.5 text-xs font-medium text-neutral-800">
                  <div className="font-black text-amber-950 flex items-center gap-1.5 border-b border-amber-200/60 pb-1">
                    <Truck size={14} className="text-amber-600" />
                    <span>Akce: {item.eventName ?? '—'}</span>
                  </div>
                  <div><User className="ikona-text" /> Pořadatel: <strong>{item.borrowerName}</strong></div>
                  <div><Phone className="ikona-text" /> Telefon: <strong>{item.borrowerPhone}</strong></div>
                  <div><Calendar className="ikona-text" /> Datum vracení: <strong className="text-rose-600">{item.expectedReturnAt}</strong></div>
                  {item.depositKic != null && (
                    <div><DollarSign className="ikona-text" /> Vratná kauce: <strong className="text-emerald-700">{item.depositKic.toLocaleString('cs-CZ')} Kč</strong></div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-end gap-2">
              {item.status === 'available' ? (
                <button
                  onClick={() => {
                    setLoaningItem(item);
                    setBorrowerName('');
                    setBorrowerPhone('');
                    setEventName('');
                  }}
                  className="btn-amber !rounded text-xs font-black py-2 px-4 shadow-2xs flex items-center gap-1.5"
                >
                  <span><ClipboardList className="ikona-text" /> Zapůjčit na festival / akci</span>
                </button>
              ) : (
                <button
                  onClick={() => openReturn(item)}
                  className="btn-primary !rounded text-xs font-black py-2 px-4 shadow-2xs flex items-center gap-1.5"
                >
                  <CheckCircle2 size={16} />
                  <span><Download className="ikona-text" /> Vracení na sklad</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Loan Modal */}
      {loaningItem && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">
                Vydání vybavení na akci
              </h3>
              <p className="text-xs text-neutral-500 font-bold mt-0.5">{loaningItem.name} ({loaningItem.serialCode})</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Název festivalu / akce</label>
                <input
                  type="text"
                  className="input font-bold text-sm"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="Slavkovské Pivní Slavnosti"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Pořadatel / Půjčitel (Jméno a Příjmení)</label>
                <input
                  type="text"
                  className="input font-bold text-sm"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  placeholder="Pavel Novák"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Telefonní kontakt</label>
                <input
                  type="text"
                  className="input font-bold text-sm"
                  value={borrowerPhone}
                  onChange={(e) => setBorrowerPhone(e.target.value)}
                  placeholder="+420 777 123 456"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Předpokládané vracení</label>
                  <input
                    type="date"
                    className="input font-bold text-sm"
                    value={expectedReturnAt}
                    onChange={(e) => setExpectedReturnAt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Vratná kauce (Kč)</label>
                  <input
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                    className="input font-bold text-sm"
                    value={depositKic}
                    onChange={(e) => setDepositKic(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setLoaningItem(null)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button onClick={confirmLoan} disabled={!borrowerName.trim()} className="btn-amber !rounded text-xs font-black px-5 py-2.5">
                Potvrdit zapůjčení
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Modal — s krokem "kauce vrácena" */}
      {returningItem && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Vrácení vybavení na sklad</h3>
              <p className="text-xs text-neutral-500 font-bold mt-0.5">{returningItem.name} ({returningItem.serialCode})</p>
            </div>

            {returningItem.depositKic != null && (
              <label className="flex items-start gap-2 text-sm font-bold text-neutral-800 cursor-pointer rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={depositReturned}
                  onChange={(e) => setDepositReturned(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 mt-0.5 shrink-0"
                />
                <span>
                  Kauce {returningItem.depositKic.toLocaleString('cs-CZ')} Kč vrácena pořadateli
                  <span className="block font-medium text-neutral-500 mt-0.5">
                    Odškrtni, pokud se kauce zatím nevrátila — zůstane to vidět v historii půjček.
                  </span>
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setReturningItem(null)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button onClick={confirmReturn} className="btn-primary !rounded text-xs font-black px-5 py-2.5">
                Potvrdit vrácení
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">+ Nové festivalové vybavení</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Název zařízeni / stánku</label>
                <input type="text" className="input font-bold text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lindr Pygmy 25/K" />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Evidenční / Sériové číslo</label>
                <input type="text" className="input font-bold text-sm" value={serialCode} onChange={(e) => setSerialCode(e.target.value)} placeholder="CHL-2026-05" />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Kategorie</label>
                <select className="input font-bold text-sm" value={category} onChange={(e) => setCategory(e.target.value as any)}>
                  <option value="chlazeni">Chlazení & Výčep</option>
                  <option value="stan">Stánky & Stany</option>
                  <option value="vycepni_stojan">Výčepní stojany</option>
                  <option value="narážeč">Narážeče</option>
                  <option value="pivni_sety">Pivní sety (Lavice & Stoly)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setShowAddModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button onClick={addItem} disabled={!name.trim()} className="btn-amber !rounded text-xs font-black px-5 py-2.5">
                Uložit vybavení
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
