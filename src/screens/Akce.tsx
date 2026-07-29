import { useEffect, useState, useMemo } from 'react';
import { supabase, Beer, Package, useRealtime, beerBg, beerText, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { Plus, Trash2, Check, Calendar, Sparkles, Star, DollarSign, CheckCircle2, RotateCcw, User, MapPin } from 'lucide-react';

export type AkceItem = {
  id?: string;
  beer_id: string;
  beer_name?: string;
  package_id: string;
  package_label?: string;
  quantity_taken: number;     // Odvezeno na akci (ks)
  quantity_returned: number;  // Neprodáno / vráceno do skladu po akci (ks)
};

export type AkceRecord = {
  id: string;
  name: string;             // Název akce
  who: string;              // Kdo tam jede
  entry_date: string;       // Datum akce
  status: 'planned' | 'completed'; // Plánovaná vs Po akci (Dokončená)
  items: AkceItem[];        // Max 7 řádků piv a obalů
  revenue?: number;         // Tržba v Kč
  rating?: number;          // Hodnocení 1-5 hvězd
  note?: string;            // Poznámka o akci
  created_at?: string;
};

const MAX_ITEMS = 7;
type FormRow = { beer_id: string; package_id: string; qty: string };

export default function AkceScreen() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [records, setRecords] = useState<AkceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('akce_records_v2');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  // New Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [who, setWho] = useState('Petr Bednář & Tým');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [itemRows, setItemRows] = useState<FormRow[]>(() =>
    Array.from({ length: MAX_ITEMS }, () => ({ beer_id: '', package_id: '', qty: '' }))
  );

  // Evaluation "Po akci" Modal State
  const [evalRecord, setEvalRecord] = useState<AkceRecord | null>(null);
  const [evalReturnedMap, setEvalReturnedMap] = useState<Record<number, string>>({});
  const [evalRevenue, setEvalRevenue] = useState<string>('');
  const [evalRating, setEvalRating] = useState<number>(5);
  const [evalNote, setEvalNote] = useState<string>('');

  async function loadData() {
    setLoading(true);
    const [{ data: b }, { data: pk }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setBeers((b as Beer[]) ?? []);
    setPackages((pk as Package[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  useRealtime(['beers', 'packages'], loadData);

  function saveRecords(newRecords: AkceRecord[]) {
    setRecords(newRecords);
    localStorage.setItem('akce_records_v2', JSON.stringify(newRecords));
  }

  // Sorted packages: Bottles first, KEGs second
  const sortedPackages = useMemo(() => {
    return [...packages].sort((a, b) => {
      const isAKeg = a.kind === 'keg' || (a.label ?? '').toLowerCase().includes('keg') || (a.label ?? '').toLowerCase().includes('sud');
      const isBKeg = b.kind === 'keg' || (b.label ?? '').toLowerCase().includes('keg') || (b.label ?? '').toLowerCase().includes('sud');
      if (!isAKeg && isBKeg) return -1;
      if (isAKeg && !isBKeg) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [packages]);

  function handleRowChange(index: number, field: keyof FormRow, val: string) {
    setItemRows((rows) => rows.map((r, i) => i === index ? { ...r, [field]: val } : r));
  }

  function handleCreateAkce(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert('Zadejte název akce.');
      return;
    }

    const validItems: AkceItem[] = itemRows
      .filter((r) => r.beer_id && r.package_id && Number(r.qty) > 0)
      .map((r) => {
        const b = beers.find((x) => x.id === r.beer_id);
        const p = packages.find((x) => x.id === r.package_id);
        return {
          beer_id: r.beer_id,
          beer_name: b?.name,
          package_id: r.package_id,
          package_label: p?.label,
          quantity_taken: Number(r.qty),
          quantity_returned: 0,
        };
      });

    if (!validItems.length) {
      alert('Vyberte alespoň jedno pivo, obal a počet kusů.');
      return;
    }

    const newRecord: AkceRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      who: who.trim(),
      entry_date: entryDate,
      status: 'planned',
      items: validItems,
    };

    saveRecords([newRecord, ...records]);
    setShowAddModal(false);
    setName('');
    setItemRows(Array.from({ length: MAX_ITEMS }, () => ({ beer_id: '', package_id: '', qty: '' })));
    alert(`✅ Akce "${newRecord.name}" byla úspěšně uložena s ${validItems.length} položkami!`);
  }

  // Open "Po akci" modal
  function openEvalModal(rec: AkceRecord) {
    setEvalRecord(rec);
    const initialMap: Record<number, string> = {};
    rec.items.forEach((it, idx) => {
      initialMap[idx] = String(it.quantity_returned ?? 0);
    });
    setEvalReturnedMap(initialMap);
    setEvalRevenue(rec.revenue ? String(rec.revenue) : '');
    setEvalRating(rec.rating ?? 5);
    setEvalNote(rec.note ?? '');
  }

  // Save "Po akci" evaluation
  function handleSaveEval(e: React.FormEvent) {
    e.preventDefault();
    if (!evalRecord) return;

    const updatedItems = evalRecord.items.map((it, idx) => {
      const retQty = Math.min(it.quantity_taken, Math.max(0, Number(evalReturnedMap[idx]) || 0));
      return { ...it, quantity_returned: retQty };
    });

    const revNum = evalRevenue ? Number(evalRevenue) : undefined;

    const updatedRec: AkceRecord = {
      ...evalRecord,
      status: 'completed',
      items: updatedItems,
      revenue: revNum,
      rating: evalRating,
      note: evalNote.trim() || undefined,
    };

    const nextRecords = records.map((r) => r.id === updatedRec.id ? updatedRec : r);
    saveRecords(nextRecords);
    setEvalRecord(null);
    alert(`🎉 Vyhodnocení akce "${updatedRec.name}" uloženo! Neprodané sudy/lahve byly vráceny do skladu.`);
  }

  function handleDeleteAkce(id: string) {
    if (!confirm('Opravdu smazat tuto akci?')) return;
    saveRecords(records.filter((r) => r.id !== id));
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded-3xl border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Sparkles size={18} />
            <span>Slavnosti, Festivaly & Akce</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>🎪 Správa akcí a výjezdního prodeje</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Zadej odvezená piva na akce a po skončení klikni na "Po akci" pro vyúčtování vrácených sudů, tržby a hodnocení.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-2"
        >
          <Plus size={18} /> Naplánovat novou akci
        </button>
      </div>

      {/* Grid akcí */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
          <h3 className="font-display font-black text-lg text-neutral-900">Přehled akcí ({records.length})</h3>
        </div>

        {records.length === 0 ? (
          <EmptyState text="Zatím nemáš zadané žádné akce. Naplánuj první akci tlačítkem nahoře!" icon="🎪" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {records.map((r) => {
              const isDone = r.status === 'completed';
              const totalTaken = r.items.reduce((s, i) => s + i.quantity_taken, 0);
              const totalReturned = r.items.reduce((s, i) => s + i.quantity_returned, 0);
              const totalSold = totalTaken - totalReturned;

              return (
                <div
                  key={r.id}
                  className={`card p-5 rounded-3xl border-2 transition-all shadow-sm flex flex-col justify-between space-y-4 ${
                    isDone ? 'bg-emerald-50/50 border-emerald-300' : 'bg-white border-amber-300/80 ring-1 ring-amber-400/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-black text-lg text-neutral-950">{r.name}</span>
                          {isDone ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-xs shadow-2xs">✓ Dokončeno (Po akci)</span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs shadow-2xs">🟡 Plánovaná / Probíhá</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-600 font-bold mt-1">
                          <span className="flex items-center gap-1"><Calendar size={14} className="text-amber-600" /> {new Date(r.entry_date).toLocaleDateString('cs-CZ')}</span>
                          {r.who && <span className="flex items-center gap-1 text-neutral-800"><User size={14} className="text-amber-600" /> {r.who}</span>}
                        </div>
                      </div>

                      <button onClick={() => handleDeleteAkce(r.id)} className="text-neutral-400 hover:text-rose-600 p-1 transition" title="Smazat akci">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Items table */}
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[10px] font-black uppercase text-neutral-500">Piva a obaly (celkem {totalTaken} ks vzato):</span>
                      <div className="flex flex-wrap gap-1.5">
                        {r.items.map((it, idx) => {
                          const beerObj = beers.find((b) => b.id === it.beer_id);
                          const pkgObj = packages.find((p) => p.id === it.package_id);
                          const bBg = beerBg(beerObj) || '#fef3c7';
                          const pBg = pkgBg(pkgObj) || '#333';

                          return (
                            <div key={idx} className="px-2.5 py-1 rounded-xl bg-white border border-neutral-300 text-xs font-bold shadow-2xs flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: bBg }} />
                              <span>{it.beer_name ?? beerObj?.name ?? 'Pivo'}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black text-white" style={{ backgroundColor: pBg }}>
                                {formatPackageLabel(it.package_label ?? pkgObj?.label ?? '')}
                              </span>
                              <span className="font-mono font-black text-amber-950">{it.quantity_taken} ks</span>
                              {isDone && (
                                <span className="text-[11px] text-emerald-800 font-extrabold bg-emerald-100 px-1.5 py-0.5 rounded-md">
                                  (prodáno {it.quantity_taken - it.quantity_returned} ks / vráceno {it.quantity_returned} ks)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Results if completed */}
                    {isDone && (
                      <div className="pt-2 border-t border-emerald-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          {r.revenue != null && (
                            <span className="px-3 py-1 rounded-xl bg-emerald-700 text-white font-mono font-black text-xs shadow-xs">
                              💰 Tržba: {r.revenue.toLocaleString('cs-CZ')} Kč
                            </span>
                          )}
                          {r.rating && (
                            <div className="flex items-center gap-1 text-amber-500 font-bold bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                              <span>Hodnocení:</span>
                              {Array.from({ length: r.rating }, (_, i) => (
                                <Star key={i} size={14} className="fill-amber-400 text-amber-500" />
                              ))}
                            </div>
                          )}
                        </div>
                        {r.note && <p className="text-neutral-700 italic font-medium bg-white/80 p-2 rounded-xl border border-emerald-200">"{r.note}"</p>}
                      </div>
                    )}
                  </div>

                  {/* Actions Button */}
                  <div className="pt-2 border-t border-neutral-200 flex justify-end">
                    <button
                      onClick={() => openEvalModal(r)}
                      className={`px-4 py-2 rounded-2xl font-black text-xs transition shadow-md flex items-center gap-1.5 ${
                        isDone
                          ? 'bg-neutral-800 hover:bg-neutral-700 text-white'
                          : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 animate-bounce'
                      }`}
                    >
                      <CheckCircle2 size={16} />
                      <span>{isDone ? '✏️ Upravit vyhodnocení (Po akci)' : '🍺 PO AKCI — Vyhodnotit a vrátit neprodané'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODÁL 1: NAPLÁNOVÁNÍ NOVÉ AKCE (ZADÁNÍ 7 ŘÁDKŮ) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-neutral-200 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Sparkles className="text-amber-500 fill-current" size={20} />
                <span>Zadat novou výjezdní akci / festival</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateAkce} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-black text-neutral-700 mb-1">Název akce</label>
                  <input
                    type="text"
                    required
                    placeholder="Např. Pivní slavnosti Cheb"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Kdo tam jede</label>
                  <input
                    type="text"
                    required
                    placeholder="Např. Petr Bednář & Tým"
                    value={who}
                    onChange={(e) => setWho(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum akce</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
              </div>

              {/* 7 ŘÁDKŮ PRO ZADÁNÍ PIVA A OBALŮ */}
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <label className="block text-xs font-black uppercase text-amber-900 tracking-wider">
                  Zadání piv a obalů na akci (až 7 řádků):
                </label>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {itemRows.map((r, i) => (
                    <div key={i} className="flex flex-col sm:flex-row items-center gap-2 bg-neutral-50 p-2 rounded-2xl border border-neutral-200">
                      <span className="text-xs font-black text-neutral-500 w-6 text-center">{i + 1}.</span>

                      <select
                        className="input flex-1 !py-1 text-xs font-bold bg-white"
                        value={r.beer_id}
                        onChange={(e) => handleRowChange(i, 'beer_id', e.target.value)}
                      >
                        <option value="">— vybrat pivo —</option>
                        {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                      </select>

                      <select
                        className="input flex-1 !py-1 text-xs font-medium bg-white"
                        value={r.package_id}
                        onChange={(e) => handleRowChange(i, 'package_id', e.target.value)}
                      >
                        <option value="">— vybrat obal (lahve / keg) —</option>
                        {sortedPackages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>

                      <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto justify-end">
                        <button type="button" onClick={() => handleRowChange(i, 'qty', String(Math.max(0, (Number(r.qty) || 0) - 1)))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-neutral-200 hover:bg-amber-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="Odečíst 1">−</button>
                        <input
                          type="number"
                          min={0}
                          className="input w-16 !py-1 text-xs font-mono font-black text-center bg-white"
                          placeholder="ks"
                          value={r.qty}
                          onChange={(e) => handleRowChange(i, 'qty', e.target.value)}
                          inputMode="numeric"
                        />
                        <button type="button" onClick={() => handleRowChange(i, 'qty', String((Number(r.qty) || 0) + 1))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-amber-950 hover:bg-amber-900 text-white font-bold text-sm select-none active:scale-95 transition" title="Přidat 1">+</button>
                        <span className="text-xs font-bold text-neutral-600 shrink-0">ks</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-extrabold text-xs">
                  Zrušit
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md">
                  Uložit akci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODÁL 2: PO AKCI (VYHODNOCENÍ + VRÁCENÍ NEPRODANÝCH KUSŮ DO SKLADU + TRŽBA + HODNOCENÍ) */}
      {evalRecord && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-neutral-200 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={22} />
                <span>Vyhodnocení PO AKCI — {evalRecord.name}</span>
              </h3>
              <button onClick={() => setEvalRecord(null)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveEval} className="space-y-4">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-medium space-y-1">
                <p className="font-bold text-amber-900">📦 Vrácení neprodaných sudů a lahví do skladu:</p>
                <p>Zadej kolik ks sudů/lahví se z akce <strong>neprodalo a vrátilo zpět do pivovaru</strong>. Tyto kusy se automaticky přičtou zpět na sklad.</p>
              </div>

              {/* Seznam položek akce s zadáním vrácených kusů */}
              <div className="space-y-2">
                {evalRecord.items.map((it, idx) => {
                  const bObj = beers.find((b) => b.id === it.beer_id);
                  const pObj = packages.find((p) => p.id === it.package_id);

                  return (
                    <div key={idx} className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-black text-neutral-950 text-sm block">{it.beer_name ?? bObj?.name}</span>
                        <span className="text-neutral-600 font-bold">
                          {formatPackageLabel(it.package_label ?? pObj?.label)} · Odvezeno: <strong className="text-neutral-900">{it.quantity_taken} ks</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-neutral-700">Vráceno zpět:</span>
                        <input
                          type="number"
                          min={0}
                          max={it.quantity_taken}
                          value={evalReturnedMap[idx] ?? '0'}
                          onChange={(e) => setEvalReturnedMap({ ...evalReturnedMap, [idx]: e.target.value })}
                          className="input !py-1 !px-2 w-16 text-center font-mono font-black text-xs bg-white border-amber-300"
                        />
                        <span className="font-bold text-neutral-600">ks</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-200">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Získaná tržba z akce (Kč)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      placeholder="Např. 45000"
                      value={evalRevenue}
                      onChange={(e) => setEvalRevenue(e.target.value)}
                      className="input font-mono font-black text-sm pl-8"
                    />
                    <span className="absolute left-3 top-2.5 text-neutral-400 font-bold">Kč</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Hodnocení akce (1 až 5 hvězd)</label>
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded-2xl border border-neutral-300">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setEvalRating(star)}
                        className="p-1 hover:scale-125 transition"
                      >
                        <Star size={20} className={star <= evalRating ? 'fill-amber-400 text-amber-500' : 'text-neutral-300'} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka a zhodnocení akce</label>
                <textarea
                  rows={2}
                  value={evalNote}
                  onChange={(e) => setEvalNote(e.target.value)}
                  placeholder="Např. Super atmosféra, nejvíce šla 11° světlá, příští rok vzít více skla..."
                  className="input font-medium text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setEvalRecord(null)} className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-extrabold text-xs">
                  Zrušit
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs shadow-md">
                  ✓ Uložit vyhodnocení Po akci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
