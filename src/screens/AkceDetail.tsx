import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, Beer, Package, Akce, AkceItem, beerBg } from '../lib/supabase';
import { Spinner, Field, EmptyState } from '../components/ui';

const MAX_ITEMS = 7;

type ItemForm = {
  id?: string;
  beer_id: string;
  package_id: string;
  quantity: number;
};

export default function AkceDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [akce, setAkce] = useState<Akce | null>(null);
  const [items, setItems] = useState<ItemForm[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: a }, { data: b }, { data: p }] = await Promise.all([
      supabase.from('akce').select('*, items:akce_items(*)').eq('id', id!).single(),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);

    if (a) {
      const akceData = a as Akce;
      setAkce(akceData);
      const currentItems: ItemForm[] = akceData.items?.map(it => ({
        id: it.id,
        beer_id: it.beer_id ?? '',
        package_id: it.package_id ?? '',
        quantity: it.quantity,
      })) ?? [];
      // Fill up to MAX_ITEMS
      while (currentItems.length < MAX_ITEMS) {
        currentItems.push({ beer_id: '', package_id: '', quantity: 0 });
      }
      setItems(currentItems);
    }

    setBeers((b as Beer[]) ?? []);
    setPackages((p as Package[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (id) {
      load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateItem(idx: number, patch: Partial<ItemForm>) {
    setItems(arr => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function save() {
    if (!akce || !form.name.trim()) return;
    setSaving(true);

    // Update akce
    const { data: updatedAkce, error: akceError } = await supabase.from('akce').update({
      entry_date: form.entry_date,
      name: form.name.trim(),
      who: form.who || null,
      note: form.note || null,
      revenue: form.revenue ? Number(form.revenue) : 0,
    }).eq('id', akce.id).select().single();

    if (akceError) {
      alert('Chyba při ukládání akce: ' + akceError.message);
      setSaving(false);
      return;
    }

    // Update items
    const existingItemIds = akce.items?.map(it => it.id) ?? [];
    const currentItemIds = items.filter(it => it.id).map(it => it.id!);
    const toDelete = existingItemIds.filter(id => !currentItemIds.includes(id));
    const toUpdate = items.filter(it => it.id && (it.beer_id || it.package_id || it.quantity !== 0));
    const toInsert = items.filter(it => !it.id && (it.beer_id || it.package_id || it.quantity !== 0));

    if (toDelete.length > 0) {
      await supabase.from('akce_items').delete().in('id', toDelete);
    }
    if (toUpdate.length > 0) {
      await supabase.from('akce_items').upsert(toUpdate.map(it => {
        const beer = beers.find(b => b.id === it.beer_id);
        const pkg = packages.find(p => p.id === it.package_id);
        return { ...it, beer_name: beer?.name ?? null, package_label: pkg?.label ?? null };
      }));
    }
    if (toInsert.length > 0) {
      await supabase.from('akce_items').insert(toInsert.map(it => {
        const beer = beers.find(b => b.id === it.beer_id);
        const pkg = packages.find(p => p.id === it.package_id);
        return { ...it, akce_id: akce.id, beer_name: beer?.name ?? null, package_label: pkg?.label ?? null };
      }));
    }

    setSaving(false);
    navigate('/akce');
  }

  const [form, setForm] = useState({ entry_date: '', name: '', who: '', note: '', revenue: '' });

  useEffect(() => {
    if (akce) {
      setForm({
        entry_date: akce.entry_date,
        name: akce.name,
        who: akce.who ?? '',
        note: akce.note ?? '',
        revenue: String(akce.revenue ?? ''),
      });
    }
  }, [akce]);

  if (loading) return <Spinner />;
  if (!akce) return <EmptyState text="Akce nenalezena." />;

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-primary-900 mb-4">Upravit akci: {akce.name}</h1>
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <Field label="Datum"><input type="date" className="input" value={form.entry_date} onChange={e => setForm({ ...form, entry_date: e.target.value })} /></Field>
          <Field label="Název akce"><input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Kdo jede"><input className="input" value={form.who} onChange={e => setForm({ ...form, who: e.target.value })} /></Field>
          <Field label="💰 Vyděláno (Kč)"><input type="number" className="input" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} /></Field>
        </div>

        <div className="space-y-2">
          {items.map((it, idx) => {
            const beer = beers.find(b => b.id === it.beer_id);
            return (
              <div key={idx} className="grid grid-cols-12 gap-1.5 sm:gap-2 items-center p-1.5 sm:p-2 rounded-lg transition-colors hover:bg-primary-50/30" style={beer ? { backgroundColor: beerBg(beer) } : undefined}>
                <div className="col-span-1 text-center text-[10px] sm:text-xs text-primary-400 font-semibold">{idx + 1}</div>
                <div className="col-span-11 sm:col-span-4"><select className="input" value={it.beer_id} onChange={e => updateItem(idx, { beer_id: e.target.value })}><option value="">—</option>{beers.map(b => <option key={b.id} value={b.id}>{b.name} {b.degree}</option>)}</select></div>
                <div className="col-span-6 sm:col-span-4"><select className="input" value={it.package_id} onChange={e => updateItem(idx, { package_id: e.target.value })}><option value="">—</option>{packages.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
                <div className="col-span-4 sm:col-span-2"><input type="number" className="input" placeholder="-10 nebo +5" value={it.quantity || ''} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })} /></div>
                <div className="sm:col-span-1 flex justify-end">
                  {(it.beer_id || it.package_id || it.quantity !== 0) && (
                    <button type="button" onClick={() => updateItem(idx, { beer_id: '', package_id: '', quantity: 0 })} className="w-6 h-6 grid place-items-center rounded text-danger-400 hover:bg-danger-50 hover:text-danger-600 text-xs" title="Vymazat řádek">✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <Field label="Poznámka"><input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="flex items-end justify-end gap-2">
            <button className="btn-ghost" onClick={() => navigate('/akce')}>Zrušit</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Ukládám...' : 'Uložit změny'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}