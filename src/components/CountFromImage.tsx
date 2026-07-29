import { useState, useRef } from 'react';
import { Modal, Spinner } from './ui';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { Camera, Plus, Trash2, Package as PackageIcon, CheckCircle2, AlertCircle } from 'lucide-react';

type CountItem = {
  package_label: string | null;
  quantity: number | null;
  note: string | null;
  beer_id: string;
  package_id: string;
  photo_id: string; // which photo produced this item
};

type PhotoSlot = {
  id: string;
  preview: string | null;
  rawText: string;
  busy: boolean;
  progress: number;
  err: string | null;
  editing: string | null; // data url being cropped
};

export function CountFromImage({ beers, packages, onClose, onSaved, table = 'inventory' }: {
  beers: Beer[];
  packages: Package[];
  onClose: () => void;
  onSaved: () => void;
  table?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [results, setResults] = useState<CountItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const id = crypto.randomUUID();
        setPhotos((ps) => [...ps, { id, preview: null, rawText: '', busy: false, progress: 0, err: null, editing: dataUrl }]);
      };
      reader.readAsDataURL(f);
    });
  }

  function onEditorConfirm(photoId: string, editedDataUrl: string) {
    setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, editing: null, preview: editedDataUrl, busy: true, progress: 30, err: null } : p));
    const base64 = editedDataUrl.split(',')[1] ?? '';
    runCount(photoId, base64, 'image/jpeg');
  }

  function cancelEditor(photoId: string) {
    setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, editing: null } : p));
  }

  async function runCount(photoId: string, base64: string, mimeType: string) {
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/count-bottles`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: mimeType,
          packages: packages.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
          promptHint: 'Count bottles inside beer crates (přepravka/bedna). A standard Czech beer crate holds 20 bottles (4x5 grid). Look at bottle caps or bottle necks. Count both full crates (20 bottles each) and individual bottles in partially filled crates.',
        }),
      });
      const respText = await resp.text();
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try { msg += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { msg += ': ' + respText; }
        throw new Error(msg);
      }
      let data: any;
      try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
      if (data?.error) throw new Error(data.error);

      const items: CountItem[] = (data?.items ?? []).map((item: any) => {
        const pkg = packages.find((p) => p.label === item.package_label) ?? null;
        return {
          package_label: item.package_label,
          quantity: item.quantity,
          note: item.note,
          beer_id: '',
          package_id: pkg?.id ?? '',
          photo_id: photoId,
        };
      });
      setResults((rs) => [...rs, ...items]);
      setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, busy: false, progress: 100, rawText: data?.raw_text ?? '' } : p));
    } catch (e: any) {
      setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, busy: false, err: 'Počítání selhalo: ' + (e?.message ?? String(e)) } : p));
    }
  }

  function retakePhoto(photoId: string) {
    setResults((rs) => rs.filter((r) => r.photo_id !== photoId));
    setPhotos((ps) => ps.map((p) => p.id === photoId ? { ...p, preview: null, editing: null, rawText: '', err: null, progress: 0 } : p));
    fileRef.current?.click();
  }

  function removePhoto(photoId: string) {
    setResults((rs) => rs.filter((r) => r.photo_id !== photoId));
    setPhotos((ps) => ps.filter((p) => p.id !== photoId));
  }

  function updateResult(i: number, patch: Partial<CountItem>) {
    setResults((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function removeResult(i: number) {
    setResults((rs) => rs.filter((_, idx) => idx !== i));
  }

  function addPresetCrate(qty: number, noteText: string) {
    const lahvePkg = packages.find((p) => /lahv|0\.5/i.test(p.label)) ?? packages[0];
    const defaultBeer = beers[0];
    const newItem: CountItem = {
      package_label: lahvePkg?.label ?? 'Lahve 0.5l',
      quantity: qty,
      note: noteText,
      beer_id: defaultBeer?.id ?? '',
      package_id: lahvePkg?.id ?? '',
      photo_id: 'preset',
    };
    setResults((rs) => [...rs, newItem]);
  }

  async function save() {
    const valid = results.filter((r) => r.beer_id && r.package_id && r.quantity && r.quantity > 0);
    if (!valid.length) { setErr('Doplň pivo, obal a množství pro každou položku.'); return; }
    setErr(null); setSaving(true);
    try {
      // 1. Save to Supabase inventory table
      const rows = valid.map((r) => {
        const beer = beers.find((b) => b.id === r.beer_id);
        const pkg = packages.find((p) => p.id === r.package_id);
        return {
          entry_date: date,
          beer_id: r.beer_id,
          beer_name: beer?.name ?? null,
          package_id: r.package_id,
          package_label: pkg?.label ?? null,
          quantity: r.quantity,
          note: r.note ?? null,
        };
      });
      const { error } = await supabase.from(table).insert(rows);
      if (error) {
        // Table might not exist or error out — non-fatal for local inventory
        console.warn('Inventory table insert warning:', error.message);
      }

      // 2. Also update actual_inventory_YYYY-MM in localStorage
      const currentMonth = date.slice(0, 7);
      try {
        const savedActual = localStorage.getItem(`actual_inventory_${currentMonth}`);
        const actualMap: Record<string, string> = savedActual ? JSON.parse(savedActual) : {};

        valid.forEach((r) => {
          const key = `${r.beer_id}__${r.package_id}`;
          const prevQty = Number(actualMap[key] || 0);
          actualMap[key] = String(prevQty + Number(r.quantity || 0));
        });

        localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(actualMap));
      } catch {}

      onSaved();
      onClose();
    } catch (e: any) {
      setErr('Ukládání selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  const readyCount = results.filter((r) => r.beer_id && r.package_id && r.quantity && r.quantity > 0).length;
  const busyAny = photos.some((p) => p.busy);

  return (
    <Modal open onClose={onClose} title="📷 Spočítat z fotek & přepravek (Inventura)" wide>
      <div className="space-y-4">
        <div className="card bg-amber-500/10 border border-amber-300 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="block text-xs font-black text-neutral-800 mb-1">Datum inventury</label>
            <input type="date" className="input font-mono font-bold text-xs max-w-[200px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="text-xs font-medium text-neutral-600">
            Nfoťte přepravky s lahvemi nebo bedny. AI spočítá zátky a zjištěné počty vloží přímo do fyzické inventury.
          </div>
        </div>

        {/* 📦 RYCHLÝ PŘEPRAVKOVÝ KALKULÁTOR */}
        <div className="card p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
          <div className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <PackageIcon size={16} className="text-amber-600" />
            <span>Rychlý kalkulátor po přepravkách / kartonech (20 ks / 12 ks / 6 ks)</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <button type="button" onClick={() => addPresetCrate(20, '1 plná přepravka (20 ks)')} className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 transition border border-amber-300 font-black">
              +20 ks (1 přepravka)
            </button>
            <button type="button" onClick={() => addPresetCrate(40, '2 plné přepravky (40 ks)')} className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 transition border border-amber-300 font-black">
              +40 ks (2 přepravky)
            </button>
            <button type="button" onClick={() => addPresetCrate(100, '5 plných přepravek (100 ks)')} className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 transition border border-amber-300 font-black">
              +100 ks (5 přepravek)
            </button>
            <button type="button" onClick={() => addPresetCrate(12, '1 karton (12 ks)')} className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 transition border border-amber-200 font-black">
              +12 ks (1 karton)
            </button>
            <button type="button" onClick={() => addPresetCrate(6, '1 karton (6 ks)')} className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 transition border border-amber-200 font-black">
              +6 ks (1 karton)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} className="hidden" />
          <button className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-2" onClick={() => fileRef.current?.click()} disabled={busyAny}>
            <Camera size={18} /> Přidat fotky beden s lahvemi
          </button>
          <span className="text-xs text-neutral-500 font-medium">Můžete nahrát i více fotek najednou. AI detekuje lahve v roštu přepravky.</span>
        </div>

        {/* Editors for photos being cropped */}
        {photos.filter((p) => p.editing).map((p) => (
          <div key={p.id} className="card p-4 border border-amber-200 rounded-2xl">
            <ImageEditor
              src={p.editing!}
              onConfirm={(edited) => onEditorConfirm(p.id, edited)}
              onCancel={() => cancelEditor(p.id)}
            />
          </div>
        ))}

        {/* Photo previews */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="rounded-2xl border-2 border-amber-200 bg-neutral-900 overflow-hidden relative shadow-sm">
                <div className="px-3 py-1.5 bg-neutral-800 text-amber-300 text-xs font-black flex items-center justify-between">
                  <span>Fotka bedny</span>
                  <button className="text-neutral-400 hover:text-rose-400 text-sm font-bold" onClick={() => removePhoto(p.id)}>×</button>
                </div>
                <div className="relative min-h-[120px] flex items-center justify-center bg-neutral-950">
                  {p.preview ? (
                    <img src={p.preview} alt="bedna" className="block max-w-full max-h-[30vh] object-contain" />
                  ) : p.busy ? (
                    <div className="text-amber-400 text-xs p-4 text-center">
                      <Spinner />
                    </div>
                  ) : (
                    <div className="text-neutral-500 text-xs p-4 text-center">Žádný náhled</div>
                  )}
                  {p.busy && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-800">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                  )}
                </div>
                {p.rawText && (
                  <div className="px-3 py-1.5 bg-amber-50 text-[10px] text-amber-950 font-bold">{p.rawText}</div>
                )}
                {p.err && (
                  <div className="px-3 py-1.5 bg-rose-50 text-[10px] text-rose-700 font-bold">{p.err}</div>
                )}
                {!p.busy && p.preview && (
                  <button className="w-full text-xs py-1.5 bg-neutral-800 text-amber-300 hover:bg-neutral-700 font-bold transition" onClick={() => retakePhoto(p.id)}>Znovu nahrát</button>
                )}
              </div>
            ))}
          </div>
        )}

        {err && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 font-bold">{err}</div>}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-black text-neutral-900 flex items-center justify-between">
              <span>Spočítané položky ({results.length})</span>
              <span className="text-xs font-bold text-amber-800">Doplňte správné pivo a obal</span>
            </div>
            <div className="space-y-3">
              {results.map((r, i) => (
                <div key={i} className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-xl bg-amber-200 text-amber-950 font-black text-xs">{r.package_label ?? 'Lahve 0.5l'}</span>
                    {r.note && <span className="text-xs text-neutral-600 font-bold">{r.note}</span>}
                    <button className="text-rose-500 hover:text-rose-700 text-sm font-bold px-2" onClick={() => removeResult(i)}>× Smazat</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-neutral-700 mb-1">Množství (ks)</label>
                      <input type="number" min={0} className="input !py-1.5 text-sm font-mono font-black"
                        value={r.quantity ?? ''} onChange={(e) => updateResult(i, { quantity: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-neutral-700 mb-1">Pivo</label>
                      <select className="input !py-1.5 text-xs font-bold" value={r.beer_id} onChange={(e) => updateResult(i, { beer_id: e.target.value })}>
                        <option value="">— Vyber pivo —</option>
                        {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-neutral-700 mb-1">Obal</label>
                      <select className="input !py-1.5 text-xs font-bold" value={r.package_id} onChange={(e) => {
                        const pkg = packages.find((p) => p.id === e.target.value);
                        updateResult(i, { package_id: e.target.value, package_label: pkg?.label ?? null });
                      }}>
                        <option value="">— Vyber obal —</option>
                        {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button className="px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 font-bold text-xs transition" onClick={onClose}>Zrušit</button>
          <button className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md" disabled={busyAny || saving || readyCount === 0} onClick={save}>
            {saving ? 'Ukládám do inventury...' : `Přičíst ${readyCount} položek do fyzické inventury`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
