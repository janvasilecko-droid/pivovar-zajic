import { useState } from 'react';
import { Package, Calendar, CheckCircle2, AlertCircle, Plus, Search, User, Truck, Shield } from 'lucide-react';
import { potvrd } from '../lib/toast';

type EquipmentItem = {
  id: string;
  name: string;
  category: 'chlazeni' | 'vycepni_stojan' | 'stan' | 'pivni_sety' | 'narážeč';
  serialCode: string;
  status: 'available' | 'borrowed' | 'maintenance';
  borrowerName?: string;
  borrowerPhone?: string;
  eventName?: string;
  borrowedAt?: string;
  expectedReturnAt?: string;
  depositKic?: number;
};

const DEFAULT_EQUIPMENT: EquipmentItem[] = [
  {
    id: 'eq_1',
    name: 'Přenosný výčepní chladič Lindr Pygmy 25/K (S kompresorem)',
    category: 'chlazeni',
    serialCode: 'CHL-2025-01',
    status: 'borrowed',
    borrowerName: 'Pivním festival Slavkov (Pavel Novák)',
    borrowerPhone: '+420 777 123 456',
    eventName: 'Slavkovské Pivní Slavnosti',
    borrowedAt: '2026-07-25',
    expectedReturnAt: '2026-07-28',
    depositKic: 5000,
  },
  {
    id: 'eq_2',
    name: 'Pivovar Zajíc Nůžkový stánkový stan 3x3m (S logem)',
    category: 'stan',
    serialCode: 'STAN-01',
    status: 'borrowed',
    borrowerName: 'Pivním festival Slavkov (Pavel Novák)',
    borrowerPhone: '+420 777 123 456',
    eventName: 'Slavkovské Pivní Slavnosti',
    borrowedAt: '2026-07-25',
    expectedReturnAt: '2026-07-28',
    depositKic: 3000,
  },
  {
    id: 'eq_3',
    name: 'Dvoukohoutový nerezový výčepní stojan s kompenzátory',
    category: 'vycepni_stojan',
    serialCode: 'STOJ-02',
    status: 'available',
  },
  {
    id: 'eq_4',
    name: 'Sada narážečů Flach (Plochý) + Kombi + KORB (3ks)',
    category: 'narážeč',
    serialCode: 'NAR-SET-05',
    status: 'available',
  },
  {
    id: 'eq_5',
    name: 'Dřevěné pivní sety (Lavice + Stůl pro 8 osob, 5 sad)',
    category: 'pivni_sety',
    serialCode: 'SETY-5SAD',
    status: 'available',
  },
];

export function FestivalEquipmentTracker() {
  const [items, setItems] = useState<EquipmentItem[]>(DEFAULT_EQUIPMENT);
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

  function addItem() {
    if (!name.trim()) return;
    const newItem: EquipmentItem = {
      id: `eq_${Date.now()}`,
      name,
      category,
      serialCode: serialCode || `EQ-${Math.floor(Math.random() * 9000 + 1000)}`,
      status: 'available',
    };
    setItems((prev) => [newItem, ...prev]);
    setName('');
    setSerialCode('');
    setShowAddModal(false);
  }

  function confirmLoan() {
    if (!loaningItem || !borrowerName.trim()) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === loaningItem.id
          ? {
              ...item,
              status: 'borrowed',
              borrowerName,
              borrowerPhone,
              eventName,
              borrowedAt: new Date().toISOString().split('T')[0],
              expectedReturnAt: expectedReturnAt || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
              depositKic: Number(depositKic) || 0,
            }
          : item
      )
    );
    setLoaningItem(null);
  }

  async function returnItem(id: string) {
    if (!(await potvrd('Potvrdit vrácení festivalového vybavení z akce zpět na sklad?'))) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'available',
              borrowerName: undefined,
              borrowerPhone: undefined,
              eventName: undefined,
              borrowedAt: undefined,
              expectedReturnAt: undefined,
              depositKic: undefined,
            }
          : item
      )
    );
  }

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.serialCode.toLowerCase().includes(query.toLowerCase()) ||
      (i.borrowerName && i.borrowerName.toLowerCase().includes(query.toLowerCase())) ||
      (i.eventName && i.eventName.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-amber-950 via-neutral-900 to-neutral-950 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
              🎪
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-md border border-neutral-200">
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
                  {item.status === 'available' ? '✅ Na skladě' : '🎪 Zapůjčeno'}
                </span>
              </div>

              {item.status === 'borrowed' && (
                <div className="p-3 rounded bg-amber-50 border border-amber-200 mt-3 space-y-1.5 text-xs font-medium text-neutral-800">
                  <div className="font-black text-amber-950 flex items-center gap-1.5 border-b border-amber-200/60 pb-1">
                    <Truck size={14} className="text-amber-600" />
                    <span>Akce: {item.eventName ?? '—'}</span>
                  </div>
                  <div>👤 Pořadatel: <strong>{item.borrowerName}</strong></div>
                  <div>📞 Telefon: <strong>{item.borrowerPhone}</strong></div>
                  <div>📅 Datum vracení: <strong className="text-rose-600">{item.expectedReturnAt}</strong></div>
                  {item.depositKic !== undefined && (
                    <div>💰 Vratná kauce: <strong className="text-emerald-700">{item.depositKic.toLocaleString('cs-CZ')} Kč</strong></div>
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
                  <span>📋 Zapůjčit na festival / akci</span>
                </button>
              ) : (
                <button
                  onClick={() => returnItem(item.id)}
                  className="btn-primary !rounded text-xs font-black py-2 px-4 shadow-2xs flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>📥 Vracení na sklad</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Loan Modal */}
      {loaningItem && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
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
                    type="number"
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
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
                  <option value="chlazeni">🍺 Chlazení & Výčep</option>
                  <option value="stan">⛺ Stánky & Stany</option>
                  <option value="vycepni_stojan">🚰 Výčepní stojany</option>
                  <option value="narážeč">🛢️ Narážeče</option>
                  <option value="pivni_sety">🪑 Pivní sety (Lavice & Stoly)</option>
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
