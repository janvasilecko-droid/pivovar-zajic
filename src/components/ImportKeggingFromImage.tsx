import { useState, useRef, useEffect } from 'react';
import { Modal } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditor } from './ImageEditor';
import type { Beer, Package } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { typObrazku } from '../lib/obrazek';
import { AlertCircle, AlertTriangle, Beer as BeerIcon, Camera, Check, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { IkonaSud } from '../components/ikony';

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
  const [editingImage, setEditingImage] = useState<string | null>(null);
  // Fotky, které už prošly (nebo vědomě neprošly) editorem — viz
  // ImportBottlingFromImage.
  const [upraveno, setUpraveno] = useState<Record<number, boolean>>({});
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
    // Zaškrtnuté „Oříznout / Otočit fotku před čtením" se dřív nikde nečetlo.
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
    const loaded: PhotoEntry[] = [];
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

        // Pivo — přesná shoda jména, pak podřetězec jména (zachytí i pivo bez
        // vlastního stupně v katalogu, např. sezonní "Summer Ale"), a teprve
        // pak holý stupeň jako poslední záchrana — jinak by pivo se stejným
        // stupněm jako jiné (ale bez stupně v katalogu) prohrálo se špatným.
        let matchedBeer = beers.find((b) => norm(b.name) === norm(itemBeerName));
        if (!matchedBeer && itemBeerName) matchedBeer = beers.find((b) => norm(b.name).includes(norm(itemBeerName)) || norm(itemBeerName).includes(norm(b.name)));
        if (!matchedBeer && itemDegree) matchedBeer = beers.find((b) => b.degree && norm(b.degree) === norm(itemDegree));

        // KEG obal — podle objemu z textu (nejspolehlivější), jinak z label.
        // Dřív se objem hledal jako `\b(50|30|20|15|10)\b`, jenže ve zdaleka
        // nejběžnějších zápisech („4x50", „2x30l", „50l") kolem čísla žádná
        // hranice slova není (písmeno i „x" jsou znaky slova) — regulár tedy
        // nesedl skoro nikdy a obal zůstával prázdný. Nově se bere v pořadí
        // spolehlivosti: číslo s litry („50l"), číslo za „x" („4x50") a
        // teprve pak holé číslo, a vždy jen takové, které je v katalogu KEGů.
        let matchedPkg: Package | undefined;
        const objemyKegu = kegPackages.map((p) => Number(p.volume_l)).filter((v) => !isNaN(v));
        const najdiObjem = (re: RegExp): number | undefined =>
          [...raw.matchAll(re)]
            .map((m) => Number(m[1]))
            .find((n) => objemyKegu.some((v) => Math.abs(v - n) < 0.5));
        const kegVol =
          najdiObjem(/(\d+)\s*l\b/gi) ??
          najdiObjem(/[x×]\s*(\d+)/gi) ??
          najdiObjem(/(\d+)(?![\d,.])/g);
        if (kegVol != null) {
          matchedPkg = kegPackages.find((p) => Math.abs(Number(p.volume_l) - kegVol) < 0.5);
        }
        if (!matchedPkg && itemPkgLabel) {
          matchedPkg = kegPackages.find((p) => norm(p.label) === norm(itemPkgLabel))
            || kegPackages.find((p) => norm(p.label).includes(norm(itemPkgLabel)) || norm(itemPkgLabel).includes(norm(p.label)));
        }

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

  // Viz stejné místo v ImportBottlingFromImage: řádky bez piva se dřív
  // potichu zahodily a okno se zavřelo, takže to vypadalo, že se nic nestalo.
  const applyAll = () => {
    const updatedMap = { ...rowsMap, [activeIndex]: entryRows ?? [] };
    const allRows: KegRow[] = [];
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
        'nebo řádek odstraň. Bez piva by se stáčení nezapsalo.',
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
  // Zrušený ořez = fotka se přečte tak, jak přišla.
  const onEditorCancel = () => {
    const idx = activeIndex;
    const foto = photos[idx];
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    processingRef.current = false;
    if (foto) runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), idx);
  };
  // Upravená fotka nahradí JEN tu právě otevřenou (dřív přepsala celé pole).
  const onEditorConfirm = (editedDataUrl: string) => {
    const idx = activeIndex;
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    setPhotos((prev) => prev.map((f, i) => (i === idx ? { ...f, dataUrl: editedDataUrl } : f)));
    runOcrFromBase64(editedDataUrl.split(',')[1] ?? '', typObrazku(editedDataUrl), idx);
  };

    // Přepnutí na jinou fotku (tečky/šipky v náhledu): rozepsané řádky té
  // současné se uloží do rowsMap, ať se po návratu neztratí — stejná oprava
  // jako v ImportBottlingFromImage.
  function goToPhoto(idx: number) {
    const next = Math.max(0, Math.min(photos.length - 1, idx));
    if (next === activeIndex) return;
    if (entryRows) setRowsMap((prev) => ({ ...prev, [activeIndex]: entryRows }));
    setActiveIndex(next);
    setEntryRows(rowsMap[next] ?? null);
  }

  if (!isOpen) return null;

  return (
    <>
      <Modal open onClose={onClose} title="Zadání stočení KEG z fotky / WhatsAppu" wide maxWidth={photos.length > 0 ? 'max-w-5xl' : undefined}>
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
              {/* Vyfocený snímek se dřív ukládal do fronty `pendingFiles`,
                  kterou nikdo nikdy nečetl — „Spustit fotoaparát" tedy
                  neudělalo vůbec nic. Jde stejnou cestou jako galerie. */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) loadMultipleFiles(files); e.target.value = ''; }} className="hidden" />
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

          {/* Ukotvená fotka nahoře — stejně jako u lahví (ImportBottlingFromImage)
              a u kontroly WhatsApp objednávek. Zůstává na místě i při scrollování
              v přečtených řádcích, ať jde průběžně porovnávat se zapsanými daty. */}
          {photos.length > 0 && (
            <div className="sticky top-0 z-20 -mx-6 -mt-6 bg-white border-b-2 border-primary-200 shadow-md">
              <div className="h-[42vh] sm:h-[45vh]">
                <PhotoReviewPane photos={photos} activeIndex={Math.min(activeIndex, Math.max(0, photos.length - 1))} onChangeIndex={goToPhoto} />
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="space-y-4">
              {entryRows === null ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center border border-dashed border-neutral-300 rounded p-6 min-h-[350px]">
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
              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-neutral-900 flex items-center gap-1.5"><Sparkles size={14} className="text-primary-600" /> Rozpoznané řádky stáčení KEG</h3>
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
                              {beers.filter((b) => b.is_active).map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="text-udaj font-black uppercase text-amber-800"><IkonaSud className="ikona-text" /> Obal (KEG)</label>
                              <select className="input text-xs font-bold w-full bg-white border border-amber-200" value={r.pkgId} onChange={(e) => updateLine(i, { pkgId: e.target.value })}>
                                {kegPackages.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="text-udaj font-black uppercase text-amber-800">Počet ks</label>
                              <input type="text" inputMode="numeric" placeholder="např. 5" className="input text-xs font-bold w-full border border-amber-200 text-center" value={r.qty} onChange={(e) => updateLine(i, { qty: e.target.value.replace(/[^0-9]/g, '') })} />
                            </div>
                          </div>
                          {!r.pkgId && <span className="text-udaj text-amber-700"><AlertTriangle className="ikona-text" /> Nenalezen obal KEG — vyber velikost ručně.</span>}
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
              : `Vložit VŠECHNO do tabulky stočení (${photos.length} fotek)`}
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
