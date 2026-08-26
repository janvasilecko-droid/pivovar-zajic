import { AlertTriangle, Camera, Lightbulb, Lock, NotebookPen, Siren, Unlock } from 'lucide-react';
import{ useState, useRef, useEffect } from 'react';
import { Modal, Spinner } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { ImageEditor } from './ImageEditor';
import { PhotoReviewPane } from './PhotoReviewPane';



import { isTapMentioned } from '../lib/tapReservations';
import type { Beer, Package, Place } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { IkonaVycep } from '../components/ikony';
import {
  parseOrderText, parseGeminiItems, dedupeAgainstExisting,
  saveAlias, savePlaceAlias, loadAliasMap, loadPlaceAliasMap, emptyAliasMap, detectOrderNotes, matchPlaceFromText,
  detectOrderDupWarnings,
  type ParsedLine, type ParserAliasMap, type GeminiItem, type ImportedOrder, type OrderDupWarning,
} from '../lib/orderParser';


type ExistingItem = { beer_id: string | null; package_id: string | null; quantity: number };
type PhotoEntry = { dataUrl: string; name: string; fingerprint: string };

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
  const [dupFilesPending, setDupFilesPending] = useState<File[] | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [editBeforeOcr, setEditBeforeOcr] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [userAllowedDups, setUserAllowedDups] = useState<Set<number>>(new Set());
  const [skipReason, setSkipReason] = useState<string | null>(null);

  // 🚨 Detekce DUPLICITNÍ OBJEDNÁVKY napříč fotkami v jedné relaci:
  // sledujeme úspěšně importované objednávky (odběratel + datum + položky).
  // Když se na další fotce objeví stejný odběratel, upozorníme uživatele a
  // ukážeme obě objednávky vedle sebe — musí je porovnat a potvrdit import.
  const importedOrdersRef = useRef<ImportedOrder[]>([]);
  const [dupOrders, setDupOrders] = useState<OrderDupWarning[]>([]);
  const [dupOrdersConfirmed, setDupOrdersConfirmed] = useState(false);
  // Zrcadlo aktuálního `parsed` pro bezpečné čtení v async kódu (funkční
  // updater by se musel duplikovat) a porovnání předchozích varování.
  const parsedRef = useRef<{ line: ParsedLine; duplicate: boolean }[] | null>(null);
  const prevDupWarningsRef = useRef<OrderDupWarning[]>([]);

  function toggleAllowDuplicate(i: number) {
    setUserAllowedDups((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // Funkce pro normalizaci textu pro porovnávání duplicit
  function normalizeTextForCompare(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // odstraní diakritiku
      .replace(/\s+/g, ' ') // normalizuje mezery
      .replace(/[\.,;:!?]/g, '') // odstraní interpunkci
      .trim();
  }

  // Detekce duplicitního textu z obrázku - když nový text obsahuje předchozí text celý
  function isDuplicateRawText(newText: string, previousTexts: Set<string>): boolean {
    const normalizedNew = normalizeTextForCompare(newText);
    for (const prevText of previousTexts) {
      const normalizedPrev = normalizeTextForCompare(prevText);
      // Pokud nový text obsahuje celý starý text (nebo naopak) a je mnohem delší
      // nebo podobný, jde pravděpodobně o kopii celé objednávky v odpovědi "ok"
      if (normalizedNew.includes(normalizedPrev) && normalizedPrev.length > 20) {
        // Starý text je dlouhý více než 20 znaků a nový text obsahuje celý starý text
        return true;
      }
      if (normalizedPrev.includes(normalizedNew) && normalizedNew.length > 20) {
        // Nebo pokud starý text obsahuje celý nový text
        return true;
      }
      // Podobnost textů více než 80%
      if (calculateTextSimilarity(normalizedNew, normalizedPrev) > 0.8) {
        return true;
      }
    }
    return false;
  }

  // Výpočet podobnosti textů (0-1)
  function calculateTextSimilarity(text1: string, text2: string): number {
    if (text1.length === 0 || text2.length === 0) return 0;
    
    // Jednoduchá Levenshtein vzdálenost pro podobnost
    const shorter = text1.length < text2.length ? text1 : text2;
    const longer = text1.length < text2.length ? text2 : text1;
    
    if (shorter.length === 0) return 1.0;
    
    const distance = levenshteinDistance(text1, text2);
    return 1.0 - distance / longer.length;
  }

  // Levenshtein distance implementace
  function levenshteinDistance(a: string, b: string): number {
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[a.length][b.length];
  }
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [paused, _setPaused] = useState(false);
  const pausedRef = useRef(false);
  function setPaused(val: boolean) {
    _setPaused(val);
    pausedRef.current = val;
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const fileRefPdf = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const editorResolveRef = useRef<((dataUrl: string | null) => void) | null>(null);

  // Klicove odra matkove: zmevove objednavky = odberatel + datum + pivo + obal + mnozstvi.
  // These keys are remembered across all photos in this session so the same
  // order is never imported twice (overlapping photo content => no duplicates).
  const seenOrderKeysRef = useRef<Set<string>>(new Set());
  // 🧹 Detekce duplicitního obsahu z fotek: když AI přečte z fotky odpověď "ok" a obsahuje
  // celý původní text, tento text už obsahuje celou původní objednávku. Pamatujeme si
  // rozpoznané texty a pokud nový text obsahuje starý celý, ignorujeme výsledky.
  const seenRawTextsRef = useRef<Set<string>>(new Set());
  // Pamatujeme si, jestli je fullscreen kontrola prave otevrena (parsed !== null),
  // abychom pri otevreni kontroly pro „dalsi" fotku prepnuli nahled na tu fotku,
  // ze ktere rozpoznane polozky pochazeji, a zobrazili ji odshora.
  const reviewWasOpenRef = useRef(false);


  // Detekce duplicitního nahrání toho samého snímku obrazovky / souboru.
  // Otisk souboru = název + velikost + čas uložení. Dva stejné soubory mají
  // stejný otisk, takže poznáme, že uživatel nahrál stejný screen 2x.
  // Otisky uložených fotek si pamatujeme i v localStorage, abychom poznali,
  // že fotku už načetl včera / dříve (ne jen teď v této relaci).
  function fileFingerprint(f: File): string {
    return `${f.name}|${f.size}|${f.lastModified}`;
  }
  const FREAD_FP_KEY = 'imported_photo_fps_v1';
  function rememberFingerprint(fp: string) {
    try {
      const saved = JSON.parse(localStorage.getItem(FREAD_FP_KEY) || '[]') as string[];
      if (!saved.includes(fp)) {
        saved.push(fp);
        localStorage.setItem(FREAD_FP_KEY, JSON.stringify(saved.slice(-600)));
      }
    } catch {}
  }
  function fileSeen(f: File): boolean {
    const fp = fileFingerprint(f);
    if (photos.some((p) => p.fingerprint === fp)) return true;
    if (pendingFiles.some((pf) => fileFingerprint(pf) === fp)) return true;
    try {
      const saved = JSON.parse(localStorage.getItem(FREAD_FP_KEY) || '[]') as string[];
      return saved.includes(fp);
    } catch { return false; }
  }


  // Resetovat historii rozpoznaných textů při otevření nové relace
  useEffect(() => {
    seenRawTextsRef.current.clear();
    seenOrderKeysRef.current.clear();
    setSkipReason(null);
  }, []);

  // Auto-open gallery on initial mount if no initialFiles and no photos present
  useEffect(() => {
    if (!initialFiles || initialFiles.length === 0) {
      const timer = setTimeout(() => { if (fileRef.current && photos.length === 0 && pendingFiles.length === 0) { fileRef.current.click(); } }, 50);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    loadAliasMap().then(setAliasMap).catch(() => {});
    loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {});
  }, []);

  // Po otevreni/znovuotevreni kontroly (parsed prejde z null na hodnoty) nastavime
  // nahled fotky na tu, ze ktere rozpoznane polozky pochazeji. PhotoReviewPane pri
  // zmene indexu vzdy resetuje pohled, takze se fotka zobrazi odshora. Behem
  // prubezneho zpracovani dalsich fotek na pozadi (kontrola jiz je otevrena) se
  // do uzivatelova pohledu nezasahuje.
  useEffect(() => {
    if (parsed && !reviewWasOpenRef.current && parsed.length > 0) {
      let maxPhotoIdx = -1;
      for (const p of parsed) {
        if (typeof p.line.photo_index === 'number' && p.line.photo_index > maxPhotoIdx) {
          maxPhotoIdx = p.line.photo_index;
        }
      }
      if (maxPhotoIdx >= 0) setActivePhotoIdx(maxPhotoIdx);
    }
    reviewWasOpenRef.current = parsed !== null;
  }, [parsed]);

  // Zrcadlo aktuálního seznamu rozparsovaných řádků pro async kód.
  useEffect(() => {
    parsedRef.current = parsed;
  }, [parsed]);

  // 🚨 Kdykoli se změní rozparsované řádky, spočítej, jestli se na aktuální
  // fotce neobjevil odběratel, který už byl v této relaci importován.
  // Potvrzení (dupOrdersConfirmed) se resetuje jen při VÝZNAMNÉ změně varování
  // (nový duplicitní odběratel / nová fotka), ne při běžné editaci řádků.
  useEffect(() => {
    if (!parsed) return;
    const warnings = detectOrderDupWarnings(parsed, importedOrdersRef.current, placeName);
    setDupOrders(warnings);
    const prev = prevDupWarningsRef.current;
    const changed =
      warnings.length !== prev.length ||
      warnings.some((w, i) => w.place !== prev[i]?.place);
    if (changed && warnings.length > 0) {
      setDupOrdersConfirmed(false);
    }
    prevDupWarningsRef.current = warnings;
  }, [parsed, placeName]);

  // Pre-load photos that were handed off via Web Share Target (e.g. shared
  // straight from WhatsApp/e-mail into the installed app) — feed them into
  // the same queue used for manually selected files.
  useEffect(() => {
    if (initialFiles && initialFiles.length) {
      setPendingFiles((q) => [...q, ...initialFiles]);
      setPaused(false);
    }
  }, [initialFiles]);

  // Drive the queue: process files automatically one after another
  useEffect(() => {
    if (busy) return;
    if (paused) return;
    if (pendingFiles.length === 0) return;

    const queue = [...pendingFiles];
    setPendingFiles([]); // clear queue so we don't trigger again
    processFilesQueue(queue);
  }, [pendingFiles, busy, paused]);

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Nelze načíst obrázek: ' + file.name));
      reader.readAsDataURL(file);
    });
  }

  async function processFilesQueue(files: File[]) {
    setBusy(true);
    setErr(null);

    const startIdx = photos.length;
    setTotalPhotos((t) => t + files.length);

    for (let i = 0; i < files.length; i++) {
      if (pausedRef.current) {
        // Put remaining files back in pendingFiles
        setPendingFiles(files.slice(i));
        setBusy(false);
        return;
      }

      const file = files[i];
      const photoIdx = startIdx + i;
      setCurrentPhotoIndex(photoIdx + 1);

      try {
        const dataUrl = await readFileAsDataURL(file);
        
        let targetDataUrl = dataUrl;
        if (editBeforeOcr) {
          setEditingImage(dataUrl);
          const editedUrl = await new Promise<string | null>((resolve) => {
            editorResolveRef.current = resolve;
          });
          if (!editedUrl) {
            // User cancelled editor, skip this file
            continue;
          }
          targetDataUrl = editedUrl;
        }

        setPhotos((prev) => [...prev, { dataUrl: targetDataUrl, name: file.name, fingerprint: fileFingerprint(file) }]);
        rememberFingerprint(fileFingerprint(file));
        const base64 = targetDataUrl.split(',')[1] ?? '';
        await runOcrFromBase64(base64, file.type || 'image/jpeg', photoIdx > 0, photoIdx);
      } catch (e: any) {
        setErr('Chyba při zpracování fotky: ' + (e?.message ?? String(e)));
      }
    }

    setBusy(false);
  }

  async function runOcrFromBase64(base64: string, mimeType: string, append: boolean, photoIndex: number) {
    setProgress(append ? 40 : 10);
    setErr(null);
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
        headers: await authenticatedFunctionHeaders(),
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

      setProgress(80);

      const geminiItems: GeminiItem[] = data?.items ?? [];
      const rawTextFromGemini: string = data?.raw_text ?? '';
      
      // 🧹 DETEKCE DUPLICITNÍHO TEXTU Z ODPOVĚDÍ "ok", "ano", "dobře" apod.
      // Když někdo odpoví na objednávku, AI přečte celou původní zprávu znovu
      // a vytvoří duplicitní položky. Kontrolujeme, jestli nový text obsahuje
      // celý nějaký starý text (nebo naopak).
      if (seenRawTextsRef.current.size > 0) {
        const isDuplicate = isDuplicateRawText(rawTextFromGemini, seenRawTextsRef.current);
        if (isDuplicate && rawTextFromGemini.trim().length > 30) {
          // Text je příliš podobný předchozímu -> pravděpodobně odpověď s kopií objednávky
          console.log('Duplicitní text detekován (pravděpodobně odpověď s kopií objednávky):', rawTextFromGemini.substring(0, 100));
          setSkipReason(`⚠️ Fotka může obsahovat odpověď s kopií původní objednávky. Zkontrolujte, jestli neobsahuje víckrát stejné položky.`);
          
          // Pokud jde o přidání dalších fotek (append), quietly skip
          if (append && geminiItems.length === 0) {
            setProgress(100);
            return; // Ticho přeskočíme, protože neobsahuje žádné nové položky
          }
          // Pokud přidáváme první fotku nebo fotka obsahuje položky, pokračujeme
          // s varováním
        }
      }
      
      // Přidáme text do historie pro budoucí porovnávání
      if (rawTextFromGemini.trim().length > 10) { // ukládáme jen smysluplně dlouhé texty
        seenRawTextsRef.current.add(rawTextFromGemini);
      }
      
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
        // AI rozpoznala jméno na položce, ale neodpovídá známému odběratele
        // → použij ho jako nového odběratele
        setPlaceName(firstItemPlaceName);
      }



      const newLines = parseGeminiItems(geminiItems, beers, packages, aliasMap, photoIndex, places);
      setParsed((prev) => {
        const prevLines = prev?.map((p) => p.line) ?? [];
        const combined = append ? [...prevLines, ...newLines] : newLines;
        return markDuplicates(combined, seenOrderKeysRef.current, existing, date, placeName);
      });

      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    }
  }

  function onEditorConfirm(editedDataUrl: string) {
    setEditingImage(null);
    if (editorResolveRef.current) {
      editorResolveRef.current(editedDataUrl);
      editorResolveRef.current = null;
    }
  }

  function onEditorCancel() {
    setEditingImage(null);
    if (editorResolveRef.current) {
      editorResolveRef.current(null);
      editorResolveRef.current = null;
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) {
      if (!parsed && pendingFiles.length === 0 && !dupFilesPending) {
        setPhotos([]);
        setTotalPhotos(0);
        setCurrentPhotoIndex(0);
      }
      // Rozděl vybrané soubory na nové a ty, které uživatel nahrál podruhé.
      const fresh: File[] = [];
      const dups: File[] = [];
      for (const f of files) {
        if (fileSeen(f)) dups.push(f);
        else fresh.push(f);
      }
      if (fresh.length) {
        setPendingFiles((q) => [...q, ...fresh]);
        setPaused(false);
        // Reset varování při novém nahrání fotek
        setSkipReason(null);
      }
      if (dups.length) {
        setDupFilesPending(dups);
      }
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
      .filter((p, idx) => (!p.duplicate || userAllowedDups.has(idx)) && !p.line._removed && p.line.beer_id && p.line.package_id && p.line.quantity)
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

      // Remember the imported items so an overlapping photo (same customer,
      // date, pivo, obal, mnozstvi) is marked as duplicate and not re-imported.
      items.forEach((it) => {
        const pn = it.place_name?.trim() || placeName.trim();
        const dt = it.date || date;
        seenOrderKeysRef.current.add(mkKey(pn, dt, it.beer_id, it.package_id, it.quantity));
      });

      // 🚨 Zapamatuj si importované OBJEDNÁVKY (odběratel + datum + položky),
      // abychom při další fotce poznali, že se stejný odběratel importuje znovu.
      const orderGroups = new Map<string, ImportedOrder>();
      for (const it of items) {
        const pn = it.place_name?.trim() || placeName.trim();
        if (!pn) continue;
        const dt = it.date || date;
        const oKey = `${pn}||${dt}`;
        if (!orderGroups.has(oKey)) {
          orderGroups.set(oKey, { place: pn, date: dt, items: [] });
        }
        orderGroups.get(oKey)!.items.push({ beer_id: it.beer_id, package_id: it.package_id, quantity: it.quantity });
      }
      for (const ord of orderGroups.values()) {
        importedOrdersRef.current.push(ord);
      }

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
    setSkipReason(null);
    setDupOrders([]);
    setDupOrdersConfirmed(false);
    prevDupWarningsRef.current = [];
    // Nesmazat seenRawTextsRef.current, protože obsahuje i rozpoznané texty z předchozích fotek
    // pro detekci duplicit napříč celou relací
  }


  function addLine() {
    const newLine: ParsedLine = {
      raw: '', originalLine: '', quantity: 1, beer_id: '', beer_name: null,
      package_id: '', package_label: null, confidence: 'low', issues: ['pivo','obal'],
      place_name: null,
      _manual: true,
    };
    setParsed((prev) => {
      const arr = prev ?? [];
      // Vložit nový řádek na místo, kde právě jsi (hned za aktuálně
      // fokusovaný řádek), aby "Přidat řádek" vkládal tam, kde píšeš,
      // a ne vždy dolů.
      const idx = focusedLine;
      if (idx != null && idx >= 0 && idx < arr.length) {
        return [
          ...arr.slice(0, idx + 1),
          { line: newLine, duplicate: false },
          ...arr.slice(idx + 1),
        ];
      }
      return [...arr, { line: newLine, duplicate: false }];
    });
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
  const dupCount = parsed?.filter((p, idx) => p.duplicate && !userAllowedDups.has(idx)).length ?? 0;
  const unknownCount = parsed?.filter((p) => p.line.confidence === 'unknown' && !p.duplicate && !p.line._removed).length ?? 0;
  const readyCount = parsed?.filter((p, idx) => (!p.duplicate || userAllowedDups.has(idx)) && !p.line._removed && p.line.beer_id && p.line.package_id && p.line.quantity).length ?? 0;
  const queueLeft = pendingFiles.length;
  const activeLineIdx = focusedLine ?? 0;
  const activeLineWrapper = parsed ? parsed[activeLineIdx] : null;
  const activeOriginalText = activeLineWrapper
    ? (activeLineWrapper.line.originalLine || activeLineWrapper.line.raw)
    : '';

  function doParse(text: string) {
    const lines = parseOrderText(text, beers, packages, aliasMap);
    const dedup = dedupeAgainstExisting(lines, existing);
    setParsed(dedup);
  }

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
            <div className="text-xs font-semibold text-warning-800 mb-1"><NotebookPen className="ikona-text" /> Rozpoznaná poznámka k objednávce</div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka (např. bez etikety, podtacky…)" />
            <div className="text-[11px] text-warning-600 mt-1">Auto-detected z textu — můžeš upravit. Bude uloženo k objednávce.</div>
            {isTapMentioned(note) && (
              <div className="mt-2.5 text-xs font-bold text-amber-900 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-200 p-2.5 rounded border border-amber-300 dark:border-amber-700 flex items-center gap-2">
                <span className="text-base"><IkonaVycep className="ikona-text" /></span>
                <span>Detekován výčep / chlazení! Po importu se automaticky otevře okno pro rezervaci konkrétního výčepu.</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 items-center">
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} className="hidden" />
            <input ref={fileRefPdf} type="file" accept="application/pdf,.pdf" multiple onChange={onFile} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
                title="Vyfotit objednávku fotoaparátem"
                className="w-11 h-11 grid place-items-center rounded bg-amber-500 hover:bg-amber-600 text-white text-xl shadow-md transition active:scale-95 disabled:opacity-50"
              >
                <Camera className="ikona-text" />
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                title="Vybrat objednávku z fotogalerie"
                className="w-11 h-11 grid place-items-center rounded bg-amber-700 hover:bg-amber-800 text-white text-xl shadow-md transition active:scale-95 disabled:opacity-50"
              >
                🖼️
              </button>
              <button
                type="button"
                onClick={() => fileRefPdf.current?.click()}
                disabled={busy}
                title="Vybrat soubor (např. PDF objednávky)"
                className="h-11 px-2.5 rounded bg-white border border-neutral-300 text-neutral-800 text-xs font-black shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                📄 PDF
              </button>
            </div>
            {busy && <span className="text-xs font-bold text-amber-700">Čtu z fotky… {progress}%</span>}

            <label className="flex items-center gap-2 text-xs text-primary-600 cursor-pointer select-none">
              <input type="checkbox" checked={editBeforeOcr} onChange={(e) => setEditBeforeOcr(e.target.checked)} className="accent-primary-600" />
              Upravit fotky před čtením (oříznutí / otočení)
            </label>
            {queueLeft > 0 && <span className="text-xs text-primary-400">Ve frontě: {queueLeft}</span>}
          </div>
          <span className="text-[11px] text-neutral-500">
            <Lightbulb className="ikona-text" /> Můžeš nahrát více fotek najednou. Obrázek/snímek obrazovky lze také přímo vložit zkopírováním a stisknutím <strong>Ctrl+V</strong> (Vložit).
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

        {dupFilesPending && dupFilesPending.length > 0 && (
          <div className="card !bg-warning-50/60 border border-warning-300 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-2xl"><AlertTriangle className="ikona-text" /></span>
              <div className="flex-1">
                <div className="font-bold text-warning-900">
                  {dupFilesPending.length === 1 ? 'Tento snímek jsi už nahrál/a' : 'Tyto snímky jsi už nahrál/a'}
                </div>
                <p className="text-sm text-warning-700 mt-1">
                  {dupFilesPending.length === 1
                    ? 'Vypadá to, že je to podruhé ten stejný obrázek/screen. Chceš ho přesto přidat, nebo přeskočit?'
                    : `${dupFilesPending.length} obrázky/snímky jsi už nahrál/a. Chceš je přesto přidat, nebo přeskočit?`}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    className="btn-primary !rounded"
                    onClick={() => { setPendingFiles((q) => [...q, ...dupFilesPending]); setDupFilesPending(null); }}
                  >
                    Přesto přidat
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !rounded"
                    onClick={() => setDupFilesPending(null)}
                  >
                    Přeskočit (doporučeno)
                  </button>
                </div>
              </div>
            </div>
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
              <div key={i} className="relative w-20 h-20 rounded overflow-hidden border-2 border-primary-200 group">
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

        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded px-3 py-2">{err}</div>}

        <div>
          <label className="label">Text objednávky (z fotky nebo e-mailu)</label>
          <textarea
            className="input font-mono text-sm"
            rows={5}
            value={rawText}
            onChange={(e) => { setRawText(e.target.value); }}
            placeholder="Např.: 12 svetly lezak 2x KEG30, 10 desitka 1x KEG50, tmava 3x KEG20"
          />
          <button className="btn-ghost !rounded text-xs mt-2 !py-1.5" onClick={() => { doParse(rawText); const d = detectOrderNotes(rawText); if (d) setNote(d); }} disabled={!rawText.trim()}>Parsovat</button>
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100 shrink-0 bg-primary-50/50">
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
              <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-primary-200 text-primary-800 shrink-0">
                Položka {activeLineIdx + 1}/{parsed.length}
              </span>
              <span className="text-xs sm:text-sm font-mono font-bold text-primary-950 truncate" title={activeOriginalText}>
                {activeOriginalText || '— (ručně přidaný řádek) —'}
              </span>
              {totalPhotos > 1 && (
                <span className="chip bg-primary-100 text-primary-700 font-black shrink-0">{currentPhotoIndex}/{totalPhotos}</span>
              )}
            </div>
            <div className="flex gap-2 text-xs items-center flex-wrap justify-end">
              {okCount > 0 && <span className="chip bg-success-100 text-success-700">{okCount} OK</span>}
              {lowCount > 0 && <span className="chip bg-warning-100 text-warning-700">{lowCount} doplnit</span>}
              {unknownCount > 0 && <span className="chip bg-danger-100 text-danger-700">{unknownCount} nerozpoznaných</span>}
              {dupCount > 0 && <span className="chip bg-primary-200 text-primary-700">{dupCount} duplikátů</span>}
              {dupOrders.length > 0 && <span className="chip bg-danger-100 text-danger-700 font-black"><AlertTriangle className="ikona-text" /> {dupOrders.length === 1 ? 'možný dupl. odběratel' : `${dupOrders.length} možní dupl. odběratelé`}</span>}
              <button className="btn-ghost !rounded text-xs !py-1 !px-2" onClick={addLine}>+ Přidat řádek</button>
              {pendingFiles.length > 0 && (
                <button className="btn-ghost !rounded text-xs !py-1 !px-2" onClick={() => { advanceToNextPhoto(); }}>⏭ Přeskočit fotku</button>
              )}
              <button className="btn-ghost !rounded text-xs !py-1 !px-2" onClick={() => { setParsed(null); setConfirmed(false); setPaused(true); }}>← Zpět na fotky</button>

            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
            {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded px-3 py-2">{err}</div>}

            {busy && pendingFiles.length > 0 && (
              <div className="bg-primary-900 text-primary-50 px-4 py-3 rounded flex items-center gap-3 shadow-md animate-pulse">
                <Spinner className="!text-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider opacity-75">Rozpoznávání na pozadí</div>
                  <div className="text-sm font-semibold truncate">
                    Čtu a zpracovávám fotku {currentPhotoIndex} z {totalPhotos} (zbývá {pendingFiles.length})...
                  </div>
                </div>
              </div>
            )}

            {dupOrders.length > 0 && (
            <div className="card !bg-danger-50 border-2 border-danger-300 p-4 space-y-3 shadow-sm rounded mb-3">
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none"><Siren className="ikona-text" /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-danger-700 text-sm sm:text-base">
                    {dupOrders.length === 1
                      ? <>Odběratel <span className="underline decoration-double underline-offset-2">{dupOrders[0].place}</span> se už v této relaci importoval!</>
                      : 'Na fotce je odběratel, který se už v této relaci importoval!'}
                  </div>
                  <p className="text-xs text-danger-600 mt-1 leading-relaxed">
                    Tahle fotka může obsahovat <strong>stejnou objednávku jako předchozí fotka</strong> (odběratel se shoduje).
                    Porovnej obě objednávky níže a potvrď, že to není duplicita.
                  </p>
                </div>
              </div>

              {dupOrders.map((w, wi) => (
                <div key={wi} className="rounded overflow-hidden border border-danger-200 bg-white/70">
                  <div className="px-3 py-1.5 bg-danger-100 text-danger-700 text-xs font-black flex items-center justify-between gap-2">
                    <span className="truncate">Odběratel: {w.place}</span>
                    <span className="font-normal opacity-70 shrink-0">datum: {w.curr.date || '—'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-danger-100">
                    <div className="p-3">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-success-700 mb-1.5">✔ Již importováno (předchozí fotka)</div>
                      {w.prev.items.length > 0 ? (
                        <ul className="space-y-1.5">
                          {w.prev.items.map((it, ii) => (
                            <li key={ii} className="text-xs font-mono text-neutral-700 flex items-baseline gap-1.5">
                              <span className="font-black text-success-700">{it.quantity}×</span>
                              <span className="min-w-0">{beers.find((b) => b.id === it.beer_id)?.name ?? it.beer_id}</span>
                              <span className="text-neutral-400">/</span>
                              <span>{packages.find((p) => p.id === it.package_id)?.label ?? it.package_id}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <div className="text-xs text-success-600 italic">—</div>}
                    </div>
                    <div className="p-3">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-danger-500 mb-1.5"><Camera className="ikona-text" /> Aktuální fotka</div>
                      {w.curr.items.length > 0 ? (
                        <ul className="space-y-1.5">
                          {w.curr.items.map((it, ii) => (
                            <li key={ii} className="text-xs font-mono text-neutral-700 flex items-baseline gap-1.5">
                              <span className="font-black text-danger-600">{it.quantity ?? '?'}×</span>
                              <span className="min-w-0">{it.beer_id ? beers.find((b) => b.id === it.beer_id)?.name ?? it.beer_id : '?'}</span>
                              <span className="text-neutral-400">/</span>
                              <span>{it.package_id ? packages.find((p) => p.id === it.package_id)?.label ?? it.package_id : '?'}</span>
                              {it.raw ? <span className="text-neutral-400 block truncate w-full" title={it.raw}>„{it.raw}“</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : <div className="text-xs text-danger-500 italic">—</div>}
                    </div>
                  </div>
                </div>
              ))}

              <label className="flex items-start gap-2.5 bg-white/80 border border-danger-200 rounded px-3 py-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dupOrdersConfirmed}
                  onChange={(e) => setDupOrdersConfirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-red-600"
                />
                <span className="text-xs font-bold text-danger-700 leading-snug">
                  Potvrzuji, že jsem porovnal/a obě objednávky. Nejde-li o duplicitu (odběratel má novou objednávku),
                  importuji ji vědomě. Pokud ano, opravím nebo odstraním řádky v kartách níže.
                </span>
              </label>
            </div>
          )}

            {dupCount > 0 && (
            <div className="card !bg-amber-50 border border-amber-300 p-3.5 text-xs text-amber-950 flex flex-col gap-1.5 shadow-xs rounded mb-3">
              <div className="font-extrabold text-amber-950 flex items-center gap-2 text-sm">
                <span className="text-base"><AlertTriangle className="ikona-text" /></span>
                <span>Detekována duplicitní položka / snímek obrazovky ({dupCount}×)</span>
              </div>
              <div className="text-amber-900 leading-relaxed">
                Tato položka se v objednávce/relaci již vyskytuje (např. při 2× vyfocení stejné obrazovky). Automaticky jsme ji přeskočili, aby se nepřidala dvakrát.
                Pokud ji přesto chceš importovat, klikni níže u dané karty na tlačítko <strong>„<Unlock className="ikona-text" /> Povolit import duplikátu“</strong>.
              </div>
            </div>
          )}
          {parsed.map((p, i) => (
              p.line._removed ? (
                <div key={i} className="rounded border-2 border-dashed border-primary-200 bg-primary-50/30 px-4 py-2 flex items-center justify-between text-xs text-primary-500">
                  <span>Řádek odstraněn (nebude se importovat)</span>
                  <button className="btn-ghost !rounded text-xs !py-1 !px-2" onClick={() => restoreLine(i)}>Vrátit</button>
                </div>
              ) : (
              <div
                key={i}
                id={`parsed-card-${i}`}
                onClick={() => {
                  setFocusedLine(i);
                  if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                }}
                className={`rounded border-2 overflow-hidden transition-all cursor-pointer ${
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
                    {(!p.duplicate || userAllowedDups.has(i)) && (
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
                  {(p.duplicate && !userAllowedDups.has(i)) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <span className="chip bg-amber-200 text-amber-950 font-bold"><AlertTriangle className="ikona-text" /> Duplikát — zřejmě vyfoceno 2x (přeskočeno)</span>
                        <button
                          type="button"
                          className="btn-secondary !py-1 !px-2.5 text-xs font-black text-amber-950 bg-amber-100 hover:bg-amber-200 border-amber-300 transition"
                          onClick={(e) => { e.stopPropagation(); toggleAllowDuplicate(i); }}
                        >
                          <Unlock className="ikona-text" /> Povolit import duplikátu
                        </button>
                      </div>
                    ) : (p.duplicate && userAllowedDups.has(i)) ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                        <span className="chip bg-success-100 text-success-800 font-bold"><Unlock className="ikona-text" /> Duplikát povolen pro import</span>
                        <button
                          type="button"
                          className="btn-ghost !rounded !py-1 !px-2 text-xs font-bold text-neutral-600 hover:text-neutral-900"
                          onClick={(e) => { e.stopPropagation(); toggleAllowDuplicate(i); }}
                        >
                          <Lock className="ikona-text" /> Zpět ignorovat
                        </button>
                      </div>
                    ) : p.line.confidence === 'high' ? (
                    <span className="chip bg-success-100 text-success-700">Rozpoznáno OK</span>
                  ) : p.line.confidence === 'unknown' ? (
                    <span className="chip bg-danger-100 text-danger-700">Nerozpoznaný řádek — doplň ručně</span>
                  ) : (
                    <span className="chip bg-warning-100 text-warning-700">Doplnit: {p.line.issues.join(', ')}</span>
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
                        className="input !py-2.5 sm:!py-1.5 text-sm sm:text-xs w-full"
                        value={p.line.place_name ?? ''}
                        placeholder="— (použít globálního odběratele) — nebo napiš nového"
                        onChange={(e) => updateLine(i, { place_name: e.target.value || null })}
                        onFocus={() => {
                          setFocusedLine(i);
                          if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                        }}
                      />
                      <datalist id={`place-list-${i}`}>
                        {places.map((pl) => <option key={pl.id} value={pl.name} />)}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.5fr_1.2fr_80px_auto] gap-3 items-end">
                      {/* Pivo */}
                      <div className="flex flex-col gap-0.5 min-w-0 col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Pivo</span>
                        <select
                          className="input !py-2.5 sm:!py-1.5 text-sm sm:text-xs w-full font-bold"
                          value={p.line.beer_id ?? ''}
                          onChange={(e) => updateLine(i, {
                            beer_id: e.target.value || null,
                            beer_name: beers.find((b) => b.id === e.target.value)?.name ?? null,
                          })}
                          onFocus={() => {
                            setFocusedLine(i);
                            if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                          }}
                        >
                          <option value="">— Vyber pivo —</option>
                          {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      {/* Obal */}
                      <div className="flex flex-col gap-0.5 min-w-0 col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Obal</span>
                        <select
                          className="input !py-2.5 sm:!py-1.5 text-sm sm:text-xs w-full font-bold"
                          value={p.line.package_id ?? ''}
                          onChange={(e) => updateLine(i, {
                            package_id: e.target.value || null,
                            package_label: packages.find((p2) => p2.id === e.target.value)?.label ?? null,
                          })}
                          onFocus={() => {
                            setFocusedLine(i);
                            if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                          }}
                        >
                          <option value="">— Vyber obal —</option>
                          {packages.map((p2) => <option key={p2.id} value={p2.id}>{p2.label}</option>)}
                        </select>
                      </div>
                      {/* Množství */}
                      <div className="flex flex-col gap-0.5 min-w-0 col-span-1">
                        <span className="text-[10px] uppercase tracking-wider text-primary-400 font-semibold">Množství</span>
                        <input
                          type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={0} className="input !py-2.5 sm:!py-1.5 text-sm font-black w-full"
                          value={p.line.quantity ?? ''}
                          onChange={(e) => updateLine(i, { quantity: e.target.value ? Number(e.target.value) : null })}
                          onFocus={() => {
                            setFocusedLine(i);
                            if (typeof p.line.photo_index === 'number') setActivePhotoIdx(p.line.photo_index);
                          }}
                        />
                      </div>
                      {/* Tlačítko odstranit */}
                      <div className="flex items-end col-span-1 justify-end">
                        <button
                          type="button"
                          className="w-10 h-10 rounded bg-danger-100 hover:bg-danger-200 text-danger-600 flex items-center justify-center transition text-base font-bold"
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
              <div className="text-sm text-danger-700 bg-danger-500/10 border border-danger-300 rounded px-3 py-2 font-medium">
                <AlertTriangle className="ikona-text" /> {err}
              </div>
            )}
            {skipReason && !err && (
              <div className="text-sm text-warning-700 bg-warning-500/10 border border-warning-300 rounded px-3 py-2 font-medium">
                <AlertTriangle className="ikona-text" /> {skipReason}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
              <button
                className="btn-primary !rounded"
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
                  if (dupOrders.length > 0 && !dupOrdersConfirmed) {
                    setErr('⚠️ Upozornění na možnou duplicitní objednávku: stejný odběratel se už v této relaci importoval. Porovnej obě objednávky nahoře a potvrď zaškrtnutím, že chceš pokračovat.');
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

}

// Session dedup key: the same order = customer + date + pivo + obal + mnozstvi.
function mkKey(place: string, d: string, beerId: string, pkgId: string, qty: number) {
  return [place || '', d || '', beerId || '', pkgId || '', String(qty ?? '')].join('|');
}

// Marks duplicate lines against the order's existing items AND against
// items already imported from previous photos in this session.
function markDuplicates(
  combined: ParsedLine[],
  seenKeys: Set<string>,
  existing: ExistingItem[],
  globalDate: string,
  globalPlace: string,
): { line: ParsedLine; duplicate: boolean }[] {
  const existingKeys = new Set(existing.map((e) => `${e.beer_id ?? ''}|${e.package_id ?? ''}|${e.quantity}`));
  return combined.map((line) => {
    const place = line.place_name?.trim() || globalPlace.trim() || '';
    const d = line.date || globalDate || '';
    const hasIds = line.beer_id != null && line.package_id != null && line.quantity != null;
    const sessionKey = mkKey(place, d, line.beer_id ?? '', line.package_id ?? '', line.quantity ?? 0);
    const inExisting = hasIds && existingKeys.has(`${line.beer_id}|${line.package_id}|${line.quantity}`);
    const duplicate = hasIds && (inExisting || seenKeys.has(sessionKey));
    return { line, duplicate };
  });
}
