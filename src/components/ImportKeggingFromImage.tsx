import { useState, useRef, useEffect } from 'react';
import { Modal } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { Camera, Upload, AlertCircle, Plus, Trash2, RotateCcw, Check, Sparkles } from 'lucide-react';

type KegRow = { beerId: string; pkgId: string; qty: string; _removed?: boolean; _manual?: boolean };
type PhotoEntry = { dataUrl: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onImport: (rows: KegRow[], date: string, note: string) => void;
};

const KEG_SIZES = [50, 30, 20, 15, 10];

export function ImportKeggingFromImage({ isOpen, onClose, beers, packages, onImport }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<KegRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  // Auto-open gallery on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fileRef.current && photos.length === 0) {
        fileRef.current.click();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);


  const [activeIndex, setActiveIndex] = useState(0);
  const [rowsMap, setRowsMap] = useState<Record<number, KegRow[]>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const kegPackages = packages.filter((p) => p.kind === 'keg' && KEG_SIZES.includes(Number(p.volume_l))).sort((a, b) => b.volume_l - a.volume_l);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, busy]);

    useEffect(() => {
    if (!photos.length || busy) return;
    if (rowsMap[activeIndex] && entryRows !== null) return;
    const currentPhoto = photos[activeIndex];
    if (!currentPhoto) return;
    if (rowsMap[activeIndex]) {
      setEntryRows(rowsMap[activeIndex]);
      return;
    }
    const base64 = currentPhoto.dataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, 'image/jpeg', activeIndex);
  }, [photos, activeIndex]);

  const loadMultipleFiles = (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    let loaded: PhotoEntry[] = [];
    let count = 0;
    files.forEach((f, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        loaded[idx] = { dataUrl: reader.result as string, name: f.name };
        count++;
        if (count === files.length) {
          setPhotos((prev) => [...prev, ...loaded.filter(Boolean)]);
          setBusy(false);
        }
      };
      reader.readAsDataURL(f);
    });
  };

  const handleFile = (file: File) => {
    loadMultipleFiles([file]);
  };

  const runOcrFromBase64 = async (base64: string, mimeType: string, targetIdx = activeIndex) => {
    setBusy(true);
    setProgress(20);
    setErr(null);
    setEntryRows(null);
    try {
      setProgress(40);
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-image`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: mimeType,
          beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree })),
          packages: packages.map((p) => ({ id: p.id, label: p.label })),
        }),
      });
      const respText = await resp.text();
      if (!resp.ok) { let m = `HTTP ${resp.status}`; try { m += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { m += ': ' + respText; } throw new Error(m); }
      let data: any;
      try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
      if (data?.error) throw new Error(data.error);
      const items: any[] = data?.items ?? [];
      if (!items.length) throw new Error('Na fotce nebyly rozpoznány žádné položky stáčení KEG.');
      setProgress(85);

      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const rows: KegRow[] = [];
      for (const item of items) {
        const raw = item.raw_line || '';
        const itemBeerName = item.beer_name || '';
        const itemDegree = item.degree || '';
        const itemPkgLabel = item.package_label || '';
        const itemQty = item.quantity != null && item.quantity !== '' ? String(item.quantity) : '';

        // Pivo
        let matchedBeer = beers.find((b) => norm(b.name) === norm(itemBeerName));
        if (!matchedBeer && itemDegree) matchedBeer = beers.find((b) => b.degree && norm(b.degree) === norm(itemDegree));
        if (!matchedBeer && itemBeerName) matchedBeer = beers.find((b) => norm(b.name).includes(norm(itemBeerName)) || norm(itemBeerName).includes(norm(b.name)));

        // KEG obal — podle objemu z textu (nejspolehlivější), jinak z label
        let matchedPkg: Package | undefined;
        const kegVol = raw.match(/\b(50|30|20|15|10)\b/);
        if (kegVol) {
          matchedPkg = kegPackages.find((p) => Math.abs(Number(p.volume_l) - Number(kegVol[1])) < 0.5);
        }
        if (!matchedPkg && itemPkgLabel) {
          matchedPkg = kegPackages.find((p) => norm(p.label) === norm(itemPkgLabel))
            || kegPackages.find((p) => norm(p.label).includes(norm(itemPkgLabel)) || norm(itemPkgLabel).includes(norm(p.label)));
        }
        if (!matchedPkg) matchedPkg = kegPackages[0];

        rows.push({ beerId: matchedBeer?.id ?? '', pkgId: matchedPkg?.id ?? '', qty: itemQty });
      }
      setEntryRows(rows);
      setRowsMap((prev) => ({ ...prev, [targetIdx]: rows }));
      if (data?.raw_text) setNote(data.raw_text.slice(0, 100));
      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  };

  const updateLine = (i: number, patch: Partial<KegRow>) => {
    if (!entryRows) return;
    setEntryRows(entryRows.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  };
  const addLine = () => {
    setEntryRows([...(entryRows ?? []), { beerId: '', pkgId: kegPackages[0]?.id ?? '', qty: '', _manual: true }]);
  };
  const saveCurrentAndNext = () => {
    if (entryRows) {
      setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
    }
    if (activeIndex < photos.length - 1) {
      const nextIdx = activeIndex + 1;
      setActiveIndex(nextIdx);
      if (rowsMap[nextIdx]) {
        setEntryRows(rowsMap[nextIdx]);
      } else {
        setEntryRows(null);
      }
    } else {
      applyAll();
    }
  };

  const applyAll = () => {
    const updatedMap = { ...rowsMap, [activeIndex]: entryRows ?? [] };
    const allRows: KegRow[] = [];
    Object.values(updatedMap).forEach((rList) => {
      rList.forEach((r) => {
        if (!r._removed && r.beerId) allRows.push(r);
      });
    });
    if (allRows.length > 0) {
      onImport(allRows, date, note);
    }
    onClose();
  };
  const onEditorCancel = () => { setEditingImage(null); processingRef.current = false; };
  const onEditorConfirm = (editedDataUrl: string) => {
    setEditingImage(null);
    setPhotos([{ dataUrl: editedDataUrl, name: 'foto' }]);
    const base64 = editedDataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, 'image/jpeg');
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Zadání stočení KEG z fotky / WhatsAppu" wide>
        <div className="space-y-4">
          <div className="card !bg-primary-50/50 p-4 space-y-3">
            <div className="text-sm font-semibold text-primary-800">Datum a poznámka stočení šarže</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="label">Datum stočení</label>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Poznámka k šarži</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="např. šarže 12 ležák z ležáckého tanku 4..." />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3 items-center">
              <input ref={fileRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp" multiple onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) loadMultipleFiles(files); e.target.value = ''; }} className="hidden" />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) setPendingFiles((q) => [...q, ...files]); e.target.value = ''; }} className="hidden" />
              <button className="btn-primary flex items-center gap-2" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera size={16} /> 📷 Spustit fotoaparát
              </button>
              <button className="btn-secondary flex items-center gap-2 border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={16} /> 🖼 Vybrat fotku z galerie
              </button>
              <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
                <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
                <span>Oříznout / Otočit fotku před čtením</span>
              </label>
            </div>
            <span className="text-[11px] text-neutral-500">
              📷 Obrázek můžete také vložit zkopírovaný stisknutím <strong>Ctrl+V</strong>.
            </span>
          </div>

          {busy && (
            <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-primary-600 h-2.5 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
          {err && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          {entryRows !== null && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-neutral-50 min-h-[350px] flex flex-col">
                <PhotoReviewPane photos={photos} activeIndex={0} onChangeIndex={() => {}} />
              </div>

              <div className="flex flex-col space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5"><Sparkles size={14} className="text-primary-600" /> Rozpoznané řádky stáčení KEG</h3>
                  <button type="button" className="btn-ghost !py-1 text-xs font-bold text-primary-700" onClick={addLine}>+ Přidat řádek</button>
                </div>
                <div className="space-y-2">
                  {entryRows.map((r, i) => (
                    <div key={i} className={`p-3 rounded-2xl border-2 transition-all ${r._removed ? 'bg-neutral-100/70 border-neutral-200 opacity-60' : 'bg-white border-neutral-200 hover:border-neutral-300'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-neutral-100">
                        <span className="text-[10px] font-black uppercase text-neutral-500">Řádek #{i + 1}</span>
                        {r._removed ? (
                          <button type="button" onClick={() => updateLine(i, { _removed: false })} className="text-xs font-bold text-primary-600 flex items-center gap-1"><RotateCcw size={12} /> Obnovit</button>
                        ) : (
                          <button type="button" onClick={() => updateLine(i, { _removed: true })} className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"><Trash2 size={12} /> Odstranit</button>
                        )}
                      </div>
                      {!r._removed && (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[9px] font-black uppercase text-neutral-500">🍺 Pivo</label>
                            <select className="input text-xs font-bold w-full bg-white border border-neutral-200" value={r.beerId} onChange={(e) => updateLine(i, { beerId: e.target.value })}>
                              <option value="">- Vyber pivo -</option>
                              {beers.filter((b) => b.is_active).map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-[9px] font-black uppercase text-amber-800">🛢️ Obal (KEG)</label>
                              <select className="input text-xs font-bold w-full bg-white border border-amber-200" value={r.pkgId} onChange={(e) => updateLine(i, { pkgId: e.target.value })}>
                                {kegPackages.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase text-amber-800">Počet ks</label>
                              <input type="text" inputMode="numeric" placeholder="např. 5" className="input text-xs font-bold w-full border border-amber-200 text-center" value={r.qty} onChange={(e) => updateLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })} />
                            </div>
                          </div>
                          {!r.pkgId && <span className="text-[10px] text-amber-700">⚠️ Nenalezen obal KEG — vyber velikost ručně.</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="pt-4 flex items-center justify-end gap-2 border-t border-neutral-100">
                  <button type="button" className="btn-ghost text-xs" onClick={onClose}>Zrušit</button>
                  <button
            className="btn-primary flex-1 !py-3 text-sm font-bold"
            onClick={saveCurrentAndNext}
            disabled={busy || !entryRows}
          >
            {activeIndex < photos.length - 1
              ? `Vložit a další fotka (${activeIndex + 2}/${photos.length}) ▶`
              : `Vložit VŠECHNO do tabulky stočení (${photos.length} fotek) ✓`}
          </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {editingImage && (
        <ImageEditor src={editingImage} onConfirm={onEditorConfirm} onCancel={onEditorCancel} />
      )}
    </>
  );
}
