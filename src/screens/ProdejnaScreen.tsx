import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerName, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ProdejnaFromImage } from '../components/ProdejnaFromImage';
import { BarChart3, Calendar, CalendarDays, Camera, Check, ClipboardList, Copy, Package as PackageIcon, PenLine, Store, Trash2, X, type LucideIcon } from 'lucide-react';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';
import { TapReservationModal } from '../components/TapReservationModal';
import { detectTapType } from '../lib/tapReservations';
import type { TapReservation } from './VycepyScreen';
import { BeerTileGrid, BeerTilePanel, TileTotalBar } from '../components/BeerTileGrid';
import { chyba, potvrd, toastZpet } from '../lib/toast';
import { podezreleMnozstvi } from '../lib/kontrolaZadani';
import { zavibruj } from '../lib/haptika';

// Tři podoby jednoho výdeje ze skladu — formulář je pořád stejný, mění se
// jen tabulka, do které se zapisuje, a jedno pole navíc. Podle toho se pak
// zápis dostane do správného listu měsíčního exportu:
//   fasovani_private → „Fasování prodejna"
//   fasovani         → „Odběr personál"
//   writeoffs        → „Vzorky promo a PR"
//
// Pojmenované jsou podle toho, KAM výdej jde, ne podle názvu tabulky —
// fasovani_private je historicky prodejna, ne personál.
const DRUHY_VYDEJE = [
  {
    tabulka: 'fasovani_private', stranka: 'prodejna', popis: 'Prodejna',
    poleNavic: null, popisek: '', napoveda: '',
  },
  {
    tabulka: 'fasovani', stranka: 'fasovani', popis: 'Personál',
    poleNavic: 'jmeno', popisek: 'Pro koho',
    napoveda: 'Jméno — komu se fasuje',
  },
  {
    tabulka: 'writeoffs', stranka: 'writeoffs', popis: 'Odpis',
    poleNavic: 'duvod', popisek: 'Důvod odpisu',
    napoveda: 'Proč se odepisuje (zkažené, rozbitá láhev…)',
  },
] as const;

/** Nastavení právě zvoleného druhu výdeje. */
const druhVydeje = (tabulka: string) =>
  DRUHY_VYDEJE.find((d) => d.tabulka === tabulka) ?? DRUHY_VYDEJE[0];

const ROW_COUNT = 12;
const FASOVANI_ROW_COUNT = 6;
type RowInput = { beerId: string; pkgId: string; qty: string; vycep: boolean; who?: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '', vycep: false, who: '' });
const emptyRows = (count: number): RowInput[] => Array.from({ length: count }, emptyItem);

