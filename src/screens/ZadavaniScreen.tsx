import { useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerName } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { exportBottlingToExcel } from '../lib/excel';

const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; qty: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);

export default function ZadavaniScreen({ setPage, mode = 'all' }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all' } = {}) {
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

  // Souhrn zapisovaných řádků
  const rowsSummary = useMemo(() => {
    let totalQty = 0;
    let totalL = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) { totalQty += n; totalL += n * Number(pkg.volume_l); }
    });
    return { totalQty, totalL };
  }, [entryRows, packages]);

  async function load(silent = false) {
    if (!silent && !rows.length) setLoading(true);
    const [zd, b, p] = await Promise.all([
      supabase.from('zadavani').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((zd.data as EntryRow[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['zadavani', 'beers', 'packages'], () => load(true));

  function setRowField(i: number, field: keyof RowInput, value: string) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const filled = entryRows.filter((r) => r.pkgId && Number(r.qty) > 0);
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); return; }
    setSaving(true);

    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      return {
        entry_date: date, beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: n,
        note: note || null,
      };
    });

    const { error } = await supabase.from('zadavani').insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    setEntryRows(emptyRows()); setNote(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);
  }

  async function del(id: string) {
    await supabase.from('zadavani').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from('zadavani').update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
  }

  // Přehled podle druhu obalu
  const packageKindBuckets = useMemo(() => {
    const kegRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && pkg.kind === 'keg';
    });
    const bottleRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && pkg.kind === 'bottle';
    });
    const otherRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return !pkg || (pkg.kind !== 'keg' && pkg.kind !== 'bottle');
    });
    const kegCount = kegRows.reduce((s, r) => s + Number(r.quantity), 0);
    const kegLiters = kegRows.reduce((s, r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
    }, 0);
    const bottleCount = bottleRows.reduce((s, r) => s + Number(r.quantity), 0);
    const bottleLiters = bottleRows.reduce((s, r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
    }, 0);
    const otherCount = otherRows.reduce((s, r) => s + Number(r.quantity), 0);
    const otherLiters = otherRows.reduce((s, r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
    }, 0);
    const totalCount = kegCount + bottleCount + otherCount;
    const totalLiters = kegLiters + bottleLiters + otherLiters;
    return { kegCount, kegLiters, bottleCount, bottleLiters, otherCount, otherLiters, totalCount, totalLiters };
  }, [rows, packages]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <span>📋</span>
            <span>{mode === 'entry_only' ? 'Zadávání (Zápis)' : mode === 'overviews_only' ? 'Zadávání (Přehled)' : 'Zadávání (Zápis & Přehled)'}</span>
          </span>
          {/* Export do Excelu */}
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

      {/* Zápis — multi-row (12 řádků pivo+obal+množství najednou) */}
      {mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card p-4 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
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
                  <th className="text-left py-1.5 px-2 font-black text-neutral-700">Pivo</th>
                  <th className="text-left py-1.5 px-2 font-black text-neutral-700">Obal</th>
                  <th className="text-center py-1.5 px-2 font-black text-neutral-700">Množství</th>
                  <th className="text-right py-1.5 px-2 font-black text-neutral-700">Litry</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map((r, i) => {
                  const pkg = packages.find((p) => p.id === r.pkgId);
                  const liters = pkg ? (Number(r.qty || 0) * pkg.volume_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '—';
                  return (
                    <tr key={i} className="border-b border-neutral-200/60">
                      <td className="py-1 pr-1">
                        <select className="input text-xs w-full" value={r.beerId} onChange={(e) => setRowField(i, 'beerId', e.target.value)}>
                          <option value="">—</option>
                          {beers.filter((b) => b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <select className="input text-xs w-full" value={r.pkgId} onChange={(e) => setRowField(i, 'pkgId', e.target.value)}>
                          <option value="">—</option>
                          {packages.map((p) => (
                            <option key={p.id} value={p.id}>{p.label || `${p.volume_l}L`}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="w-7 h-7 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition disabled:opacity-30"
                            disabled={!r.qty || Number(r.qty) <= 0}
                            onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, qty: String(Math.max(0, Number(x.qty) - 1)) } : x))}
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="input text-xs w-14 text-center font-bold"
                            value={r.qty}
                            onChange={(e) => setRowField(i, 'qty', e.target.value)}
                            placeholder="0"
                          />
                          <button
                            type="button"
                            className="w-7 h-7 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-sm transition"
                            onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, qty: String(Number(x.qty || 0) + 1) } : x))}
                          >+</button>
                        </div>
                      </td>
                      <td className="py-1 pr-1 text-right text-xs font-bold text-neutral-600 whitespace-nowrap">{liters}</td>
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

          {/* Souhrn aktuálního zápisu pod tabulkou */}
          {rowsSummary.totalQty > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <div className="flex items-center gap-1 bg-emerald-100/80 rounded-lg px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">📦 V zápisu</span>
                <span className="text-xs font-black text-emerald-800">{rowsSummary.totalQty} ks</span>
                <span className="text-[10px] text-emerald-700/70">({rowsSummary.totalL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs font-black shadow-md">
                {saving ? '⏳ Ukládám…' : '💾 Uložit záznam'}
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows([...entryRows, emptyItem()])}>➕ Přidat řádek</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows(emptyRows())}>🗑️ Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

        </form>
      )}

      {/* Přehled podle druhu obalu */}
      {mode !== 'entry_only' && rows.length > 0 && (
        <div className="card p-3 mb-4 border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-black text-amber-950 text-xs">📊 Přehled záznamů</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {packageKindBuckets.kegCount > 0 && (
              <div className="flex items-center gap-1 bg-amber-100/80 rounded-lg px-2.5 py-1.5 border border-amber-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-950 whitespace-nowrap">🛢️ KEG</span>
                <span className="text-xs font-black text-amber-800">{packageKindBuckets.kegCount} ks</span>
                <span className="text-[10px] text-amber-700/70">({packageKindBuckets.kegLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            )}
            {packageKindBuckets.bottleCount > 0 && (
              <div className="flex items-center gap-1 bg-emerald-100/80 rounded-lg px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">🍾 Lahve</span>
                <span className="text-xs font-black text-emerald-800">{packageKindBuckets.bottleCount} ks</span>
                <span className="text-[10px] text-emerald-700/70">({packageKindBuckets.bottleLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            )}
            {packageKindBuckets.otherCount > 0 && (
              <div className="flex items-center gap-1 bg-neutral-100/80 rounded-lg px-2.5 py-1.5 border border-neutral-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-neutral-950 whitespace-nowrap">📦 Ostatní</span>
                <span className="text-xs font-black text-neutral-800">{packageKindBuckets.otherCount} ks</span>
                <span className="text-[10px] text-neutral-700/70">({packageKindBuckets.otherLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-emerald-200/80 rounded-lg px-2.5 py-1.5 border border-emerald-400/60 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">📦 Celkem</span>
              <span className="text-xs font-black text-emerald-800">{packageKindBuckets.totalCount} ks</span>
              <span className="text-[10px] text-emerald-700/70">({packageKindBuckets.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
            </div>
          </div>
        </div>
      )}

      {/* Všechny záznamy */}
      <div className="mt-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
            <span>📋</span>
            <span>{mode === 'entry_only' ? 'Záznamy zadávání' : 'Všechny záznamy zadávání'}</span>
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
                📋 {recordsView === 'month' ? `Měsíc ${currentMonthKey}` : `Týden ${recordsWeekKey}`}
              </h3>
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-300/80 bg-amber-100/80">
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Obal</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Akce</th>
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
                              <button type="button" onClick={() => {
                                if (confirm(`Smazat záznam: ${r.beer_name ?? beer?.name ?? '—'} ${pkg?.label ?? ''} × ${r.quantity} ks?`)) {
                                  del(r.id);
                                }
                              }} className="w-6 h-6 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition">✕</button>
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
