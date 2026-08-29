import { useState, useRef, useEffect } from 'react';
import { Modal, Spinner } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { typObrazku } from '../lib/obrazek';
import { AlertCircle, Camera, Check, ChevronLeft, ChevronRight, FilePlus, Folder, Lightbulb, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';

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
  // Auto-open gallery on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fileRef.current && photos.length === 0) {
        fileRef.current.click();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);


  const [editingImage, setEditingImage] = useState<string | null>(null);
  // Fotky, které už prošly (nebo vědomě neprošly) editorem — ať se ořez
  // nenabízí pořád dokola u té samé fotky.
  const [upraveno, setUpraveno] = useState<Record<number, boolean>>({});
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rowsMap, setRowsMap] = useState<Record<number, RowInput[]>>({});

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
    if (!photos.length || busy) return;
    if (rowsMap[activeIndex] && entryRows !== null) return;
    const currentPhoto = photos[activeIndex];
    if (!currentPhoto) return;
    if (rowsMap[activeIndex]) {
      setEntryRows(rowsMap[activeIndex]);
      return;
    }
    // Zaškrtnuté „Oříznout / Otočit fotku před čtením" se dřív nikde
    // nečetlo — fotka šla do AI rovnou tak, jak byla. Teď se před čtením
    // otevře editor.
    if (editBeforeOcr && !upraveno[activeIndex] && !editingImage) {
      setEditingImage(currentPhoto.dataUrl);
      return;
    }
    const base64 = currentPhoto.dataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, typObrazku(currentPhoto.dataUrl), activeIndex);
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

        // Match Beer — přesná shoda jména, pak podřetězec jména (zachytí i
        // pivo bez vlastního stupně v katalogu, např. sezonní "Summer Ale"),
        // a teprve pak holý stupeň jako poslední záchrana — jinak by pivo se
        // stejným stupněm jako jiné (ale bez stupně v katalogu) prohrálo se
        // špatným.
        let matchedBeer = beers.find((b) => norm(b.name) === norm(itemBeerName));
        if (!matchedBeer && itemBeerName) {
          matchedBeer = beers.find((b) => norm(b.name).includes(norm(itemBeerName)) || norm(itemBeerName).includes(norm(b.name)));
        }
        if (!matchedBeer && itemDegree) {
          matchedBeer = beers.find((b) => b.degree && norm(b.degree) === norm(itemDegree));
        }

        // Match Package — nenajde-li se shoda, necháme obal prázdný (nehádáme
        // natvrdo první obal v katalogu, uživatel ho pak doplní ručně).
        let matchedPkg = bottlePackages.find((p) => norm(p.label) === norm(itemPkgLabel));
        if (!matchedPkg && itemPkgLabel) {
          matchedPkg = bottlePackages.find((p) => norm(p.label).includes(norm(itemPkgLabel)) || norm(itemPkgLabel).includes(norm(p.label)));
        }
        if (!matchedPkg && raw) {
          if (raw.includes('1.5') || raw.includes('1,5') || raw.toLowerCase().includes('pet')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 1.5);
          } else if (raw.includes('0.5') || raw.includes('0,5') || raw.toLowerCase().includes('sklo')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 0.5);
          } else if (raw.includes('1l') || raw.includes('1 l')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 1.0);
          } else if (raw.includes('0.33') || raw.includes('0,33')) {
            matchedPkg = bottlePackages.find((p) => Number(p.volume_l) === 0.33);
          }
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
          // Nehádáme natvrdo první KEG v katalogu, když se konkrétní objem
          // nenajde — necháme prázdné, ať si ho uživatel doplní ručně.
        }

        rows.push({
          beerId: matchedBeer?.id ?? '',
          pkgId: matchedPkg?.id ?? '',
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
      setRowsMap((prev) => ({ ...prev, [targetIdx]: consolidatedRows }));
      if (data?.raw_text) setNote(data.raw_text.slice(0, 100));
      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  };

  // Upravená fotka nahradí JEN tu právě otevřenou — dřív se `setPhotos`
  // přepsalo celé pole, takže ořez jedné fotky zahodil všechny ostatní.
  const onEditorConfirm = (editedDataUrl: string) => {
    const idx = activeIndex;
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    setPhotos((prev) => prev.map((f, i) => (i === idx ? { ...f, dataUrl: editedDataUrl } : f)));
    runOcrFromBase64(editedDataUrl.split(',')[1] ?? '', typObrazku(editedDataUrl), idx);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) loadMultipleFiles(files);
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

  // Potvrzení celého importu. Řádky bez vybraného piva se DŘÍV potichu
  // zahodily a okno se prostě zavřelo — když AI pivo nespárovala (jiný název,
  // ruční zápis), vypadalo to, že tlačítko nic nedělá a fotka se nezapsala.
  // Teď takový řádek zápis zastaví a řekne, u kterého řádku chybí pivo.
  const applyAll = () => {
    const updatedMap = { ...rowsMap, [activeIndex]: entryRows ?? [] };
    const allRows: RowInput[] = [];
    const bezPiva: number[] = [];
    Object.values(updatedMap).forEach((rList) => {
      rList.forEach((r, i) => {
        if (r._removed) return;
        if (!r.beerId) { bezPiva.push(i + 1); return; }
        allRows.push(r);
      });
    });
    if (bezPiva.length > 0) {
      setErr(
        `U ${bezPiva.length === 1 ? 'řádku' : 'řádků'} #${bezPiva.join(', #')} není vybrané pivo — doplň ho, ` +
        'nebo řádek odstraň. Bez piva by se stočení nezapsalo.',
      );
      return;
    }
    if (allRows.length === 0) {
      setErr('Není co zapsat — všechny řádky jsou odstraněné.');
      return;
    }
    onImport(allRows, date, note);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Zadání stočení lahví z fotky / WhatsAppu" wide>
        <div className="space-y-4">
{photos.length > 1 && (
            <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded border border-amber-300 text-xs font-semibold text-amber-950 mb-3 shadow-xs">
              <button
                type="button"
                className="btn-secondary !py-1 !px-2 text-xs"
                onClick={() => {
                  if (entryRows) setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
                  const prevIdx = Math.max(0, activeIndex - 1);
                  setActiveIndex(prevIdx);
                  setEntryRows(rowsMap[prevIdx] ?? null);
                }}
                disabled={activeIndex === 0 || busy}
              >
                <ChevronLeft className="ikona-text" /> Předchozí fotka
              </button>
              <span className="font-extrabold text-xs sm:text-sm">
                <Camera className="ikona-text" /> Fotka {activeIndex + 1} z {photos.length} {photos[activeIndex]?.name ? `(${photos[activeIndex].name})` : ''}
              </span>
              <button
                type="button"
                className="btn-secondary !py-1 !px-2 text-xs"
                onClick={() => {
                  if (entryRows) setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
                  const nextIdx = Math.min(photos.length - 1, activeIndex + 1);
                  setActiveIndex(nextIdx);
                  setEntryRows(rowsMap[nextIdx] ?? null);
                }}
                disabled={activeIndex === photos.length - 1 || busy}
              >
                Další fotka <ChevronRight className="ikona-text" />
              </button>
            </div>
          )}
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
              
              <button className="btn-primary !rounded flex items-center gap-2" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Camera size={16} /> <Camera className="ikona-text" /> Spustit fotoaparát
              </button>

              <button className="btn-secondary flex items-center gap-2 border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={16} /> <Folder className="ikona-text" /> Vybrat fotku / soubor z galerie
              </button>

              <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
                <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
                <span>Oříznout / Otočit fotku před čtením</span>
              </label>
            </div>
            <span className="text-[11px] text-neutral-500">
              <Lightbulb className="ikona-text" /> Obrázek/snímek obrazovky můžeš také přímo vložit zkopírováním a stisknutím <strong>Ctrl+V</strong> (Vložit).
            </span>
          </div>

          {/* Progress / Error */}
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

          {/* Side-by-side view.
              Náhled fotky se ukazuje HNED po načtení, ne až když se čtení
              povede. Dřív viselo celé zobrazení na `entryRows !== null`,
              takže při nezdařeném čtení zmizela i fotka a obrazovka
              vypadala, jako by se nestalo vůbec nic. */}
          {photos.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
              {/* Left Column: Photo Review Pane */}
              <div className="border border-neutral-200 rounded overflow-hidden bg-neutral-50 min-h-[350px] flex flex-col">
                <PhotoReviewPane
                  photos={photos}
                  activeIndex={Math.min(activeIndex, Math.max(0, photos.length - 1))}
                  onChangeIndex={setActiveIndex}
                />
              </div>

              {entryRows === null ? (
                /* Fotka je načtená, řádky ještě ne — čte se, nebo čtení selhalo. */
                <div className="flex flex-col items-center justify-center gap-3 text-center border border-dashed border-neutral-300 rounded p-6 min-h-[350px]">
                  {busy ? (
                    <>
                      <Spinner />
                      <div className="text-sm font-bold text-neutral-700">Čtu fotku…</div>
                      <div className="text-xs text-neutral-500">Ruční zápis chvíli trvá, počkej pár vteřin.</div>
                    </>
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
                            runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), activeIndex);
                          }}
                        >
                          <RotateCcw className="ikona-text" /> Zkusit přečíst znovu
                        </button>
                        <button type="button" className="btn-primary !rounded text-xs" onClick={() => { setErr(null); setEntryRows([]); addLine(); }}>
                          <Plus className="ikona-text" /> Zapsat ručně podle fotky
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
              /* Right Column: Interactive Editor Table */
              <div className="flex flex-col space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-neutral-900">Rozpoznané řádky stočení</h3>
                  <button type="button" className="btn-ghost !rounded !py-1 text-xs font-bold text-primary-700" onClick={addLine}>
                    + Přidat řádek
                  </button>
                </div>

                <div className="space-y-2">
                  {entryRows.map((r, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded border-2 transition-all ${
                        r._removed
                          ? 'bg-neutral-100/70 border-neutral-200 opacity-60'
                          : 'bg-white border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-neutral-100">
                        <span className="text-[11px] font-black uppercase text-neutral-500">Řádek #{i + 1}</span>
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
                              <label className="text-[11px] font-black uppercase text-neutral-500">Pivo</label>
                              <select
                                className="input text-sm sm:text-xs font-bold w-full bg-white border border-neutral-200"
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
                                <label className="text-[11px] font-black uppercase text-amber-800">Zdrojový KEG</label>
                                <select
                                  className="input text-sm sm:text-xs font-bold w-full bg-white border border-amber-200"
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
                                <label className="text-[11px] font-black uppercase text-amber-800">Počet KEGů</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="např. 2"
                                  className="input text-sm sm:text-xs font-bold w-full border border-amber-200 text-center"
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
                              <label className="text-[11px] font-black uppercase text-neutral-500">1. Lahve</label>
                              <select
                                className="input text-sm sm:text-[11px] font-bold w-full p-1.5 bg-neutral-50"
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
                                className="input text-sm sm:text-xs text-right font-black"
                                value={r.qty}
                                onChange={(e) => updateLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                            </div>
                            {/* Bottle 2 */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-black uppercase text-neutral-500">2. Lahve</label>
                              <select
                                className="input text-sm sm:text-[11px] font-bold w-full p-1.5 bg-neutral-50"
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
                                className="input text-sm sm:text-xs text-right font-black"
                                value={r.qty2}
                                onChange={(e) => updateLine(i, { qty2: e.target.value.replace(/[^0-9]/g, '') })}
                              />
                            </div>
                            {/* Bottle 3 */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-black uppercase text-neutral-500">3. Lahve</label>
                              <select
                                className="input text-sm sm:text-[11px] font-bold w-full p-1.5 bg-neutral-50"
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
                                className="input text-sm sm:text-xs text-right font-black"
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
                  <button type="button" className="btn-ghost !rounded text-xs" onClick={onClose}>
                    Zrušit
                  </button>
                  <button
            className="btn-primary !rounded flex-1 !py-3 text-sm font-bold"
            onClick={saveCurrentAndNext}
            disabled={busy || !entryRows}
          >
            {activeIndex < photos.length - 1
              ? `Vložit a další fotka (${activeIndex + 2}/${photos.length})`
              : `Vložit VŠECHNO do tabulky stočení lahví (${photos.length} fotek)`}
          </button>
                </div>
              </div>
              )}
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

  // Zrušený ořez neznamená „fotku zahodit" — přečte se tak, jak přišla.
  function onEditorCancel() {
    const idx = activeIndex;
    const foto = photos[idx];
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    processingRef.current = false;
    if (foto) runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), idx);
  }
}
