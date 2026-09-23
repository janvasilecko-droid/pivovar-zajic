// 📷 Čtení výdeje (Fasování / Prodejna / Odpis) z fotky.
// ---------------------------------------------------------------------------
// Z provozu 22. 9. 2026: „dával jsem číst z fotky fasování obchod a četlo to
// špatně … ať to čte přesně, stejně jako u objednávek, ať půlka obrazu
// originální obrázek a pod ním budou data ke kontrole."
//
// CO BYLO ŠPATNĚ: tohle okno dřív výsledek AI SLILO DO TEXTU („5x 12° Světlá
// 0,5 l") a obrazovka ho pak znovu rozebírala textovým parserem zkratek.
// Dvojí překlad = dvojí ztráta: co AI přečetla správně, se cestou rozbilo
// (z „0,33 l" se stal jiný obal, počet se přilepil k názvu) a nikde nešlo
// porovnat výsledek s fotkou. Fotka se navíc posílala v plné velikosti.
//
// Teď se z odpovědi AI rovnou páruje pivo a obal z katalogu
// (lib/fotkaPolozky.ts — společné se stáčením) a nahoře je ukotvená fotka
// (PhotoReviewPane, stejná jako u objednávek a stáčení), pod ní řádky
// k překontrolování a opravě. Ven jdou hotové řádky s ID, ne text.
import { useState, useRef, useEffect } from 'react';
import { Modal } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { typObrazku, zmensenyDataUrl } from '../lib/obrazek';
import { radkyZFotky, type RadekZFotky } from '../lib/fotkaPolozky';
import { AlertCircle, AlertTriangle, Beer as BeerIcon, Camera, Package as PackageIcon, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';

type VydejRadek = RadekZFotky & { _removed?: boolean };
type PhotoEntry = { dataUrl: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  /** Přečtené a obsluhou zkontrolované řádky — pivo, obal, počet. */
  onImport: (rows: RadekZFotky[]) => void;
  /** Druh výdeje do nadpisu (Prodejna / Personál / Odpis). */
  popisVydeje?: string;
};

export function ProdejnaFromImage({ isOpen, onClose, beers, packages, onImport, popisVydeje }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entryRows, setEntryRows] = useState<VydejRadek[] | null>(null);
  const [rowsMap, setRowsMap] = useState<Record<number, VydejRadek[]>>({});
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [upraveno, setUpraveno] = useState<Record<number, boolean>>({});
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Výdej jde ze všech obalů (lahve, PET i sudy), proto se katalog nezužuje.
  const vsechnyObaly = packages;

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) void loadMultipleFiles(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, busy]);

  // Hned po otevření nabídne galerii — jinak se na malém displeji musí trefit
  // do tlačítka pod fotkou, kterou ještě nikdo nevybral.
  useEffect(() => {
    if (!isOpen || photos.length > 0) return;
    const timer = setTimeout(() => { if (fileRef.current && photos.length === 0) fileRef.current.click(); }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Čtení se spustí samo, jakmile je fotka na řadě a ještě není přečtená.
  useEffect(() => {
    if (!photos.length || busy) return;
    const currentPhoto = photos[activeIndex];
    if (!currentPhoto) return;
    if (rowsMap[activeIndex]) {
      if (entryRows === null) setEntryRows(rowsMap[activeIndex]);
      return;
    }
    if (editBeforeOcr && !upraveno[activeIndex] && !editingImage) {
      setEditingImage(currentPhoto.dataUrl);
      return;
    }
    void runOcrFromBase64(currentPhoto.dataUrl.split(',')[1] ?? '', typObrazku(currentPhoto.dataUrl), activeIndex);
  }, [photos, activeIndex]);

  // Fotka z mobilu má klidně 4–8 MB. Nezmenšená appku na telefonu sekla
  // (stejný bug řešily ImportBottlingFromImage i ImportKeggingFromImage) —
  // zmensenyDataUrl ji srazí na rozumnou velikost ještě před odesláním.
  const loadMultipleFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    try {
      const loaded: PhotoEntry[] = await Promise.all(
        files.map(async (f) => ({ dataUrl: await zmensenyDataUrl(f), name: f.name })),
      );
      setPhotos((prev) => [...prev, ...loaded]);
    } catch (e: any) {
      setErr('Fotku se nepodařilo načíst: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
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
        headers: await authenticatedFunctionHeaders(),
        body: JSON.stringify({
          imageBase64: base64,
          imageMimeType: mimeType,
          beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree })),
          packages: packages.map((p) => ({ id: p.id, label: p.label })),
        }),
      });
      const respText = await resp.text();
      if (!resp.ok) {
        let m = `HTTP ${resp.status}`;
        try { m += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { m += ': ' + respText; }
        throw new Error(m);
      }
      let data: any;
      try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
      if (data?.error) throw new Error(data.error);

      const items: any[] = data?.items ?? [];
      if (!items.length) throw new Error('Na fotce nebyly rozpoznány žádné položky.');
      setProgress(85);

      const rows: VydejRadek[] = radkyZFotky(items, beers, vsechnyObaly);
      setEntryRows(rows);
      setRowsMap((prev) => ({ ...prev, [targetIdx]: rows }));
      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (i: number, patch: Partial<VydejRadek>) => {
    if (!entryRows) return;
    setEntryRows(entryRows.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };
  const addLine = () => {
    setEntryRows([...(entryRows ?? []), { beerId: '', pkgId: '', qty: '' }]);
  };

  function goToPhoto(idx: number) {
    if (entryRows) setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
    setActiveIndex(idx);
    setEntryRows(rowsMap[idx] ?? null);
  }

  const saveCurrentAndNext = () => {
    if (entryRows) setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
    if (activeIndex < photos.length - 1) {
      const nextIdx = activeIndex + 1;
      setActiveIndex(nextIdx);
      setEntryRows(rowsMap[nextIdx] ?? null);
    } else {
      applyAll();
    }
  };

  // Řádek bez piva nebo bez obalu se dřív potichu zahodil a okno se zavřelo —
  // vypadalo to, že se nic nestalo (stejná past jako u stáčení).
  const applyAll = () => {
    const updatedMap = { ...rowsMap, [activeIndex]: entryRows ?? [] };
    const allRows: RadekZFotky[] = [];
    const nedodelane: number[] = [];
    Object.values(updatedMap).forEach((rList) => {
      rList.forEach((r, i) => {
        if (r._removed) return;
        if (!r.beerId || !r.pkgId || !r.qty) { nedodelane.push(i + 1); return; }
        allRows.push({ beerId: r.beerId, pkgId: r.pkgId, qty: r.qty });
      });
    });
    if (nedodelane.length > 0) {
      setErr(
        `U ${nedodelane.length === 1 ? 'řádku' : 'řádků'} #${nedodelane.join(', #')} chybí pivo, obal nebo počet — ` +
        'doplň je podle fotky, nebo řádek odstraň.',
      );
      return;
    }
    if (allRows.length === 0) {
      setErr('Není co zapsat — všechny řádky jsou odstraněné.');
      return;
    }
    onImport(allRows);
    onClose();
  };

  const onEditorCancel = () => {
    const idx = activeIndex;
    const foto = photos[idx];
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    if (foto) void runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), idx);
  };
  const onEditorConfirm = (editedDataUrl: string) => {
    const idx = activeIndex;
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    setPhotos((prev) => prev.map((f, i) => (i === idx ? { ...f, dataUrl: editedDataUrl } : f)));
    void runOcrFromBase64(editedDataUrl.split(',')[1] ?? '', typObrazku(editedDataUrl), idx);
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Čtení z fotky — ${popisVydeje ?? 'výdej ze skladu'}`}
        wide
        maxWidth={photos.length > 0 ? 'max-w-5xl' : undefined}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3 items-center">
              <input
                ref={fileRef} type="file" accept="image/*,.png,.jpg,.jpeg,.webp" multiple className="hidden"
                onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void loadMultipleFiles(files); e.target.value = ''; }}
              />
              <input
                ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void loadMultipleFiles(files); e.target.value = ''; }}
              />
              <button className="btn-primary !rounded flex items-center gap-2" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera size={16} /> Spustit fotoaparát
              </button>
              <button className="btn-secondary flex items-center gap-2 border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={16} /> Vybrat fotku z galerie
              </button>
              <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
                <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
                <span>Oříznout / Otočit fotku před čtením</span>
              </label>
            </div>
            <span className="text-udaj text-neutral-500">
              <Camera className="ikona-text" /> Obrázek můžete také vložit zkopírovaný stisknutím <strong>Ctrl+V</strong>.
            </span>
          </div>

          {busy && (
            <div className="w-full bg-neutral-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-primary-600 h-2.5 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}
          {err && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          )}

          {/* Ukotvená fotka nahoře — pod ní se roluje v přečtených řádcích,
              takže jde průběžně porovnávat s originálem. */}
          {photos.length > 0 && (
            <div className="sticky top-0 z-20 -mx-6 -mt-6 bg-white border-b-2 border-primary-200 shadow-md">
              <div className="h-[42vh] sm:h-[45vh]">
                <PhotoReviewPane
                  photos={photos}
                  activeIndex={Math.min(activeIndex, Math.max(0, photos.length - 1))}
                  onChangeIndex={goToPhoto}
                />
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="space-y-4">
              {entryRows === null ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center border border-dashed border-neutral-300 rounded p-6 min-h-[200px]">
                  {busy ? (
                    <div className="text-sm font-bold text-neutral-700">Čtu fotku…</div>
                  ) : (
                    <>
                      <AlertCircle size={22} className="text-rose-600" />
                      <div className="text-sm font-bold text-neutral-700">
                        {err ? 'Z fotky se nepodařilo nic přečíst.' : 'Fotka zatím není přečtená.'}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary !rounded text-xs"
                          onClick={() => {
                            const foto = photos[activeIndex];
                            if (!foto) return;
                            void runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), activeIndex);
                          }}
                        >
                          <RotateCcw className="ikona-text" /> Zkusit přečíst znovu
                        </button>
                        <button type="button" className="btn-primary !rounded text-xs" onClick={() => { setErr(null); setEntryRows([{ beerId: '', pkgId: '', qty: '' }]); }}>
                          <Plus className="ikona-text" /> Zapsat ručně podle fotky
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-primary-600" /> Přečtené řádky ke kontrole
                    </h3>
                    <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold text-primary-700" onClick={addLine}>+ Přidat řádek</button>
                  </div>
                  <div className="space-y-2">
                    {entryRows.map((r, i) => (
                      <div key={i} className={`p-3 rounded border-2 transition-all ${r._removed ? 'bg-neutral-100/70 border-neutral-200 opacity-60' : 'bg-white border-neutral-200 hover:border-neutral-300'}`}>
                        <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-neutral-100">
                          <span className="text-udaj font-black uppercase text-neutral-500">Řádek #{i + 1}</span>
                          {r._removed ? (
                            <button type="button" onClick={() => updateLine(i, { _removed: false })} className="text-xs font-bold text-primary-600 flex items-center gap-1"><RotateCcw size={12} /> Obnovit</button>
                          ) : (
                            <button type="button" onClick={() => updateLine(i, { _removed: true })} className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"><Trash2 size={12} /> Odstranit</button>
                          )}
                        </div>
                        {!r._removed && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-udaj font-black uppercase text-neutral-500"><BeerIcon className="ikona-text" /> Pivo</label>
                              <select className="input text-xs font-bold w-full bg-white border border-neutral-200" value={r.beerId} onChange={(e) => updateLine(i, { beerId: e.target.value })}>
                                <option value="">- Vyber pivo -</option>
                                {beers.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="text-udaj font-black uppercase text-amber-800"><PackageIcon className="ikona-text" /> Obal</label>
                                <select className="input text-xs font-bold w-full bg-white border border-amber-200" value={r.pkgId} onChange={(e) => updateLine(i, { pkgId: e.target.value })}>
                                  <option value="">- Vyber obal -</option>
                                  {vsechnyObaly.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="text-udaj font-black uppercase text-amber-800">Počet ks</label>
                                <input
                                  type="text" inputMode="numeric" placeholder="např. 6"
                                  className="input text-xs font-bold w-full border border-amber-200 text-center"
                                  value={r.qty}
                                  onChange={(e) => updateLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                                />
                              </div>
                            </div>
                            {(!r.beerId || !r.pkgId) && (
                              <span className="text-udaj text-amber-700">
                                <AlertTriangle className="ikona-text" /> {!r.beerId ? 'Pivo' : 'Obal'} se z fotky nepoznal — vyber ho ručně.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 flex items-center justify-end gap-2 border-t border-neutral-100">
                    <button type="button" className="btn-ghost !rounded text-xs" onClick={onClose}>Zrušit</button>
                    <button
                      className="btn-primary !rounded flex-1 !py-3 text-sm font-bold"
                      onClick={saveCurrentAndNext}
                      disabled={busy || !entryRows}
                    >
                      {activeIndex < photos.length - 1
                        ? `Vložit a další fotka (${activeIndex + 2}/${photos.length})`
                        : `Vložit do zápisu${photos.length > 1 ? ` (${photos.length} fotek)` : ''}`}
                    </button>
                  </div>
                </div>
              )}
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
