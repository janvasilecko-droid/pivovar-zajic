import { useEffect, useState, useMemo } from 'react';
import { supabase, fetchAllRows, Beer, Package, Place, Vehicle, useRealtime, BEER_COLOR_PRESETS, beerBorder } from '../lib/supabase';
import { getVehicleExpiryStatus } from '../lib/vozidla';
import { najdiPodezreleDuplicity, type KandidatDuplicity } from '../lib/podezreleDuplicity';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import ExcelImportModal from '../components/ExcelImportModal';
import { AlertTriangle, Beer as BeerIcon, Car, Copy, FileSpreadsheet, Check, Mail, MapPin, Milestone, NotebookPen, Package as PackageIcon, Pencil, Phone, Plus, Search, ShieldAlert, ShieldCheck, Sparkles, Store, Trash2, Wrench, X } from 'lucide-react';
import { lookupPlaceOnline } from '../lib/placeLookup';
import { chyba, oznam, potvrd, uspech } from '../lib/toast';
import { usePosledniNacteni } from '../lib/nacitani';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/config';
import { fetchPlaceAliasesForAdmin, deletePlaceAlias, pridejPlaceAliasRucne, upravPlaceAlias, type PlaceAliasRow, fetchAliasesForAdmin, deleteAlias, pridejAliasRucne, upravAlias, type ParserAliasRow } from '../lib/orderParser';

