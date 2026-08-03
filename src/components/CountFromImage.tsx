import { useState, useRef, useMemo } from 'react';
import { Modal, Spinner } from './ui';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { Camera, Plus, Trash2, Package as PackageIcon, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

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

export function CountFromImage({ beers, packages, onClose, onSaved, table = 'inventory', mode = 'inventory' }: {
  beers: Beer[];
  packages: Package[];
  onClose: () => void;
  onSaved: () => void;
  table?: string;
  mode?: 'inventory' | 'kegging';
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
        const base64 = dataUrl.split(',')[1] ?? '';
        if (mode === 'kegging') {
          // V KEG režimu přeskočíme editor a rovnou pošleme na AI
          setPhotos((ps) => [...ps, { id, preview: dataUrl, rawText: '', busy: true, progress: 30, err: null, editing: null }]);
          runCount(id, base64, 'image/jpeg');
        } else {
          setPhotos((ps) => [...ps, { id, preview: null, rawText: '', busy: false, progress: 0, err: null, editing: dataUrl }]);
        }
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
      const isKegMode = mode === 'kegging';
      const promptHint = isKegMode
        ? 'Count beer kegs (sudy). Identify each keg type by size (30L, 50L, 20L, 15L, 10L). Look for labels or markings on the kegs to determine the beer brand/type. Count how many kegs of each size and beer type are visible. Return each distinct beer+size combination as a separate item.'
        : 'Count bottles inside beer crates (přepravka/bedna). A standard Czech beer crate holds 20 bottles (4x5 grid). Look at bottle caps or bottle necks. Count both full crates (20 bottles each) and individual bottles in partially filled crates.';

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
          promptHint,
          mode: isKegMode ? 'kegging' : 'inventory',
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

  const isKegMode = mode === 'kegging';
  const readyCount = results.filter((r) => r.beer_id && r.package_id && r.quantity && r.quantity > 0).length;
  const busyAny = photos.some((p) => p.busy);

  return (
    <Modal open onClose={onClose} title={isKegMode ? "🛢️ Kegy z fotky" : "📷 Spočítat z fotek"} wide>
      <div className="space-y-3">
        {/* Datum + info v jednom kompaktním řádku */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl">
            <label className="text-[10px] font-black text-neutral-700">📅</label>
            <input type="date" className="input !py-0.5 !px-1.5 font-mono font-bold text-[11px] max-w-[130px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <span className="text-[10px] text-neutral-500 font-medium leading-tight">
            {isKegMode ? 'Nfoť kegy na paletě' : 'Nfoť přepravky s lahvemi'}
          </span>
        </div>

        {/* RYCHLÝ KALKULÁTOR — kompaktní */}
        {!isKegMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-2 space-y-1.5">
          <div className="text-[9px] font-black text-amber-950 uppercase tracking-wider flex items-center gap-1">
            <PackageIcon size={12} className="text-amber-600" />
            <span>Rychlý kalkulátor (přepravky/kartony)</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => addPresetCrate(20, '1 přepravka (20 ks)')} className="px-2 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 text-[10px] font-black border border-amber-300 transition">
              +20
            </button>
            <button type="button" onClick={() => addPresetCrate(40, '2 přepravky (40 ks)')} className="px-2 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 text-[10px] font-black border border-amber-300 transition">
              +40
            </button>
            <button type="button" onClick={() => addPresetCrate(100, '5 přepravek (100 ks)')} className="px-2 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 text-[10px] font-black border border-amber-300 transition">
              +100
            </button>
            <button type="button" onClick={() => addPresetCrate(12, '1 karton (12 ks)')} className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-black border border-amber-200 transition">
              +12
            </button>
            <button type="button" onClick={() => addPresetCrate(6, '1 karton (6 ks)')} className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-black border border-amber-200 transition">
              +6
            </button>
          </div>
        </div>
        )}

        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} className="hidden" />
          <button className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[11px] transition shadow-xs flex items-center gap-1.5" onClick={() => fileRef.current?.click()} disabled={busyAny}>
            <Camera size={14} /> {isKegMode ? 'Přidat fotky' : 'Přidat fotky'}
          </button>
          <span className="text-[10px] text-neutral-500 font-medium">lze i více najednou</span>
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

        {/* Photo previews — kompaktní mřížka */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="rounded-xl border border-amber-200 bg-neutral-900 overflow-hidden relative shadow-xs">
                <div className="px-2 py-1 bg-neutral-800 text-amber-300 text-[10px] font-black flex items-center justify-between">
                  <span>📷</span>
                  <button className="text-neutral-400 hover:text-rose-400 text-sm font-bold leading-none" onClick={() => removePhoto(p.id)}>×</button>
                </div>
                <div className="relative min-h-[80px] flex items-center justify-center bg-neutral-950">
                  {p.preview ? (
                    <img src={p.preview} alt="fotka" className="block max-w-full max-h-[20vh] object-contain" />
                  ) : p.busy ? (
                    <div className="text-amber-400 text-[10px] p-2 text-center"><Spinner /></div>
                  ) : (
                    <div className="text-neutral-500 text-[10px] p-2 text-center">⏳</div>
                  )}
                  {p.busy && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-800">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                  )}
                </div>
                {p.rawText && (
                  <div className="px-2 py-1 bg-amber-50 text-[9px] text-amber-950 font-bold leading-tight truncate">{p.rawText}</div>
                )}
                {p.err && (
                  <div className="px-2 py-1 bg-rose-50 text-[9px] text-rose-700 font-bold leading-tight">{p.err}</div>
                )}
                {!p.busy && p.preview && (
                  <button className="w-full text-[10px] py-1 bg-neutral-800 text-amber-300 hover:bg-neutral-700 font-bold transition" onClick={() => retakePhoto(p.id)}>🔄</button>
                )}
              </div>
            ))}
          </div>
        )}

        {err && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-1.5 font-bold">{err}</div>}

        {/* ✅ VÝSLEDKY — kompaktní zobrazení jako ruční zápis */}
        {results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-neutral-900">📋 Rozpoznané položky ({results.length})</span>
              <span className="text-[10px] font-bold text-amber-800">Doplň pivo a obal</span>
            </div>
            <div className="space-y-1.5">
              {results.map((r, i) => {
                const photo = photos.find((p) => p.id === r.photo_id);
                return (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/40 p-2.5 space-y-1.5">
                    {/* Řádek: co AI přečetlo + smazat */}
                    <div className="flex items-center justify-between gap-1">
                      {photo?.rawText ? (
                        <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded truncate" title={photo.rawText}>
                          🤖 {photo.rawText}
                        </span>
                      ) : (
                        <span className="text-[9px] text-neutral-400 italic">AI nepřečetla text</span>
                      )}
                      <button className="text-rose-400 hover:text-rose-600 text-[11px] font-bold leading-none shrink-0 px-1" onClick={() => removeResult(i)}>✕</button>
                    </div>
                    {/* Zápis jako ručně: název piva / obal / množství */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <input
                        type="text"
                        placeholder="Pivo"
                        className="input !py-1 !px-2 text-[11px] font-black min-w-[80px] flex-1"
                        value={r.beer_id ? beers.find((b) => b.id === r.beer_id)?.name ?? '' : ''}
                        onChange={(e) => {
                          const match = beers.find((b) => b.name.toLowerCase().startsWith(e.target.value.toLowerCase()));
                          if (match) updateResult(i, { beer_id: match.id });
                        }}
                        list={`beer-list-${i}`}
                      />
                      <datalist id={`beer-list-${i}`}>
                        {beers.map((b) => <option key={b.id} value={b.name} />)}
                      </datalist>
                      <input
                        type="number"
                        min={0}
                        placeholder="ks"
                        className="input !py-1 !px-1.5 text-[11px] font-mono font-black w-14 text-right"
                        value={r.quantity ?? ''}
                        onChange={(e) => updateResult(i, { quantity: e.target.value ? Number(e.target.value) : null })}
                      />
                      <select
                        className="input !py-1 !px-1.5 text-[10px] font-bold min-w-[60px]"
                        value={r.package_id}
                        onChange={(e) => {
                          const pkg = packages.find((p) => p.id === e.target.value);
                          updateResult(i, { package_id: e.target.value, package_label: pkg?.label ?? null });
                        }}
                      >
                        <option value="">obal</option>
                        {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                    {/* Poznámka */}
                    {r.note && (
                      <div className="text-[9px] text-neutral-500 font-medium leading-tight">📝 {r.note}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-1.5 pt-1.5 border-t border-neutral-100">
          <button className="px-3 py-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 font-bold text-[11px] transition" onClick={onClose}>Zrušit</button>
          <button className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[11px] transition shadow-xs" disabled={busyAny || saving || readyCount === 0} onClick={save}>
            {saving ? '⏳' : isKegMode ? `🛢️ Uložit (${readyCount})` : `📦 Přičíst (${readyCount})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
