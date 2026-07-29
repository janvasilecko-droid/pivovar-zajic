import { useEffect, useState, useMemo } from 'react';
import { supabase, Beer, Package, Place, Vehicle, useRealtime, BEER_COLOR_PRESETS, beerBg, beerText, beerBorder } from '../lib/supabase';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import ExcelImportModal from '../components/ExcelImportModal';
import { FileSpreadsheet, Plus, Search, Beer as BeerIcon, Package as PackageIcon, MapPin, Phone, Mail, Edit, Trash2, Eye, EyeOff, Car, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

/* ===== PIVA ===== */
export function BeersScreen() {
  const [rows, setRows] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [edit, setEdit] = useState<Beer | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('beers').select('*').order('sort_order');
    setRows((data as Beer[]) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['beers'], load);

  async function toggleActive(b: Beer) {
    await supabase.from('beers').update({ is_active: !b.is_active }).eq('id', b.id);
    load();
  }
  async function del(id: string) {
    if (!confirm('Smazat pivo?')) return;
    const { error } = await supabase.from('beers').delete().eq('id', id);
    if (error) { alert('Pivo nelze smazat — je použito v záznamech.'); return; }
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
        <button className="px-3.5 py-2.5 rounded-2xl bg-white border border-amber-300/80 text-amber-950 hover:bg-amber-50 font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs" onClick={() => setShowImport(true)}>
          <FileSpreadsheet size={16} /> Import z Excelu
        </button>
        <button className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat pivo
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Hledat pivo podle názvu, stupně nebo barvy..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
        />
      </div>

      {showImport && <ExcelImportModal open={showImport} onClose={() => setShowImport(false)} targetTable="beers" onSuccess={load} />}

      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState text="Žádná piva v katalogu." icon="🍺" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <div key={b.id} className="card p-5 border-2 shadow-sm transition-all hover:shadow-md flex flex-col justify-between" style={{ backgroundColor: beerBg(b), borderColor: beerBorder(b) }}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`font-display font-black text-lg truncate ${beerText(b)}`}>{b.name}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {b.degree && <span className="px-2.5 py-0.5 rounded-lg bg-neutral-900 text-amber-300 font-mono font-black text-xs">{b.degree}</span>}
                      {b.color && <span className="px-2 py-0.5 rounded-lg bg-white/80 text-neutral-800 font-extrabold text-xs border border-black/10">{b.color}</span>}
                    </div>
                  </div>
                  <span className={`w-3 h-3 rounded-full shrink-0 shadow-xs ${b.is_active ? 'bg-emerald-500' : 'bg-neutral-300'}`} title={b.is_active ? 'Aktivní' : 'Skryté'} />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-black/10">
                <button className="flex-1 px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white text-neutral-900 font-extrabold text-xs shadow-xs transition" onClick={() => { setEdit(b); setShow(true); }}>
                  Upravit
                </button>
                <button className="px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white/90 text-neutral-800 font-bold text-xs shadow-xs transition" onClick={() => toggleActive(b)}>
                  {b.is_active ? 'Skrýt' : 'Aktivovat'}
                </button>
                <button className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-700 hover:text-white font-bold text-xs transition" onClick={() => del(b.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <BeerForm beer={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
    </div>
  );
}

