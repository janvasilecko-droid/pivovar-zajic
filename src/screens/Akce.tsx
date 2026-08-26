import { useEffect, useState, useMemo } from 'react';
import { supabase, Beer, Package, useRealtime, beerBg, beerText, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { createReminder } from '../lib/reminders';
import { Plus, Trash2, Check, Calendar, Sparkles, Star, DollarSign, CheckCircle2, RotateCcw, User, MapPin, ClipboardList, ThumbsUp, ThumbsDown, Bell } from 'lucide-react';
import { oznam, potvrd } from '../lib/toast';

/** Řádky z DB (akce + vnořené akce_items) → tvar, se kterým pracuje obrazovka. */
function rowsToRecords(rows: any[]): AkceRecord[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    who: r.who ?? '',
    entry_date: r.entry_date,
    status: (r.status === 'completed' ? 'completed' : 'planned') as 'planned' | 'completed',
    items: (r.items ?? []).map((it: any) => ({
      id: it.id,
      beer_id: it.beer_id ?? '',
      beer_name: it.beer_name ?? undefined,
      package_id: it.package_id ?? '',
      package_label: it.package_label ?? undefined,
      quantity_taken: Number(it.quantity_taken ?? 0),
      quantity_returned: Number(it.quantity_returned ?? 0),
    })),
    ready: r.ready ?? false,
    equipment: Array.isArray(r.equipment) ? r.equipment : undefined,
    revenue: r.revenue == null ? undefined : Number(r.revenue),
    rating: r.rating == null ? undefined : Number(r.rating),
    note: r.note ?? undefined,
    recommend: r.recommend ?? undefined,
    created_at: r.created_at ?? undefined,
  }));
}

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
  ready?: boolean;          // Připraveno na akci
  equipment?: string[];     // Vybavení na akci (checklist)
  revenue?: number;         // Tržba v Kč
  rating?: number;          // Hodnocení 1-5 hvězd
  note?: string;            // Poznámka o akci
  recommend?: 'yes' | 'no'; // Doporučení jet na akci i za rok
  created_at?: string;
};

// Výchozí seznam vybavení, které je potřeba na akci připravit
const DEFAULT_EQUIPMENT = [
  '🍺 Sudy s pivem (dle fasování)',
  '🪣 Výčepní zařízení (pípa, hadice, CO2)',
  '🥛 Sklo: Tübinger 0,5L',
  '🥛 Sklo: Tübinger 0,3L',
  '🥛 Sklo: Willy 0,5L',
  '🥛 Sklo: Willy 0,3L',
  '💰 Kasa / pokladna + drobné',
  '🧾 Faktury a doklady',
  '🪑 Stoly a židle',
  '⛱️ Stánek / slunečník',
  '🛒 Vozík na převoz',
  '🧊 Lednice / led na chlazení',
  '🗑️ Odpadkové koše',
];

type FormRow = { beer_id: string; package_id: string; qty: string };

