import { useEffect, useMemo, useState } from 'react';

import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerText, beerBorder, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Spinner, useConfirm } from './ui';
import { CountFromImage } from './CountFromImage';
import { VoiceRecorder } from './VoiceRecorder';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';

type OrderRow = { id: string; order_date: string; status: string };
type OrderItemRow = { order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; quantity: number };

import { WeeklyOrderSummaryCard, isoWeekKey, weekRange, shiftWeek, WeeklyOrderItem } from './WeeklyOrderSummaryCard'; // Import WeeklyOrderItem

type Props = {
  table: 'bottling' | 'kegging' | 'fasovani' | 'fasovani_private' | 'writeoffs' | 'inventory';
  title: string;
  icon: string;
  exportFn: (rows: EntryRow[]) => void;
  hasWho?: boolean;
  hasReason?: boolean;
  hasNote?: boolean;
  hasSourceVolume?: boolean;
  packageKind?: 'keg' | 'bottle';
  subtitle?: string;
  hasCountFromImage?: boolean;
  showOrderedWeek?: boolean;
  multiRow?: boolean;
  multiRowCount?: number;
  mode?: 'entry_only' | 'overviews_only' | 'all';
  setPage?: (p: any, sec?: string) => void;
};

export function EntryModule({ table, title, icon, exportFn, hasWho, hasReason, hasNote, hasSourceVolume, packageKind, subtitle, hasCountFromImage, showOrderedWeek, multiRow, multiRowCount, mode = 'all', setPage }: Props) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, node: confirmNode } = useConfirm();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [beerId, setBeerId] = useState('');
  const [pkgId, setPkgId] = useState('');
  const [qty, setQty] = useState('');
  const [who, setWho] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [multiWho, setMultiWho] = useState('');
  const [multiReason, setMultiReason] = useState('');

  const [sourceVolume, setSourceVolume] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);


  // Multi-row mode: fixed number of empty rows, each with its own beer + package + qty
  const MULTI_ROW_COUNT = multiRowCount ?? 7;
  // Předdefinované velikosti sudů pro rychlý výběr objemu "l sud" (jinak lze zadat ručně)
  const SUD_SIZES = [50, 30];
  type MultiRowInput = { beerId: string; pkgId: string; qty: string; sourceVolume: string; sourceVolumeCustom: boolean };
  const emptyMultiRows = (): MultiRowInput[] => Array.from({ length: MULTI_ROW_COUNT }, () => ({ beerId: '', pkgId: '', qty: '', sourceVolume: '', sourceVolumeCustom: false }));
  const [multiRows, setMultiRows] = useState<MultiRowInput[]>(emptyMultiRows());
  function setMultiField(i: number, field: keyof MultiRowInput, value: string | boolean) {
    setMultiRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }
  function clearMultiRow(i: number) {
    setMultiRows((rs) => rs.map((r, idx) => idx === i ? { beerId: '', pkgId: '', qty: '', sourceVolume: '', sourceVolumeCustom: false } : r));
  }
  const multiFilledCount = multiRows.filter((r) => r.beerId && r.qty && Number(r.qty) > 0).length;



  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  const [weekItems, setWeekItems] = useState<OrderItemRow[]>([]);
  const [listFilter, setListFilter] = useState<'all' | 'remaining' | 'done'>('all');

  const filteredPackages = useMemo(() => {
    const list = packageKind ? packages.filter((p) => p.kind === packageKind) : packages;
    return [...list].sort((a, b) => {
      const isAKeg = a.kind === 'keg' || (a.label ?? '').toLowerCase().includes('keg') || (a.label ?? '').toLowerCase().includes('sud');
      const isBKeg = b.kind === 'keg' || (b.label ?? '').toLowerCase().includes('keg') || (b.label ?? '').toLowerCase().includes('sud');
      if (!isAKeg && isBKeg) return -1;
      if (isAKeg && !isBKeg) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [packages, packageKind]);

  async function load(silent = false) {
    if (!silent && !rows.length) setLoading(true);
    const [{ data }, { data: b }, { data: p }] = await Promise.all([
      supabase.from(table).select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((data as EntryRow[]) ?? []);
    if (b) setBeers(b as Beer[]);
    if (p) setPackages(p as Package[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [table]);
  useRealtime([table, 'beers', 'packages'], () => load(true));

  // prehled objednanych ks pro dany tyden (filtrovano dle packageKind)
  const reloadWeek = useMemo(() => {
    let cancelled = false;
    return async () => {
      const { data: ords } = await supabase.from('orders').select('id,order_date,status').order('order_date', { ascending: false });
      const wkOrders = (ords as OrderRow[] ?? []).filter((o) => isoWeekKey(o.order_date) === weekKey && o.status !== 'storno');
      if (cancelled) return;
      setWeekOrders(wkOrders);
      if (!wkOrders.length) { setWeekItems([]); return; }
      const { data: its } = await supabase.from('order_items').select('order_id,beer_id,beer_name,package_id,quantity').in('order_id', wkOrders.map((o) => o.id));
      if (cancelled) return;
      setWeekItems((its as OrderItemRow[]) ?? []);
    };
  }, [weekKey]);

  useEffect(() => {
    if (!showOrderedWeek) return;
    reloadWeek();
  }, [reloadWeek, showOrderedWeek]);
  useRealtime(['orders', 'order_items'], () => { if (showOrderedWeek) reloadWeek(); });

  const orderedByBeer = useMemo(() => {
    const pkgIds = new Set(filteredPackages.map((p) => p.id));
    const map = new Map<string, { beer_id: string; name: string; count: number }>();
    weekItems.forEach((i) => {
      if (!i.package_id || !pkgIds.has(i.package_id)) return;
      const key = i.beer_id ?? i.beer_name ?? '—';
      const name = i.beer_name ?? beers.find((b) => b.id === i.beer_id)?.name ?? '—';
      const cur = map.get(key) ?? { beer_id: key, name, count: 0 };
      cur.count += Number(i.quantity);
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [weekItems, filteredPackages, beers]);
  const orderedTotal = useMemo(() => orderedByBeer.reduce((s, r) => s + r.count, 0), [orderedByBeer]);
  const wr = weekRange(weekKey);

  // Rozpis objednaných lahví podle piva × velikost (za vybraný týden) + kolik ještě zbývá stočit
  // (zbývá = objednáno v tomto týdnu − stočeno kdykoliv v historii pro danou kombinaci pivo+velikost).
  // Pouze pro packageKind === 'bottle' (viz showOrderedWeek + packageKind v EntryModule pro bottling).
  const keggedHistoryMapBottle = useMemo(() => {
    type Key = string; // `${beerKey}|${volume}`
    const m = new Map<Key, number>();
    rows.forEach((r) => {
      const pkg = filteredPackages.find((p) => p.id === r.package_id);
      if (!pkg) return;
      const beerKey = r.beer_id ?? r.beer_name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      m.set(key, (m.get(key) ?? 0) + Number(r.quantity));
    });
    return m;
  }, [rows, filteredPackages]);
  const orderedByBeerSize = useMemo(() => {
    type Key = string;
    const orderedMap = new Map<Key, { beerKey: string; beerName: string; volume: number; ordered: number }>();
    weekItems.forEach((i) => {
      const pkg = filteredPackages.find((p) => p.id === i.package_id);
      if (!pkg) return;
      const beerKey = i.beer_id ?? i.beer_name ?? '—';
      const beerName = i.beer_name ?? beers.find((b) => b.id === i.beer_id)?.name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      const cur = orderedMap.get(key) ?? { beerKey, beerName, volume: Number(pkg.volume_l), ordered: 0 };
      cur.ordered += Number(i.quantity);
      orderedMap.set(key, cur);
    });

    const list = [...orderedMap.entries()].map(([key, v]) => {
      const kegged = keggedHistoryMapBottle.get(key) ?? 0;
      const remaining = Math.max(v.ordered - kegged, 0);
      return { ...v, remaining };
    });
    list.sort((a, b) => a.beerName.localeCompare(b.beerName, 'cs') || a.volume - b.volume);

    const remainingBySize = new Map<number, number>();
    list.forEach((r) => remainingBySize.set(r.volume, (remainingBySize.get(r.volume) ?? 0) + r.remaining));
    const remainingSizeList = [...remainingBySize.entries()]
      .map(([volume, remaining]) => ({ volume, remaining }))
      .filter((r) => r.remaining > 0)
      .sort((a, b) => b.volume - a.volume);

    return { list, remainingSizeList };
  }, [weekItems, keggedHistoryMapBottle, filteredPackages, beers]);

  // Přehled stočení lahví podle velikosti (rámečky) — velikosti se zjistí z číselníku obalů (bottle)
  const bottleSizeBuckets = useMemo(() => {
    const sizes = [...new Set(filteredPackages.map((p) => Number(p.volume_l)))].sort((a, b) => b - a);
    return sizes.map((size) => {
      const sizeRows = rows.filter((r) => {
        const pkg = packages.find((p) => p.id === r.package_id);
        return pkg && Number(pkg.volume_l) === size;
      });
      const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
      const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
      return { size, count, liters };
    });
  }, [rows, filteredPackages, packages]);
  const bottleTotalCount = bottleSizeBuckets.reduce((s, b) => s + b.count, 0);
  const bottleTotalLiters = bottleSizeBuckets.reduce((s, b) => s + b.liters, 0);


  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (!beerId) { setErr('Vyber pivo.'); return; }
    if (!pkgId) { setErr('Vyber obal.'); return; }
    const n = Number(qty);
    if (!n || n <= 0) { setErr('Zadej množství.'); return; }
    setSaving(true);
    const beer = beers.find((b) => b.id === beerId);
    const pkg = packages.find((p) => p.id === pkgId);
    const payload: any = {
      entry_date: date, beer_id: beerId, beer_name: beer?.name ?? null,
      package_id: pkgId, package_label: pkg?.label ?? null, quantity: n,
    };
    if (hasWho) payload.who = who || null;
    if (hasReason) payload.reason = reason || null;
    if (hasNote) payload.note = note || null;
    if (hasSourceVolume) payload.source_volume_l = sourceVolume ? Number(sourceVolume) : null;
    const { error } = await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setQty(''); setWho(''); setReason(''); setNote(''); setSourceVolume(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load();
  }

  async function addMulti(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const filled = multiRows.filter((r) => r.beerId && r.qty && Number(r.qty) > 0);
    if (!filled.length) { setErr('Vyplň pivo a množství alespoň u jednoho řádku.'); return; }
    for (const r of filled) {
      if (!r.pkgId) { setErr('Vyber obal pro každý vyplněný řádek.'); return; }
    }
    setSaving(true);
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const p: any = {
        entry_date: date, beer_id: r.beerId, beer_name: beer?.name ?? null,
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: Number(r.qty),
      };
      if (hasNote) p.note = note || null;
      if (hasWho) p.who = multiWho || null;
      if (hasReason) p.reason = multiReason || null;
      if (hasSourceVolume) p.source_volume_l = r.sourceVolume ? Number(r.sourceVolume) : null;
      return p;
    });
    const { error } = await supabase.from(table).insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setMultiRows(emptyMultiRows()); setNote(''); setMultiWho(''); setMultiReason(''); setSourceVolume(''); setErr(null);

    setFlash(true); setTimeout(() => setFlash(false), 800);
    load();
  }


  async function del(id: string) {
    if (!(await confirm('Opravdu chceš tento záznam smazat?'))) return;
    const row = rows.find((r) => r.id === id);
    if (row) {
      await supabase.from('audit_log').insert({
        table_name: table,
        record_id: id,
        action: 'delete',
        old_data: row as any,
        changed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
    }
    await supabase.from(table).delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from(table).update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
  }

  // Hlasový zápis (multi-row): přepis se rozparsuje a naplní se první volné prázdné řádky.
  function handleVoiceResultMulti(text: string) {
    const parsed = parseFreeTextEntries(text, beers, filteredPackages, aliasMap);

    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar 0.5".'); return; }
    setMultiRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) break;
        next[cursor] = {
          beerId: p.beer_id ?? '',
          pkgId: p.package_id ?? '',
          qty: p.quantity != null ? String(p.quantity) : '',
          sourceVolume: '',
          sourceVolumeCustom: false,
        };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }

  // Hlasový zápis (single-row): vezme první rozpoznanou položku a vyplní hlavní formulář.
  function handleVoiceResultSingle(text: string) {
    const parsed = parseFreeTextEntries(text, beers, filteredPackages, aliasMap);

    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar 0.5".'); return; }
    const p = parsed[0];
    if (p.beer_id) setBeerId(p.beer_id);
    if (p.package_id) setPkgId(p.package_id);
    if (p.quantity != null) setQty(String(p.quantity));
    setErr(null);
  }


  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-100/50 p-6 rounded-3xl text-neutral-900 shadow-md border-2 border-amber-300/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-amber-950 tracking-tight flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-md">{icon}</span>
            <span>{table === 'bottling' ? (mode === 'entry_only' ? 'Lahve (Stáčení)' : mode === 'overviews_only' ? 'Lahve (Přehled)' : title) : title}</span>
          </h1>
          {subtitle && <p className="text-xs sm:text-sm text-amber-900/80 mt-1 font-bold">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'entry_only' && setPage && table === 'bottling' && (
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => setPage('bottling_overview')}>
              📋 Lahve (Přehled) →
            </button>
          )}
          {mode === 'overviews_only' && setPage && table === 'bottling' && (
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => setPage('bottling_entry')}>
              ✏️ Lahve (Stáčení) →
            </button>
          )}
          <VoiceRecorder onResult={multiRow ? handleVoiceResultMulti : handleVoiceResultSingle} compact beerNames={beers.map((b) => b.name)} />

          {hasCountFromImage && (
            <button className="btn-primary" title="Spočítat z fotek" onClick={() => setShowCount(true)} disabled={!beers.length || !packages.length}>
              📷 Fotka
            </button>
          )}
          {table === 'fasovani' && setPage && (
            <button className="btn-ghost !bg-rose-50 border border-rose-300 text-rose-950 font-black text-xs shadow-xs" onClick={() => setPage('writeoffs')}>
              📉 Odpis →
            </button>
          )}
          <button className="btn-ghost !bg-white border-amber-300 shadow-xs text-xs font-black" title="Export do Excelu" onClick={() => exportFn(rows)} disabled={!rows.length}>📊 Export Excel</button>
        </div>
      </div>






      {multiRow && (
        <form onSubmit={addMulti} className={`card p-4 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3">
            <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-primary-400">{title}</div>
            <div className="flex items-center gap-2 sm:gap-3">
              <input type="date" className="input !py-1.5 !px-2 !w-auto text-xs sm:text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="text-[10px] sm:text-xs text-primary-500 whitespace-nowrap">{multiFilledCount} {multiFilledCount === 1 ? 'řádek' : multiFilledCount < 5 ? 'řádky' : 'řádků'}</span>
            </div>
          </div>


          <div className="space-y-2">
            {multiRows.map((r, i) => {
              const filled = r.beerId && r.qty && Number(r.qty) > 0;
              const selectedBeer = beers.find((b) => b.id === r.beerId);
              return (
                <div
                  key={i}                  className={`p-2 rounded-2xl border-2 transition-all grid grid-cols-12 items-center gap-2 ${
                    filled
                      ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                      : 'bg-white border-neutral-200/90 hover:border-neutral-300'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-800 text-[11px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>                  <div className="flex items-center gap-1.5 col-span-11 sm:col-span-4">

                    <div className="w-3.5 shrink-0 flex items-center justify-center">
                      {selectedBeer && (
                        <span className="w-3 h-3 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(selectedBeer) }} />
                      )}
                    </div>
                    <select
                      className="input !py-1 !px-2 text-xs font-bold w-full bg-white shadow-2xs"
                      value={r.beerId}
                      onChange={(e) => setMultiField(i, 'beerId', e.target.value)}
                    >
                      <option value="">— pivo —</option>
                      {beers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}{b.degree ? ` (${b.degree})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-11 sm:col-span-4">
                    <select
                      className="input !py-1 !px-2 text-xs font-medium w-full bg-white shadow-2xs"
                      value={r.pkgId}
                      onChange={(e) => setMultiField(i, 'pkgId', e.target.value)}
                    >
                      <option value="">— obal —</option>
                      {filteredPackages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1 col-span-11 sm:col-span-3">
                    <button type="button" onClick={() => setMultiField(i, 'qty', String(Math.max(0, (Number(r.qty) || 0) - 1)))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-neutral-100 hover:bg-amber-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="Odečíst 1">−</button>
                    <input
                      type="number"
                      min={0}
                      className="input !py-1 !px-1 w-12 sm:w-14 text-center text-xs font-mono font-black bg-white shadow-2xs"
                      placeholder="ks"
                      value={r.qty}
                      onChange={(e) => setMultiField(i, 'qty', e.target.value)}
                      inputMode="numeric"
                    />
                    <button type="button" onClick={() => setMultiField(i, 'qty', String((Number(r.qty) || 0) + 1))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-amber-950 hover:bg-amber-900 text-white font-bold text-sm select-none active:scale-95 transition" title="Přidat 1">+</button>
                    <span className="text-xs font-extrabold text-neutral-600">ks</span>
                  </div>                  <div className="col-span-12 sm:col-span-1 flex justify-end">
                  {hasSourceVolume && (
                    <div className="shrink-0 w-24">
                      {!r.sourceVolumeCustom ? (
                        <select
                          className="input !py-1 !px-1.5 text-xs font-bold bg-white shadow-2xs"
                          value={SUD_SIZES.includes(Number(r.sourceVolume)) ? r.sourceVolume : ''}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setMultiField(i, 'sourceVolumeCustom', true);
                              setMultiField(i, 'sourceVolume', '');
                            } else {
                              setMultiField(i, 'sourceVolume', e.target.value);
                            }
                          }}
                        >
                          <option value="">— sud —</option>
                          {SUD_SIZES.map((s) => <option key={s} value={s}>{s} l</option>)}
                          <option value="__custom__">Jiné…</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input type="number" min={0} step="0.1" autoFocus className="input !py-1 !px-1.5 text-xs font-mono font-bold" placeholder="l" value={r.sourceVolume}
                            onChange={(e) => setMultiField(i, 'sourceVolume', e.target.value)} inputMode="decimal" />
                          <button type="button" title="Zpět na výběr sudu" onClick={() => { setMultiField(i, 'sourceVolumeCustom', false); setMultiField(i, 'sourceVolume', ''); }}
                            className="shrink-0 w-6 h-6 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 text-xs">↺</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>
              );
            })}
          </div>


          {(hasWho || hasReason || hasNote) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {hasWho && (
                <div>
                  <label className="label">Kdo (společné pro všechny řádky)</label>
                  <input className="input" value={multiWho} onChange={(e) => setMultiWho(e.target.value)} placeholder="jméno" />
                </div>
              )}
              {hasReason && (
                <div>
                  <label className="label">Důvod (společný pro všechny řádky)</label>
                  <input className="input" value={multiReason} onChange={(e) => setMultiReason(e.target.value)} placeholder="důvod" />
                </div>
              )}
              {hasNote && (
                <div>
                  <label className="label">Poznámka (společná pro všechny řádky)</label>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end mt-3">
            <button type="submit" className="btn-primary !py-2 !px-4 text-sm" disabled={saving || !multiFilledCount}>
              {saving ? '…' : `+ Uložit ${multiFilledCount ? `(${multiFilledCount})` : ''}`}
            </button>
          </div>
          {err && <div className="text-xs sm:text-sm text-danger-600 mt-3 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
        </form>
      )}


      {!multiRow && mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card p-4 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Datum</label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setDate(new Date().toISOString().slice(0, 10))} className="text-[10px] font-black text-amber-700 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded-md border border-amber-300">Dnes</button>
                  <button type="button" onClick={() => setDate(new Date(Date.now() - 86400000).toISOString().slice(0, 10))} className="text-[10px] font-black text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-1.5 py-0.5 rounded-md border border-neutral-300">Včera</button>
                </div>
              </div>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-2 lg:col-span-2">
              <label className="label">Pivo</label>
              <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
                <option value="">— vyber pivo —</option>
                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
              </select>
            </div>

            <div className="col-span-1 sm:col-span-1">
              <label className="label">Obal</label>
              <select className="input" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                <option value="">—</option>
                {filteredPackages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <label className="label">Množství</label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQty(String(Math.max(0, (Number(qty) || 0) - 1)))} className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-neutral-100 hover:bg-amber-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="Odečíst 1">−</button>
                <input type="number" min={0} className="input text-center !px-1 min-w-0" placeholder="ks" value={qty}
                  onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
                <button type="button" onClick={() => setQty(String((Number(qty) || 0) + 1))} className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-amber-950 hover:bg-amber-900 text-white font-bold text-sm select-none active:scale-95 transition" title="Přidat 1">+</button>
              </div>
            </div>
            {hasWho && (
              <div className="col-span-1">
                <label className="label">Kdo</label>
                <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="jméno" />
              </div>
            )}
            {hasReason && (
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Důvod</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="důvod" />
              </div>
            )}
            {hasSourceVolume && (
              <div className="col-span-1 sm:col-span-1">
                <label className="label">Z sudu (l)</label>
                <input type="number" min={0} step="0.1" className="input" placeholder="l" value={sourceVolume}
                  onChange={(e) => setSourceVolume(e.target.value)} inputMode="numeric" />
              </div>
            )}
            {hasNote && (
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Poznámka</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" />
              </div>
            )}
            <div className="col-span-2 sm:col-span-1 flex items-end">
              <button type="submit" className="btn-primary w-full !py-2" disabled={saving}>
                {saving ? '…' : '+ Uložit'}
              </button>
            </div>
          </div>
          {err && <div className="text-sm text-danger-600 mt-3 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
        </form>
      )}


      {/* Přehled zadaných záznamů */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
            <span>📋</span>
            <span>{mode === 'entry_only' ? `Přehled zadaných záznamů (${table === 'bottling' ? 'Lahve' : title})` : `Všechny záznamy (${table === 'bottling' ? 'Lahve' : title})`}</span>
          </div>
          {rows.length > 0 && <span className="chip bg-amber-100 text-amber-900 text-xs font-bold">{rows.length} záznamů</span>}
        </div>

        {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Zatím žádné záznamy. Přidej první výše." icon="📝" /> : (
          <div className="card overflow-hidden animate-fade-in border-2 border-neutral-200">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table">
                <thead>
                  <tr>
                    <th>Datum</th><th>Pivo</th><th>Obal</th><th className="text-right">Množství</th>
                    {hasSourceVolume && <th className="text-right">Z sudu (l)</th>}
                    {hasSourceVolume && <th className="text-right">Ztráta</th>}
                    {hasWho && <th>Kdo</th>}
                    {hasReason && <th>Důvod</th>}
                    {hasNote && <th>Poznámka</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pkgObj = packages.find((p) => p.id === r.package_id);
                    const pkgLabel = r.package_label ?? pkgObj?.label ?? '—';
                    return (
                      <tr key={r.id} className="hover:bg-primary-50/50 transition-colors">
                        <td className="whitespace-nowrap text-primary-700">{r.entry_date}</td>
                        <td className="font-medium"><span className="inline-block rounded-md px-2 py-0.5" style={{ backgroundColor: beerBg(beers.find((b) => b.id === r.beer_id)), color: beerText(beers.find((b) => b.id === r.beer_id)) === 'text-white' ? '#fff' : undefined }}>{r.beer_name ?? beers.find((b) => b.id === r.beer_id)?.name ?? '—'}</span></td>
                        <td className="font-medium">
                          <span className="inline-block rounded-md px-2 py-0.5 text-xs font-extrabold shadow-2xs" style={{ backgroundColor: pkgBg(pkgObj), color: pkgText(pkgObj) === 'text-white' ? '#fff' : '#111' }}>
                            {pkgLabel}
                          </span>
                        </td>
                      <td className="text-right font-semibold text-primary-900">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => increment(r.id, -1)} disabled={Number(r.quantity) <= 0}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-primary-100 text-primary-700 hover:bg-primary-200 disabled:opacity-40 transition text-sm font-bold" title="Odečíst 1">−</button>
                          <span className="min-w-[2rem] text-center">{r.quantity}</span>
                          <button type="button" onClick={() => increment(r.id, 1)}
                            className="w-7 h-7 grid place-items-center rounded-lg bg-primary-900 text-white hover:bg-primary-800 transition text-sm font-bold" title="Přidat 1">+</button>
                        </div>
                      </td>
                      {hasSourceVolume && <td className="text-right text-primary-700">{r.source_volume_l != null ? Number(r.source_volume_l).toLocaleString('cs-CZ') + ' l' : '—'}</td>}
                      {hasSourceVolume && (() => {
                        const pkg = packages.find((p) => p.id === r.package_id);
                        const src = r.source_volume_l != null ? Number(r.source_volume_l) : null;
                        const produced = pkg ? Number(r.quantity) * Number(pkg.volume_l) : null;
                        if (src == null || produced == null || src <= 0) return <td className="text-right text-primary-400">—</td>;
                        const diff = src - produced; // Kladná hodnota = ztráta (odebráno z tanku více než v lahvích), záporná = přebytek
                        const diffPct = (Math.abs(diff) / src) * 100;
                        if (Math.abs(diff) < 0.01) {
                          return (
                            <td className="text-right font-medium text-emerald-700" title={`Vyrobeno ${produced} l ze ${src} l`}>
                              0 l <span className="block text-[11px] font-normal text-emerald-600">0 %</span>
                            </td>
                          );
                        }
                        if (diff < 0) {
                          const surplus = Math.abs(diff);
                          return (
                            <td className="text-right font-medium text-emerald-700" title={`Stočeho z tanku ${src} l, v lahvích ${produced} l (+${surplus.toLocaleString('cs-CZ')} l přebytek)`}>
                              +{surplus.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l
                              <span className="block text-[11px] font-normal text-emerald-600">+{diffPct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} % přebytek</span>
                            </td>
                          );
                        }
                        const tone = diffPct > 10 ? 'text-danger-600' : diffPct > 4 ? 'text-warning-600' : 'text-primary-700';
                        return (
                          <td className={`text-right font-medium ${tone}`} title={`Stočeno z tanku ${src} l, v lahvích ${produced} l (${diff.toLocaleString('cs-CZ')} l ztráta)`}>
                            −{diff.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l
                            <span className="block text-[11px] font-normal">−{diffPct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} % ztráta</span>
                          </td>
                        );
                      })()}
                      {hasWho && <td className="text-primary-600">{r.who ?? ''}</td>}
                      {hasReason && <td className="text-primary-600">{r.reason ?? ''}</td>}
                      {hasNote && <td className="text-primary-600 max-w-[200px] truncate" title={r.note ?? ''}>{r.note ?? ''}</td>}
                      <td className="text-right">
                        <button className="w-7 h-7 grid place-items-center rounded-lg text-danger-400 hover:bg-danger-50 hover:text-danger-600 transition" title="Smazat" onClick={() => del(r.id)}>×</button>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {confirmNode}
      {hasCountFromImage && showCount && (
        <CountFromImage
          table={table}
          beers={beers}
          packages={packages}
          onClose={() => setShowCount(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