function BeerForm({ beer, onClose, onSaved }: { beer: Beer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(beer?.name ?? '');
  const [degree, setDegree] = useState(beer?.degree ?? '');
  const [color, setColor] = useState(beer?.color ?? '');
  const [beerColor, setBeerColor] = useState(beer?.beer_color ?? '#F3F4F6');
  const [order, setOrder] = useState(beer?.sort_order ?? 1);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const payload = { name, degree: degree || null, color: color || null, beer_color: beerColor, sort_order: order, is_active: true };
    if (beer) await supabase.from('beers').update(payload).eq('id', beer.id);
    else await supabase.from('beers').insert(payload);
    setBusy(false); onSaved();
  }

  return (
    <Modal open onClose={onClose} title={beer ? 'Upravit pivo' : 'Nové pivo'}>
      <div className="space-y-4">
        <Field label="Název"><input className="input font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. 12° Světlá" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stupeň"><input className="input" value={degree} onChange={(e) => setDegree(e.target.value)} placeholder="12°" /></Field>
          <Field label="Barva"><input className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="světlé" /></Field>
        </div>
        <Field label="Barva pozadí (v aplikaci)">
          <div className="flex flex-wrap gap-2 items-center">
            {BEER_COLOR_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => setBeerColor(c)}
                className={`w-8 h-8 rounded-xl border-2 transition ${beerColor === c ? 'ring-2 ring-amber-500 border-amber-500 scale-110' : 'border-neutral-200'}`}
                style={{ backgroundColor: c }} title={c} />
            ))}
            <input type="color" value={beerColor} onChange={(e) => setBeerColor(e.target.value)} className="w-8 h-8 rounded-xl cursor-pointer border border-neutral-200" />
          </div>
        </Field>
        <Field label="Pořadí"><input type="number" className="input" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy || !name} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
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

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('packages').select('*').order('sort_order');
    setRows((data as Package[]) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['packages'], load);

  async function del(id: string) {
    if (!confirm('Smazat obal?')) return;
    const { error } = await supabase.from('packages').delete().eq('id', id);
    if (error) { alert('Obal nelze smazat — je použit v záznamech.'); return; }
    load();
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-end">
        <button className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat obal
        </button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádné obaly v katalogu." icon="📦" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rows.map((p) => (
            <div key={p.id} className="card p-5 shadow-sm hover:shadow-md border border-neutral-200/90 bg-white rounded-3xl flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display font-black text-lg text-neutral-900">{p.label}</div>
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-black ${p.kind === 'keg' ? 'bg-amber-500/20 text-amber-900 border border-amber-400/30' : 'bg-emerald-500/20 text-emerald-900 border border-emerald-400/30'}`}>
                    {p.kind === 'keg' ? '🛢️ KEG' : '🍾 Lahev'}
                  </span>
                </div>
                <div className="text-sm font-extrabold text-amber-700 mt-2 font-mono">{p.volume_l} litrů</div>
                <div className="text-xs text-neutral-400 mt-0.5 font-mono">Kód: {p.code}</div>
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-100">
                <button className="flex-1 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-extrabold text-xs transition" onClick={() => { setEdit(p); setShow(true); }}>
                  Upravit
                </button>
                <button className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white font-bold text-xs transition" onClick={() => del(p.id)}>
                  <Trash2 size={15} />
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
          <Field label="Objem (l)"><input type="number" step="0.01" className="input" value={vol} onChange={(e) => setVol(Number(e.target.value))} /></Field>
          <Field label="Pořadí"><input type="number" className="input" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
        </div>
        <Field label="Popisek"><input className="input font-bold" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="KEG 30l" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy || !code || !label} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== ODBĚRATELÉ ===== */
export function PlacesScreen() {
  const [rows, setRows] = useState<(Place & { delivery_group?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [edit, setEdit] = useState<Place | null>(null);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('places').select('*').order('name');
    if (data && !error) {
      // Pre-fill delivery group for specific places
      const toUpdate = data.filter(p => ['sklad', 'BEN', 'JONA'].includes(p.name) && !p.delivery_group);
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map(p => supabase.from('places').update({ delivery_group: 'Radek' }).eq('id', p.id))
        );
        // reload after update
        const { data: refreshedData } = await supabase.from('places').select('*').order('name');
        setRows((refreshedData as Place[]) ?? []);
      } else {
        setRows((data as Place[]) ?? []);
      }
    }
    setRows((data as Place[]) ?? []); setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['places'], load);

  async function del(id: string) {
    if (!confirm('Smazat odběratele?')) return;
    const { error } = await supabase.from('places').delete().eq('id', id);
    if (error) { alert('Odběratele nelze smazat — má navázané objednávky.'); return; }
    load();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.toLowerCase();
    return rows.filter((p) => p.name.toLowerCase().includes(term) || (p.address ?? '').toLowerCase().includes(term) || (p.contact_name ?? '').toLowerCase().includes(term));
  }, [rows, search]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button className="px-3.5 py-2.5 rounded-2xl bg-white border border-amber-300/80 text-amber-950 hover:bg-amber-50 font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs" onClick={() => setShowImport(true)}>
          <FileSpreadsheet size={16} /> Import z Excelu
        </button>
        <button className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat odběratele
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Hledat odběratele podle jména, adresy nebo kontaktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
        />
      </div>

      {showImport && <ExcelImportModal open={showImport} onClose={() => setShowImport(false)} targetTable="places" onSuccess={load} />}

      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState text="Žádní odběratelé." icon="🏪" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card p-5 shadow-sm hover:shadow-md border border-neutral-200/90 bg-white rounded-3xl flex flex-col justify-between">
              <div>
                <div className="font-display font-black text-base text-neutral-900">{p.name}</div>
                {p.address && <div className="text-xs text-neutral-500 mt-1 flex items-center gap-1"><MapPin size={13} className="text-amber-600 shrink-0" /><span className="truncate">{p.address}</span></div>}
                {p.delivery_group && <div className="mt-2 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded-lg px-2 py-1 inline-block">Skupina: {p.delivery_group}</div>}
                {p.contact_name && <div className="text-xs text-neutral-700 font-bold mt-2">Kontakt: {p.contact_name}</div>}
                {p.phone && <div className="text-xs text-amber-700 font-mono font-bold mt-0.5 flex items-center gap-1"><Phone size={12} />{p.phone}</div>}
                {p.email && <div className="text-xs text-neutral-500 font-mono mt-0.5 flex items-center gap-1"><Mail size={12} />{p.email}</div>}
              </div>

              <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-100">
                <button className="flex-1 px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-extrabold text-xs transition" onClick={() => { setEdit(p); setShow(true); }}>
                  Upravit
                </button>
                <button className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white font-bold text-xs transition" onClick={() => del(p.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <PlaceForm place={edit} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
    </div>
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
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const payload = { name, address: address || null, contact_name: contactName || null, phone: phone || null, email: email || null, note: note || null, delivery_group: deliveryGroup || null };
    if (place) await supabase.from('places').update(payload).eq('id', place.id);
    else await supabase.from('places').insert(payload);
    setBusy(false); onSaved();
  }

  return (
    <Modal open onClose={onClose} title={place ? 'Upravit odběratele' : 'Nový odběratel'}>
      <div className="space-y-4">
        <Field label="Název odběratele / Hospody"><input className="input font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. U Zajíce" /></Field>
        <Field label="Adresa"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ulice 123, Město" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kontaktní osoba"><input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} /></Field>
          <Field label="Telefon"><input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
        <Field label="Závozová skupina (pro sloučení více míst do jednoho závozu)"><input className="input" value={deliveryGroup} onChange={(e) => setDeliveryGroup(e.target.value)} placeholder="např. Radek" /></Field>
        <Field label="E-mail"><input className="input font-mono" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Poznámka"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy || !name} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== VOZIDLA (STK & DÁLNIČNÍ ZNÁMKY) ===== */
export function getVehicleExpiryStatus(dateStr: string | null | undefined): {
  daysLeft: number | null;
  status: 'ok' | 'warning' | 'expired' | 'none';
  label: string;
} {
  if (!dateStr) return { daysLeft: null, status: 'none', label: 'Nezadáno' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00Z');
  const diffTime = target.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const fmtDate = new Date(dateStr).toLocaleDateString('cs-CZ');

  if (daysLeft < 0) {
    return { daysLeft, status: 'expired', label: `🚨 EXPIROVALO před ${Math.abs(daysLeft)} dny (${fmtDate})` };
  } else if (daysLeft <= 30) {
    return { daysLeft, status: 'warning', label: `⚠️ Vyprší za ${daysLeft} dní (${fmtDate})` };
  } else {
    return { daysLeft, status: 'ok', label: `Platné do ${fmtDate}` };
  }
}

export function VehiclesScreen() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState<Vehicle | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('vehicles').select('*').order('name');
    let vehicleList = (data as Vehicle[]) ?? [];

    // Pokud je databáze prázdná, předvytvořit 2 výchozí pivovarská auta: "Velké auto" a "Kachna"
    if (vehicleList.length === 0) {
      const defaultVehicles = [
        {
          name: 'Velké auto',
          spz: '5H1 2345',
          stk_valid_until: '2026-08-25',
          highway_toll_valid_until: '2026-12-31',
          note: 'Velký rozvozový nákladní vůz pro sudové pivo',
        },
        {
          name: 'Kachna',
          spz: '3H8 9876',
          stk_valid_until: '2026-08-10',
          highway_toll_valid_until: '2026-09-01',
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
    if (!confirm('Smazat vozidlo z evidence?')) return;
    await supabase.from('vehicles').delete().eq('id', id);
    load();
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-end">
        <button className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-md flex items-center gap-1.5" onClick={() => { setEdit(null); setShow(true); }}>
          <Plus size={16} /> Přidat auto
        </button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádná vozidla." icon="🚗" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {rows.map((v) => {
            const stkStatus = getVehicleExpiryStatus(v.stk_valid_until);
            const tollStatus = getVehicleExpiryStatus(v.highway_toll_valid_until);

            const hasWarning = stkStatus.status === 'warning' || tollStatus.status === 'warning';
            const hasExpired = stkStatus.status === 'expired' || tollStatus.status === 'expired';

            return (
              <div
                key={v.id}
                className={`card p-6 shadow-md border-2 transition-all rounded-3xl flex flex-col justify-between ${
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
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center font-black text-xl shadow-md">
                        🚗
                      </div>
                      <div>
                        <h3 className="font-display font-black text-xl text-neutral-900">{v.name}</h3>
                        {v.spz && <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-md bg-neutral-900 text-amber-300 shadow-xs">SPZ: {v.spz}</span>}
                      </div>
                    </div>

                    {(hasExpired || hasWarning) && (
                      <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 shadow-xs ${
                        hasExpired ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-slate-950'
                      }`}>
                        <AlertTriangle size={15} />
                        <span>{hasExpired ? 'EXPIROVÁNO' : 'Pozor: Vyprší brzy'}</span>
                      </span>
                    )}
                  </div>

                  {/* STK & Toll Indicators */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* STK */}
                    <div className={`p-3.5 rounded-2xl border ${
                      stkStatus.status === 'expired'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-950 font-black'
                        : stkStatus.status === 'warning'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-extrabold'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    }`}>
                      <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-0.5">🛠️ Technická (STK)</div>
                      <div className="text-xs font-black flex items-center gap-1.5 mt-1">
                        {stkStatus.status === 'expired' && <ShieldAlert size={16} className="text-rose-600 shrink-0" />}
                        {stkStatus.status === 'warning' && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                        {stkStatus.status === 'ok' && <ShieldCheck size={16} className="text-emerald-600 shrink-0" />}
                        <span>{stkStatus.label}</span>
                      </div>
                    </div>

                    {/* Highway Toll */}
                    <div className={`p-3.5 rounded-2xl border ${
                      tollStatus.status === 'expired'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-950 font-black'
                        : tollStatus.status === 'warning'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-950 font-extrabold'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    }`}>
                      <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-0.5">🛣️ Dálniční známka</div>
                      <div className="text-xs font-black flex items-center gap-1.5 mt-1">
                        {tollStatus.status === 'expired' && <ShieldAlert size={16} className="text-rose-600 shrink-0" />}
                        {tollStatus.status === 'warning' && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                        {tollStatus.status === 'ok' && <ShieldCheck size={16} className="text-emerald-600 shrink-0" />}
                        <span>{tollStatus.label}</span>
                      </div>
                    </div>
                  </div>

                  {v.note && (
                    <div className="text-xs text-neutral-600 font-medium bg-neutral-100/70 p-3 rounded-xl italic">
                      📝 {v.note}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-5 pt-3 border-t border-neutral-200/80">
                  <button className="flex-1 px-4 py-2 rounded-xl bg-neutral-900 text-amber-300 font-extrabold text-xs hover:bg-slate-800 transition shadow-xs" onClick={() => { setEdit(v); setShow(true); }}>
                    Upravit termíny & SPZ
                  </button>
                  <button className="p-2 rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-600 hover:text-white font-bold text-xs transition" onClick={() => del(v.id)}>
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
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Ukládám…' : 'Uložit vozidlo'}</button>
        </div>
      </div>
    </Modal>
  );
}
