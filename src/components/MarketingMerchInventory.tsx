import { useState } from 'react';
import { AlertTriangle, Box, Plus, Search, ShoppingBag, Tag } from 'lucide-react';

type MerchItem = {
  id: string;
  name: string;
  category: 'sklo' | 'tacky' | 'obleceni' | 'reklama' | 'doplnky';
  stockQty: number;
  minAlertQty: number;
  unitCostKic: number;
  sellPriceKic?: number;
};

const DEFAULT_MERCH: MerchItem[] = [
  { id: 'm1', name: 'Zajíc Značkové sklo 0.5L (Cejchovaný cejch)', category: 'sklo', stockQty: 240, minAlertQty: 50, unitCostKic: 45, sellPriceKic: 95 },
  { id: 'm2', name: 'Zajíc Značkové sklo 0.3L', category: 'sklo', stockQty: 180, minAlertQty: 40, unitCostKic: 38, sellPriceKic: 85 },
  { id: 'm3', name: 'Papírové pivní tácky Zajíc (Karton 1000ks)', category: 'tacky', stockQty: 12, minAlertQty: 3, unitCostKic: 450, sellPriceKic: 0 },
  { id: 'm4', name: 'Pivovarské tričko Zajíc (Černé L/XL)', category: 'obleceni', stockQty: 28, minAlertQty: 10, unitCostKic: 180, sellPriceKic: 390 },
  { id: 'm5', name: 'Kovový otvírák na lahve Zajíc (S magnetem)', category: 'doplnky', stockQty: 150, minAlertQty: 30, unitCostKic: 22, sellPriceKic: 59 },
  { id: 'm6', name: 'Plechová reklamní cedule 40x30cm', category: 'reklama', stockQty: 8, minAlertQty: 5, unitCostKic: 150, sellPriceKic: 350 },
];

export function MarketingMerchInventory() {
  const [items, setItems] = useState<MerchItem[]>(DEFAULT_MERCH);
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MerchItem['category']>('sklo');
  const [stockQty, setStockQty] = useState('50');
  const [unitCostKic, setUnitCostKic] = useState('40');
  const [sellPriceKic, setSellPriceKic] = useState('90');

  function updateQty(id: string, delta: number) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, stockQty: Math.max(0, i.stockQty + delta) } : i))
    );
  }

  function addMerch() {
    if (!name.trim()) return;
    const newItem: MerchItem = {
      id: `m_${Date.now()}`,
      name,
      category,
      stockQty: Number(stockQty) || 0,
      minAlertQty: 10,
      unitCostKic: Number(unitCostKic) || 0,
      sellPriceKic: Number(sellPriceKic) || 0,
    };
    setItems((prev) => [newItem, ...prev]);
    setShowAddModal(false);
    setName('');
  }

  const filtered = items.filter(
    (i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.category.includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-amber-950 via-neutral-900 to-neutral-950 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
              🛍️
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-amber-400">
                Evidence marketingových materiálů & Merche
              </h3>
              <p className="text-xs text-neutral-300 font-medium">
                Sklad značkového skla, tácků, reklamních cedulí, otvíráků, triček a POS materiálů pro hospody.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-amber !rounded text-xs font-black px-4 py-2.5 shadow-md flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Přidat merch / sklo</span>
          </button>
        </div>

        <div className="relative pt-1">
          <Search className="absolute left-3.5 top-4 text-neutral-400" size={18} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 rounded bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-400 text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            placeholder="Hledat sklo, tácky, otvíráky, oblečení…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className="card p-5 bg-white border border-neutral-200 rounded space-y-3 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-2">
                <span className="text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-950 px-2.5 py-0.5 rounded-full border border-amber-200">
                  {item.category === 'sklo' ? '🍺 Sklo' : item.category === 'tacky' ? '📦 Tácky' : item.category === 'obleceni' ? '👕 Oblečení' : '🏷️ Merch'}
                </span>
                {item.stockQty <= item.minAlertQty && (
                  <span className="chip bg-rose-100 text-rose-950 font-black border border-rose-300 text-[11px]">
                    <AlertTriangle className="ikona-text" /> Dochází
                  </span>
                )}
              </div>

              <h4 className="font-display font-black text-base text-neutral-900 mt-2">{item.name}</h4>

              <div className="p-3 rounded bg-neutral-50 border border-neutral-200 mt-3 space-y-1 text-xs text-neutral-800 font-medium">
                <div>Nákupní cena: <strong>{item.unitCostKic} Kč/ks</strong></div>
                {item.sellPriceKic ? <div>Prodejní cena: <strong className="text-emerald-700">{item.sellPriceKic} Kč/ks</strong></div> : null}
                <div className="text-base font-display font-black text-neutral-950 mt-1">
                  Skladem: <span className="text-amber-600">{item.stockQty} ks</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-400">Rychlá úprava:</span>
              <div className="flex gap-1">
                <button onClick={() => updateQty(item.id, -5)} className="px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-black text-xs">
                  -5
                </button>
                <button onClick={() => updateQty(item.id, -1)} className="px-2.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-black text-xs">
                  -1
                </button>
                <button onClick={() => updateQty(item.id, 1)} className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs">
                  +1
                </button>
                <button onClick={() => updateQty(item.id, 10)} className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs">
                  +10
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">+ Nová položka merche / skla</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Název položky</label>
                <input type="text" className="input font-bold text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sklo 0.5L / Tácky" />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Kategorie</label>
                <select className="input font-bold text-sm" value={category} onChange={(e) => setCategory(e.target.value as any)}>
                  <option value="sklo">🍺 Značkové sklo</option>
                  <option value="tacky">📦 Pivní tácky</option>
                  <option value="obleceni">👕 Oblečení & Trička</option>
                  <option value="doplnky">🔑 Otvíráky & Doplňky</option>
                  <option value="reklama">🖼️ Reklamní cedule</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Počáteční ks</label>
                  <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} className="input font-bold text-sm" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Nákup (Kč)</label>
                  <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} className="input font-bold text-sm" value={unitCostKic} onChange={(e) => setUnitCostKic(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Prodej (Kč)</label>
                  <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} className="input font-bold text-sm" value={sellPriceKic} onChange={(e) => setSellPriceKic(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setShowAddModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button onClick={addMerch} disabled={!name.trim()} className="btn-amber !rounded text-xs font-black px-5 py-2.5">
                Uložit merch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
