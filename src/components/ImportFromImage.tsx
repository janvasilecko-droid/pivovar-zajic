import { useState, useRef, useEffect } from 'react';
import { Modal, Spinner } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { ImageEditor } from './ImageEditor';
import { PhotoReviewPane } from './PhotoReviewPane';



import type { Beer, Package, Place } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import {
  parseOrderText, parseGeminiItems, dedupeAgainstExisting,
  saveAlias, loadAliasMap, emptyAliasMap, detectOrderNotes, matchPlaceFromText,
  type ParsedLine, type ParserAliasMap, type GeminiItem,
} from '../lib/orderParser';
import { autoReserveTapIfNeeded } from '../lib/tapReservations';

type ExistingItem = { beer_id: string | null; package_id: string | null; quantity: number };
type PhotoEntry = { dataUrl: string; name: string };

export function ImportFromImage({ beers, packages, places, existing, targetLabel, initialFiles, onClose, onImport }: {
  beers: Beer[]; packages: Package[]; places: Place[]; existing: ExistingItem[]; targetLabel: string | null;
  initialFiles?: File[];
  onClose: () => void; onImport: (items: { beer_id: string; package_id: string; quantity: number; place_name: string | null }[], meta: { placeId: string; placeName: string; date: string; note: string }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [placeId, setPlaceId] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<{ line: ParsedLine; duplicate: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editBeforeOcr, setEditBeforeOcr] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);


  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);

  // Pre-load photos that were handed off via Web Share Target (e.g. shared
  // straight from WhatsApp/e-mail into the installed app) — feed them into
  // the same queue used for manually selected files.
  useEffect(() => {
    if (initialFiles && initialFiles.length) {
      setPendingFiles((q) => [...q, ...initialFiles]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  // Drive the queue: whenever there are pending files and we're not already
  // processing or showing the editor, pick the next file and handle it.
  useEffect(() => {
    if (processingRef.current) return;
    if (editingImage) return;
    if (pendingFiles.length === 0) return;
    const next = pendingFiles[0];
    setPendingFiles((q) => q.slice(1));
    handleFile(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, editingImage]);

  async function runOcrFromBase64(base64: string, mimeType: string, append: boolean) {
    setBusy(true); setProgress(append ? 40 : 10); setErr(null);
    if (!append) setParsed(null);
    try {
      setProgress(append ? 55 : 30);

      // Send the top learned aliases (most-used corrections) so the AI can
      // use them as strong hints — capped to keep the request small.
      const aliasList = [...aliasMap.beer.entries()]
        .map(([alias_text, beer_id]) => ({ alias_text, beer_name: beers.find((b) => b.id === beer_id)?.name ?? null, package_label: null as string | null }))
        .concat(
          [...aliasMap.package.entries()].map(([alias_text, package_id]) => ({ alias_text, beer_name: null as string | null, package_label: packages.find((p) => p.id === package_id)?.label ?? null }))
        )
        .slice(0, 80);

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
          places: places.map((pl) => pl.name),
          aliases: aliasList,
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

      setProgress(append ? 80 : 80);

      const geminiItems: GeminiItem[] = data?.items ?? [];
      const rawTextFromGemini: string = data?.raw_text ?? '';
      setRawText((prev) => prev ? prev + '\n---\n' + rawTextFromGemini : rawTextFromGemini);
      const detected = detectOrderNotes(rawTextFromGemini);
      if (detected) setNote(detected);

      // Auto-detect customer/place from raw text or Gemini response if not already set
      const detectedPlaceName = data?.place_name ?? data?.customer_name;
      if (!placeId && !placeName) {
        const found = matchPlaceFromText(detectedPlaceName || rawTextFromGemini, places);
        if (found.placeId) {
          setPlaceId(found.placeId);
          setPlaceName(found.placeName ?? '');
        } else if (detectedPlaceName) {
          setPlaceName(detectedPlaceName);
        }
      }

      const currentPhotoIndex = photos.length; // photo about to be pushed for this batch
      const newLines = parseGeminiItems(geminiItems, beers, packages, aliasMap, currentPhotoIndex);
      setParsed((prev) => {
        const prevLines = prev?.map((p) => p.line) ?? [];
        const combined = append ? [...prevLines, ...newLines] : newLines;
        return dedupeAgainstExisting(combined, existing);
      });

      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      processingRef.current = false;
    }
  }

  function handleFile(file: File) {
    processingRef.current = true;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (editBeforeOcr) {
        setEditingImage(dataUrl);
      } else {
        setPhotos((prev) => [...prev, { dataUrl, name: file.name }]);
        const base64 = dataUrl.split(',')[1] ?? '';
        runOcrFromBase64(base64, file.type || 'image/jpeg', photos.length > 0 || parsed != null);
      }
    };
    reader.onerror = () => {
      setErr('Nelze načíst obrázek: ' + file.name);
      processingRef.current = false;
    };
    reader.readAsDataURL(file);
  }

  function onEditorConfirm(editedDataUrl: string) {
    setEditingImage(null);
    setPhotos((prev) => [...prev, { dataUrl: editedDataUrl, name: 'foto' }]);
    const base64 = editedDataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, 'image/jpeg', photos.length > 0 || parsed != null);
  }

  function onEditorCancel() {
    setEditingImage(null);
    processingRef.current = false;
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setPendingFiles((q) => [...q, ...files]);
    e.target.value = '';
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function updateLine(i: number, patch: Partial<ParsedLine>) {
    if (!parsed) return;
    const old = parsed[i].line;
    const updated = parsed.map((x, idx) => idx === i ? { ...x, line: { ...x.line, ...patch } } : x);
    setParsed(updated);

    const newLine = updated[i].line;
    // Learn the mapping when: the beer/package changed on an existing recognized
    // line, OR this is a manually added line (for text the AI missed entirely)
    // and now has enough info (raw text + beer + package) to be worth remembering.
    const beerOrPkgChanged = (patch.beer_id !== undefined && patch.beer_id !== old.beer_id) ||
      (patch.package_id !== undefined && patch.package_id !== old.package_id);
    const manualReady = newLine._manual && newLine.raw?.trim() && newLine.beer_id && newLine.package_id;
    if (beerOrPkgChanged || manualReady) {
      try {
        const textToLearn = newLine.raw?.trim() || old.raw;
        if (textToLearn) {
          await saveAlias(textToLearn, newLine.beer_id, newLine.package_id);
          setAliasMap(await loadAliasMap());
        }
      } catch {}
    }
  }


  async function importSelected() {
    if (!parsed) return;
    const items = parsed
      .filter((p) => !p.duplicate && !p.line._removed && p.line.beer_id && p.line.package_id && p.line.quantity)
      .map((p) => ({ beer_id: p.line.beer_id!, package_id: p.line.package_id!, quantity: p.line.quantity!, place_name: p.line.place_name ?? null }));
    if (!items.length) {
      setErr('Nic k importu. Každá položka musí mít vyplněné pivo, obal i množství. Doplnit můžeš přímo v kartách níže, nebo klikni × pro odstranění řádku, který nechceš.');
      return;
    }
    if (!targetLabel) {
      const anyNamed = items.some((i) => i.place_name && i.place_name.trim());
      if (!anyNamed && !placeName.trim()) { setErr('Nejprve napiš nebo vyber odběratele v poli nahoře, nebo doplň odběratele u každé položky.'); return; }
    }
    setErr(null);
    setBusy(true);
    try {
      autoReserveTapIfNeeded(placeName.trim(), date, note.trim());
      await onImport(items, { placeId, placeName: placeName.trim(), date, note: note.trim() });
    } catch (e: any) {
      setErr('Import selhal: ' + (e?.message ?? String(e)));
      setBusy(false);
    }
  }

  function addLine() {
    const newLine: ParsedLine = {
      raw: '', originalLine: '', quantity: 1, beer_id: '', beer_name: null,
      package_id: '', package_label: null, confidence: 'low', issues: ['pivo','obal'],
      place_name: placeName || null,
      _manual: true,
    };
    setParsed([...(parsed ?? []), { line: newLine, duplicate: false }]);
  }


  function removeLine(i: number) {
    if (!parsed) return;
    setParsed(parsed.map((x, idx) => idx === i ? { ...x, line: { ...x.line, _removed: true } } : x));
  }
  function restoreLine(i: number) {
    if (!parsed) return;
    setParsed(parsed.map((x, idx) => idx === i ? { ...x, line: { ...x.line, _removed: false } } : x));
  }

  const lowCount = parsed?.filter((p) => p.line.confidence === 'low' && !p.duplicate && !p.line._removed).length ?? 0;
  const okCount = parsed?.filter((p) => p.line.confidence === 'high' && !p.duplicate && !p.line._removed).length ?? 0;
  const dupCount = parsed?.filter((p) => p.duplicate).length ?? 0;
  const unknownCount = parsed?.filter((p) => p.line.confidence === 'unknown' && !p.duplicate && !p.line._removed).length ?? 0;
  const readyCount = parsed?.filter((p) => !p.duplicate && !p.line._removed && p.line.beer_id && p.line.package_id && p.line.quantity).length ?? 0;
  const queueLeft = pendingFiles.length;

  return (
    <>
    <Modal open onClose={onClose} title="Načíst objednávku z fotky / e-mailu" wide>
      <div className="space-y-4">

        {!targetLabel && (
          <div className="card !bg-primary-50/50 p-4 space-y-3">
            <div className="text-sm font-semibold text-primary-800">Odběratel a datum pro novou objednávku</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="label">Odběratel</label>
                <PlaceCombobox value={placeId} onChange={(id, name) => { setPlaceId(id); setPlaceName(name); }} places={places} />
              </div>
              <div>
                <label className="label">Datum</label>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        {targetLabel && (
          <div className="card !bg-primary-50/50 p-3 text-sm text-primary-700">
            Přidáváš položky do existující objednávky: <strong>{targetLabel}</strong>
          </div>
        )}

        {note && (
          <div className="card !bg-warning-50/50 border border-warning-200 p-3">
            <div className="text-xs font-semibold text-warning-800 mb-1">📝 Rozpoznaná poznámka k objednávce</div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka (např. bez etikety, podtacky…)" />
            <div className="text-[11px] text-warning-600 mt-1">Auto-detected z textu — můžeš upravit. Bude uloženo k objednávce.</div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} className="hidden" />
          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? `Čtu z fotky… ${progress}%` : 'Nahrát fotky (WhatsApp)'}
          </button>
          <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
            <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
            Upravit fotky před čtením (oříznutí / otočení)
          </label>
          {queueLeft > 0 && <span className="text-xs text-primary-400">Ve frontě: {queueLeft}</span>}
          <span className="text-xs text-primary-400">Můžeš nahrát více fotek najednou — AI přečte každou a spojí výsledky</span>
        </div>

        {editingImage && (
          <div className="card p-4">
            <ImageEditor
              src={editingImage}
              onConfirm={onEditorConfirm}
              onCancel={onEditorCancel}
            />
          </div>
        )}

        {busy && !editingImage && (
          <div className="flex items-center gap-3">
            <Spinner />
            <div className="flex-1 h-2 bg-primary-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {photos.map((ph, i) => (
              <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-primary-200 group">
                <img src={ph.dataUrl} alt={ph.name} className="w-full h-full object-cover" />
                <button
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-primary-900/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removePhoto(i)}
                  title="Odstranit fotku"
                >×</button>
                <span className="absolute bottom-0 left-0 right-0 bg-primary-900/70 text-white text-[9px] px-1 py-0.5 truncate">{i + 1}</span>
              </div>
            ))}
          </div>
        )}

        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}

        <div>
          <label className="label">Text objednávky (z fotky nebo e-mailu)</label>
          <textarea
            className="input font-mono text-sm"
            rows={5}
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); }}
            placeholder="Např.: 12 svetly lezak 2x KEG30, 10 desitka 1x KEG50, tmava 3x KEG20"
          />
          <button className="btn-ghost text-xs mt-2 !py-1.5" onClick={() => { doParse(rawText); const d = detectOrderNotes(rawText); if (d) setNote(d); }} disabled={!rawText.trim()}>Parsovat</button>
        </div>

        {!parsed && (
          <div className="text-xs text-primary-400 text-center py-4">
            Nahraj fotku nebo vlož text objednávky výše, po rozpoznání se otevře kontrola na celou obrazovku.
          </div>
        )}
      </div>
    </Modal>

    {parsed && (
      <div className="fixed inset-0 z-[90] bg-white flex flex-col">
        <div className="h-[42vh] min-h-[220px] shrink-0">
          <PhotoReviewPane
            photos={photos}
            activeIndex={Math.min(activePhotoIdx, Math.max(0, photos.length - 1))}
            onChangeIndex={setActivePhotoIdx}
            activeBbox={focusedLine != null ? parsed[focusedLine]?.line.bbox : undefined}
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100 shrink-0">
            <div className="text-sm font-semibold text-primary-800">Rozparsované položky ({parsed.length})</div>
            <div className="flex gap-2 text-xs items-center flex-wrap justify-end">
              {okCount > 0 && <span className="chip bg-success-100 text-success-700">{okCount} OK</span>}
              {lowCount > 0 && <span className="chip bg-warning-100 text-warning-700">{lowCount} doplnit</span>}
              {unknownCount > 0 && <span className="chip bg-danger-100 text-danger-700">{unknownCount} nerozpoznaných</span>}
              {dupCount > 0 && <span className="chip bg-primary-200 text-primary-700">{dupCount} duplikátů</span>}
              <button className="btn-ghost text-xs !py-1 !px-2" onClick={addLine}>+ Přidat řádek</button>
              <button className="btn-ghost text-xs !py-1 !px-2" onClick={() => { setParsed(null); setConfirmed(false); }}>← Zpět na fotky</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
            {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
            {parsed.map((p, i) => (
              p.line._removed ? (
                <div key={i} className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/30 px-4 py-2 flex items-center justify-between text-xs text-primary-500">
                  <span>Řádek odstraněn (nebude se importovat)</span>
                  <button className="btn-ghost text-xs !py-1 !px-2" onClick={() => restoreLine(i)}>Vrátit</button>
                </div>
              ) : (
              <div
                key={i}
                id={`parsed-card-${i}`}
                onClick={() => {
                  setFocusedLine(i);
                  if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                }}
                className={`rounded-2xl border-2 overflow-hidden transition-all cursor-pointer ${
                  focusedLine === i ? 'ring-4 ring-primary-400 ring-offset-2' : ''
                } ${
                  p.duplicate
                    ? 'bg-primary-50/50 border-primary-200 opacity-70'
                    : p.line.confidence === 'unknown'
                      ? 'bg-danger-50/40 border-danger-300'
                      : p.line.confidence === 'low'
                        ? 'bg-warning-50/40 border-warning-300'
                        : 'bg-success-50/40 border-success-300'
                }`}
              >
                <div className="px-4 py-3 bg-primary-900 text-primary-50">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-primary-300 font-semibold shrink-0">Řádek {i + 1}</span>
                    <span className="text-[10px] uppercase tracking-wider text-primary-400 shrink-0">
                      {p.line._manual ? 'ručně přidáno' : `z fotky ${typeof p.line.photo_index === 'number' ? p.line.photo_index + 1 : ''} — klikni pro zobrazení na fotce`}
                    </span>
                    {!p.duplicate && (
                      <button
                        className="ml-auto text-primary-300 hover:text-danger-400 text-xs px-2 py-0.5 rounded hover:bg-primary-800 transition-colors"
                        title="Odstranit tento řádek z importu"
                        onClick={(e) => { e.stopPropagation(); removeLine(i); }}
                      >× Odstranit</button>
                    )}
                  </div>
                  {p.line._manual ? (
                    <input
                      type="text"
                      className="input !py-1.5 text-sm font-mono bg-primary-800 border-primary-700 text-primary-50 placeholder:text-primary-400"
                      placeholder="Vlož přesný text řádku z fotky (např. „5x jantar KEG20“) — použije se k naučení pro příště"
                      value={p.line.raw}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateLine(i, { raw: e.target.value, originalLine: e.target.value })}
                    />
                  ) : (
                    <code className="text-base font-mono leading-snug break-words block">{p.line.originalLine || p.line.raw}</code>
                  )}
                </div>


                <div className="px-4 pt-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  {p.duplicate ? (
                    <span className="chip bg-primary-200 text-primary-700">Duplikát — už existuje</span>
                  ) : p.line.confidence === 'high' ? (
                    <span className="chip bg-success-100 text-success-700">Rozpoznáno OK</span>
                  ) : p.line.confidence === 'unknown' ? (
                    <span className="chip bg-danger-100 text-danger-700">Nerozpoznaný řádek — doplň ručně</span>
                  ) : (
                    <span className="chip bg-warning-100 text-warning-700">Doplnit: {p.line.issues.join(', ')}</span>
                  )}
                  {p.line.matched_alias && !p.duplicate && (
                    <span className="text-[10px] text-primary-400" title="Naučená zkratka z minulé opravy">⭐ naučeno</span>
                  )}
                </div>

                {!p.duplicate && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="sm:col-span-1">
                      <label className="label text-[10px]">Odběratel</label>
                      <input
                        type="text"
                        className="input !py-1.5 text-sm"
                        placeholder="— podle zprávy —"
                        value={p.line.place_name ?? ''}
                        onChange={(e) => updateLine(i, { place_name: e.target.value || null })}
                        list="place-suggestions"
                      />
                      <datalist id="place-suggestions">
                        {places.map((pl) => <option key={pl.id} value={pl.name} />)}
                      </datalist>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="label text-[10px]">Pivo</label>
                      <select
                        className="input !py-1.5 text-sm"
                        value={p.line.beer_id ?? ''}
                        onChange={(e) => updateLine(i, {
                          beer_id: e.target.value || null,
                          beer_name: beers.find((b) => b.id === e.target.value)?.name ?? null,
                        })}
                      >
                        <option value="">—</option>
                        {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="label text-[10px]">Obal</label>
                      <select
                        className="input !py-1.5 text-sm"
                        value={p.line.package_id ?? ''}
                        onChange={(e) => updateLine(i, {
                          package_id: e.target.value || null,
                          package_label: packages.find((p2) => p2.id === e.target.value)?.label ?? null,
                        })}
                      >
                        <option value="">—</option>
                        {packages.map((p2) => <option key={p2.id} value={p2.id}>{p2.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <label className="label text-[10px]">Množství</label>
                      <input
                        type="number" min={0} className="input !py-1.5 text-sm"
                        value={p.line.quantity ?? ''}
                        onChange={(e) => updateLine(i, { quantity: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>

                  </div>
                )}
              </div>
              )
            ))}

            <p className="text-xs text-primary-400 mt-3 leading-relaxed">
              <strong>Tmavý pruh</strong> = přesný celý řádek z fotky/e-mailu. Klikni na kartu, na fotce nahoře se zobrazí odhadovaná poloha (orientační).
              Zelené = rozpoznáno OK. Žluté = doplnit ručně. Šedé = duplikát. Červené = nerozpoznáno.
            </p>
          </div>

          <div className="border-t border-primary-100 px-4 py-3 shrink-0 bg-white space-y-2">
            <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer select-none">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4 accent-primary-600" />
              Zkontroloval jsem data podle fotky a souhlasí
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Zrušit</button>
              <button className="btn-primary" disabled={busy || readyCount === 0 || !confirmed} onClick={importSelected}>
                {readyCount > 0 ? `Importovat ${readyCount} ${readyCount === 1 ? 'položku' : readyCount < 5 ? 'položky' : 'položek'}` : 'Nic k importu'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );

  function doParse(text: string) {
    const lines = parseOrderText(text, beers, packages, aliasMap);
    const dedup = dedupeAgainstExisting(lines, existing);
    setParsed(dedup);
  }
}
