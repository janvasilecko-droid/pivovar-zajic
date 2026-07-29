import { useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, EntryRow, CellarTank, useRealtime, beerBg, beerText, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { exportKeggingToExcel } from '../lib/excel';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { CountFromImage } from '../components/CountFromImage';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';

type OrderRow = { id: string; order_date: string; status: string };
type OrderItemRow = { order_id: string; package_id: string | null; quantity: number; beer_id: string | null; beer_name: string | null };

const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; qty: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);

export default function KeggingScreen({ setPage, mode = 'all' }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all' } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [cellarTanks, setCellarTanks] = useState<CellarTank[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [cellarTankId, setCellarTankId] = useState('');
  const [lossL, setLossL] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);


  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  const [weekItems, setWeekItems] = useState<OrderItemRow[]>([]);

  const kegPackages = useMemo(() => packages.filter((p) => p.kind === 'keg').sort((a, b) => b.volume_l - a.volume_l), [packages]);

  // Aktivní sklepní tanky (stáčí se z nich) — status active nebo emptying
  const activeCellarTanks = useMemo(() => cellarTanks.filter((t) => t.status === 'active' || t.status === 'emptying'), [cellarTanks]);
  const selectedCellarTank = cellarTanks.find((t) => t.id === cellarTankId);

  // Pro dané pivo najde aktivní/stáčecí tank, ve kterém toto pivo skutečně je
  // (pokud je jich víc, vezme se ten s větším aktuálním objemem). Toto je zdroj pravdy
  // pro odečet objemu — nezávisí na tom, jaký tank je vybraný nahoře ve formuláři.
  function findTankForBeer(beerId: string): CellarTank | undefined {
    if (!beerId) return undefined;
    const candidates = activeCellarTanks.filter((t) => t.current_beer_id === beerId);
    if (candidates.length === 0) return undefined;
    return candidates.reduce((best, t) => Number(t.current_volume_l) > Number(best.current_volume_l) ? t : best);
  }

  // Souhrn zapisovaných řádků: celkový počet ks a litrů podle vyplněných řádků formuláře
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

  // Souhrn odečtu podle skutečně nalezeného tanku pro pivo na každém řádku (ne podle globálního výběru).
  // Mapa tankId -> litry, které se z něj odečtou; a seznam řádků, pro které nebyl nalezen žádný tank.
  const rowTankPreview = useMemo(() => {
    const perTank = new Map<string, number>();
    let missingCount = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (!pkg || !(n > 0) || !r.beerId) return;
      const tank = findTankForBeer(r.beerId);
      if (!tank) { missingCount++; return; }
      const l = n * Number(pkg.volume_l);
      perTank.set(tank.id, (perTank.get(tank.id) ?? 0) + l);
    });
    return { perTank, missingCount };
  }, [entryRows, packages, activeCellarTanks]);

  async function load(silent = false) {
    if (!silent && !rows.length) setLoading(true);
    const [kg, ct, b, p] = await Promise.all([
      supabase.from('kegging').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('cellar_tanks').select('*').order('label'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((kg.data as EntryRow[]) ?? []);
    setCellarTanks((ct.data as CellarTank[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['kegging', 'cellar_tanks', 'beers', 'packages'], () => load(true));

  // Pokud existuje přesně jeden aktivní tank, předvyplní se automaticky (jen jako výchozí pivo pro prázdné řádky)
  useEffect(() => {
    if (!cellarTankId && activeCellarTanks.length === 1) setCellarTankId(activeCellarTanks[0].id);
  }, [activeCellarTanks, cellarTankId]);

  // Při výběru tanku nahoře predvyplní pivo jen na řádcích, kde ještě pivo nebylo ručně nastaveno
  // (slouží jako pohodlný výchozí výběr — skutečný odečet objemu se ale vždy řídí tím, jaké pivo
  // je na konkrétním řádku a jaký tank se k němu dohledá, viz findTankForBeer).
  useEffect(() => {
    if (!selectedCellarTank?.current_beer_id) return;
    setEntryRows((rs) => rs.map((r) => r.beerId ? r : { ...r, beerId: selectedCellarTank.current_beer_id! }));
  }, [selectedCellarTank?.current_beer_id]);


  // nacti objednavky + polozky pro dany tyden (kvuli prehledu objednanych kegu)
  useEffect(() => {
    (async () => {
      const { data: ords } = await supabase.from('orders').select('id,order_date,status').order('order_date', { ascending: false });
      const wkOrders = (ords as OrderRow[] ?? []).filter((o) => isoWeekKey(o.order_date) === weekKey && o.status !== 'storno');
      setWeekOrders(wkOrders);
      if (!wkOrders.length) { setWeekItems([]); return; }
      const { data: its } = await supabase.from('order_items').select('order_id,package_id,quantity,beer_id,beer_name').in('order_id', wkOrders.map((o) => o.id));
      setWeekItems((its as OrderItemRow[]) ?? []);
    })();
  }, [weekKey]);

  const orderedKegCount = useMemo(() => {
    const kegPkgIds = new Set(packages.filter((p) => p.kind === 'keg').map((p) => p.id));
    return weekItems.filter((i) => i.package_id && kegPkgIds.has(i.package_id)).reduce((s, i) => s + Number(i.quantity), 0);
  }, [weekItems, packages]);
  const wr = weekRange(weekKey);

  // Rozpis objednaných sudů podle piva × velikost (za vybraný týden) + kolik ještě zbývá stočit
  // (zbývá = objednáno v tomto týdnu − stočeno kdykoliv v historii pro danou kombinaci pivo+velikost).
  const keggedHistoryMap = useMemo(() => {
    type Key = string; // `${beerKey}|${volume}`
    const keggedMap = new Map<Key, number>();
    rows.forEach((r) => { // rows are all kegging entries
      const pkg = kegPackages.find((p) => p.id === r.package_id);
      if (!pkg) return;
      const beerKey = r.beer_id ?? r.beer_name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      keggedMap.set(key, (keggedMap.get(key) ?? 0) + Number(r.quantity));
    });
    return keggedMap;
  }, [rows, kegPackages]);

  const orderedByBeerSize = useMemo(() => {
    type Key = string; // `${beerKey}|${volume}`
    const orderedMap = new Map<Key, { beerKey: string; beerName: string; volume: number; ordered: number }>();
    weekItems.forEach((i) => { // weekItems are all order items
      const pkg = kegPackages.find((p) => p.id === i.package_id);
      if (!pkg) return;
      const beerKey = i.beer_id ?? i.beer_name ?? '—';
      const beerName = i.beer_name ?? beers.find((b) => b.id === i.beer_id)?.name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      const cur = orderedMap.get(key) ?? { beerKey, beerName, volume: Number(pkg.volume_l), ordered: 0 };
      cur.ordered += Number(i.quantity);
      orderedMap.set(key, cur);
    });

    const list = [...orderedMap.entries()].map(([key, v]) => {
      const kegged = keggedHistoryMap.get(key) ?? 0;
      const remaining = Math.max(v.ordered - kegged, 0);
      return { ...v, remaining };
    });
    list.sort((a, b) => a.beerName.localeCompare(b.beerName, 'cs') || a.volume - b.volume);

    // Souhrn zbývá stočit celkem podle velikosti (bez ohledu na pivo)
    const remainingBySize = new Map<number, number>();
    list.forEach((r) => remainingBySize.set(r.volume, (remainingBySize.get(r.volume) ?? 0) + r.remaining));
    const remainingSizeList = [...remainingBySize.entries()]
      .map(([volume, remaining]) => ({ volume, remaining }))
      .filter((r) => r.remaining > 0)
      .sort((a, b) => b.volume - a.volume);

    return { list, remainingSizeList };
  }, [weekItems, keggedHistoryMap, kegPackages, beers]);


  // Souhrn stáčení z tanku (kegging) — sjednoceno s Cellar.tsx: % stočeno se počítá
  // ze skutečně zapsaných záznamů (source_volume_l), ne z current_volume_l tanku.
  const tankSummary = useMemo(() => {
    const m = new Map<string, { kegCount: number; sourceL: number }>();
    rows.forEach((r) => {
      const id = r.cellar_tank_id ?? '_none';
      if (!m.has(id)) m.set(id, { kegCount: 0, sourceL: 0 });
      const s = m.get(id)!;
      s.kegCount += Number(r.quantity) ?? 0;
      s.sourceL += Number(r.source_volume_l ?? 0);
    });
    return m;
  }, [rows]);

  function setRowField(i: number, field: keyof RowInput, value: string) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  // Hlasový zápis: přepis se rozparsuje a naplní se první volné prázdné řádky.
  function handleVoiceResult(text: string) {
    const parsed = parseFreeTextEntries(text, beers, packages, aliasMap);

    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar keg30".'); return; }
    setEntryRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) break;
        next[cursor] = {
          beerId: p.beer_id ?? '',
          pkgId: p.package_id ?? '',
          qty: p.quantity != null ? String(p.quantity) : '',
        };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }


  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const filled = entryRows.filter((r) => r.pkgId && Number(r.qty) > 0);
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); return; }
    setSaving(true);

    // Každý řádek si najde svůj vlastní zdrojový tank podle piva na řádku (ne podle globálně
    // vybraného tanku). Pokud pro dané pivo není žádný aktivní tank, řádek se přesto uloží,
    // jen bez vazby na tank a bez odečtu objemu.
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      const tank = r.beerId ? findTankForBeer(r.beerId) : undefined;
      const sourceL = pkg && tank ? n * Number(pkg.volume_l) : 0;
      return {
        entry_date: date, beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: n,
        note: note || null,
        cellar_tank_id: tank?.id ?? null,
        source_volume_l: sourceL || null,
        loss_l: lossL ? Number(lossL) / filled.length : 0,
      };
    });

    // Souhrn odečtu podle tanku (více řádků může brát ze stejného, nebo i z různých tanků)
    const deductByTank = new Map<string, number>();
    payloads.forEach((p) => {
      if (p.cellar_tank_id && p.source_volume_l) {
        deductByTank.set(p.cellar_tank_id, (deductByTank.get(p.cellar_tank_id) ?? 0) + p.source_volume_l);
      }
    });

    const { error } = await supabase.from('kegging').insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // odecti stoceny objem z kazdeho dotcenho tanku zvlast
    for (const [tankId, deductL] of deductByTank.entries()) {
      const tank = cellarTanks.find((t) => t.id === tankId);
      if (!tank) continue;
      const newVol = Math.max(Number(tank.current_volume_l) - deductL, 0);
      const newStatus = newVol <= 0 ? tank.status : 'emptying';
      await supabase.from('cellar_tanks').update({
        current_volume_l: newVol,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', tankId);
    }

    setEntryRows(emptyRows()); setNote(''); setErr(null); setLossL('');
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);
  }

  async function del(id: string) {
    await supabase.from('kegging').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from('kegging').update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
  }

  // Prehled podle velikosti kegu (50/30/20/15/10 l + ostatni)
  const KEG_SIZES = [50, 30, 20, 15, 10];
  const sizeBuckets = KEG_SIZES.map((size) => {
    const sizeRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Number(pkg.volume_l) === size;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });
  const otherRows = rows.filter((r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return !pkg || !KEG_SIZES.includes(Number(pkg.volume_l));
  });
  const otherCount = otherRows.reduce((s, r) => s + Number(r.quantity), 0);
  const otherLiters = otherRows.reduce((s, r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
  }, 0);
  const totalCount = sizeBuckets.reduce((s, b) => s + b.count, 0) + otherCount;
  const totalLiters = sizeBuckets.reduce((s, b) => s + b.liters, 0) + otherLiters;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <span>🛢️</span>
            <span>{mode === 'entry_only' ? 'KEG (Stáčení)' : mode === 'overviews_only' ? 'KEG (Přehled)' : 'KEG (Stáčení & Přehled)'}</span>
          </span>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {mode === 'entry_only' && setPage && (
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => setPage('kegging_overview')}>
              📋 KEG (Přehled) →
            </button>
          )}
          {mode === 'overviews_only' && setPage && (
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => setPage('kegging_entry')}>
              ✏️ KEG (Stáčení) →
            </button>
          )}
          <VoiceRecorder onResult={handleVoiceResult} compact beerNames={beers.map((b) => b.name)} />
          <button className="btn-primary text-xs font-black shadow-md flex items-center gap-1.5" title="Spočítat z fotek" onClick={() => setShowCount(true)} disabled={!beers.length || !packages.length}>
            <span>📷 Zadávání z fotky</span>
          </button>
          <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs" title="Export do Excelu" onClick={() => exportKeggingToExcel(rows)} disabled={!rows.length}>📊 Export Excel</button>
        </div>
      </div>


      {/* Prehled: objednane kegy na dany tyden & tanky */}
      {mode !== 'entry_only' && (
        <>
          {/* Zbývá stočit keg — souhrn */}
          <div className="card p-4 mb-5 border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-amber-100/30">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-display font-black text-amber-950 text-sm">🛢️ Zbývá stočit keg</h3>
                <p className="text-xs text-amber-800/70 mt-0.5">Objednané sudy v týdnu {wr.label} − již stočeno = zbývá</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 bg-white/80 border border-amber-200 rounded-lg px-2.5 py-1">
                  Týden: {weekKey}
                </span>
                <button onClick={() => setWeekKey(shiftWeek(weekKey, -1))} className="w-7 h-7 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition">‹</button>
                <button onClick={() => setWeekKey(shiftWeek(weekKey, 1))} className="w-7 h-7 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition">›</button>
              </div>
            </div>

            {orderedByBeerSize.remainingSizeList.length === 0 ? (
              <div className="text-sm text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded-xl px-4 py-3 font-bold flex items-center gap-2">
                <span>✅</span>
                <span>Všechny objednané sudy jsou již stočeny!</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {orderedByBeerSize.remainingSizeList.map((r) => (
                  <div key={r.volume} className="rounded-xl bg-white border-2 border-amber-200/80 px-4 py-2.5 text-center shadow-xs">
                    <div className="text-[10px] uppercase tracking-wider text-amber-800 font-black">KEG {r.volume} L</div>
                    <div className="font-display font-black text-2xl text-amber-950">{r.remaining}</div>
                    <div className="text-xs text-amber-700 font-bold">ks zbývá</div>
                  </div>
                ))}
              </div>
            )}

            {orderedByBeerSize.list.length > 0 && (
              <details className="mt-3 group">
                <summary className="text-xs font-bold text-amber-800 cursor-pointer hover:text-amber-950 select-none">
                  📋 Rozpis podle piv ({orderedByBeerSize.list.length})
                </summary>
                <div className="mt-2 space-y-1">
                  {orderedByBeerSize.list.map((r) => (
                    <div key={`${r.beerKey}|${r.volume}`} className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-1.5 border border-amber-200/60">
                      <span className="font-semibold text-amber-950">{r.beerName}</span>
                      <span className="text-amber-800">
                        KEG {r.volume} L · objednáno: <strong>{r.ordered}</strong> ks
                        {r.remaining > 0 ? (
                          <span className="text-rose-700 ml-1">· zbývá: <strong>{r.remaining}</strong> ks</span>
                        ) : (
                          <span className="text-emerald-700 ml-1">· ✅ hotovo</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Aktivní sklepní tanky - přehled */}
          {activeCellarTanks.length === 0 ? (
            <div className="card p-4 mb-5 border-dashed border-2 border-warning-200 bg-warning-50/30 text-warning-800 text-sm">
              ⚠️ Žádný sklepní tank není aktivní. Spusť tank v sekci <strong>Sklep</strong>, poté se tady objeví pro stáčení.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
              {activeCellarTanks.map((t) => {
                const initialVol = Number(t.initial_volume_l ?? t.capacity_l);
                const s = tankSummary.get(t.id) ?? { kegCount: 0, sourceL: 0 };
                const remaining = Math.max(initialVol - s.sourceL, 0);
                const pct = initialVol > 0 ? Math.min((s.sourceL / initialVol) * 100, 100) : 0;
                const selected = cellarTankId === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setCellarTankId(t.id)}
                    className={`card p-4 text-left transition-all ${selected ? 'ring-2 ring-primary-600 bg-primary-50/60' : 'hover:bg-primary-50/30'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold text-primary-900">{t.label}</div>
                      {selected && <span className="chip bg-primary-900 text-white text-[10px]">Vybráno</span>}
                    </div>
                    <div className="text-sm text-primary-700 font-medium mt-0.5">{t.current_beer_name ?? '—'}</div>
                    <div className="mt-2 h-2 bg-primary-100 rounded-full overflow-hidden">
                      <div className="h-full bg-success-500 rounded-full" style={{ width: `${Math.max(pct, 3)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-primary-500 mt-1">
                      <span>{pct.toFixed(0)}% stočeno</span>
                      <span>{remaining.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l zbývá</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Přehled stáčení sudů podle velikosti */}
          {rows.length > 0 && (
            <div className="card p-4 mb-5">
              <h3 className="font-display font-bold text-primary-900 mb-3">Přehled stáčení sudů podle velikosti</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {sizeBuckets.map((b) => (
                  <div key={b.size} className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Keg {b.size} l</div>
                    <div className="font-display font-bold text-2xl text-primary-900 mt-1">{b.count}</div>
                    <div className="text-xs text-primary-600">{b.liters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</div>
                  </div>
                ))}
                {otherCount > 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/20 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-primary-500 font-semibold">Ostatní</div>
                    <div className="font-display font-bold text-2xl text-primary-900 mt-1">{otherCount}</div>
                    <div className="text-xs text-primary-600">{otherLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</div>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-primary-100 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-primary-700">
                  Celkem <strong className="text-primary-900">{totalCount} ks</strong> sudů ·
                  <strong className="text-primary-900"> {totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</strong>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizeBuckets.filter((b) => b.count > 0).map((b) => (
                    <span key={b.size} className="chip bg-primary-100 text-primary-700 text-xs">{b.size} l: {b.count} ks</span>
                  ))}
                  {otherCount > 0 && <span className="chip bg-primary-100 text-primary-700 text-xs">ostatní: {otherCount} ks</span>}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Zápis stáčení — multi-row (12 řádků pivo+obal+množství najednou) */}
      {mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card p-4 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mb-4">
          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <label className="label">Výchozí pivo pro nové řádky (nepovinné)</label>
            <select className="input" value={cellarTankId} onChange={(e) => setCellarTankId(e.target.value)}>
              <option value="">— nevyplňovat automaticky —</option>
              {activeCellarTanks.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.current_beer_name ?? '—'} ({Number(t.current_volume_l).toLocaleString('cs-CZ')} l)</option>)}
            </select>
            <p className="text-[11px] text-primary-400 mt-1">Tank pro odečet se u každého řádku dohledá automaticky podle piva, tohle jen předvyplní prázdné řádky.</p>
          </div>
          <div>
            <label className="label">Ztráta celkem (l)</label>
            <input type="number" step="0.1" className="input" placeholder="l" value={lossL} onChange={(e) => setLossL(e.target.value)} inputMode="decimal" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950">Řádky stáčení (pivo + obal + množství)</div>
          <div className="flex items-center gap-2">
            <VoiceRecorder onResult={handleVoiceResult} compact beerNames={beers.map((b) => b.name)} />
            <button type="button" className="btn-primary text-xs !py-1 !px-2.5 shadow-xs flex items-center gap-1.5" title="Spočítat z fotek" onClick={() => setShowCount(true)} disabled={!beers.length || !packages.length}>
              <span>📷 Zadávání z fotky</span>
            </button>
          </div>
        </div>

        {/* Hlavička tabulky pro přesné zarovnání */}
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-black text-amber-950/70 uppercase tracking-wider border-b-2 border-amber-200/80 mb-2 bg-amber-500/5 rounded-t-xl">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Pivo</div>
          <div className="col-span-4">Obal (KEG)</div>
          <div className="col-span-2 text-center">Množství (ks)</div>
          <div className="col-span-1 text-right">Smazat</div>
        </div>

        <div className="space-y-1 bg-white rounded-xl border border-neutral-200/90 divide-y divide-neutral-100 overflow-hidden shadow-2xs">
          {entryRows.map((r, i) => {
            const rowBeer = beers.find((b) => b.id === r.beerId);
            const filled = r.pkgId && r.qty && Number(r.qty) > 0;
            const rowTank = r.beerId ? findTankForBeer(r.beerId) : undefined;
            const noTankWarning = !!r.beerId && !rowTank;
            return (
              <div key={i} className={`p-1.5 sm:px-3 sm:py-2 transition-colors ${filled ? 'bg-amber-50/60' : 'hover:bg-neutral-50/60'}`}>
                <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-center">
                  <div className="col-span-1 flex justify-center">
                    <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg text-[10px] sm:text-xs font-black grid place-items-center ${filled ? 'bg-amber-950 text-amber-100' : 'bg-neutral-100 text-neutral-600'}`}>
                      {i + 1}
                    </span>
                  </div>
                  <div className="col-span-11 sm:col-span-4 flex items-center gap-1.5">
                    <div className="w-3.5 shrink-0 flex items-center justify-center">
                      {rowBeer && (
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(rowBeer) }} />
                      )}
                    </div>
                    <select className="input !py-1.5 !px-2 text-xs sm:text-sm font-semibold w-full" value={r.beerId} onChange={(e) => setRowField(i, 'beerId', e.target.value)}>
                      <option value="">— pivo —</option>
                      {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                    </select>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <select className="input !py-1.5 !px-2 text-xs sm:text-sm font-semibold w-full" value={r.pkgId} onChange={(e) => setRowField(i, 'pkgId', e.target.value)}>
                      <option value="">— obal —</option>
                      {kegPackages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => setRowField(i, 'qty', String(Math.max(0, (Number(r.qty) || 0) - 1)))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-neutral-100 hover:bg-amber-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="Odečíst 1">−</button>
                      <input type="number" min={0} className="input !py-1.5 !px-1 text-xs sm:text-sm font-bold text-center min-w-0 flex-1" placeholder="ks" value={r.qty}
                        onChange={(e) => setRowField(i, 'qty', e.target.value)} inputMode="numeric" />
                      <button type="button" onClick={() => setRowField(i, 'qty', String((Number(r.qty) || 0) + 1))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-amber-950 hover:bg-amber-900 text-white font-bold text-sm select-none active:scale-95 transition" title="Přidat 1">+</button>
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {(r.pkgId || r.qty || r.beerId) && (
                      <button type="button" onClick={() => setEntryRows((rs) => rs.map((row, idx) => idx === i ? { beerId: '', pkgId: '', qty: '' } : row))}
                        className="w-6 h-6 grid place-items-center rounded-lg text-danger-400 hover:bg-danger-50 hover:text-danger-600 text-xs font-bold transition" title="Vymazat řádek">✕</button>
                    )}
                  </div>
                </div>
                {rowTank && filled && (
                  <div className="ml-8 sm:ml-11 mt-1 text-[11px] text-success-700 font-medium">
                    ✓ Bere se z tanku <strong>{rowTank.label}</strong> ({Number(rowTank.current_volume_l).toLocaleString('cs-CZ')} l)
                  </div>
                )}
                {noTankWarning && (
                  <div className="ml-8 sm:ml-11 mt-1 text-[11px] text-warning-700 font-medium">
                    ⚠️ Pro toto pivo není aktivní tank — zapíše se bez odečtu objemu z tanku.
                  </div>
                )}
              </div>
            );
          })}
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <Field2 label="Poznámka" value={note} onChange={setNote} />
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full !py-2.5" disabled={saving}>
              {saving ? 'Ukládám…' : `+ Uložit (${rowsSummary.totalQty} ks)`}
            </button>
          </div>
        </div>

        {(rowTankPreview.perTank.size > 0 || rowTankPreview.missingCount > 0) && (
          <div className="text-xs mt-3 bg-accent-50 border border-accent-100 rounded-lg px-3 py-2 space-y-1.5">
            {Array.from(rowTankPreview.perTank.entries()).map(([tankId, l]) => {
              const t = cellarTanks.find((x) => x.id === tankId);
              if (!t) return null;
              const remaining = Math.max(Number(t.current_volume_l) - l, 0);
              return (
                <div key={tankId} className="flex justify-between">
                  <span className="text-primary-600">Tank <strong>{t.label}</strong> ({t.current_beer_name ?? '—'}) — bude odečteno:</span>
                  <span className="font-semibold text-danger-600">−{l.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l <span className="text-primary-500 font-normal">(zbude {remaining.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l)</span></span>
                </div>
              );
            })}
            {rowTankPreview.missingCount > 0 && (
              <div className="text-warning-700">⚠️ {rowTankPreview.missingCount} řádek/řádky bez nalezeného tanku — uloží se bez odečtu objemu.</div>
            )}
          </div>
        )}
        {err && <div className="text-sm text-danger-600 mt-3 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
      </form>
      )}

      {/* Přehled zadaných záznamů */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
            <span>📋</span>
            <span>{mode === 'entry_only' ? 'Přehled zadaných záznamů stáčení KEG' : 'Všechny záznamy stáčení KEG'}</span>
          </div>
          {rows.length > 0 && <span className="chip bg-amber-100 text-amber-900 text-xs font-bold">{rows.length} záznamů</span>}
        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState text="Zatím žádné záznamy. Přidej první výše." icon="📝" />
        ) : (
          <div className="card overflow-hidden animate-fade-in border-2 border-neutral-200">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table">
                <thead>
                  <tr>
                    <th>Datum</th><th>Pivo</th><th>Obal</th><th className="text-right">Množství</th><th>Sklep tank</th><th className="text-right">Stočeno</th><th className="text-right">Ztráta</th><th>Poznámka</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const cellar = cellarTanks.find((t) => t.id === r.cellar_tank_id);
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
                              className="w-7 h-7 grid place-items-center rounded-lg bg-primary-900 text-white hover:bg-primary-800 transition text-sm font-bold" title="Přidat 1 keg">+</button>
                          </div>
                        </td>
                        <td className="text-primary-700">{cellar ? cellar.label : '—'}</td>
                        <td className="text-right text-primary-700">{r.source_volume_l ? Number(r.source_volume_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '—'}</td>
                        <td className={`text-right ${Number(r.loss_l) > 0 ? 'text-danger-600 font-semibold' : 'text-primary-600'}`}>{r.loss_l != null && Number(r.loss_l) > 0 ? Number(r.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) : '—'}</td>
                        <td className="text-primary-600 max-w-[200px] truncate" title={r.note ?? ''}>{r.note ?? ''}</td>
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
      {showCount && (
        <CountFromImage
          table="kegging"
          beers={beers}
          packages={packages}
          onClose={() => setShowCount(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Field2({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="poznámka" />
    </div>
  );
}
