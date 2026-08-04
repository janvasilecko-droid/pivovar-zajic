import { useState, useRef, useEffect } from 'react';
import { Modal, Spinner } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { Camera, Upload, Sparkles, AlertCircle, Plus, Trash2, RotateCcw, Check, FilePlus } from 'lucide-react';

type RowInput = { beerId: string; pkgId: string; pkg2Id: string; pkg3Id: string; kegPkgId: string; kegQty: string; qty: string; qty2: string; qty3: string; _removed?: boolean; _manual?: boolean };
type PhotoEntry = { dataUrl: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onImport: (rows: RowInput[], date: string, note: string) => void;
};

export function ImportBottlingFromImage({ isOpen, onClose, beers, packages, onImport }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const bottlePackages = packages.filter((p) => p.kind === 'bottle');
  const kegPackages = packages.filter((p) => p.kind === 'keg');

  // clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, busy]);

  // Process queue of files
  useEffect(() => {
    if (processingRef.current) return;
    if (editingImage) return;
    if (pendingFiles.length === 0) return;
    if (entryRows !== null) return; // Wait for user to review

    const next = pendingFiles[0];
    setPendingFiles((q) => q.slice(1));
    const idx = currentPhotoIndex;
    setCurrentPhotoIndex(idx + 1);
    handleFile(next);
  }, [pendingFiles, editingImage, entryRows]);

  const handleFile = (file: File) => {
    processingRef.current = true;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (editBeforeOcr) {
        setEditingImage(dataUrl);
      } else {
        setPhotos([{ dataUrl, name: file.name }]);
        const base64 = dataUrl.split(',')[1] ?? '';
        runOcrFromBase64(base64, file.type || 'image/jpeg');
      }
    };
    reader.onerror = () => {
      setErr('Nelze načíst obrázek: ' + file.name);
      processingRef.current = false;
    };
    reader.readAsDataURL(file);
  };

  const runOcrFromBase64 = async (base64: string, mimeType: string) => {
    setBusy(true);
    setProgress(20);
    setErr(null);
    setEntryRows(null);

    try {
      setProgress(40);
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-image`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: mimeType,
          beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree })),
          packages: packages.map((p) => ({ id: p.id, label: p.label })),
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

      const items: any[] = data?.items ?? [];
      if (!items.length) {
        throw new Error('Na fotce nebyly rozpoznány žádné položky stočení.');
      }

      setProgress(85);

      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const rows: RowInput[] = [];

      for (const item of items) {
        const raw = item.raw_line || '';
        const itemBeerName = item.beer_name || '';
        const itemDegree = item.degree || '';
        const itemPkgLabel = item.package_label || '';
        const itemQty = item.quantity ? String(item.quantity) : '';

        // Match Beer
        let matchedBeer = beers.find((b) => norm(b.name) === norm(itemBeerName));
        if (!matchedBeer && itemDegree) {
          matchedBeer = beers.find((b) => b.degree && norm(b.degree) === norm(itemDegree));
        }
        if (!matchedBeer && itemBeerName) {
          matchedBeer = beers.find((b) => norm(b.name).includes(norm(itemBeerName)) || norm(itemBeerName).includes(norm(b.name)));
        }

        // Match Package
        let matchedPkg = bottlePackages.find((p) => norm(p.label) === norm(itemPkgLabel));
        if (!matchedPkg && itemPkgLabel) {
          matchedPkg = bottlePackages.find((p) => norm(p.label).includes(norm(itemPkgLabel)) || norm(itemPkgLabel).includes(norm(p.label)));
        }
        if (!matchedPkg && raw) {
          if (raw.includes('1.5') || raw.includes('1,5') || raw.toLowerCase().includes('pet')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 1.5) || bottlePackages[0];
          } else if (raw.includes('0.5') || raw.includes('0,5') || raw.toLowerCase().includes('sklo')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 0.5) || bottlePackages[0];
          } else if (raw.includes('1l') || raw.includes('1 l')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 1.0) || bottlePackages[0];
          } else if (raw.includes('0.33') || raw.includes('0,33')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 0.33) || bottlePackages[0];
          }
        }
        if (!matchedPkg) {
          matchedPkg = bottlePackages[0];
        }

        // Match Kegs/Sudy (ONLY if written in photo!)
        let kegPkgId = '';
        let kegQty = '';

        const kegMatch = raw.match(/(\d+)\s*x?\s*(50|30|20|15|10)\s*l?/i) || raw.match(/(\d+)\s*(sudy|sudů|keg|kegy)/i);
        if (kegMatch) {
          const qtyVal = kegMatch[1];
          const volVal = kegMatch[2];
          kegQty = qtyVal;
          if (volVal && !isNaN(Number(volVal))) {
            const foundKeg = kegPackages.find((p) => Number(p.volume_l) === Number(volVal));
            if (foundKeg) kegPkgId = foundKeg.id;
          }
          if (!kegPkgId && kegPackages.length) {
            kegPkgId = kegPackages[0].id;
          }
        }

        rows.push({
          beerId: matchedBeer?.id ?? '',
          pkgId: matchedPkg?.id ?? bottlePackages[0]?.id ?? '',
          pkg2Id: '',
          pkg3Id: '',
          kegPkgId: kegPkgId, // Leave empty if not mentioned on photo!
          kegQty: kegQty,     // Leave empty if not mentioned on photo!
          qty: itemQty,
          qty2: '',
          qty3: '',
        });
      }

      // Group and combine pkg1/2/3 for same beer
      const consolidatedRows: RowInput[] = [];
      for (const r of rows) {
        const existing = consolidatedRows.find(
          (c) => c.beerId && c.beerId === r.beerId && c.kegPkgId === r.kegPkgId && c.kegQty === r.kegQty
        );
        if (existing && r.pkgId) {
          if (existing.pkgId === r.pkgId) {
            existing.qty = String((Number(existing.qty) || 0) + (Number(r.qty) || 0));
          } else if (!existing.pkg2Id || existing.pkg2Id === r.pkgId) {
            existing.pkg2Id = r.pkgId;
            existing.qty2 = String((Number(existing.qty2) || 0) + (Number(r.qty) || 0));
          } else if (!existing.pkg3Id || existing.pkg3Id === r.pkgId) {
            existing.pkg3Id = r.pkgId;
            existing.qty3 = String((Number(existing.qty3) || 0) + (Number(r.qty) || 0));
          } else {
            consolidatedRows.push(r);
          }
        } else {
          consolidatedRows.push(r);
        }
      }

      setEntryRows(consolidatedRows);
      if (data?.raw_text) setNote(data.raw_text.slice(0, 100));
      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  };

  const onEditorConfirm = (editedDataUrl: string) => {
    setEditingImage(null);
    setPhotos([{ dataUrl: editedDataUrl, name: 'foto' }]);
    const base64 = editedDataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, 'image/jpeg');
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      setPendingFiles((q) => [...q, ...files]);
    }
    e.target.value = '';
  };

  const updateLine = (i: number, patch: Partial<RowInput>) => {
    if (!entryRows) return;
    setEntryRows(entryRows.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };

  const addLine = () => {
    const newLine: RowInput = {
      beerId: '',
      pkgId: bottlePackages[0]?.id ?? '',
      pkg2Id: '',
      pkg3Id: '',
      kegPkgId: '',
      kegQty: '',
      qty: '',
      qty2: '',
      qty3: '',
      _manual: true,
    };
    setEntryRows([...(entryRows ?? []), newLine]);
  };

  const applyRows = () => {
    if (!entryRows) return;
    const activeRows = entryRows.filter((r) => !r._removed && r.beerId);
    onImport(activeRows, date, note);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Zadání stočení lahví z fotky / WhatsAppu" wide>
        <div className="space-y-4">
          {/* Top panel with Date & Note */}
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

          {/* Action Bar */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3 items-center">
              <input ref={fileRef} type="file" accept="image/*,application/pdf,.png,.jpg,.jpeg,.webp" multiple onChange={onFile} className="hidden" />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
              
              <button className="btn-primary flex items-center gap-2" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera size={16} /> 📷 Spustit fotoaparát
              </button>

              <button className="btn-secondary flex items-center gap-2 border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={16} /> 📁 Vybrat fotku / soubor z galerie
              </button>

              <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
                <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
                <span>Oříznout / Otočit fotku před čtením</span>
              </label>
            </div>
            <span className="text-[11px] text-neutral-500">
              💡 Obrázek/snímek obrazovky můžeš také přímo vložit zkopírováním a stisknutím <strong>Ctrl+V</strong> (Vložit).
            </span>
          </div>

          {/* Progress / Error */}
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

          {/* Side-by-side view */}
          {entryRows !== null && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              {/* Left Column: Photo Review Pane */}
              <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-neutral-50 min-h-[350px] flex flex-col">
                <PhotoReviewPane
                  photos={photos}
                  activeIndex={0}
                  onChangeIndex={() => {}}
                />
              </div>

              {/* Right Column: Interactive Editor Table */}
              <div className="flex flex-col space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-neutral-900">Rozpoznané řádky stočení</h3>
                  <button type="button" className="btn-ghost !py-1 text-xs font-bold text-primary-700" onClick={addLine}>
                    + Přidat řádek
                  </button>
                </div>

                <div className="space-y-2">
                  {entryRows.map((r, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-2xl border-2 transition-all ${
                        r._removed
                          ? 'bg-neutral-100/70 border-neutral-200 opacity-60'
                          : 'bg-white border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-neutral-100">
                        <span className="text-[10px] font-black uppercase text-neutral-500">Řádek #{i + 1}</span>
                        {r._removed ? (
                          <button
                            type="button"
                            onClick={() => updateLine(i, { _removed: false })}
                            className="text-xs font-bold text-primary-600 flex items-center gap-1"
                          >
                            <RotateCcw size={12} /> Obnovit
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateLine(i, { _removed: true })}
                            className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Odstranit
                          </button>
                        )}
                      </div>

                      {!r._removed && (
                        <div className="space-y-3">
                          {/* Beer selector */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-black uppercase text-neutral-500">Pivo</label>
                              <select
                                className="input text-xs font-bold w-full bg-white border border-neutral-200"
                                value={r.beerId}
                                onChange={(e) => updateLine(i, { beerId: e.target.value })}
                              >
                                <option value="">— Vyber pivo —</option>
                                {beers.filter((b) => b.is_active).map((b) => (
                                  <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                              </select>
                            </div>
                            {/* KEG barrel - empty if not parsed */}
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="text-[9px] font-black uppercase text-amber-800">Zdrojový KEG</label>
                                <select
                                  className="input text-xs font-bold w-full bg-white border border-amber-200"
                                  value={r.kegPkgId}
                                  onChange={(e) => updateLine(i, { kegPkgId: e.target.value })}
                                >
                                  <option value="">(není v kegu)</option>
                                  {kegPackages.map((p) => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[9px] font-black uppercase text-amber-800">Počet KEGů</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="např. 2"
                                  className="input text-xs font-bold w-full border border-amber-200 text-center"
                                  value={r.kegQty}
                                  onChange={(e) => updateLine(i, { kegQty: e.target.value.replace(/[^0-9]/g, '') })}
                                />
                              </div>
                            </div>
                          </div>

                          {/* 3 Bottle Package columns */}
                          <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-dashed border-neutral-100">
                            {/* Bottle 1 */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase text-neutral-500">1. Lahve</label>
                              <select
                                className="input text-[11px] font-bold w-full p-1.5 bg-neutral-50"
                                value={r.pkgId}
                                onChange={(e) => updateLine(i, { pkgId: e.target.value })}
                              >
                                {bottlePackages.map((p) => (
                                  <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="kusů"
                                className="input text-xs text-right font-black"
                                value={r.qty}
                                onChange={(e) => updateLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                            </div>
                            {/* Bottle 2 */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase text-neutral-500">2. Lahve</label>
                              <select
                                className="input text-[11px] font-bold w-full p-1.5 bg-neutral-50"
                                value={r.pkg2Id}
                                onChange={(e) => updateLine(i, { pkg2Id: e.target.value })}
                              >
                                <option value="">— nepoužito —</option>
                                {bottlePackages.map((p) => (
                                  <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="kusů"
                                className="input text-xs text-right font-black"
                                value={r.qty2}
                                onChange={(e) => updateLine(i, { qty2: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                            </div>
                            {/* Bottle 3 */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase text-neutral-500">3. Lahve</label>
                              <select
                                className="input text-[11px] font-bold w-full p-1.5 bg-neutral-50"
                                value={r.pkg3Id}
                                onChange={(e) => updateLine(i, { pkg3Id: e.target.value })}
                              >
                                <option value="">— nepoužito —</option>
                                {bottlePackages.map((p) => (
                                  <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="kusů"
                                className="input text-xs text-right font-black"
                                value={r.qty3}
                                onChange={(e) => updateLine(i, { qty3: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer confirm buttons */}
                <div className="pt-4 flex items-center justify-end gap-2 border-t border-neutral-100">
                  <button type="button" className="btn-ghost text-xs" onClick={onClose}>
                    Zrušit
                  </button>
                  <button
                    type="button"
                    className="btn-primary py-2.5 px-5 text-xs font-black shadow-md flex items-center gap-2"
                    onClick={applyRows}
                  >
                    <Check size={14} /> Vložit vše do tabulky stočení
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Editor image dialog */}
      {editingImage && (
        <ImageEditor
          src={editingImage}
          onConfirm={onEditorConfirm}
          onCancel={onEditorCancel}
        />
      )}
    </>
  );

  function onEditorCancel() {
    setEditingImage(null);
    processingRef.current = false;
  }
}