export default function AkceScreen() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [records, setRecords] = useState<AkceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // New Event Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [who, setWho] = useState('Petr Bednář & Tým');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [itemRows, setItemRows] = useState<FormRow[]>(() =>
    Array.from({ length: 7 }, () => ({ beer_id: '', package_id: '', qty: '' }))
  );

  // Datum upomínky "říct Denisovi o kašu" = 3 dny před akcí
  const reminderDate = useMemo(() => {
    if (!entryDate) return null;
    const d = new Date(entryDate + 'T09:00:00');
    d.setDate(d.getDate() - 3);
    return d;
  }, [entryDate]);

  // Evaluation "Po akci" Modal State
  const [evalRecord, setEvalRecord] = useState<AkceRecord | null>(null);
  const [evalSoldMap, setEvalSoldMap] = useState<Record<number, string>>({});
  const [evalRevenue, setEvalRevenue] = useState<string>('');
  const [evalRating, setEvalRating] = useState<number>(5);
  const [evalNote, setEvalNote] = useState<string>('');
  const [evalRecommend, setEvalRecommend] = useState<'yes' | 'no' | ''>('');

  // Equipment checklist Modal State
  const [equipRecord, setEquipRecord] = useState<AkceRecord | null>(null);
  const [equipChecked, setEquipChecked] = useState<Record<string, boolean>>({});
  const [equipCustom, setEquipCustom] = useState<string>('');
  const [equipCustomItems, setEquipCustomItems] = useState<string[]>([]);

  async function loadData() {
    setLoading(true);
    const [{ data: b }, { data: pk }, { data: ak }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase
        .from('akce')
        .select('*, items:akce_items(id,beer_id,beer_name,package_id,package_label,quantity_taken,quantity_returned)')
        .order('entry_date', { ascending: false }),
    ]);
    setBeers((b as Beer[]) ?? []);
    setPackages((pk as Package[]) ?? []);
    setRecords(rowsToRecords((ak as any[]) ?? []));
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  // Akce se čtou i na Skladu/Dashboardu/Inventuře (spotřeba piva na akci),
  // proto posloucháme i změny z jiných zařízení.
  useRealtime(['beers', 'packages', 'akce', 'akce_items'], loadData);

  // 🚚 Jednorázový převod akcí zadaných dřív, kdy se ukládaly jen do tohoto
  // prohlížeče. Bez toho by po přechodu na databázi historické akce zmizely.
  // Běží až po prvním načtení; localStorage klíč se po úspěchu přejmenuje,
  // aby se převod neopakoval (a data zůstala dohledatelná, kdyby něco).
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      let legacy: AkceRecord[] = [];
      try {
        const raw = localStorage.getItem('akce_records_v2');
        if (!raw) return;
        legacy = JSON.parse(raw);
      } catch { return; }
      if (!Array.isArray(legacy) || legacy.length === 0) return;
      // Nepřenášet akce, které už v DB jsou (podle názvu + data).
      const existing = new Set(records.map((r) => `${r.name}__${r.entry_date}`));
      const toMigrate = legacy.filter((r) => !existing.has(`${r.name}__${r.entry_date}`));
      for (const rec of toMigrate) {
        const err = await persistRecord(rec, true);
        if (err) return; // při chybě necháme localStorage být a zkusíme příště
      }
      if (cancelled) return;
      try {
        localStorage.setItem('akce_records_v2__prevedeno', localStorage.getItem('akce_records_v2') || '');
        localStorage.removeItem('akce_records_v2');
      } catch {}
      loadData();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /** Uloží akci (hlavičku i položky) do databáze. Vrací text chyby, nebo null. */
  async function persistRecord(rec: AkceRecord, isNew: boolean): Promise<string | null> {
    const header = {
      id: rec.id,
      name: rec.name,
      who: rec.who || null,
      entry_date: rec.entry_date,
      status: rec.status,
      ready: rec.ready ?? false,
      equipment: rec.equipment ?? null,
      revenue: rec.revenue ?? null,
      rating: rec.rating ?? null,
      recommend: rec.recommend ?? null,
      note: rec.note ?? null,
    };
    const { error: headErr } = isNew
      ? await supabase.from('akce').insert(header)
      : await supabase.from('akce').update(header).eq('id', rec.id);
    if (headErr) return headErr.message;

    // Položky se přepisují celé — je jich max 7 a uživatel je edituje najednou.
    const { error: delErr } = await supabase.from('akce_items').delete().eq('akce_id', rec.id);
    if (delErr) return delErr.message;
    if (rec.items.length > 0) {
      const { error: itemsErr } = await supabase.from('akce_items').insert(
        rec.items.map((it) => ({
          akce_id: rec.id,
          beer_id: it.beer_id || null,
          beer_name: it.beer_name ?? null,
          package_id: it.package_id || null,
          package_label: it.package_label ?? null,
          quantity_taken: it.quantity_taken,
          quantity_returned: it.quantity_returned,
        }))
      );
      if (itemsErr) return itemsErr.message;
    }
    return null;
  }

  /** Uloží změnu do DB a teprve po úspěchu ji promítne na obrazovku. */
  async function saveRecord(rec: AkceRecord, isNew = false) {
    setSaveErr(null);
    const err = await persistRecord(rec, isNew);
    if (err) {
      setSaveErr('Uložení se nepovedlo: ' + err);
      return false;
    }
    setRecords((prev) =>
      isNew ? [rec, ...prev] : prev.map((r) => (r.id === rec.id ? rec : r))
    );
    return true;
  }

  async function deleteRecord(id: string) {
    setSaveErr(null);
    const { error } = await supabase.from('akce').delete().eq('id', id);
    if (error) {
      setSaveErr('Smazání se nepovedlo: ' + error.message);
      return;
    }
    setRecords((prev) => prev.filter((r) => r.id !== id));
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

  function clearRow(index: number) {
    setItemRows((rows) => rows.map((r, i) => i === index ? { beer_id: '', package_id: '', qty: '' } : r));
  }

  async function handleCreateAkce(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      oznam('Zadejte název akce.');
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
      oznam('Vyberte alespoň jedno pivo, obal a počet kusů.');
      return;
    }

    const newRecord: AkceRecord = {
      id: crypto.randomUUID(),
      name: name.trim(),
      who: who.trim(),
      entry_date: entryDate,
      status: 'planned',
      items: validItems,
      ready: false,
      equipment: [],
    };

    if (!(await saveRecord(newRecord, true))) return;
    setShowAddModal(false);
    setName('');
    setItemRows(Array.from({ length: 7 }, () => ({ beer_id: '', package_id: '', qty: '' })));

    // Naplánovat upomínku 3 dny před akcí pro osobu, která na akci jede
    try {
      const eventDate = new Date(entryDate + 'T09:00:00');
      const remindDate = new Date(eventDate);
      remindDate.setDate(remindDate.getDate() - 3);
      const remindDateTime = `${remindDate.getFullYear()}-${String(remindDate.getMonth() + 1).padStart(2, '0')}-${String(remindDate.getDate()).padStart(2, '0')}T08:00`;

      await createReminder({
        title: `🎪 Akce: ${newRecord.name}`,
        note: `Za 3 dny je akce "${newRecord.name}" (${new Date(entryDate).toLocaleDateString('cs-CZ')}). Nezapomeň: říct Denisovi o kašu!`,
        date_time: remindDateTime,
        target_role: newRecord.who.trim() || 'all',
        display_mode: 'both',
        created_by: 'Systém (Akce)',
      });
    } catch {}

    oznam(`✅ Akce "${newRecord.name}" byla úspěšně uložena s ${validItems.length} položkami! Upomínka pro ${newRecord.who} přijde 3 dny před akcí.`);
  }

  // Přepnutí stavu "Připraveno na akci"
  async function toggleReady(rec: AkceRecord) {
    await saveRecord({ ...rec, ready: !rec.ready });
  }

  // Otevření modálu vybavení na akci
  function openEquipModal(rec: AkceRecord) {
    setEquipRecord(rec);
    const checked: Record<string, boolean> = {};
    (rec.equipment || []).forEach((e) => { checked[e] = true; });
    setEquipChecked(checked);
    setEquipCustom('');
    setEquipCustomItems([]);
  }

  // Uložení vybavení na akci
  async function saveEquipment() {
    if (!equipRecord) return;
    const selected = [
      ...DEFAULT_EQUIPMENT.filter((e) => equipChecked[e]),
      ...equipCustomItems,
    ];
    if (!(await saveRecord({ ...equipRecord, equipment: selected }))) return;
    setEquipRecord(null);
    oznam(`✅ Vybavení na akci "${equipRecord.name}" uloženo (${selected.length} položek).`);
  }

  function addCustomEquipItem() {
    const val = equipCustom.trim();
    if (!val) return;
    setEquipCustomItems((prev) => [...prev, val]);
    setEquipCustom('');
  }

  // Open "Po akci" modal
  function openEvalModal(rec: AkceRecord) {
    setEvalRecord(rec);
    const initialMap: Record<number, string> = {};
    rec.items.forEach((it, idx) => {
      // Výchozí: prodáno = odvezeno - vráceno (pokud už bylo vyhodnoceno)
      const sold = it.quantity_taken - (it.quantity_returned ?? 0);
      initialMap[idx] = String(Math.max(0, sold));
    });
    setEvalSoldMap(initialMap);
    setEvalRevenue(rec.revenue ? String(rec.revenue) : '');
    setEvalRating(rec.rating ?? 5);
    setEvalNote(rec.note ?? '');
    setEvalRecommend(rec.recommend ?? '');
  }

  // Save "Po akci" evaluation
  async function handleSaveEval(e: React.FormEvent) {
    e.preventDefault();
    if (!evalRecord) return;

    const updatedItems = evalRecord.items.map((it, idx) => {
      // Uživatel zadává, kolik se VYTOČILO/PRODALO; zbytek se vrací na sklad
      const soldQty = Math.min(it.quantity_taken, Math.max(0, Number(evalSoldMap[idx]) || 0));
      const retQty = it.quantity_taken - soldQty;
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
      recommend: evalRecommend || undefined,
    };

    if (!(await saveRecord(updatedRec))) return;
    setEvalRecord(null);
    oznam(`🎉 Vyhodnocení akce "${updatedRec.name}" uloženo! Neprodané sudy/lahve byly vráceny do skladu.`);
  }

  async function handleDeleteAkce(id: string) {
    if (!(await potvrd('Opravdu smazat tuto akci?'))) return;
    await deleteRecord(id);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* Chyba zápisu do databáze — dřív se akce ukládaly jen do prohlížeče,
          takže uložení nemohlo selhat. Teď jde o skutečný zápis, a když ho
          server odmítne (práva, výpadek), musí to uživatel vidět — jinak by
          si myslel, že je akce uložená, a ona by nikde nebyla. */}
      {saveErr && (
        <div className="rounded border border-danger-300 bg-danger-500/10 px-4 py-3 text-sm font-bold text-danger-700">
          ⚠️ {saveErr}
        </div>
      )}
      {/* Top Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
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
          className="px-5 py-3 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-2"
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
                  onClick={() => openEvalModal(r)}
                  className={`card p-5 rounded border-2 transition-all shadow-sm flex flex-col justify-between space-y-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${
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
                          {!isDone && r.ready && (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white font-extrabold text-xs shadow-2xs">✅ Připraveno na akci</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-600 font-bold mt-1">
                          <span className="flex items-center gap-1"><Calendar size={14} className="text-amber-600" /> {new Date(r.entry_date).toLocaleDateString('cs-CZ')}</span>
                          {r.who && <span className="flex items-center gap-1 text-neutral-800"><User size={14} className="text-amber-600" /> {r.who}</span>}
                        </div>
                      </div>

                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAkce(r.id); }} className="text-neutral-400 hover:text-rose-600 p-1 transition" title="Smazat akci">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Připraveno + Vybavení buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!isDone && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleReady(r); }}
                          className={`px-3 py-1.5 rounded font-black text-xs transition shadow-sm flex items-center gap-1.5 ${
                            r.ready ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-emerald-100'
                          }`}
                        >
                          <Check size={15} />
                          {r.ready ? 'Připraveno na akci ✓' : 'Označit jako připraveno'}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEquipModal(r); }}
                        className={`px-3 py-1.5 rounded font-black text-xs transition shadow-sm flex items-center gap-1.5 ${
                          (r.equipment || []).length ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-100 text-neutral-700 hover:bg-amber-100'
                        }`}
                      >
                        <ClipboardList size={15} />
                        Vybavení na akci {(r.equipment || []).length ? `(${(r.equipment || []).length})` : ''}
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
                            <div key={idx} className="px-2.5 py-1 rounded bg-white border border-neutral-300 text-xs font-bold shadow-2xs flex items-center gap-1.5">
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
                            <span className="px-3 py-1 rounded bg-emerald-700 text-white font-mono font-black text-xs shadow-xs">
                              💰 Tržba: {r.revenue.toLocaleString('cs-CZ')} Kč
                            </span>
                          )}
                          {r.rating && (
                            <div className="flex items-center gap-1 text-amber-500 font-bold bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                              <span>Hodnocení:</span>
                              {Array.from({ length: r.rating }, (_, i) => (
                                <Star key={i} size={14} className="fill-amber-400 text-amber-500" />
                              ))}
                            </div>
                          )}
                          {r.recommend && (
                            <span className={`px-3 py-1 rounded font-black text-xs shadow-xs flex items-center gap-1 ${
                              r.recommend === 'yes' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}>
                              {r.recommend === 'yes' ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}
                              {r.recommend === 'yes' ? 'Doporučeno jet i za rok' : 'Nedoporučeno jet za rok'}
                            </span>
                          )}
                        </div>
                        {r.note && <p className="text-neutral-700 italic font-medium bg-white/80 p-2 rounded border border-emerald-200">"{r.note}"</p>}
                      </div>
                    )}

                    {/* Equipment checklist display */}
                    {(r.equipment || []).length > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-1">
                          <ClipboardList size={12} className="text-amber-600" /> Vybavení na akci:
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(r.equipment || []).map((eq, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                              ✓ {eq}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Button */}
                  <div className="pt-2 border-t border-neutral-200 flex justify-end">
                    <button
                      onClick={() => openEvalModal(r)}
                      className={`px-4 py-2 rounded font-black text-xs transition shadow-md flex items-center gap-1.5 ${
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
          <div className="bg-white rounded max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-neutral-200 my-8">
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

              {/* Upozornění s datem upomínky na kašu */}
              {reminderDate && (
                <div className="flex items-start gap-2 p-3 rounded bg-sky-50 border border-sky-200 text-xs text-sky-950 font-medium">
                  <Bell size={16} className="text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sky-900">🔔 Upozornění na kašu (Denis)</p>
                    <p>
                      Osoba <strong>{who || '…'}</strong> dostane upomínku <strong>„říct Denisovi o kašu“</strong> dne{' '}
                      <strong className="font-mono">{reminderDate.toLocaleDateString('cs-CZ')}</strong> (3 dny před akcí) — na telefonu i při přihlášení.
                    </p>
                  </div>
                </div>
              )}

              {/* 7 ŘÁDKŮ PRO ZADÁNÍ PIVA A OBALŮ — stejný styl jako fasování */}
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <label className="block text-xs font-black uppercase text-amber-900 tracking-wider">
                  Zadání piv a obalů na akci (7 řádků):
                </label>

                {/* Mobilní karty */}
                <div className="grid grid-cols-1 gap-2 md:hidden">
                  {itemRows.map((r, i) => (
                    <div key={i} className="rounded border border-neutral-200 bg-white p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="input text-xs"
                          value={r.beer_id}
                          onChange={(e) => handleRowChange(i, 'beer_id', e.target.value)}
                        >
                          <option value="">— pivo —</option>
                          {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                        </select>
                        <select
                          className="input text-xs"
                          value={r.package_id}
                          onChange={(e) => handleRowChange(i, 'package_id', e.target.value)}
                        >
                          <option value="">— obal —</option>
                          {sortedPackages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="w-11 h-11 shrink-0 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-lg transition disabled:opacity-30"
                          disabled={!r.qty || Number(r.qty) <= 0}
                          onClick={() => handleRowChange(i, 'qty', String(Math.max(0, Number(r.qty) - 1)))}
                        >−</button>
                        <span className="flex-1 text-center text-base font-black bg-white border border-neutral-200 rounded py-2.5">
                          {Number(r.qty) > 0 ? r.qty : '0'}
                        </span>
                        <button
                          type="button"
                          className="w-11 h-11 shrink-0 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-lg transition"
                          onClick={() => handleRowChange(i, 'qty', String(Number(r.qty || 0) + 1))}
                        >+</button>
                        <button type="submit" className="min-h-[44px] px-3 shrink-0 grid place-items-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-black text-lg transition" title="Potvrdit / uložit vše">✓</button>
                        <button type="button" className="w-11 min-h-[44px] shrink-0 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-lg transition" onClick={() => clearRow(i)} title="Zrušit řádek">✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop tabulka */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-neutral-100">
                        <th className="text-left py-1.5 px-1 font-black text-neutral-700">Pivo</th>
                        <th className="text-left py-1.5 px-1 font-black text-neutral-700">Obal</th>
                        <th className="text-center py-1.5 px-1 font-black text-neutral-700">KS</th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemRows.map((r, i) => (
                        <tr key={i} className="border-b border-neutral-200/60">
                          <td className="py-1 pr-1">
                            <select
                              className="input text-[10px] w-full appearance-none pr-2"
                              value={r.beer_id}
                              onChange={(e) => handleRowChange(i, 'beer_id', e.target.value)}
                            >
                              <option value="">—</option>
                              {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                            </select>
                          </td>
                          <td className="py-1 pr-1">
                            <select
                              className="input text-[10px] w-full appearance-none pr-2"
                              value={r.package_id}
                              onChange={(e) => handleRowChange(i, 'package_id', e.target.value)}
                            >
                              <option value="">—</option>
                              {sortedPackages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                          </td>
                          <td className="py-1 pr-1">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                className="w-7 h-7 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition disabled:opacity-30"
                                disabled={!r.qty || Number(r.qty) <= 0}
                                onClick={() => handleRowChange(i, 'qty', String(Math.max(0, Number(r.qty) - 1)))}
                              >−</button>
                              <span className="w-14 text-center text-xs font-bold bg-white border border-neutral-200 rounded py-2">
                                {Number(r.qty) > 0 ? r.qty : '0'}
                              </span>
                              <button
                                type="button"
                                className="w-7 h-7 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-sm transition"
                                onClick={() => handleRowChange(i, 'qty', String(Number(r.qty || 0) + 1))}
                              >+</button>
                            </div>
                          </td>
                          <td className="py-1">
                            <div className="flex items-center gap-1">
                              <button type="submit" className="w-7 h-7 grid place-items-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm transition" title="Potvrdit / uložit vše">✓</button>
                              <button type="button" className="w-7 h-7 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm transition" onClick={() => clearRow(i)} title="Zrušit řádek">✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs">
                  Zrušit
                </button>
                <button type="submit" className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md">
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
          <div className="bg-white rounded max-w-xl w-full p-6 space-y-4 shadow-2xl border border-neutral-200 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={22} />
                <span>Vyhodnocení PO AKCI — {evalRecord.name}</span>
              </h3>
              <button onClick={() => setEvalRecord(null)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleSaveEval} className="space-y-4">
              <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-950 font-medium space-y-1">
                <p className="font-bold text-amber-900">🍺 Vytočené/prodané kusy:</p>
                <p>Zadej kolik ks sudů/lahví se z akce <strong>vytáčelo a prodalo</strong>. Zbytek (odvezeno − prodáno) se automaticky vrátí zpět na sklad.</p>
              </div>

              {/* Seznam položek akce s zadáním prodaných kusů */}
              <div className="space-y-2">
                {evalRecord.items.map((it, idx) => {
                  const bObj = beers.find((b) => b.id === it.beer_id);
                  const pObj = packages.find((p) => p.id === it.package_id);

                  return (
                    <div key={idx} className="p-3 rounded bg-neutral-50 border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-black text-neutral-950 text-sm block">{it.beer_name ?? bObj?.name}</span>
                        <span className="text-neutral-600 font-bold">
                          {formatPackageLabel(it.package_label ?? pObj?.label)} · Odvezeno: <strong className="text-neutral-900">{it.quantity_taken} ks</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-neutral-700">Vytočeno/Prodáno:</span>
                        <input
                          type="number"
                          min={0}
                          max={it.quantity_taken}
                          value={evalSoldMap[idx] ?? '0'}
                          onChange={(e) => setEvalSoldMap({ ...evalSoldMap, [idx]: e.target.value })}
                          className="input !py-1 !px-2 w-16 text-center font-mono font-black text-xs bg-white text-neutral-900 border-amber-300"
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
                  <input
                    type="number"
                    min={0}
                    placeholder="Např. 45000"
                    value={evalRevenue}
                    onChange={(e) => setEvalRevenue(e.target.value)}
                    className="input font-mono font-black text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Hodnocení akce (1 až 5 hvězd)</label>
                  <div className="flex items-center gap-1.5 bg-white p-2 rounded border border-neutral-300">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setEvalRating(star)}
                        className="p-1 hover:scale-125 transition"
                      >
                        <Star size={20} className={star <= evalRating ? 'fill-amber-400 text-amber-500' : 'text-neutral-400'} />
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

              <div className="pt-2 border-t border-neutral-200">
                <label className="block text-xs font-black text-neutral-700 mb-2">Doporučení — jet na tuto akci i za rok?</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEvalRecommend('yes')}
                    className={`flex-1 px-4 py-2.5 rounded font-black text-xs transition shadow-sm flex items-center justify-center gap-1.5 ${
                      evalRecommend === 'yes' ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-neutral-100 text-neutral-700 hover:bg-emerald-100'
                    }`}
                  >
                    <ThumbsUp size={16} /> Ano, jet i za rok
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvalRecommend('no')}
                    className={`flex-1 px-4 py-2.5 rounded font-black text-xs transition shadow-sm flex items-center justify-center gap-1.5 ${
                      evalRecommend === 'no' ? 'bg-rose-600 text-white ring-2 ring-rose-300' : 'bg-neutral-100 text-neutral-700 hover:bg-rose-100'
                    }`}
                  >
                    <ThumbsDown size={16} /> Ne, nejet za rok
                  </button>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button type="button" onClick={() => setEvalRecord(null)} className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs">
                  Zrušit
                </button>
                <button type="submit" className="px-5 py-2.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs shadow-md">
                  ✓ Uložit vyhodnocení Po akci
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODÁL 3: VYBAVENÍ NA AKCI (CHECKLIST) */}
      {equipRecord && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <ClipboardList className="text-amber-500" size={22} />
                <span>Vybavení na akci — {equipRecord.name}</span>
              </h3>
              <button onClick={() => setEquipRecord(null)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <p className="text-xs text-neutral-600 font-medium bg-amber-50 border border-amber-200 p-3 rounded">
              Zaškrtni, co vše je potřeba na akci připravit. Uložený seznam se zobrazí u akce.
            </p>

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {DEFAULT_EQUIPMENT.map((item) => (
                <label
                  key={item}
                  className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition select-none ${
                    equipChecked[item] ? 'bg-emerald-50 border-emerald-300' : 'bg-neutral-50 border-neutral-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!equipChecked[item]}
                    onChange={(e) => setEquipChecked({ ...equipChecked, [item]: e.target.checked })}
                    className="w-5 h-5 accent-emerald-600 shrink-0"
                  />
                  <span className={`text-sm font-bold ${equipChecked[item] ? 'text-emerald-900 line-through' : 'text-neutral-800'}`}>
                    {item}
                  </span>
                </label>
              ))}

              {/* Vlastní položky */}
              {equipCustomItems.map((item, idx) => (
                <div key={`custom-${idx}`} className="flex items-center gap-3 p-2.5 rounded border bg-amber-50 border-amber-300">
                  <span className="text-sm font-bold text-amber-950 flex-1">✓ {item}</span>
                  <button
                    type="button"
                    onClick={() => setEquipCustomItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-rose-500 hover:text-rose-700 font-bold"
                    title="Odebrat"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={equipCustom}
                onChange={(e) => setEquipCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomEquipItem(); } }}
                placeholder="Přidat vlastní vybavení..."
                className="input flex-1 font-bold text-xs"
              />
              <button
                type="button"
                onClick={addCustomEquipItem}
                className="px-4 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-black text-xs shadow-md flex items-center gap-1.5"
              >
                <Plus size={15} /> Přidat
              </button>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
              <button type="button" onClick={() => setEquipRecord(null)} className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs">
                Zrušit
              </button>
              <button type="button" onClick={saveEquipment} className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md">
                ✓ Uložit vybavení
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