/* ===== PIVA ===== */
export function BeersScreen() {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const [rows, setRows] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [edit, setEdit] = useState<Beer | null>(null);
  const [search, setSearch] = useState('');
  const [showNaucene, setShowNaucene] = useState(false);

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load() {
    const smiZapsat = zacniNacteni();
    setLoading(true);
    const { data } = await supabase
      .from('beers')
      .select('id,name,short_name,degree,color,beer_color,price_per_liter,is_active,sort_order,created_at')
      .order('sort_order');
    if (!smiZapsat()) return;
    setRows((data as Beer[]) ?? []); setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['beers'], load);

  async function toggleActive(b: Beer) {
    await supabase.from('beers').update({ is_active: !b.is_active }).eq('id', b.id);
    load();
  }
  async function del(id: string) {
    if (!(await potvrd('Smazat pivo?'))) return;
    const { error } = await supabase.from('beers').delete().eq('id', id);
    if (error) { chyba('Pivo nelze smazat — je použito v záznamech.'); return; }
    load();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((b) => b.name.toLowerCase().includes(term) || (b.degree ?? '').toLowerCase().includes(term) || (b.color ?? '').toLowerCase().includes(term));
  }, [rows, search]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isAdmin && (
          <button className="btn-ghost !rounded !py-2.5 !px-3.5 text-xs" onClick={() => setShowNaucene(true)}>
            <Sparkles size={16} /> Naučené zkratky
          </button>
        )}
        <button className="px-3.5 py-2.5 rounded bg-white border border-amber-300/80 text-amber-950 hover:bg-amber-50 font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs" onClick={() => setShowImport(true)}>
          <FileSpreadsheet size={16} /> Import z Excelu
        </button>
        <button className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat pivo
        </button>
      </div>

      {/* Search Input */}
      <div className="sticky top-0 z-10 bg-white py-1.5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Hledat pivo podle názvu, stupně nebo barvy..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
        />
      </div>

      {showImport && <ExcelImportModal open={showImport} onClose={() => setShowImport(false)} targetTable="beers" onSuccess={load} />}

      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState text="Žádná piva v katalogu." icon={BeerIcon} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="card p-5 border-2 shadow-sm transition-all hover:shadow-md flex flex-col justify-between" style={{ borderColor: beerBorder(b) }}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-black text-lg truncate text-neutral-900 dark:text-neutral-100">{b.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {b.degree && <span className="px-2.5 py-0.5 rounded bg-neutral-900 text-amber-300 font-mono font-black text-xs">{b.degree}</span>}
                      {b.color && <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-extrabold text-xs border border-neutral-200 dark:border-neutral-700">{b.color}</span>}
                    </div>
                  </div>
                  <span className={`w-3 h-3 rounded-full shrink-0 shadow-xs ${b.is_active ? 'bg-emerald-500' : 'bg-neutral-300'}`} title={b.is_active ? 'Aktivní' : 'Skryté'} />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <button className="flex-1 px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-extrabold text-xs shadow-xs transition tap" onClick={() => { setEdit(b); setShow(true); }}>
                  Upravit
                </button>
                <button className="px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs shadow-xs transition tap" onClick={() => toggleActive(b)}>
                  {b.is_active ? 'Skrýt' : 'Aktivovat'}
                </button>
                <button aria-label="Smazat pivo" title="Smazat pivo" className="p-1.5 rounded bg-rose-50 hover:bg-rose-500 dark:bg-rose-900/30 text-rose-700 hover:text-white font-bold text-xs transition tap" onClick={() => del(b.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <BeerForm beer={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
      {showNaucene && <NauceneZkratkyModal beers={rows} onClose={() => setShowNaucene(false)} />}
    </div>
  );
}

function BeerForm({ beer, onClose, onSaved }: { beer: Beer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(beer?.name ?? '');
  const [shortName, setShortName] = useState(beer?.short_name ?? '');
  const [degree, setDegree] = useState(beer?.degree ?? '');
  const [color, setColor] = useState(beer?.color ?? '');
  const [beerColor, setBeerColor] = useState(beer?.beer_color ?? '#F3F4F6');
  const [order, setOrder] = useState(beer?.sort_order ?? 1);
  const [trvanlivost, setTrvanlivost] = useState(beer?.trvanlivost_dni != null ? String(beer.trvanlivost_dni) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    // short_name se aktivně používá při rozpoznávání piva ve WhatsApp/hlasových/
    // fotoobjednávkách (lib/orderParser.ts, matchBeerFromHints) — dřív se
    // neukládalo (sloupec prý nemusí existovat), takže tahle cesta byla
    // celou dobu naprázdno, i když pole ve formuláři vypadalo funkčně.
    const dni = trvanlivost.trim() === '' ? null : Math.round(Number(trvanlivost));
    if (dni != null && (!Number.isFinite(dni) || dni <= 0)) {
      setBusy(false);
      chyba('Trvanlivost musí být kladný počet dní, nebo prázdná.');
      return;
    }
    const payload: Record<string, unknown> = { name, short_name: shortName.trim() || null, degree: degree || null, color: color || null, beer_color: beerColor, sort_order: order, is_active: true };
    // Sloupec přidává migrace 20261231060000 — dokud neběží, neposílat ho,
    // jinak by selhalo uložení celého piva kvůli jednomu nepovinnému poli.
    if (dni != null || beer?.trvanlivost_dni != null) payload.trvanlivost_dni = dni;
    let error: any = null;
    if (beer) {
      const res = await supabase.from('beers').update(payload).eq('id', beer.id);
      error = res.error;
    } else {
      const res = await supabase.from('beers').insert(payload);
      error = res.error;
    }
    setBusy(false);
    if (error) {
      chyba(`Nepodařilo se uložit pivo: ${error.message}`);
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={beer ? 'Upravit pivo' : 'Nové pivo'}>
      <div className="space-y-4">
        <Field label="Název"><input className="input font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. 12° Světlá" /></Field>
        <Field label="Zkratka (pro úzké sloupce)"><input className="input" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="např. 12°S" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stupeň"><input className="input" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="12°" /></Field>
          <Field label="Barva"><input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="světlé" /></Field>
        </div>
        <Field label="Barva pozadí (v aplikaci)">
          <div className="flex flex-wrap gap-2 items-center">
            {BEER_COLOR_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => setBeerColor(c)}
                className={`tap w-8 h-8 rounded border-2 transition ${beerColor === c ? 'ring-2 ring-amber-500 border-amber-500 scale-110' : 'border-neutral-200'}`}
                style={{ backgroundColor: c }} title={c} />
            ))}
            <input type="color" value={beerColor} onChange={(e) => setBeerColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-neutral-200" />
          </div>
        </Field>
        <Field label="Pořadí"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} className="input" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
        <Field label="Trvanlivost lahví (dní od lahvování)" hint="Sklad podle toho upozorní na šarže, kterým se blíží datum. Prázdné = nehlídat.">
          <input type="number" inputMode="numeric" min={1} onWheel={(e) => e.currentTarget.blur()} className="input" value={trvanlivost} onChange={(e) => setTrvanlivost(e.target.value)} placeholder="např. 90" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy || !name} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Naučené zkratky piv/obalů — přehled toho, co si appka zapamatovala při
 * rozpoznávání WhatsApp/hlasových/fotoobjednávek (tabulka parser_aliases,
 * čtená matchBeerFromHints/matchPackage v lib/orderParser.ts). Stejně jako
 * u Naučených odběratelů jde zkratku i ručně přidat nebo upravit — zápis
 * jde do stejné tabulky, takže se ruční a naučená zkratka chovají stejně.
 */
function NauceneZkratkyModal({ beers, onClose }: { beers: Beer[]; onClose: () => void }) {
  const [zkratky, setZkratky] = useState<ParserAliasRow[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [pridavam, setPridavam] = useState(false);
  const [upravovanyId, setUpravovanyId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formBeerId, setFormBeerId] = useState('');
  const [formPackageId, setFormPackageId] = useState('');
  const [ukladam, setUkladam] = useState(false);

  async function nacti() {
    setLoading(true);
    try {
      const [z, p] = await Promise.all([
        fetchAliasesForAdmin(),
        supabase.from('packages').select('id,code,kind,volume_l,label,sort_order').order('sort_order'),
      ]);
      setZkratky(z);
      setPackages((p.data as Package[]) ?? []);
    } catch (e) {
      chyba(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { nacti(); }, []);

  function zacniPridavat() {
    setPridavam(true);
    setUpravovanyId(null);
    setFormText('');
    setFormBeerId('');
    setFormPackageId('');
  }
  function zacniUpravovat(z: ParserAliasRow) {
    setUpravovanyId(z.id);
    setPridavam(false);
    setFormText(z.alias_text);
    setFormBeerId(z.beer_id ?? '');
    setFormPackageId(z.package_id ?? '');
  }
  function zrusFormular() {
    setPridavam(false);
    setUpravovanyId(null);
  }

  async function ulozFormular() {
    if (!formText.trim() || (!formBeerId && !formPackageId)) { oznam('Vyplň text zkratky a vyber pivo nebo obal.'); return; }
    setUkladam(true);
    try {
      const chybaVysledku = upravovanyId
        ? await upravAlias(upravovanyId, formText, formBeerId || null, formPackageId || null)
        : await pridejAliasRucne(formText, formBeerId || null, formPackageId || null);
      if (chybaVysledku === 'prazdne') { oznam('Zadej text zkratky.'); return; }
      if (chybaVysledku === 'neplatna_zkratka') { oznam('Tahle zkratka pivo dostatečně nepojmenovává (musí obsahovat aspoň 3 písmena z názvu, nebo stupeň s barvou) — jako trvalé pravidlo by mohla přebít jiné pivo.'); return; }
      uspech(upravovanyId ? 'Zkratka upravena.' : 'Zkratka přidána.');
      zrusFormular();
      await nacti();
    } catch (e) {
      chyba(e);
    } finally {
      setUkladam(false);
    }
  }

  async function smaz(id: string) {
    if (!(await potvrd('Smazat naučenou zkratku?'))) return;
    try {
      await deleteAlias(id);
      setZkratky((arr) => arr.filter((z) => z.id !== id));
    } catch (e) {
      chyba(e);
    }
  }

  const formularOtevreny = pridavam || upravovanyId !== null;

  return (
    <Modal open={true} onClose={onClose} title="Naučené zkratky">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Když appka (nebo člověk) opraví špatně rozpoznané pivo nebo obal, zapamatuje si
          „tenhle text = tohle pivo/obal" pro příště. Tady jde vidět, co se naučila,
          smazat špatné naučení — a taky přidat nebo upravit zkratku ručně.
        </p>

        {formularOtevreny ? (
          <div className="p-3 rounded border border-amber-300 bg-amber-50 space-y-2.5">
            <Field label="Text zkratky">
              <input
                type="text" className="input w-full" value={formText}
                onChange={(e) => setFormText(e.target.value)}
                placeholder="např. desitka, jant, 12sv…"
              />
            </Field>
            <Field label="Pivo (nepovinné)">
              <select className="input w-full" value={formBeerId} onChange={(e) => setFormBeerId(e.target.value)}>
                <option value="">— nevázat na pivo —</option>
                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Obal (nepovinné)">
              <select className="input w-full" value={formPackageId} onChange={(e) => setFormPackageId(e.target.value)}>
                <option value="">— nevázat na obal —</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <button
                className="btn-primary !rounded text-xs font-black flex items-center gap-1.5"
                disabled={ukladam} onClick={ulozFormular}
              >
                <Check size={14} /> {ukladam ? 'Ukládám…' : upravovanyId ? 'Uložit úpravu' : 'Přidat zkratku'}
              </button>
              <button className="btn-ghost !rounded text-xs" onClick={zrusFormular}>
                <X size={14} /> Zrušit
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost !rounded text-xs font-black flex items-center gap-1.5" onClick={zacniPridavat}>
            <Plus size={16} /> Přidat zkratku ručně
          </button>
        )}

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {loading && <div className="text-sm text-neutral-400 py-2">Načítám…</div>}
          {!loading && zkratky.map((z) => {
            const pivo = beers.find((b) => b.id === z.beer_id);
            const obal = packages.find((p) => p.id === z.package_id);
            return (
              <div key={z.id} className="flex items-center justify-between p-3 rounded bg-neutral-50 border border-neutral-200 gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-black text-neutral-800 truncate">
                    „{z.alias_text}" → {[pivo?.name, obal?.label].filter(Boolean).join(' / ') || '(bez přiřazení)'}
                  </div>
                  <div className="text-xs text-neutral-500">
                    použito {z.hit_count ?? 1}× · naposledy {z.updated_at ? new Date(z.updated_at).toLocaleDateString('cs-CZ') : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => zacniUpravovat(z)}
                    className="btn-ghost !rounded !p-2 !min-h-0 !border-none text-amber-600 hover:text-amber-800"
                    title="Upravit zkratku" aria-label="Upravit zkratku"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => smaz(z.id)}
                    className="btn-ghost !rounded !p-2 !min-h-0 !border-none text-rose-500 hover:text-rose-700"
                    title="Smazat naučenou zkratku" aria-label="Smazat naučenou zkratku"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          {!loading && zkratky.length === 0 && (
            <div className="text-sm text-neutral-400 py-2 italic">Zatím se appka nic nenaučila.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ===== OBALY ===== */
export function PackagesScreen() {
  const [rows, setRows] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Package | null>(null);

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load() {
    const smiZapsat = zacniNacteni();
    setLoading(true);
    const { data } = await supabase.from('packages').select('*').order('sort_order');
    if (!smiZapsat()) return;
    setRows((data as Package[]) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['packages'], load);

  async function del(id: string) {
    if (!(await potvrd('Smazat obal?'))) return;
    const { error } = await supabase.from('packages').delete().eq('id', id);
    if (error) { chyba('Obal nelze smazat — je použit v záznamech.'); return; }
    load();
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-end">
        <button className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat obal
        </button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádné obaly v katalogu." icon={PackageIcon} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <div key={p.id} className="card p-5 shadow-sm hover:shadow-md border border-neutral-200/90 bg-white rounded flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display font-black text-lg text-neutral-900">{p.label}</div>
                  <span className={`px-2.5 py-1 rounded text-xs font-black ${p.kind === 'keg' ? 'bg-amber-500/20 text-amber-900 border border-amber-400/30' : 'bg-emerald-500/20 text-emerald-900 border border-emerald-400/30'}`}>
                    {p.kind === 'keg' ? 'KEG' : 'Lahev'}
                  </span>
                </div>
                <div className="text-sm font-extrabold text-amber-700 mt-2 font-mono">{p.volume_l} litrů</div>
                <div className="text-xs text-neutral-400 mt-0.5 font-mono">Kód: {p.code}</div>
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-100">
                <button className="flex-1 px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-extrabold text-xs transition tap" onClick={() => { setEdit(p); setShow(true); }}>
                  Upravit
                </button>
                <button aria-label="Smazat obal" title="Smazat obal" className="p-1.5 rounded bg-rose-50 hover:bg-rose-500 text-rose-700 hover:text-white font-bold text-xs transition tap" onClick={() => del(p.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <PackageForm pkg={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
    </div>
  );
}

function PackageForm({ pkg, onClose, onSaved }: { pkg: Package | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(pkg?.code ?? '');
  const [kind, setKind] = useState<'keg' | 'bottle'>(pkg?.kind ?? 'keg');
  const [vol, setVol] = useState(pkg?.volume_l ?? 50);
  const [label, setLabel] = useState(pkg?.label ?? '');
  const [order, setOrder] = useState(pkg?.sort_order ?? 1);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const payload = { code, kind, volume_l: vol, label, sort_order: order };
    if (pkg) await supabase.from('packages').update(payload).eq('id', pkg.id);
    else await supabase.from('packages').insert(payload);
    setBusy(false); onSaved();
  }

  return (
    <Modal open onClose={onClose} title={pkg ? 'Upravit obal' : 'Nový obal'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kód"><input className="input font-mono font-bold" value={code} onChange={(e) => setCode(e.target.value)} placeholder="KEG30" /></Field>
          <Field label="Typ">
            <select className="input font-bold" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="keg">KEG</option><option value="bottle">Lahve</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Objem (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" className="input" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></Field>
          <Field label="Pořadí"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} className="input" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
        </div>
        <Field label="Popisek"><input className="input font-bold" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="KEG 30l" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy || !code || !label} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== ODBĚRATELÉ ===== */
export function PlacesScreen() {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const [rows, setRows] = useState<(Place & { delivery_group?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGpsBackfill, setShowGpsBackfill] = useState(false);
  const [showDuplicity, setShowDuplicity] = useState(false);
  const [showNauceni, setShowNauceni] = useState(false);
  const [edit, setEdit] = useState<Place | null>(null);
  const [search, setSearch] = useState('');

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load() {
    const smiZapsat = zacniNacteni();
    setLoading(true);
    const { data, error } = await supabase.from('places').select('*').order('name');
    if (!smiZapsat()) return;
    if (data && !error) {
      // Pre-fill delivery group for specific places
      const toUpdate = data.filter(p => ['sklad', 'BEN', 'JONA'].includes(p.name) && !p.delivery_group);
      if (toUpdate.length > 0) {
        try {
          await Promise.all(
            toUpdate.map(p => supabase.from('places').update({ delivery_group: 'Radek' }).eq('id', p.id))
          );
          const { data: refreshedData } = await supabase.from('places').select('*').order('name');
          setRows((refreshedData as Place[]) ?? []);
        } catch {
          setRows((data as Place[]) ?? []);
        }
      } else {
        setRows((data as Place[]) ?? []);
      }
    } else {
      setRows([]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['places'], load);

  async function del(id: string) {
    if (!(await potvrd('Smazat odběratele?'))) return;
    const { error } = await supabase.from('places').delete().eq('id', id);
    if (error) { chyba('Odběratele nelze smazat — má navázané objednávky.'); return; }
    load();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((p) => p.name.toLowerCase().includes(term) || (p.address ?? '').toLowerCase().includes(term) || (p.contact_name ?? '').toLowerCase().includes(term));
  }, [rows, search]);

  const missingGps = useMemo(
    () => rows.filter((p) => p.lat == null || p.lng == null),
    [rows]
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button className="btn-ghost !rounded !py-2.5 !px-3.5 text-xs" onClick={() => setShowDuplicity(true)}>
          <Copy size={16} /> Podezřelé duplicity
        </button>
        {isAdmin && (
          <button className="btn-ghost !rounded !py-2.5 !px-3.5 text-xs" onClick={() => setShowNauceni(true)}>
            <Sparkles size={16} /> Naučení odběratelé
          </button>
        )}
        {missingGps.length > 0 && (
          <button className="px-3.5 py-2.5 rounded bg-white border border-sky-300/80 text-sky-950 hover:bg-sky-50 font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs" onClick={() => setShowGpsBackfill(true)}>
            <MapPin size={16} /> Doplnit chybějící GPS ({missingGps.length})
          </button>
        )}
        <button className="px-3.5 py-2.5 rounded bg-white border border-amber-300/80 text-amber-950 hover:bg-amber-50 font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs" onClick={() => setShowImport(true)}>
          <FileSpreadsheet size={16} /> Import z Excelu
        </button>
        <button className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat odběratele
        </button>
      </div>

      <div className="sticky top-0 z-10 bg-white py-1.5">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Hledat odběratele podle jména, adresy nebo kontaktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
        />
      </div>

      {showImport && <ExcelImportModal open={showImport} onClose={() => setShowImport(false)} targetTable="places" onSuccess={load} />}

      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState text="Žádní odběratelé." icon={Store} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card p-5 shadow-sm hover:shadow-md border border-neutral-200/90 bg-white rounded flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-1">
                  <div className="font-display font-black text-base text-neutral-900">{p.name}</div>
                  {!p.address && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-extrabold text-udaj shrink-0 border border-amber-300">
                      <AlertTriangle className="ikona-text" /> Bez adresy
                    </span>
                  )}
                </div>
                {p.address ? (
                  <div className="text-xs text-neutral-600 font-medium mt-1 flex items-center gap-1">
                    <MapPin size={14} className="text-amber-600 shrink-0" />
                    <span className="truncate">{p.address}</span>
                  </div>
                ) : (
                  <div className="text-udaj text-neutral-400 font-bold italic mt-1">
                    Adresa není zadána
                  </div>
                )}
                {p.delivery_group && <div className="mt-2 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded px-2 py-1 inline-block">Skupina: {p.delivery_group}</div>}
                {p.contact_name && <div className="text-xs text-neutral-700 font-bold mt-2">Kontakt: {p.contact_name}</div>}
                {p.phone ? (
                  <div className="text-xs text-amber-700 font-mono font-bold mt-0.5 flex items-center gap-1">
                    <Phone size={12} />
                    <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a>
                  </div>
                ) : (
                  <div className="text-udaj text-neutral-400 font-mono mt-0.5 flex items-center gap-1">
                    <Phone size={12} /> bez telefonu
                  </div>
                )}
                {p.email && <div className="text-xs text-neutral-500 font-mono mt-0.5 flex items-center gap-1"><Mail size={12} />{p.email}</div>}
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-100">
                <button className="flex-1 px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-extrabold text-xs transition tap" onClick={() => { setEdit(p); setShow(true); }}>
                  Upravit
                </button>
                <button aria-label="Smazat místo" title="Smazat místo" className="p-1.5 rounded bg-rose-50 hover:bg-rose-500 text-rose-700 hover:text-white font-bold text-xs transition tap" onClick={() => del(p.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <PlaceForm place={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
      {showGpsBackfill && (
        <GpsBackfillModal
          places={missingGps}
          onClose={() => setShowGpsBackfill(false)}
          onSaved={() => { setShowGpsBackfill(false); load(); }}
        />
      )}
      {showDuplicity && (
        <DuplicatePlacesModal
          places={rows}
          onClose={() => setShowDuplicity(false)}
          onChanged={load}
        />
      )}
      {showNauceni && (
        <NaucenaJmenaModal places={rows} onClose={() => setShowNauceni(false)} />
      )}
    </div>
  );
}

/**
 * Naučení odběratelé — přehled aliasů „špatně napsané jméno" → odběratel.
 * Dřív jen výpis pro smazání (bylo v Nastavení); teď i ruční přidání a
 * úprava, ať se to dá doplnit, i když se AI/OCR ještě nespletla. Zápis jde
 * do stejné tabulky (place_aliases), kterou čte párování objednávek
 * (lib/orderParser.ts loadPlaceAliasMap, edge funkce place-match.ts) — ruční
 * i naučený alias se tak chová úplně stejně.
 */
function NaucenaJmenaModal({ places, onClose }: { places: Place[]; onClose: () => void }) {
  const [aliasy, setAliasy] = useState<PlaceAliasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pridavam, setPridavam] = useState(false);
  const [upravovanyId, setUpravovanyId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formPlaceId, setFormPlaceId] = useState('');
  const [ukladam, setUkladam] = useState(false);

  async function nacti() {
    setLoading(true);
    try {
      setAliasy(await fetchPlaceAliasesForAdmin());
    } catch (e) {
      chyba(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { nacti(); }, []);

  function zacniPridavat() {
    setPridavam(true);
    setUpravovanyId(null);
    setFormText('');
    setFormPlaceId('');
  }
  function zacniUpravovat(a: PlaceAliasRow) {
    setUpravovanyId(a.id);
    setPridavam(false);
    setFormText(a.wrong_name);
    setFormPlaceId(a.place_id ?? '');
  }
  function zrusFormular() {
    setPridavam(false);
    setUpravovanyId(null);
  }

  async function ulozFormular() {
    const misto = places.find((p) => p.id === formPlaceId);
    if (!formText.trim() || !misto) { oznam('Vyplň špatně napsané jméno i odběratele.'); return; }
    setUkladam(true);
    try {
      const chybaVysledku = upravovanyId
        ? await upravPlaceAlias(upravovanyId, formText, misto.id, misto.name)
        : await pridejPlaceAliasRucne(formText, misto.id, misto.name);
      if (chybaVysledku === 'prazdne') { oznam('Zadej, jaký text se má opravit.'); return; }
      if (chybaVysledku === 'prilis_obecne') { oznam('Tohle slovo je moc obecné (objevuje se skoro v každé zprávě) — appka by ho pak naučila přebít i jasně napsané jméno.'); return; }
      uspech(upravovanyId ? 'Alias upraven.' : 'Alias přidán.');
      zrusFormular();
      await nacti();
    } catch (e) {
      chyba(e);
    } finally {
      setUkladam(false);
    }
  }

  async function smaz(id: string) {
    if (!(await potvrd('Smazat naučený alias?'))) return;
    try {
      await deletePlaceAlias(id);
      setAliasy((arr) => arr.filter((a) => a.id !== id));
    } catch (e) {
      chyba(e);
    }
  }

  const formularOtevreny = pridavam || upravovanyId !== null;

  return (
    <Modal open={true} onClose={onClose} title="Naučení odběratelé">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Když appka (nebo člověk) opraví špatně rozpoznaného odběratele, zapamatuje si
          „tenhle text = tenhle odběratel" pro příště. Tady jde vidět, co se naučila,
          smazat špatné naučení — a taky přidat nebo upravit alias ručně, i bez toho,
          aby se nejdřív musela splést.
        </p>

        {formularOtevreny ? (
          <div className="p-3 rounded border border-amber-300 bg-amber-50 space-y-2.5">
            <Field label="Špatně napsané/rozpoznané jméno">
              <input
                type="text" className="input w-full" value={formText}
                onChange={(e) => setFormText(e.target.value)}
                placeholder="např. U Krbu, hospoda na rohu…"
              />
            </Field>
            <Field label="Patří odběrateli">
              <select className="input w-full" value={formPlaceId} onChange={(e) => setFormPlaceId(e.target.value)}>
                <option value="">— vyber odběratele —</option>
                {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <button
                className="btn-primary !rounded text-xs font-black flex items-center gap-1.5"
                disabled={ukladam} onClick={ulozFormular}
              >
                <Check size={14} /> {ukladam ? 'Ukládám…' : upravovanyId ? 'Uložit úpravu' : 'Přidat alias'}
              </button>
              <button className="btn-ghost !rounded text-xs" onClick={zrusFormular}>
                <X size={14} /> Zrušit
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost !rounded text-xs font-black flex items-center gap-1.5" onClick={zacniPridavat}>
            <Plus size={16} /> Přidat alias ručně
          </button>
        )}

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {loading && <div className="text-sm text-neutral-400 py-2">Načítám…</div>}
          {!loading && aliasy.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded bg-neutral-50 border border-neutral-200 gap-2">
              <div className="min-w-0">
                <div className="text-sm font-black text-neutral-800 truncate">
                  „{a.wrong_name}" → {a.correct_name || '(bez jména)'}
                </div>
                <div className="text-xs text-neutral-500">
                  použito {a.hit_count ?? 1}× · naposledy {a.updated_at ? new Date(a.updated_at).toLocaleDateString('cs-CZ') : '—'}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => zacniUpravovat(a)}
                  className="btn-ghost !rounded !p-2 !min-h-0 !border-none text-amber-600 hover:text-amber-800"
                  title="Upravit alias" aria-label="Upravit alias"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => smaz(a.id)}
                  className="btn-ghost !rounded !p-2 !min-h-0 !border-none text-rose-500 hover:text-rose-700"
                  title="Smazat naučený alias" aria-label="Smazat naučený alias"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {!loading && aliasy.length === 0 && (
            <div className="text-sm text-neutral-400 py-2 italic">Zatím se appka nic nenaučila.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Jen NABÍDKA podezřelých duplicit ke kontrole — sloučit nebo označit
// "nejsou duplicita" musí vždycky sám člověk (viz lib/podezreleDuplicity.ts:
// audit 16.–17. 9. 2026 skoro sloučil dva různé lidi jen podle jména).
function DuplicatePlacesModal({ places, onClose, onChanged }: { places: Place[]; onClose: () => void; onChanged: () => void }) {
  const [loading, setLoading] = useState(true);
  const [pocty, setPocty] = useState<Record<string, number>>({});
  const [ignorovane, setIgnorovane] = useState<{ a: string; b: string }[]>([]);
  const [slucuji, setSlucuji] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [objRes, ignRes] = await Promise.all([
        fetchAllRows('orders', 'place_id').neq('status', 'storno'),
        supabase.from('mista_duplicity_ignorovano').select('place_id_a, place_id_b'),
      ]);
      const p: Record<string, number> = {};
      for (const o of (objRes.data as { place_id: string | null }[] | null) ?? []) {
        if (!o.place_id) continue;
        p[o.place_id] = (p[o.place_id] ?? 0) + 1;
      }
      setPocty(p);
      setIgnorovane(((ignRes.data as { place_id_a: string; place_id_b: string }[] | null) ?? []).map((r) => ({ a: r.place_id_a, b: r.place_id_b })));
      setLoading(false);
    })();
  }, []);

  const jeIgnorovany = (a: string, b: string) => ignorovane.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

  const kandidati = useMemo(
    () => najdiPodezreleDuplicity(places).filter((k) => !jeIgnorovany(k.a.id, k.b.id)),
    [places, ignorovane]
  );

  async function nejsouDuplicity(k: KandidatDuplicity) {
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
    await supabase.from('mista_duplicity_ignorovano').insert({ place_id_a: k.a.id, place_id_b: k.b.id, created_by: user?.email ?? null });
    setIgnorovane((arr) => [...arr, { a: k.a.id, b: k.b.id }]);
  }

  async function sloucDoTohoto(cilove: { id: string; name: string }, zdrojove: { id: string; name: string }) {
    const pocetZdroj = pocty[zdrojove.id] ?? 0;
    if (!(await potvrd(
      `Sloučit „${zdrojove.name}" do „${cilove.name}"? ${pocetZdroj} objednávek a další záznamy se přepíšou na „${cilove.name}" a „${zdrojove.name}" se smaže. Nejde vrátit zpět.`
    ))) return;
    setSlucuji(zdrojove.id);
    const kroky = [
      supabase.from('orders').update({ place_id: cilove.id, place_name: cilove.name }).eq('place_id', zdrojove.id),
      supabase.from('keg_returns').update({ place_id: cilove.id, place_name: cilove.name }).eq('place_id', zdrojove.id),
      supabase.from('place_aliases').update({ place_id: cilove.id }).eq('place_id', zdrojove.id),
      supabase.from('whatsapp_incoming').update({ parsed_place_id: cilove.id, parsed_place_name: cilove.name }).eq('parsed_place_id', zdrojove.id),
    ];
    for (const krok of kroky) {
      const { error } = await krok;
      if (error) { chyba(`Sloučení selhalo: ${error.message}`); setSlucuji(null); return; }
    }
    const { error: delErr } = await supabase.from('places').delete().eq('id', zdrojove.id);
    setSlucuji(null);
    if (delErr) { chyba(`Záznamy přepsány, ale starý odběratel „${zdrojove.name}" se nesmazal: ${delErr.message}`); }
    else { oznam(`Sloučeno do „${cilove.name}".`); }
    onChanged();
  }

  return (
    <Modal open={true} onClose={onClose} title="Podezřelé duplicity odběratelů">
      <div className="space-y-4 text-xs">
        <p className="text-neutral-600 font-bold leading-snug">
          Appka jen NABÍZÍ páry se skoro stejným jménem nebo stejnou adresou — sloučit nebo nechat rozhoduješ vždycky ty.
          Sloučení přepíše objednávky i další záznamy na vybraného odběratele a ten druhý smaže.
        </p>
        {loading ? <Spinner /> : kandidati.length === 0 ? (
          <EmptyState text="Žádné podezřelé duplicity." icon={ShieldCheck} />
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {kandidati.map((k) => (
              <div key={`${k.a.id}-${k.b.id}`} className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                <div className="text-udaj font-extrabold text-violet-800">
                  {k.duvod === 'jmeno' ? 'Skoro stejné jméno' : 'Stejná adresa, jiné jméno'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[k.a, k.b].map((m, i) => {
                    const druhy = i === 0 ? k.b : k.a;
                    return (
                      <div key={m.id} className="rounded-lg border border-neutral-200 bg-white p-2.5 space-y-1">
                        <div className="font-black text-neutral-900">{m.name}</div>
                        <div className="text-neutral-500 font-medium">{m.address || 'bez adresy'}</div>
                        <div className="text-neutral-500 font-bold">{pocty[m.id] ?? 0} objednávek</div>
                        <button
                          className="btn-danger !rounded w-full mt-1 !py-1.5 text-udaj"
                          disabled={slucuji !== null}
                          onClick={() => sloucDoTohoto(m, druhy)}
                        >
                          {slucuji === druhy.id ? 'Slučuji…' : `Sloučit sem (smazat „${druhy.name}")`}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  className="btn-ghost !rounded w-full !py-1.5 text-udaj"
                  onClick={() => nejsouDuplicity(k)}
                >
                  Nejsou duplicita — nechat obě
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Hromadné dohledání GPS pro odběratele bez souřadnic (potřeba pro výpočet
// reálné jízdní vzdálenosti v Knize jízd). Kdo adresu už má vyplněnou, tomu
// se nabídne rovnou k vyhledání; kdo ji nemá (jen jméno typu "Radek" nebo
// "Sklad"), ten dostane editovatelné políčko — vyhledá se JEN to, co má
// v době spuštění vyplněnou adresu, ať geokodér nedostává holá jména, u
// kterých by vrátil náhodné/špatné místo. Výsledky se před uložením musí
// ručně potvrdit (checkbox u každého řádku).
function GpsBackfillModal({ places, onClose, onSaved }: { places: Place[]; onClose: () => void; onSaved: () => void }) {
  const [addresses, setAddresses] = useState<Record<string, string>>(() =>
    Object.fromEntries(places.map((p) => [p.id, p.address ?? '']))
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [targets, setTargets] = useState<Place[]>([]);
  const [results, setResults] = useState<Record<string, { address: string; lat: number; lng: number; displayName: string } | null>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function runLookup() {
    const toLookup = places.filter((p) => (addresses[p.id] ?? '').trim());
    if (toLookup.length === 0) return;
    setTargets(toLookup);
    setRunning(true);
    setProgress(0);
    const found: typeof results = {};
    const picked: Record<string, boolean> = {};
    for (let i = 0; i < toLookup.length; i++) {
      const p = toLookup[i];
      const candidates = await lookupPlaceOnline(addresses[p.id]);
      const best = candidates.find((c) => c.lat != null && c.lng != null);
      if (best && best.lat != null && best.lng != null) {
        found[p.id] = { address: best.address, lat: best.lat, lng: best.lng, displayName: best.displayName };
        picked[p.id] = true;
      } else {
        found[p.id] = null;
      }
      setResults({ ...found });
      setProgress(i + 1);
      // Nominatim usage policy: max ~1 dotaz/s.
      if (i < toLookup.length - 1) await new Promise((r) => setTimeout(r, 1100));
    }
    setSelected(picked);
    setRunning(false);
    setDone(true);
  }

  async function saveSelected() {
    setSaving(true);
    const toSave = targets.filter((p) => selected[p.id] && results[p.id]);
    for (const p of toSave) {
      const r = results[p.id]!;
      // Adresu ulož i tehdy, když se dřív vyhledávala jen podle jména bez
      // adresy — uživatel ji do políčka doplnil ručně před spuštěním.
      await supabase.from('places').update({ address: addresses[p.id] || r.address, lat: r.lat, lng: r.lng }).eq('id', p.id);
    }
    setSaving(false);
    onSaved();
  }

  const readyCount = places.filter((p) => (addresses[p.id] ?? '').trim()).length;
  const foundCount = Object.values(results).filter(Boolean).length;
  const selectedCount = Object.entries(selected).filter(([id, v]) => v && results[id]).length;

  return (
    <Modal open={true} onClose={onClose} title="Doplnit chybějící GPS">
      <div className="space-y-4 text-xs">
        {!running && !done && (
          <>
            <p className="text-neutral-700 font-bold leading-snug">
              Najde souřadnice pro odběratele bez GPS (potřeba pro výpočet km v Knize jízd) — pomocí veřejného
              geokodéru Nominatim (OpenStreetMap). Komu chybí adresa, tomu ji doplň níž (vyhledají se jen řádky
              s vyplněnou adresou). Výsledky se před uložením musí potvrdit — u méně přesných adres může vrátit
              jen střed obce.
            </p>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {places.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded border border-neutral-200 bg-white">
                  <div className="font-black text-neutral-900 shrink-0 w-28 truncate" title={p.name}>{p.name}</div>
                  <input
                    type="text"
                    value={addresses[p.id] ?? ''}
                    onChange={(e) => setAddresses((a) => ({ ...a, [p.id]: e.target.value }))}
                    placeholder="Zadej adresu (ulice, obec)…"
                    className="input !py-1.5 flex-1 text-xs"
                  />
                </div>
              ))}
            </div>
            <button onClick={runLookup} disabled={readyCount === 0} className="btn-amber !rounded w-full justify-center py-2.5 font-black disabled:opacity-50">
              <Search className="ikona-text" /> Spustit vyhledání ({readyCount})
            </button>
          </>
        )}

        {running && (
          <div className="space-y-2">
            <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${(progress / targets.length) * 100}%` }} />
            </div>
            <p className="text-center text-neutral-500 font-bold">Hledám {progress}/{targets.length}…</p>
          </div>
        )}

        {done && (
          <>
            <p className="text-neutral-700 font-bold">
              Nalezeno {foundCount} z {targets.length}. Odškrtni, co nechceš uložit (vybráno {selectedCount}).
            </p>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
              {targets.map((p) => {
                const r = results[p.id];
                return (
                  <label key={p.id} className={`flex items-start gap-2 px-3 py-2 rounded border cursor-pointer ${r ? 'bg-white border-neutral-200' : 'bg-neutral-50 border-neutral-200 opacity-60'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={!r}
                      checked={!!selected[p.id] && !!r}
                      onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-neutral-900 truncate">{p.name}</div>
                      <div className="text-udaj text-neutral-500 truncate">{addresses[p.id]}</div>
                      {r ? (
                        <div className="text-udaj text-emerald-700 font-bold truncate" title={r.displayName}>
                          <Check className="ikona-text" /> {r.lat.toFixed(6)}, {r.lng.toFixed(6)} — {r.displayName}
                        </div>
                      ) : (
                        <div className="text-udaj text-rose-600 font-bold">Nenalezeno</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={onClose} className="flex-1 px-3 py-2.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-extrabold transition">
                Zrušit
              </button>
              <button
                onClick={saveSelected}
                disabled={saving || selectedCount === 0}
                className="flex-1 btn-amber py-2.5 font-black disabled:opacity-50"
              >
                {saving ? 'Ukládám…' : `Uložit vybrané (${selectedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function PlaceForm({ place, onClose, onSaved }: { place: Place | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(place?.name ?? '');
  const [address, setAddress] = useState(place?.address ?? '');
  const [contactName, setContactName] = useState(place?.contact_name ?? '');
  const [phone, setPhone] = useState(place?.phone ?? '');
  const [email, setEmail] = useState(place?.email ?? '');
  const [deliveryGroup, setDeliveryGroup] = useState((place as any)?.delivery_group ?? '');
  const [note, setNote] = useState(place?.note ?? '');
  const [lat, setLat] = useState<number | null>(place?.lat ?? null);
  const [lng, setLng] = useState<number | null>(place?.lng ?? null);
  const [busy, setBusy] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressCandidates, setAddressCandidates] = useState<{ address: string; phone?: string; displayName: string; lat?: number; lng?: number }[]>([]);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);

  async function handleAutoLookupAddress() {
    if (!name.trim()) {
      oznam('Nejprve zadejte název odběratele / hospody.');
      return;
    }
    setSearchingAddress(true);
    setLookupMsg(null);
    setAddressCandidates([]);

    const results = await lookupPlaceOnline(name);
    setSearchingAddress(false);

    if (results.length === 0) {
      setLookupMsg('Adresa nebyla nalezena. Můžete ji zadat ručně, nebo do názvu připsat město (např. „U Zajíce Cheb“).');
    } else if (results.length === 1) {
      setAddress(results[0].address);
      if (results[0].phone && !phone) setPhone(results[0].phone);
      if (results[0].lat != null) setLat(results[0].lat);
      if (results[0].lng != null) setLng(results[0].lng);
      setLookupMsg(`Adresa načtena: ${results[0].address}`);
    } else {
      setAddressCandidates(results);
      setLookupMsg(`Nalezeno ${results.length} možných adres — zvolte správnou:`);
    }
  }

  async function save() {
    if (!name.trim()) {
      oznam('Vyplň název odběratele.');
      return;
    }
    setBusy(true);

    const trimmedName = name.trim();
    const fullPayload = {
      name: trimmedName,
      address: address.trim() || null,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      note: note.trim() || null,
      delivery_group: deliveryGroup.trim() || null,
      lat, lng,
    };
    const basePayload = {
      name: trimmedName,
      address: address.trim() || null,
      phone: phone.trim() || null,
      note: note.trim() || null,
      lat, lng,
    };
    const minimalPayload = {
      name: trimmedName,
    };

    let error: any = null;
    if (place) {
      const res = await supabase.from('places').update(fullPayload).eq('id', place.id);
      error = res.error;
      if (error) {
        const retry1 = await supabase.from('places').update(basePayload).eq('id', place.id);
        error = retry1.error;
        if (error) {
          const retry2 = await supabase.from('places').update(minimalPayload).eq('id', place.id);
          error = retry2.error;
        }
      }
    } else {
      const res = await supabase.from('places').insert(fullPayload);
      error = res.error;
      if (error) {
        if (error.message?.includes('places_name_lower_uniq') || error.code === '23505') {
          error = null;
        } else {
          const retry1 = await supabase.from('places').insert(basePayload);
          error = retry1.error;
          if (error && (error.message?.includes('places_name_lower_uniq') || error.code === '23505')) {
            error = null;
          } else if (error) {
            const retry2 = await supabase.from('places').insert(minimalPayload);
            error = retry2.error;
            if (error && (error.message?.includes('places_name_lower_uniq') || error.code === '23505')) {
              error = null;
            }
          }
        }
      }
    }

    setBusy(false);
    if (error) {
      chyba(`Nepodařilo se uložit odběratele: ${error.message || JSON.stringify(error)}`);
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={place ? 'Upravit odběratele' : 'Nový odběratel'}>
      <div className="space-y-4">
        <div>
          <Field label="Název odběratele / Hospody">
            <div className="flex gap-2">
              <input
                className="input font-bold flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. U Zajíce"
              />
              <button
                type="button"
                onClick={handleAutoLookupAddress}
                disabled={searchingAddress || !name.trim()}
                className="btn-secondary text-xs font-black shrink-0 flex items-center gap-1 shadow-2xs"
                title="Automaticky načíst adresu z Google / Map"
              >
                {searchingAddress ? 'Hledám…' : 'Načíst adresu'}
              </button>
            </div>
          </Field>

          {lookupMsg && (
            <div className="mt-1.5 text-xs font-bold text-neutral-700 bg-amber-50 border border-amber-200 rounded p-2">
              {lookupMsg}
            </div>
          )}

          {addressCandidates.length > 0 && (
            <div className="mt-2 space-y-1 bg-white border border-neutral-200 rounded p-2">
              {addressCandidates.map((cand, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setAddress(cand.address);
                    if (cand.phone && !phone) setPhone(cand.phone);
                    if (cand.lat != null) setLat(cand.lat);
                    if (cand.lng != null) setLng(cand.lng);
                    setAddressCandidates([]);
                    setLookupMsg(`Vybrána adresa: ${cand.address}`);
                  }}
                  className="w-full text-left p-2 rounded text-xs hover:bg-amber-50 font-medium text-neutral-800 transition flex items-center justify-between gap-2 border border-transparent hover:border-amber-300"
                >
                  <span className="truncate">{cand.address}</span>
                  <span className="text-udaj font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
                    Zvolit
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Adresa">
          <input
            className="input font-medium"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ulice 123, Město"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kontaktní osoba">
            <input
              className="input"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Jméno vedoucího"
            />
          </Field>
          <Field label="Telefon zákazníka">
            <input
              type="tel"
              className="input font-mono font-bold"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+420 777 123 456"
            />
          </Field>
        </div>

        <Field label="Závozová skupina (pro sloučení více míst do jednoho závozu)">
          <input
            className="input"
            value={deliveryGroup}
            onChange={(e) => setDeliveryGroup(e.target.value)}
            placeholder="např. Radek"
          />
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            className="input font-mono"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="objednavky@hospoda.cz"
          />
        </Field>

        <Field label="Poznámka">
          <textarea
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="např. vjezd zezadu, zvonit na rampu"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button type="button" className="btn-ghost !rounded text-xs font-bold" onClick={onClose}>
            Zrušit
          </button>
          <button
            type="button"
            className="btn-primary !rounded text-xs font-black"
            disabled={busy || !name}
            onClick={save}
          >
            {busy ? 'Ukládám…' : 'Uložit odběratele'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== VOZIDLA (STK & DÁLNIČNÍ ZNÁMKY) ===== */
export { getVehicleExpiryStatus };

export function VehiclesScreen() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Vehicle | null>(null);

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load() {
    const smiZapsat = zacniNacteni();
    setLoading(true);
    const { data } = await supabase.from('vehicles').select('*').order('name');
    if (!smiZapsat()) return;
    let vehicleList = (data as Vehicle[]) ?? [];

    // Pokud je databáze prázdná, předvytvořit 2 výchozí pivovarská auta:
    // "Velké auto" a "Kachna" — appka je pod těmito jmény zná i jinde
    // (Závoz rozlišuje jízdy "🦆 Kačena"), jen SPZ a termíny STK/známky se
    // NEVYMÝŠLÍ (byly to fiktivní datumy, které mohly vypadat jako
    // skutečná blížící se revize — nalezeno 10. 9. 2026,
    // docs/50-navrhu-2026-09-10-treti.md, bod 7) — ty ať doplní člověk.
    if (vehicleList.length === 0) {
      const defaultVehicles = [
        {
          name: 'Velké auto',
          spz: '',
          stk_valid_until: null,
          highway_toll_valid_until: null,
          note: 'Velký rozvozový nákladní vůz pro sudové pivo',
        },
        {
          name: 'Kachna',
          spz: '',
          stk_valid_until: null,
          highway_toll_valid_until: null,
          note: 'Dodávka Kachna pro rychlé závozy lahví a kegů',
        },
      ];

      const { data: created } = await supabase.from('vehicles').insert(defaultVehicles).select('*');
      if (created) vehicleList = created as Vehicle[];
      else {
        vehicleList = defaultVehicles.map((v, i) => ({ id: `local-${i}`, ...v }));
      }
    }

    setRows(vehicleList);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['vehicles'], load);

  async function del(id: string) {
    if (!(await potvrd('Smazat vozidlo z evidence?'))) return;
    await supabase.from('vehicles').delete().eq('id', id);
    load();
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-end">
        <button className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat auto
        </button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádná vozidla." icon={Car} /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {rows.map((v) => {
            const stkStatus = getVehicleExpiryStatus(v.stk_valid_until);
            const tollStatus = getVehicleExpiryStatus(v.highway_toll_valid_until);

            const hasWarning = stkStatus.status === 'warning' || tollStatus.status === 'warning';
            const hasExpired = stkStatus.status === 'expired' || tollStatus.status === 'expired';

            return (
              <div
                key={v.id}
                className={`card p-6 shadow-md border-2 transition-all rounded flex flex-col justify-between ${
                  hasExpired
                    ? 'bg-rose-50 border-rose-400 shadow-rose-100'
                    : hasWarning
                    ? 'bg-amber-50/80 border-amber-400 shadow-amber-100'
                    : 'bg-white border-neutral-200/90 hover:border-amber-400'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-200/80">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded bg-neutral-900 text-amber-400 flex items-center justify-center font-black text-xl shadow-md">
                        <Car className="ikona-text" />
                      </div>
                      <div>
                        <h3 className="font-display font-black text-xl text-neutral-900">{v.name}</h3>
                        {v.spz && <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-md bg-neutral-900 text-amber-300 shadow-xs">SPZ: {v.spz}</span>}
                      </div>
                    </div>

                    {(hasExpired || hasWarning) && (
                      <span className={`px-3 py-1 rounded text-xs font-black flex items-center gap-1 shadow-xs ${
                        hasExpired ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-neutral-950'
                      }`}>
                        <AlertTriangle size={16} />
                        <span>{hasExpired ? 'EXPIROVÁNO' : 'Pozor: Vyprší brzy'}</span>
                      </span>
                    )}
                  </div>

                  {/* STK & Toll Indicators */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* STK */}
                    <div className={`p-3.5 rounded border ${
                      stkStatus.status === 'expired'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-950 font-black'
                        : stkStatus.status === 'warning'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-extrabold'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    }`}>
                      <div className="text-udaj font-black uppercase tracking-wider text-neutral-500 mb-0.5"><Wrench className="ikona-text" /> Technická (STK)</div>
                      <div className="text-xs font-black flex items-center gap-1.5 mt-1">
                        {stkStatus.status === 'expired' && <ShieldAlert size={16} className="text-rose-600 shrink-0" />}
                        {stkStatus.status === 'warning' && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                        {stkStatus.status === 'ok' && <ShieldCheck size={16} className="text-emerald-600 shrink-0" />}
                        <span>{stkStatus.label}</span>
                      </div>
                    </div>

                    {/* Highway Toll */}
                    <div className={`p-3.5 rounded border ${
                      tollStatus.status === 'expired'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-950 font-black'
                        : tollStatus.status === 'warning'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-extrabold'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    }`}>
                      <div className="text-udaj font-black uppercase tracking-wider text-neutral-500 mb-0.5"><Milestone className="ikona-text" /> Dálniční známka</div>
                      <div className="text-xs font-black flex items-center gap-1.5 mt-1">
                        {tollStatus.status === 'expired' && <ShieldAlert size={16} className="text-rose-600 shrink-0" />}
                        {tollStatus.status === 'warning' && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                        {tollStatus.status === 'ok' && <ShieldCheck size={16} className="text-emerald-600 shrink-0" />}
                        <span>{tollStatus.label}</span>
                      </div>
                    </div>
                  </div>

                  {v.note && (
                    <div className="text-xs text-neutral-600 font-medium bg-neutral-100/70 p-3 rounded italic">
                      <NotebookPen className="ikona-text" /> {v.note}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-200/80">
                  <button className="flex-1 px-4 py-2 rounded bg-neutral-900 text-amber-300 font-extrabold text-xs hover:bg-neutral-800 transition shadow-xs" onClick={() => { setEdit(v); setShow(true); }}>
                    Upravit termíny & SPZ
                  </button>
                  <button aria-label="Smazat vozidlo" title="Smazat vozidlo" className="p-2 rounded bg-rose-50 hover:bg-rose-500 text-rose-700 hover:text-white font-bold text-xs transition" onClick={() => del(v.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {show && <VehicleForm vehicle={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
    </div>
  );
}

function VehicleForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(vehicle?.name ?? '');
  const [spz, setSpz] = useState(vehicle?.spz ?? '');
  const [stkDate, setStkDate] = useState(vehicle?.stk_valid_until ?? '');
  const [tollDate, setTollDate] = useState(vehicle?.highway_toll_valid_until ?? '');
  const [note, setNote] = useState(vehicle?.note ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const payload = {
      name: name.trim(),
      spz: spz.trim() || null,
      stk_valid_until: stkDate || null,
      highway_toll_valid_until: tollDate || null,
      note: note.trim() || null,
    };
    if (vehicle && !vehicle.id.startsWith('local-')) {
      await supabase.from('vehicles').update(payload).eq('id', vehicle.id);
    } else {
      await supabase.from('vehicles').insert(payload);
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? 'Upravit vozidlo' : 'Nové vozidlo'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Název auta (např. Velké auto, Kachna)"><input className="input font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="Velké auto" /></Field>
          <Field label="SPZ / RZ"><input className="input font-mono font-bold" value={spz} onChange={(e) => setSpz(e.target.value)} placeholder="5H1 2345" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Platnost STK (do)"><input type="date" className="input font-bold" value={stkDate} onChange={(e) => setStkDate(e.target.value)} /></Field>
          <Field label="Platnost Dálniční známky (do)"><input type="date" className="input font-bold" value={tollDate} onChange={(e) => setTollDate(e.target.value)} /></Field>
        </div>

        <Field label="Poznámka"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Náklaďák pro závozy..." /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Ukládám…' : 'Uložit vozidlo'}</button>
        </div>
      </div>
    </Modal>
  );
}