export default function ProdejnaScreen({ setPage, mode = 'all', table = 'fasovani_private', title = 'Fasování', Ikona = Store, showVycep = false }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all'; table?: string; title?: string; Ikona?: LucideIcon; showVycep?: boolean } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(() => emptyRows(table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT));

  // 💾 Rozepsaný zápis přežije zavření aplikace.
  // Na telefonu se z appky vypadne kdykoli — přijde hovor, přepne se okno,
  // systém ji uspí. Dřív se tím rozdělaný výdej ztratil a člověk počítal
  // znovu. Drží se zvlášť pro každý druh výdeje, ať si personál a odpis
  // nepřepisují rozdělanou práci navzájem.
  const klicRozdelane = `rozdelany_vydej_${table}`;
  const obnovenoRef = useRef(false);

  useEffect(() => {
    obnovenoRef.current = false;
    try {
      const ulozene = localStorage.getItem(klicRozdelane);
      if (!ulozene) return;
      const d = JSON.parse(ulozene);
      if (Array.isArray(d?.entryRows) && d.entryRows.some((r: RowInput) => r?.pkgId && Number(r?.qty) > 0)) {
        setEntryRows(d.entryRows);
        if (typeof d.who === 'string') setWho(d.who);
        if (typeof d.note === 'string') setNote(d.note);
        if (typeof d.date === 'string' && d.date) setDate(d.date);
      }
    } catch { /* rozbitý záznam radši zahodit než spadnout */ }
    finally { obnovenoRef.current = true; }
  }, [table]);

  useEffect(() => {
    // Ukládat až po pokusu o obnovu, jinak by prázdný výchozí stav přepsal
    // to, co se právě chystáme načíst.
    if (!obnovenoRef.current) return;
    try {
      const jeCo = entryRows.some((r) => r.pkgId && Number(r.qty) > 0) || who.trim() || note.trim();
      if (jeCo) localStorage.setItem(klicRozdelane, JSON.stringify({ entryRows, who, note, date }));
      else localStorage.removeItem(klicRozdelane);
    } catch { /* plné úložiště nesmí shodit zápis */ }
  }, [entryRows, who, note, date, klicRozdelane]);
  const [expandedProdejnaBeerId, setExpandedProdejnaBeerId] = useState<string | null>(null);
  const expandedProdejnaBeer = beers.find((b) => b.id === expandedProdejnaBeerId) ?? null;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);

  // Zápis / Přehled záložky
  const [tab, setTab] = useState<'zapis' | 'prehled'>('zapis');

  // Filtry v Přehledu — druh (pivo), jméno (kdo) a měsíc; výchozí je aktuální měsíc.
  const [overviewMonth, setOverviewMonth] = useState(new Date().toISOString().slice(0, 7));
  const [overviewBeerId, setOverviewBeerId] = useState('');
  const [overviewWho, setOverviewWho] = useState('');

  // 🚰 Rezervace výčepu — stav pro modální okno
  const [showTapModal, setShowTapModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [tapModalRowIndex, setTapModalRowIndex] = useState<number | undefined>(undefined);

  // Prodejna nemá pole navíc; personál má jméno, odpis důvod.
  const druh = druhVydeje(table);
  const showWhoColumn = druh.poleNavic !== null;

  const filteredRows = useMemo(() => {
    const whoNeedle = overviewWho.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (overviewMonth && !(r.entry_date ?? '').startsWith(overviewMonth)) return false;
        if (overviewBeerId && r.beer_id !== overviewBeerId) return false;
        if (whoNeedle && !getRowWho(r).toLowerCase().includes(whoNeedle)) return false;
        return true;
      })
      .sort((a, b) => {
        const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
        if (dateCmp !== 0) return dateCmp;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });
  }, [rows, overviewMonth, overviewBeerId, overviewWho]);

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

  // Prodejna = lahve + sudy (lahve na začátku)
  const ALLOWED_PKG_VOLUMES = [50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33];
  const shopPackages = useMemo(() => {
    const allowed = (p: Package) => ALLOWED_PKG_VOLUMES.includes(Number(p.volume_l));
    const bottles = packages.filter((p) => p.kind === 'bottle' && allowed(p)).sort((a, b) => b.volume_l - a.volume_l);
    const kegs = packages.filter((p) => p.kind === 'keg' && allowed(p)).sort((a, b) => b.volume_l - a.volume_l);
    return [...bottles, ...kegs];
  }, [packages]);

  async function load(silent = false) {
    if (!silent && !rows.length) setLoading(true);
    const [fp, b, p] = await Promise.all([
      supabase.from(table).select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    setRows((fp.data as EntryRow[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    setLoading(false);
  }
  // Přepnutí druhu výdeje mění tabulku, ze které se čte. Komponenta se přitom
  // schválně NEodmountuje (viz App.tsx), aby se neztratily rozepsané řádky —
  // proto se musí načíst znovu podle table, jinak by v přehledu zůstal
  // seznam z předchozí tabulky.
  useEffect(() => { load(); }, [table]);
  useRealtime([table, 'beers', 'packages'], () => load(true));

  function setRowField(i: number, field: keyof RowInput, value: string | boolean) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  // Zadávání přes dlaždice piv: čte/zapisuje do stejného pole entryRows (fixní
  // řádky) jako tabulka níže — najde existující řádek pro dané pivo+obal, jinak
  // použije první prázdný slot. Tabulka pod dlaždicemi zůstává pro ruční úpravy
  // (např. rozdělení stejného piva/obalu mezi dvě různé osoby).
  function tileQtyFor(beerId: string, pkgId: string): number {
    const row = entryRows.find((r) => r.beerId === beerId && r.pkgId === pkgId);
    return row ? Number(row.qty || 0) : 0;
  }
  function setTileRow(beerId: string, pkgId: string, patch: Partial<RowInput>) {
    setEntryRows((rs) => {
      const idx = rs.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
      if (idx >= 0) return rs.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      const emptyIdx = rs.findIndex((r) => !r.beerId && !r.pkgId);
      const base: RowInput = { ...emptyItem(), beerId, pkgId };
      if (emptyIdx >= 0) return rs.map((r, i) => (i === emptyIdx ? { ...base, ...patch } : r));
      return [...rs, { ...base, ...patch }];
    });
  }

  function getRowWho(r: EntryRow) {
    if (r.who) return r.who;
    if (r.note) {
      const match = r.note.match(/^\[(.*?)\]/);
      if (match) return match[1];
    }
    return '—';
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    // Kontroluje se i PIVO, ne jen obal a množství. Bez piva se sice záznam
    // uložil a byl vidět v seznamu, ale VŠECHNY skladové výpočty ho přeskočí
    // (filtrují `if (!beer_id || !package_id) return`) — pivo se tedy nikdy
    // neodečetlo ze skladu a nikdo nezjistil proč.
    const rozepsane = entryRows.filter((r) => r.pkgId || Number(r.qty) > 0 || r.beerId);
    const bezPiva = rozepsane.filter((r) => !r.beerId && (r.pkgId || Number(r.qty) > 0));
    if (bezPiva.length > 0) {
      setErr('U každého vyplněného řádku vyberte pivo — bez něj by se záznam neodečetl ze skladu.');
      return;
    }
    const filled = entryRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (pivo, obal a množství).'); return; }

    // Přehmat o řád (12 → 120) — stejná pojistka jako ve Stáčení KEG
    // a v Lahvích. Výdej a odpis hýbou skladem úplně stejně, takže tady
    // chyběla bez důvodu. Neblokuje: velká akce je legitimní, jen se zeptá.
    for (const r of filled) {
      const historie = rows
        .filter((x) => x.beer_id === r.beerId && x.package_id === r.pkgId)
        .map((x) => Number(x.quantity || 0));
      const popis = `${beers.find((b) => b.id === r.beerId)?.name ?? 'Pivo'} · ${packages.find((p) => p.id === r.pkgId)?.label ?? 'obal'}`;
      const dotaz = podezreleMnozstvi(Number(r.qty), historie, popis);
      if (dotaz && !(await potvrd(dotaz, { titulek: 'Zkontrolujte množství', potvrdit: 'Ano, uložit' }))) return;
    }

    setSaving(true);

    // Tabulka `writeoffs` nemá sloupec `note` (jen `who` a `reason`) — na
    // rozdíl od bottling/kegging/fasovani. Nepodmíněné poslání `note` klíče
    // v payloadu shodilo KAŽDÝ zápis na Odpisu s PGRST204 ("Could not find
    // the 'note' column"), tiše (chyba se sice zobrazila v `err`, ale
    // vypadalo to jako obecná porucha) — tady ho proto vynecháváme.
    const isWriteoffs = table === 'writeoffs';
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      const person = r.who?.trim() || who.trim();
      return {
        entry_date: date,
        who: person || null,
        beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: n,
        ...(isWriteoffs ? {} : { note: note || null }),
      };
    });

    let { error } = await supabase.from(table).insert(payloads);
    if (error && (error.message?.includes("'who'") || error.message?.includes("who"))) {
      const fallbackPayloads = filled.map((r) => {
        const beer = beers.find((b) => b.id === r.beerId);
        const pkg = packages.find((p) => p.id === r.pkgId);
        const n = Number(r.qty);
        const person = r.who?.trim() || who.trim();
        const combinedNote = person ? (note ? `[${person}] ${note}` : `[${person}]`) : note;
        return {
          entry_date: date,
          beer_id: r.beerId || null, beer_name: beer?.name ?? null,
          package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: n,
          ...(isWriteoffs ? {} : { note: combinedNote || null }),
        };
      });
      const res = await supabase.from(table).insert(fallbackPayloads);
      error = res.error;
    }

    setSaving(false);
    if (error) { setErr(error.message); return; }

    setEntryRows(emptyRows(table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT)); setWho(''); setNote(''); setErr(null);
    try { localStorage.removeItem(klicRozdelane); } catch { /* uklizeno i tak */ }
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);

    // ↩️ Vrátit zpět i po ULOŽENÍ, ne jen po smazání. Nebezpečný překlep je
    // ten, který něco PŘIDÁ — omylem uložený výdej odečte pivo ze skladu a
    // najde se to až u inventury. Maže se přesně to, co se právě vložilo
    // (podle data, piva, obalu a množství), vždy nejnovější řádek a nejvýš
    // jeden na položku — kdyby někdo mezitím zapsal totéž znovu, jeho
    // řádek zůstane.
    const kusuCelkem = filled.reduce((a, r) => a + Number(r.qty), 0);
    toastZpet(
      `Uloženo ${filled.length} ${filled.length === 1 ? 'řádek' : 'řádky'} — ${kusuCelkem} ks.`,
      async () => {
        for (const r of filled) {
          const { data: nalezene } = await supabase
            .from(table)
            .select('id')
            .eq('entry_date', date)
            .eq('beer_id', r.beerId)
            .eq('package_id', r.pkgId)
            .eq('quantity', Number(r.qty))
            .order('created_at', { ascending: false })
            .limit(1);
          const id = ((nalezene as any[]) ?? [])[0]?.id;
          if (id) {
            const { error: chybaMazani } = await supabase.from(table).delete().eq('id', id);
            if (chybaMazani) throw chybaMazani;
          }
        }
        load(true);
      },
    );
  }

  async function del(id: string) {
    const row = rows.find((r) => r.id === id);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { chyba(error); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    load(true);
    if (!row) return;

    zavibruj('odskrtnuto');
    toastZpet(
      `Smazáno: ${row.beer_name ?? 'pivo'} ${row.package_label ?? ''} × ${row.quantity} ks`,
      async () => {
        // Zapisuje se zpátky do TÉŽE tabulky, ze které se mazalo — kdyby se
        // mezitím přepnul druh výdeje, řádek by jinak skončil jinde.
        const { error: chybaVraceni } = await supabase.from(table).insert(row);
        if (chybaVraceni) throw chybaVraceni;
        load(true);
      },
    );
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from(table).update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
    load(true);
  }

  // Hlasový zápis: přepis se rozparsuje a naplní se první volné prázdné řádky.
  function handleVoiceResult(text: string) {
    const parsed = parseFreeTextEntries(text, beers, packages, aliasMap);
    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar 0.5".'); return; }
    setEntryRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) break;
        next[cursor] = { beerId: p.beer_id ?? '', pkgId: p.package_id ?? '', qty: p.quantity != null ? String(p.quantity) : '', vycep: false };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }

  // 🚰 Po potvrzení / přeskočení rezervace výčepu
  // Zpracuje text naceny z fotky pri stejnem parseru zkratek jako objednavky (12, 12sv, svetly, lezak => 12° Svetla).
  function handlePhotoText(text: string) {
    handleVoiceResult(text);
  }

  function handleTapModalDone() {
    setShowTapModal(false);
    setTapModalRowIndex(undefined);
  }

  function formatDate(d: string | null | undefined) {
    if (!d) return '—';
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[2]}.${parts[1]}.`;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar — bez ukotvení (žádný prvek na téhle obrazovce nezůstává přilepený). */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <Ikona className="ikona-text" />
            <span>{setPage && mode === 'all' ? 'Fasování' : title}</span>
          </span>
        </div>
      </div>

      {/* Záložky: Zápis / Přehled */}
      <div className="flex items-center gap-1 bg-white p-1 rounded border border-neutral-200 shadow-2xs w-fit">
        <button
          type="button"
          onClick={() => setTab('zapis')}
          className={`px-4 py-1.5 rounded text-xs font-black transition ${tab === 'zapis' ? 'bg-neutral-700 text-white shadow-xs' : 'bg-white text-neutral-900 hover:bg-neutral-100'}`}
        >
          <PenLine className="ikona-text" /> Zápis
        </button>
        <button
          type="button"
          onClick={() => setTab('prehled')}
          className={`px-4 py-1.5 rounded text-xs font-black transition ${tab === 'prehled' ? 'bg-neutral-700 text-white shadow-xs' : 'bg-white text-neutral-900 hover:bg-neutral-100'}`}
        >
          <BarChart3 className="ikona-text" /> Přehled
        </button>
      </div>

      {/* ===== ZÁPIS ===== */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card px-2 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20' : ''}`}>
          {/* Kam výdej jde. Je to pořád tentýž formulář — podle volby se mění
              jen tabulka, do které se zapisuje, a jedno pole navíc. Sedí to
              hned nad tím polem, aby bylo vidět, co volba způsobí. */}
          {setPage && mode === 'all' && (
            <div className="mb-4">
              <label className="label">Kam se vydává</label>
              <div className="grid grid-cols-3 gap-2">
                {DRUHY_VYDEJE.map((d) => {
                  const zvoleno = d.tabulka === table;
                  return (
                    <button
                      key={d.tabulka}
                      type="button"
                      onClick={() => { if (!zvoleno) { zavibruj('klik'); setPage(d.stranka); } }}
                      aria-pressed={zvoleno}
                      className={`min-h-[52px] px-3 rounded border-2 font-black text-sm transition inline-flex items-center justify-center gap-2 ${
                        zvoleno
                          ? 'bg-amber-500 border-amber-600 text-neutral-950 shadow-xs'
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 ${
                          zvoleno ? 'bg-neutral-950 border-neutral-950 text-amber-400' : 'border-neutral-300'
                        }`}
                      >
                        {zvoleno ? <Check size={12} strokeWidth={4} /> : null}
                      </span>
                      {d.popis}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 items-end mb-2">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {showWhoColumn && (
              <div>
                <label className="label">{druh.popisek}</label>
                <input
                  type="text"
                  className="input"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder={druh.napoveda}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <span className="text-xs font-bold text-neutral-600 bg-neutral-100 rounded px-3 py-2">
              <PackageIcon className="ikona-text" /> {rowsSummary.totalQty} ks · {rowsSummary.totalL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L
            </span>
            {/* Rezervace výčepu patří sem, ne k jednotlivým obalům: rezervuje
                se výčep, ne konkrétní velikost sudu, a u každého obalu to jen
                zabíralo místo a otevíralo dialog omylem. */}
            {showVycep && (
              <button
                type="button"
                onClick={() => { setTapModalRowIndex(undefined); setShowTapModal(true); }}
                className="px-3 py-2 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-black text-xs transition"
              >
                Rezervovat výčep
              </button>
            )}
          </div>

          <TileTotalBar label="Zatím zapsáno" value={`${rowsSummary.totalQty} ks · ${rowsSummary.totalL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L`} />
          <div className="mb-2">
            <span className="text-[11px] text-neutral-400 font-medium">klepni na dlaždici a zadej obaly a množství</span>
          </div>
          <div className="mb-4">
            <BeerTileGrid
              beers={beers.filter((b) => b.is_active)}
              onSelect={(b) => setExpandedProdejnaBeerId(b.id)}
              summaryFor={(b) => {
                const beerRows = entryRows.filter((r) => r.beerId === b.id && Number(r.qty) > 0);
                const label = beerRows
                  .map((r) => {
                    const pkg = packages.find((p) => p.id === r.pkgId);
                    return pkg ? `${r.qty}×${Math.round(Number(pkg.volume_l) * 100) / 100}` : null;
                  })
                  .filter(Boolean)
                  .join(', ');
                return { filled: beerRows.length > 0, label };
              }}
            />
          </div>

          {expandedProdejnaBeer && (
            <BeerTilePanel
              beer={expandedProdejnaBeer}
              onClose={() => setExpandedProdejnaBeerId(null)}
              headerRight={showWhoColumn ? (
                /* „Pro koho" patří do lišty, ne k jednotlivým obalům: fasuje se
                   jednomu člověku najednou a pole u každé velikosti dělalo z
                   panelu na telefonu nekonečný sloupec. */
                <input
                  type="text"
                  className="min-w-0 flex-1 px-2 py-1.5 rounded bg-white/90 border border-black/10 text-sm font-bold text-neutral-900 placeholder:font-medium placeholder:text-neutral-500"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder={druh.popisek}
                  aria-label={druh.popisek}
                />
              ) : undefined}
            >
              {shopPackages.map((p) => {
                const qty = tileQtyFor(expandedProdejnaBeer.id, p.id);
                return (
                  <div key={p.id} className="rounded border border-neutral-200 dark:border-neutral-700 py-1 px-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200 truncate">{formatPackageLabel(p.label)}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setTileRow(expandedProdejnaBeer.id, p.id, { qty: String(Math.max(0, qty - 1)) })} className="w-10 h-10 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xl transition disabled:opacity-30 select-none" disabled={qty <= 0}>−</button>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          min={0}
                          inputMode="numeric"
                          value={qty || ''}
                          placeholder="0"
                          onChange={(e) => setTileRow(expandedProdejnaBeer.id, p.id, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                          className="w-14 h-10 text-center text-lg font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded"
                        />
                        <button type="button" onClick={() => setTileRow(expandedProdejnaBeer.id, p.id, { qty: String(qty + 1) })} className="w-10 h-10 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xl transition select-none">+</button>
                      </div>
                  </div>
                );
              })}
            </BeerTilePanel>
          )}

          {/* Souhrn zapsaných položek — jen ke čtení, úprava se dělá kliknutím na dlaždici výše. */}
          {entryRows.some((r) => r.pkgId && Number(r.qty) > 0) && (
            <div className="rounded border border-neutral-200 bg-white p-3 space-y-1.5 mb-4">
              <div className="text-[11px] font-black uppercase tracking-wider text-neutral-500 mb-1">Zapsáno</div>
              {entryRows.filter((r) => r.pkgId && Number(r.qty) > 0).map((r, i) => {
                const beer = beers.find((b) => b.id === r.beerId);
                const pkg = packages.find((p) => p.id === r.pkgId);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs font-bold text-neutral-800 py-1.5 border-b border-neutral-100 last:border-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                      <span className="truncate">{beerName(beer)} {pkg ? `· ${formatPackageLabel(pkg.label)}` : ''}</span>
                      {showWhoColumn && r.who && <span className="text-neutral-400 font-medium shrink-0">· {r.who}</span>}
                    </span>
                    <span className="font-black text-emerald-700 shrink-0">{r.qty} ks</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Poznámka pod tabulkou */}
          <div className="mt-3">
            <label className="label">Poznámka</label>
            <input className="input text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="nepovinná poznámka" />
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary !rounded !from-emerald-600 !to-emerald-700 hover:!from-emerald-500 hover:!to-emerald-600 !shadow-emerald-600/30 text-xs font-black shadow-md">
                {saving ? 'Ukládám…' : 'Uložit fasování'}
              </button>
              <button type="button" className="btn-ghost !rounded text-xs" onClick={() => setEntryRows(emptyRows(table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT))}><Trash2 className="ikona-text" /> Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

        </form>
      )}

      {/* Voice recorder mimo form */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <div className="flex justify-end -mt-4 mb-2 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="btn-secondary flex items-center gap-2 border-amber-300 text-amber-900 bg-white hover:bg-amber-50 shadow-xs py-2 px-3 text-xs font-black"
          >
            <Camera size={16} /> Číst z fotky
          </button>
          <VoiceRecorder onResult={handleVoiceResult} beerNames={beers.map((b) => b.name)} />
        </div>
      )}

      {/* ===== PŘEHLED ===== */}
      {tab === 'prehled' && mode !== 'entry_only' && (
        <>
          {/* Všechny záznamy */}
          <div className="mt-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
                <span><ClipboardList className="ikona-text" /></span>
                <span>Záznamy fasování</span>
              </div>
              <div className="flex items-center gap-2">
                {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={overviewMonth}
                onChange={(e) => setOverviewMonth(e.target.value)}
                className="input !py-1.5 !px-3 text-xs font-semibold"
              />
              <select
                value={overviewBeerId}
                onChange={(e) => setOverviewBeerId(e.target.value)}
                className="input !py-1.5 !px-3 text-xs font-semibold"
              >
                <option value="">Všechna piva</option>
                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {showWhoColumn && (
                <input
                  type="text"
                  value={overviewWho}
                  onChange={(e) => setOverviewWho(e.target.value)}
                  placeholder={table === 'writeoffs' ? 'Hledat důvod…' : 'Hledat jméno…'}
                  className="input !py-1.5 !px-3 text-xs font-semibold"
                />
              )}
              {(overviewMonth !== new Date().toISOString().slice(0, 7) || overviewBeerId || overviewWho) && (
                <button
                  type="button"
                  onClick={() => { setOverviewMonth(new Date().toISOString().slice(0, 7)); setOverviewBeerId(''); setOverviewWho(''); }}
                  className="btn-ghost !rounded text-xs font-bold !py-1.5 !px-3"
                >
                  Zrušit filtry
                </button>
              )}
            </div>

            {loading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              <EmptyState text="Zatím žádné záznamy. Přidej první v záložce Zápis." icon={PenLine} />
            ) : filteredRows.length === 0 ? (
              <EmptyState text="Žádné záznamy pro toto období / filtr." icon={CalendarDays} />
            ) : (() => {
              const sortedRows = [...filteredRows].sort((a, b) => {
                const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
                if (dateCmp !== 0) return dateCmp;
                return (b.created_at ?? '').localeCompare(a.created_at ?? '');
              });
              const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);

              return (
                <div className="card p-4 border-2 border-amber-300/80 bg-white">
                  <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                    <ClipboardList className="ikona-text" /> Přehled fasování
                  </h3>
                  <ul className="md:hidden space-y-2">
                    {sortedRows.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const pkg = packages.find((p) => p.id === r.package_id);
                      const vol = pkg ? Number(pkg.volume_l) : 0;
                      return (
                        <li key={`m-${r.id}`} className="rounded border border-amber-300/80 bg-amber-50/90 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-black text-sm text-amber-950 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                                <span className="truncate">{r.beer_name ?? beer?.name ?? '—'}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-black text-xs shrink-0">{pkg ? `${vol} l` : '—'}</span>
                              </div>
                              <div className="text-[11px] font-bold text-amber-800 mt-0.5">
                                {formatDate(r.entry_date)}
                                {showWhoColumn && getRowWho(r) ? ` · ${getRowWho(r)}` : ''}
                              </div>
                            </div>
                            <div className="font-mono font-black text-2xl text-amber-950 leading-none shrink-0">{r.quantity}</div>
                          </div>

                          {/* Křížek je schválně až za mezerou od plusu — na dotyk
                              jsou to sousedi a záměna maže zápis. */}
                          <div className="flex items-stretch gap-1.5 mt-2.5">
                            <button
                              type="button"
                              className="w-12 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black transition disabled:opacity-40"
                              onClick={() => increment(r.id, -1)}
                              disabled={Number(r.quantity) <= 0}
                              title="Odebrat 1 ks"
                            >−</button>
                            <button
                              type="button"
                              className="flex-1 min-h-[44px] grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black transition"
                              onClick={() => increment(r.id, 1)}
                              title="Přidat 1 ks"
                            >+ 1 ks</button>
                            <button
                              type="button"
                              className="w-12 min-h-[44px] ml-2 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black transition"
                              onClick={() => del(r.id)}
                              title="Smazat záznam"><X size={18} /></button>
                          </div>
                        </li>
                      );
                    })}
                    <li className="rounded border-2 border-amber-400 bg-amber-200/70 px-3 py-2.5 flex items-center justify-between font-black text-amber-950">
                      <span className="text-sm"><PackageIcon className="ikona-text" /> Celkem</span>
                      <span className="font-mono text-xl">{totalCount}</span>
                    </li>
                  </ul>

                  <div className="hidden md:block rounded border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-amber-300/80 bg-amber-100/80">
                          <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                          {showWhoColumn && (
                            <th className="text-left py-1.5 px-2 font-black text-amber-950">
                              {druh.popisek}
                            </th>
                          )}
                          <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Obal</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((r) => {
                          const beer = beers.find((b) => b.id === r.beer_id);
                          const pkg = packages.find((p) => p.id === r.package_id);
                          const vol = pkg ? Number(pkg.volume_l) : 0;
                          return (
                            <tr key={r.id} className="border-b border-amber-200/60 hover:bg-amber-100/70 transition-colors">
                              <td className="py-1.5 px-2 font-mono font-bold text-amber-950 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                              {showWhoColumn && (
                                <td className="py-1.5 px-2 font-semibold text-amber-950 whitespace-nowrap">{getRowWho(r)}</td>
                              )}
                              <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                                <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{pkg ? `${vol}L` : '—'}</td>
                              <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                              <td className="py-1.5 px-2 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, -1)}
                                    disabled={Number(r.quantity) <= 0}
                                    title="Odebrat 1 ks"
                                  >−</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, 1)}
                                    title="Přidat 1 ks"
                                  >+</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition"
                                    onClick={() => del(r.id)}
                                    title="Smazat záznam"><X size={18} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {/* Souhrnný řádek */}
                        <tr className="bg-amber-200/60 font-black">
                          <td className="py-1.5 px-2 font-black text-amber-950"></td>
                          {showWhoColumn && <td className="py-1.5 px-2 font-black text-amber-950"></td>}
                          <td className="py-1.5 px-2 font-black text-amber-950"><PackageIcon className="ikona-text" /> Celkem</td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* 🚰 Modální okno pro rezervaci výčepu */}
      {showTapModal && (
        <TapReservationModal
          orderDate={date}
          customerName={title}
          tapTypeHint={detectTapType(note)}
          onConfirm={handleTapModalDone}
          onSkip={handleTapModalDone}
        />
      )}

      {showPhotoModal && (
        <ProdejnaFromImage
          isOpen={showPhotoModal}
          onClose={() => setShowPhotoModal(false)}
          beers={beers}
          packages={packages}
          onTextExtracted={handlePhotoText}
        />
      )}

    </div>
  );
}
