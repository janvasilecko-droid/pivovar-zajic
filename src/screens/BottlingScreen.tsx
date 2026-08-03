import { useEffect, useMemo, useState } from 'react';


import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerName } from '../lib/supabase';


import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { exportBottlingToExcel } from '../lib/excel';

const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; pkg2Id: string; kegPkgId: string; kegQty: string; qty: string; qty2: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', pkg2Id: '', kegPkgId: '', kegQty: '', qty: '', qty2: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);


// Povolené velikosti lahví v dropdownu
const ALLOWED_BOTTLE_VOLUMES = [1.5, 1, 0.5, 0.33];
// Velikosti KEG sudů
const KEG_SIZES = [50, 30, 20, 15, 10];


export default function BottlingScreen({ setPage, mode = 'all' }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all' } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);



  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const [recordsView, setRecordsView] = useState<'month' | 'week'>('month');
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const currentMonthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const filteredRows = useMemo(() => {
    if (recordsView === 'month') {
      return rows.filter((r) => r.entry_date?.startsWith(currentMonthKey));
    }
    return rows.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
  }, [rows, recordsView, currentMonthKey, recordsWeekKey]);

  // Filtrované obaly: pouze lahve povolených velikostí
  const bottlePackages = useMemo(() =>
    packages
      .filter((p) => p.kind === 'bottle' && ALLOWED_BOTTLE_VOLUMES.some((v) => Math.abs(Number(p.volume_l) - v) < 0.01))
      .sort((a, b) => b.volume_l - a.volume_l),
  [packages]);

  // KEG obaly
  const kegPackages = useMemo(() =>
    packages
      .filter((p) => p.kind === 'keg' && KEG_SIZES.includes(Number(p.volume_l)))
      .sort((a, b) => b.volume_l - a.volume_l),
  [packages]);

  // Souhrn zapisovaných řádků
  const rowsSummary = useMemo(() => {
    let totalQty = 0;
    let totalL = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId || p.id === r.kegPkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) { totalQty += n; totalL += n * Number(pkg.volume_l); }
    });
    return { totalQty, totalL };
  }, [entryRows, packages]);

  async function load(silent = false) {
    if (!silent && !rows.length) setLoading(true);
    const [bt, b, p] = await Promise.all([
      supabase.from('bottling').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((bt.data as EntryRow[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['bottling', 'beers', 'packages'], () => load(true));


  function setRowField(i: number, field: keyof RowInput, value: string) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const filled = entryRows.filter((r) => (r.pkgId || r.pkg2Id || r.kegPkgId) && (Number(r.qty) > 0 || Number(r.qty2) > 0));
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); return; }
    setSaving(true);

    // Z každého řádku vytvoříme 1–2 záznamy (Lahve 1 a/nebo Lahve 2).
    // Oba sdílí stejný zdroj ze sudů (kegs_used + source_volume_l), takže
    // je možné stočit z jednoho sudu více druhů obalů najednou.
    const payloads: any[] = [];
    filled.forEach((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const kegsUsed = Number(r.kegQty || 0);
      const kegPkg = r.kegPkgId ? packages.find((p) => p.id === r.kegPkgId) : null;
      // Zdrojový objem = počet sudů × objem sudu (např. 6×50L = 300L).
      const sourceL = kegsUsed > 0 && kegPkg ? kegsUsed * Number(kegPkg.volume_l) : 0;
      const base = {
        entry_date: date, beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        kegs_used: kegsUsed > 0 ? kegsUsed : null,
        kegs_used_package_id: kegsUsed > 0 && kegPkg ? kegPkg.id : null,
        source_volume_l: sourceL > 0 ? sourceL : null,
        note: note || null,
      };
      // Lahve 1 (nebo KEG, pokud není vybrána lahev)
      const pkgId = r.pkgId || r.kegPkgId;
      const pkg = packages.find((p) => p.id === pkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) {
        payloads.push({ ...base, package_id: pkgId, package_label: pkg?.label ?? null, quantity: n });
      }
      // Lahve 2 (druhý obal ze stejného sudu)
      const pkg2 = r.pkg2Id ? packages.find((p) => p.id === r.pkg2Id) : null;
      const n2 = Number(r.qty2);
      if (pkg2 && n2 > 0) {
        payloads.push({ ...base, package_id: r.pkg2Id, package_label: pkg2?.label ?? null, quantity: n2 });
      }
    });

    if (payloads.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); setSaving(false); return; }

    const { error } = await supabase.from('bottling').insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    setEntryRows(emptyRows()); setNote(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);
  }




  async function del(id: string) {
    await supabase.from('bottling').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from('bottling').update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
  }

  // Přehled podle velikosti lahví
  const BOTTLE_SIZES = [1.5, 1, 0.5, 0.33];

  const sizeBuckets = BOTTLE_SIZES.map((size) => {
    const sizeRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Math.abs(Number(pkg.volume_l) - size) < 0.01;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });

  // Přehled podle velikosti KEG
  const kegBuckets = KEG_SIZES.map((size) => {
    const sizeRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Number(pkg.volume_l) === size;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });

  // Výpočet ztráty ze sudů (vytrata) — zahrnuje:
  // 1) přímé stáčení do KEG (package je sud)
  // 2) stáčení do lahví ze sudů (kegs_used) — např. 6×50L = 300L zdroj
  const kegLossSummary = useMemo(() => {
    let totalKegCount = 0;   // počet stočených sudů (přímé KEG)
    let totalKegLiters = 0;  // litry stočené do sudů
    let totalSourceL = 0;    // celkový zdrojový objem z tanku (litry)
    let totalBottledL = 0;   // litry stočené do lahví ze sudů

    // Když se z jednoho sudu stáčí do více druhů obalů (Lahve 1 + Lahve 2),
    // vznikne více záznamů se stejným zdrojem (kegs_used). Zdroj započítáme jen jednou.
    const seenSource = new Set<string>();

    rows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      // Přímé stáčení do KEG
      if (pkg && pkg.kind === 'keg' && KEG_SIZES.includes(Number(pkg.volume_l))) {
        totalKegCount += Number(r.quantity);
        totalKegLiters += Number(r.quantity) * Number(pkg.volume_l);
        totalSourceL += Number(r.source_volume_l ?? 0);
      }
      // Stáčení do lahví ze sudů (kegs_used)
      if (r.kegs_used && r.kegs_used > 0) {
        const kegPkg = r.kegs_used_package_id ? packages.find((p) => p.id === r.kegs_used_package_id) : null;
        const sourceL = Number(r.source_volume_l ?? 0) || (kegPkg ? Number(r.kegs_used) * Number(kegPkg.volume_l) : 0);
        // Deduplikace zdroje: stejný (datum, pivo, sudy, typ sudu) = jeden zdroj
        const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}`;
        if (!seenSource.has(key)) {
          seenSource.add(key);
          totalSourceL += sourceL;
        }
        if (pkg) totalBottledL += Number(r.quantity) * Number(pkg.volume_l);
      }
    });

    const lossL = totalSourceL > 0 ? Math.max(totalSourceL - (totalKegLiters + totalBottledL), 0) : 0;
    const lossPct = totalSourceL > 0 ? (lossL / totalSourceL * 100) : 0;
    return { totalKegCount, totalKegLiters, totalSourceL, totalBottledL, lossL, lossPct };
  }, [rows, packages]);



  const otherRows = rows.filter((r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return !pkg || (!BOTTLE_SIZES.some((s) => Math.abs(Number(pkg.volume_l) - s) < 0.01) && !KEG_SIZES.includes(Number(pkg.volume_l)));
  });
  const otherCount = otherRows.reduce((s, r) => s + Number(r.quantity), 0);
  const otherLiters = otherRows.reduce((s, r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
  }, 0);
  const totalCount = sizeBuckets.reduce((s, b) => s + b.count, 0) + kegBuckets.reduce((s, b) => s + b.count, 0) + otherCount;
  const totalLiters = sizeBuckets.reduce((s, b) => s + b.liters, 0) + kegBuckets.reduce((s, b) => s + b.liters, 0) + otherLiters;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <span>🍾</span>
            <span>{mode === 'entry_only' ? 'Lahve (Stáčení)' : mode === 'overviews_only' ? 'Lahve (Přehled)' : 'Lahve (Stáčení & Přehled)'}</span>
          </span>
          {/* Export do Excelu — vedle názvu */}
          <div className="relative group">
            <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs" disabled={!rows.length}>📊 Export Excel ▾</button>
            {rows.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 min-w-[180px] hidden group-hover:block">
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const now = new Date();
                  const m = now.toISOString().slice(0, 7);
                  const filtered = rows.filter((r) => r.entry_date?.startsWith(m));
                  exportBottlingToExcel(filtered);
                }}>📅 Tento měsíc</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() - 1);
                  const m = d.toISOString().slice(0, 7);
                  const filtered = rows.filter((r) => r.entry_date?.startsWith(m));
                  exportBottlingToExcel(filtered);
                }}>📅 Minulý měsíc</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const wk = recordsView === 'week' ? recordsWeekKey : isoWeekKey(new Date().toISOString().slice(0, 10));
                  const filtered = rows.filter((r) => isoWeekKey(r.entry_date) === wk);
                  exportBottlingToExcel(filtered);
                }}>📅 Tento týden</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  exportBottlingToExcel(rows);
                }}>📅 Všechno</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zápis stáčení — multi-row (12 řádků pivo+obal+množství najednou) */}
      {mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card px-2 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
          <div className="grid grid-cols-2 gap-3 items-end mb-4">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Poznámka</label>
              <input className="input text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="nepovinná poznámka" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">Pivo</th>
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">Lahve 1</th>
                  <th className="text-center py-1.5 px-1 font-black text-neutral-700">KS</th>
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">Lahve 2</th>
                  <th className="text-center py-1.5 px-1 font-black text-neutral-700">KS</th>
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">KEG</th>
                  <th className="text-center py-1.5 px-1 font-black text-neutral-700">🛢️ Sudů</th>
                  <th className="text-right py-1.5 px-1 font-black text-neutral-700">Litry</th>
                  <th className="w-8"></th>
                </tr>


              </thead>
              <tbody>
                {entryRows.map((r, i) => {
                  const pkg1 = packages.find((p) => p.id === r.pkgId);
                  const pkg2 = packages.find((p) => p.id === r.pkg2Id);
                  const liters = (pkg1 ? Number(r.qty || 0) * pkg1.volume_l : 0) + (pkg2 ? Number(r.qty2 || 0) * pkg2.volume_l : 0);
                  return (
                    <tr key={i} className="border-b border-neutral-200/60">
                      <td className="py-1 pr-0.5 w-[30%]">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.beerId} onChange={(e) => setRowField(i, 'beerId', e.target.value)}>
                          <option value="">—</option>
                          {beers.filter((b) => b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0.5">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.pkgId} onChange={(e) => setRowField(i, 'pkgId', e.target.value)}>
                          <option value="">—</option>
                          {bottlePackages.map((p) => (
                            <option key={p.id} value={p.id}>{p.label || `${p.volume_l}L`}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          className="input text-base font-black w-full text-center text-neutral-950 bg-white border-2 border-amber-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={r.qty}
                          onChange={(e) => setRowField(i, 'qty', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="0"
                        />
                      </td>
                      <td className="py-1 pr-0.5">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.pkg2Id} onChange={(e) => setRowField(i, 'pkg2Id', e.target.value)}>
                          <option value="">—</option>
                          {bottlePackages.map((p) => (
                            <option key={p.id} value={p.id}>{p.label || `${p.volume_l}L`}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          className="input text-base font-black w-full text-center text-neutral-950 bg-white border-2 border-amber-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={r.qty2}
                          onChange={(e) => setRowField(i, 'qty2', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="0"
                        />
                      </td>
                      <td className="py-1 pr-0.5">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.kegPkgId} onChange={(e) => setRowField(i, 'kegPkgId', e.target.value)}>
                          <option value="">—</option>
                          {kegPackages.map((p) => (
                            <option key={p.id} value={p.id}>KEG {p.volume_l}L</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          title="Počet sudů KEG použitých na stočení do lahví (odečte se ze skladu)"
                          className="input text-base font-black w-full text-center text-neutral-950 bg-white border-2 border-sky-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={r.kegQty}
                          onChange={(e) => setRowField(i, 'kegQty', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="0"
                        />
                      </td>

                      <td className="py-1 pr-1 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">{liters > 0 ? liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '—'}</td>

                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <button type="button" className="w-7 h-7 grid place-items-center rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm transition" onClick={add} title="Uložit vše">✓</button>
                          <button type="button" className="w-7 h-7 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm transition" onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? emptyItem() : x))}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs font-black shadow-md">
                {saving ? '⏳ Ukládám…' : '💾 Uložit stáčení'}
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows([...entryRows, emptyItem()])}>➕ Přidat řádek</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows(emptyRows())}>🗑️ Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

        </form>
      )}

      {/* Přehled: Stočeno lahví — velikosti */}
      {mode !== 'entry_only' && rows.length > 0 && (
        <div className="card p-3 mb-4 border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-black text-amber-950 text-xs">🍾 Přehled stočených lahví</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sizeBuckets.map((b) => (
              <div key={b.size} className="flex items-center gap-1 bg-emerald-100/80 rounded-lg px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">{b.size}L</span>
                <span className="text-xs font-black text-emerald-800">{b.count} ks</span>
                <span className="text-[10px] text-emerald-700/70">({b.liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            ))}
            {otherCount > 0 && (
              <div className="flex items-center gap-1 bg-emerald-100/80 rounded-lg px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">Ostatní</span>
                <span className="text-xs font-black text-emerald-800">{otherCount} ks</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-emerald-200/80 rounded-lg px-2.5 py-1.5 border border-emerald-400/60 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">📦 Celkem</span>
              <span className="text-xs font-black text-emerald-800">{totalCount} ks</span>
              <span className="text-[10px] text-emerald-700/70">({totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
            </div>
          </div>
        </div>
      )}

      {/* Přehled: Stočeno KEG — velikosti + ztráta */}
      {mode !== 'entry_only' && rows.length > 0 && kegBuckets.some((b) => b.count > 0) && (
        <div className="card p-3 mb-4 border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-amber-100/30">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-black text-amber-950 text-xs">🛢️ Přehled stočených KEG</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {kegBuckets.filter((b) => b.count > 0).map((b) => (
              <div key={b.size} className="flex items-center gap-1 bg-amber-100/80 rounded-lg px-2.5 py-1.5 border border-amber-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-950 whitespace-nowrap">KEG {b.size}L</span>
                <span className="text-xs font-black text-amber-800">{b.count} ks</span>
                <span className="text-[10px] text-amber-700/70">({b.liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            ))}
          </div>

          {/* Ztráta ze sudů (vytrata) — přímé KEG + stáčení do lahví ze sudů */}
          {kegLossSummary.totalSourceL > 0 && (
            <div className="rounded-xl border border-rose-300/80 bg-rose-50/90 p-3">
              <div className="text-xs font-black text-rose-800 mb-2 flex items-center gap-1.5">
                <span>📊</span>
                <span>Vytrata (ze sudů vs. stočeno)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Stočeno do KEG</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalKegCount} ks ({kegLossSummary.totalKegLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</div>
                </div>
                <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Stočeno do lahví ze sudů</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalBottledL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L</div>
                </div>
                <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Ze sudů (zdroj)</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalSourceL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L</div>
                </div>

                <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Ztráta</span>
                  <div className="font-black text-rose-900">{kegLossSummary.lossL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L ({kegLossSummary.lossPct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %)</div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Všechny záznamy stáčení lahví */}
      <div className="mt-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
            <span>📋</span>
            <span>{mode === 'entry_only' ? 'Záznamy stáčení lahví' : 'Všechny záznamy stáčení lahví'}</span>
          </div>
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setRecordsView('month')}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                    recordsView === 'month'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  📅 Měsíc
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }`}
                  >
                    📅 Týden
                  </button>
                  {recordsView === 'week' && (
                    <>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                    </>
                  )}
                </div>
              </>
            )}
            {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState text="Zatím žádné záznamy. Přidej první výše." icon="📝" />
        ) : filteredRows.length === 0 ? (
          <EmptyState text="Žádné záznamy pro toto období." icon="📅" />
        ) : (() => {
          const sortedRows = [...filteredRows].sort((a, b) => {
            const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
            if (dateCmp !== 0) return dateCmp;
            return (b.created_at ?? '').localeCompare(a.created_at ?? '');
          });
          const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);
          const totalLiters = sortedRows.reduce((s, r) => {
            const pkg = packages.find((p) => p.id === r.package_id);
            return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
          }, 0);

          function formatDate(d: string | null | undefined) {
            if (!d) return '—';
            const parts = d.split('-');
            if (parts.length < 3) return d;
            return `${parts[2]}.${parts[1]}.`;
          }

          return (
            <div className="card p-4 border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-amber-100/30">
              <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                🍾 {recordsView === 'month' ? `Měsíc ${currentMonthKey}` : `Týden ${recordsWeekKey}`}
              </h3>
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-300/80 bg-amber-100/80">
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Lahve</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const pkg = packages.find((p) => p.id === r.package_id);
                      const vol = pkg ? Number(pkg.volume_l) : 0;
                      const liters = Number(r.quantity) * vol;
                      return (
                        <tr key={r.id} className="border-b border-amber-200/60 hover:bg-amber-100/70 transition-colors">
                          <td className="py-1.5 px-2 font-mono font-bold text-amber-950 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                          <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                            <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{pkg?.label ?? '—'}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>
                          <td className="py-1.5 px-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button type="button" onClick={() => increment(r.id, -1)} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs transition">−</button>
                              <button type="button" onClick={() => increment(r.id, 1)} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold text-xs transition">+</button>
                              <button type="button" onClick={() => del(r.id)} className="w-6 h-6 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Souhrnný řádek */}
                    <tr className="bg-amber-200/60 font-black">
                      <td className="py-1.5 px-2 font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 font-black text-amber-950">📦 Celkem</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>
                      <td className="py-1.5 px-2 text-right"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
    </div>

    </div>
  );
}
