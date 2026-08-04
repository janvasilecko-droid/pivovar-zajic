import{ useState, useRef, useEffect } from 'react';
import { Modal, Spinner } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { ImageEditor } from './ImageEditor';
import { PhotoReviewPane } from './PhotoReviewPane';



import { isTapMentioned } from '../lib/tapReservations';
import type { Beer, Package, Place } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import {
  parseOrderText, parseGeminiItems, dedupeAgainstExisting,
  saveAlias, savePlaceAlias, loadAliasMap, loadPlaceAliasMap, emptyAliasMap, detectOrderNotes, matchPlaceFromText,
  type ParsedLine, type ParserAliasMap, type GeminiItem,
} from '../lib/orderParser';


type ExistingItem = { beer_id: string | null; package_id: string | null; quantity: number };
type PhotoEntry = { dataUrl: string; name: string };

export function ImportFromImage({ beers, packages, places, existing, targetLabel, initialFiles, onClose, onImport, onPlacesChanged }: {
  beers: Beer[]; packages: Package[]; places: Place[]; existing: ExistingItem[]; targetLabel: string | null;
  initialFiles?: File[];
  onClose: () => void; onImport: (items: { beer_id: string; package_id: string; quantity: number; place_name: string | null; date?: string | null }[], meta: { placeId: string; placeName: string; date: string; note: string }) => void;

  onPlacesChanged?: () => void;
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
  const [placeAliasMap, setPlaceAliasMap] = useState<Map<string, string>>(new Map());
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [queueTick, setQueueTick] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);


  useEffect(() => {
    loadAliasMap().then(setAliasMap).catch(() => {});
    loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {});
  }, []);

  // Pre-load photos that were handed off via Web Share Target (e.g. shared
  // straight from WhatsApp/e-mail into the installed app) — feed them into
  // the same queue used for manually selected files.
  useEffect(() => {
    if (initialFiles && initialFiles.length) {
      setPendingFiles((q) => [...q, ...initialFiles]);
      setTotalPhotos((t) => t + initialFiles.length);
      setPaused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  // Drive the queue: process ONE photo at a time. After a photo is parsed
  // (parsed !== null) we wait for the user to import it. After import we clear
  // parsed, which lets this effect pick up the next photo automatically.
  // queueTick is bumped after each photo finishes so the queue moves on.
  useEffect(() => {
    if (processingRef.current) return;
    if (editingImage) return;
    if (paused) return;
    if (pendingFiles.length === 0) return;
    if (parsed !== null) return; // wait for the user to import the current photo
    const next = pendingFiles[0];
    setPendingFiles((q) => q.slice(1));
    const idx = currentPhotoIndex; // 0-based index of this photo
    setCurrentPhotoIndex(idx + 1);
    handleFile(next, idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, editingImage, queueTick, parsed, paused]);

  async function runOcrFromBase64(base64: string, mimeType: string, append: boolean, photoIndex: number) {
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

      // 🧠 NAUČENÉ ALIASY ODBĚRATELŮ: špatný název z fotky → správný název.
      // Tyto aliasy posíláme AI, aby příště rozpoznala správného odběratele.
      const placeAliasList = [...placeAliasMap.entries()]
        .map(([wrongName, placeId]) => {
          const place = places.find((pl) => pl.id === placeId);
          return place ? { wrong_name: wrongName, correct_name: place.name } : null;
        })
        .filter((x): x is { wrong_name: string; correct_name: string } => x !== null)
        .slice(0, 50);

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
          placeAliases: placeAliasList,
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

      // 🧠 DATUM OBJEDNÁVKY: Pokud AI rozpoznala datum z fotky (např. "na 7.8"),
      // nastav ho jako datum objednávky. Uživatel ho může stále upravit.
      if (data?.order_date) {
        setDate(data.order_date);
      }


      // 🧠 AUTO-DETEKCE ODBĚRATELE z fotky.
      // AI vrací top-level "place_name" (hlavní odběratel na fotce) i place_name
      // u každé položky. Zkusíme je spárovat se známými odběrateli (places).
      // Detekci spouštíme VŽDY (i když už je placeId nastavené), aby se při
      // importu více fotek správně rozpoznal odběratel pro každou objednávku.
      const isIgnoredSender = (name?: string | null) => {
        if (!name) return true;
        const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return ['bednar', 'petr', 'sladek', 'gabina', 'ucetni', 'pojmi', 'bendat'].some((s) => norm.includes(s));
      };

      const detectedPlaceName = isIgnoredSender(data?.place_name ?? data?.customer_name) ? null : (data?.place_name ?? data?.customer_name);
      // Nejprve zkus top-level place_name z AI (nejspolehlivější)
      let foundPlace = matchPlaceFromText(detectedPlaceName || '', places, placeAliasMap);
      let firstItemPlaceName: string | null = null;
      // Pokud top-level nic nedal, zkus place_name z jednotlivých položek
      if (!foundPlace.placeId) {
        for (const item of geminiItems) {
          if (item.place_name && !isIgnoredSender(item.place_name)) {
            if (!firstItemPlaceName) firstItemPlaceName = item.place_name;
            foundPlace = matchPlaceFromText(item.place_name, places, placeAliasMap);
            if (foundPlace.placeId) break;
          }
        }
      }
      // Pokud stále nic, zkus najít odběratele v celém rozpoznaném textu
      if (!foundPlace.placeId) {
        foundPlace = matchPlaceFromText(rawTextFromGemini, places, placeAliasMap);
      }
      if (foundPlace.placeId) {
        setPlaceId(foundPlace.placeId);
        setPlaceName(foundPlace.placeName ?? '');
      } else if (detectedPlaceName && !isIgnoredSender(detectedPlaceName)) {
        // AI rozpoznala jméno, ale neodpovídá žádnému známému odběrateli
        // → použij ho jako nového odběratele
        setPlaceName(detectedPlaceName);
      } else if (firstItemPlaceName && !isIgnoredSender(firstItemPlaceName)) {
        // AI rozpoznala jméno na položce, ale neodpovídá známému odběrateli
        // → použij ho jako nového odběratele
        setPlaceName(firstItemPlaceName);
      }



      const newLines = parseGeminiItems(geminiItems, beers, packages, aliasMap, photoIndex, places);
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
      // Bump the tick so the queue effect picks up the next photo automatically.
      setQueueTick((t) => t + 1);
    }
  }

  function handleFile(file: File, photoIndex: number) {
    processingRef.current = true;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (editBeforeOcr) {
        setEditingImage(dataUrl);
      } else {
        setPhotos([{ dataUrl, name: file.name }]);
        const base64 = dataUrl.split(',')[1] ?? '';
        runOcrFromBase64(base64, file.type || 'image/jpeg', false, photoIndex);
      }
    };
    reader.onerror = () => {
      setErr('Nelze načíst obrázek: ' + file.name);
      processingRef.current = false;
      setQueueTick((t) => t + 1);
    };
    reader.readAsDataURL(file);
  }

  function onEditorConfirm(editedDataUrl: string) {
    setEditingImage(null);
    setPhotos([{ dataUrl: editedDataUrl, name: 'foto' }]);
    const base64 = editedDataUrl.split(',')[1] ?? '';
    runOcrFromBase64(base64, 'image/jpeg', false, Math.max(0, currentPhotoIndex - 1));
  }

  function onEditorCancel() {
    setEditingImage(null);
    processingRef.current = false;
    setQueueTick((t) => t + 1);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      setPendingFiles((q) => [...q, ...files]);
      setTotalPhotos((t) => t + files.length);
      setPaused(false);
    }
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
    // Každá položka si nese vlastního odběratele (place_name) rozpoznaného z fotky.
    // Pokud ho AI neurčila, použijeme globálně vybraného odběratele (placeName).
    // Díky tomu se objednávky z více WhatsApp oken na jedné fotce rozdělí správně.
    const items = parsed
      .filter((p) => !p.duplicate && !p.line._removed && p.line.beer_id && p.line.package_id && p.line.quantity)
      .map((p) => ({ beer_id: p.line.beer_id!, package_id: p.line.package_id!, quantity: p.line.quantity!, place_name: p.line.place_name?.trim() || placeName.trim() || null, date: p.line.date ?? null }));

    if (!items.length) {
      // Všechny položky jsou odstraněné/duplicitní → přeskoč na další fotku
      setErr(null);
      advanceToNextPhoto();
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      // Rezervace výčepu se vytvoří až v Orders.tsx po vytvoření objednávky,
      // aby byla správně spárovaná s objednávkou (order_id).
      await onImport(items, { placeId, placeName: placeName.trim(), date, note: note.trim() });

      // After a successful import, advance to the next photo (or close when done).
      if (targetLabel) {
        // Importing into an existing order → single import, close.
        onClose();
      } else if (pendingFiles.length === 0) {
        // No more photos in the queue → done.
        onClose();
      } else {
        // More photos remain → clear the review and let the queue load the next one.
        advanceToNextPhoto();
      }
    } catch (e: any) {
      setErr('Import selhal: ' + (e?.message ?? String(e)));
      setBusy(false);
    }
  }

  // Pomocná funkce: vyčistí stav a nechá frontu načíst další fotku.
  function advanceToNextPhoto() {
    setParsed(null);
    setConfirmed(false);
    setNote('');
    setRawText('');
    setActivePhotoIdx(0);
    setFocusedLine(null);
    setPaused(false);
  }


  function addLine() {
    const newLine: ParsedLine = {
      raw: '', originalLine: '', quantity: 1, beer_id: '', beer_name: null,
      package_id: '', package_label: null, confidence: 'low', issues: ['pivo','obal'],
      place_name: null,
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
                <PlaceCombobox
                  value={placeId}
                  onChange={(id, name) => {
                    setPlaceId(id);
                    setPlaceName(name);
                    // 🧠 Nauč se alias místa, pokud uživatel ručně vybral existující místo
                    if (id && name) {
                      savePlaceAlias(name, id).catch(() => {});
                    }
                    // 🧠 PROPAGACE ODBĚRATELE NA VŠECHNY POLOŽKY:
                    // Když uživatel ručně vybere/napíše odběratele, propíšeme ho
                    // na VŠECHNY rozparsované položky (nahradí špatné názvy z AI).
                    // Díky tomu se objednávka správně přiřadí jednomu odběrateli.
                    if (name && parsed) {
                      setParsed((prev) => prev
                        ? prev.map((p) => ({ ...p, line: { ...p.line, place_name: name } }))
                        : prev);
                    }
                  }}
                  places={places}
                  onPlacesChanged={onPlacesChanged}
                />

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
            {isTapMentioned(note) && (
              <div className="mt-2.5 text-xs font-bold text-amber-900 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-200 p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 flex items-center gap-2">
                <span className="text-base">🚰</span>
                <span>Detekován výčep / chlazení! Po importu se automaticky otevře okno pro rezervaci konkrétního výčepu.</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 items-center">
            <input ref={fileRef} type="file" accept="image/*,application/pdf,.png,.jpg,.jpeg,.webp" multiple onChange={onFile} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            
            <button className="btn-primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
              {busy ? `Čtu z fotky… ${progress}%` : '📷 Spustit fotoaparát'}
            </button>

            <button className="btn-secondary border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50" onClick={() => fileRef.current?.click()} disabled={busy}>
              📁 Vybrat fotku / soubor z galerie
            </button>

            <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
              <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
              Upravit fotky před čtením (oříznutí / otočení)
            </label>
            {queueLeft > 0 && <span className="text-xs text-primary-400">Ve frontě: {queueLeft}</span>}
          </div>
          <span className="text-[11px] text-neutral-500">
            💡 Můžeš nahrát více fotek najednou. Obrázek/snímek obrazovky lze také přímo vložit zkopírováním a stisknutím <strong>Ctrl+V</strong> (Vložit).
          </span>
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary-800">Rozparsované položky ({parsed.length})</span>
              {totalPhotos > 1 && (
                <span className="chip bg-primary-100 text-primary-700 font-black">{currentPhotoIndex}/{totalPhotos}</span>
              )}
            </div>
            <div className="flex gap-2 text-xs items-center flex-wrap justify-end">
              {okCount > 0 && <span className="chip bg-success-100 text-success-700">{okCount} OK</span>}
              {lowCount > 0 && <span className="chip bg-warning-100 text-warning-700">{lowCount} doplnit</span>}
              {unknownCount > 0 && <span className="chip bg-danger-100 text-danger-700">{unknownCount} nerozpoznaných</span>}
              {dupCount > 0 && <span className="chip bg-primary-200 text-primary-700">{dupCount} duplikátů</span>}
              <button className="btn-ghost text-xs !py-1 !px-2" onClick={addLine}>+ Přidat řádek</button>
              {pendingFiles.length > 0 && (
                <button className="btn-ghost text-xs !py-1 !px-2" onClick={() => { advanceToNextPhoto(); }}>⏭ Přeskočit fotku</button>
              )}
              <button className="btn-ghost text-xs !py-1 !px-2" onClick={() => { setParsed(null); setConfirmed(false); setPaused(true); }}>← Zpět na fotky</button>

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
                      {p.line._manual ? 'ručně přidáno' : `z fotky ${typeof p.line.photo_index === 'number' ? p.line.photo_index + 1 : ''}`}
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
                  <div className="p-3 sm:p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                    {/* Odběratel — každá položka si nese vlastního odběratele (kvůli více objednávkám na jedné fotce) */}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Odběratel</span>
                      <input
                        type="text"
                        list={`place-list-${i}`}
                        className="input !py-1.5 text-xs w-full"
                        value={p.line.place_name ?? ''}
                        placeholder="— (použít globálního odběratele) — nebo napiš nového"
                        onChange={(e) => updateLine(i, { place_name: e.target.value || null })}
                      />
                      <datalist id={`place-list-${i}`}>
                        {places.map((pl) => <option key={pl.id} value={pl.name} />)}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[1fr_1fr_1fr_auto] gap-x-3 gap-y-2">
                      {/* Pivo */}
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Pivo</span>
                        <select
                          className="input !py-1.5 text-xs w-full"
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
                      {/* Obal */}
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Obal</span>
                        <select
                          className="input !py-1.5 text-xs w-full"
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
                      {/* Množství */}
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Množ</span>
                        <input
                          type="number" min={0} className="input !py-1.5 text-sm font-black w-full"
                          value={p.line.quantity ?? ''}
                          onChange={(e) => updateLine(i, { quantity: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                      {/* Tlačítko odstranit */}
                      <div className="flex items-end pb-0.5">
                        <button
                          className="w-8 h-8 rounded-xl bg-danger-100 hover:bg-danger-200 text-danger-600 flex items-center justify-center transition text-sm font-bold"
                          title="Odstranit řádek"
                          onClick={(e) => { e.stopPropagation(); removeLine(i); }}
                        >×</button>
                      </div>
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
            {err && (
              <div className="text-sm text-danger-700 bg-danger-500/10 border border-danger-300 rounded-lg px-3 py-2 font-medium">
                ⚠️ {err}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose}>Zrušit</button>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={() => {
                  // 🧠 Pokud uživatel odstranil VŠECHNY položky → nic se neimportuje,
                  // jen přeskočíme na další fotku (nebo zavřeme, když už žádná není).
                  if (parsed && parsed.length > 0 && parsed.every((p) => p.line._removed)) {
                    setErr(null);
                    if (pendingFiles.length === 0) {
                      onClose();
                    } else {
                      advanceToNextPhoto();
                    }
                    return;
                  }
                  if (readyCount === 0) {
                    if (dupCount > 0 && parsed?.every((p) => p.duplicate || p.line._removed)) {
                      setErr('Všechny položky z fotky už v této objednávce existují (duplikáty), takže není co importovat. Pokud chceš přesto přidat, uprav množství u duplikátu níže.');
                    } else {
                      setErr('Nic k importu. Každá položka musí mít vyplněné pivo, obal i množství. Doplnit můžeš přímo v kartách níže, nebo klikni × pro odstranění řádku, který nechceš.');
                    }
                    return;
                  }
                  if (!confirmed) {
                    setErr('Zaškrtni prosím „Zkontroloval jsem data podle fotky a souhlasí“ a pak klikni znovu na Importovat.');
                    return;
                  }
                  importSelected();
                }}

              >
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
