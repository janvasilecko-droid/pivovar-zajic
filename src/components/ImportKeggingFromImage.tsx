import { useState, useRef, useEffect } from 'react';
import { Modal } from './ui';
import { PhotoReviewPane } from './PhotoReviewPane';
import { ImageEditorOverlay } from './ImageEditor';
import PrepinacOrezu, { useOrezFotky } from './PrepinacOrezu';
import PanelTabulky from './PanelTabulky';
import RadekTabulkyInfo from './RadekTabulkyInfo';
import { useTabulkaZFotky, type RezimCteni } from '../lib/useTabulkaZFotky';
import { radkyObalyZTabulky } from '../lib/tabulkaStaceni';
import { dnyRadku, souhrnDnu } from '../lib/zapisPoDnech';
import type { Beer, Package } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { typObrazku, zmensenyDataUrl } from '../lib/obrazek';
import { AlertCircle, AlertTriangle, Beer as BeerIcon, Camera, Plus, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { IkonaSud } from '../components/ikony';
import { businessDateISO } from '../lib/businessDate';

type KegRow = {
  beerId: string; pkgId: string; qty: string; _removed?: boolean; _manual?: boolean;
  /** Jen řádky z tabulky z Excelu: den, číslo řádku excelu, text z buňky Pivo a co zkontrolovat. */
  datum?: string | null; cisloRadku?: number | null; pivoText?: string | null; varovani?: string[];
  /** Den, jak stál v tabulce — podle něj se řádky filtrují při výběru dne; `datum` se smí přepsat. */
  denZTabulky?: string | null;
};
type PhotoEntry = { dataUrl: string; name: string; soubor?: File };

/**
 * Řádek ve tvaru, který čeká formulář — bez údajů, které patří jen k tomuhle oknu.
 * Den řádku (`datum`) zůstává: z víc dnů tabulky se řádky zapíšou každý na svůj den
 * (screens/Kegging.tsx, lib/zapisPoDnech.ts).
 */
const naFormular = ({ cisloRadku: _c, pivoText: _p, varovani: _v, denZTabulky: _z, ...zbytek }: KegRow): KegRow => zbytek;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onImport: (rows: KegRow[], date: string, note: string) => void;
  /** Datum posledního zápisu stáčení KEG v aplikaci — čtení tabulky začne dnem po něm. */
  posledniZapis?: string | null;
};

const KEG_SIZES = [50, 30, 20, 15, 10];

export function ImportKeggingFromImage({ isOpen, onClose, beers, packages, onImport, posledniZapis }: Props) {
  const today = businessDateISO();
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
  const [editBeforeOcr, setEditBeforeOcr] = useOrezFotky();
  // 📊 Fotka je tabulka z Excelu: čtení od zvoleného data bez ořezávání (15. 10. 2026).
  // Víc dnů v tabulce se vloží NAJEDNOU: každý řádek nese svůj den (`datum`) a Stáčení KEG
  // ho zapíše na ten den (16. 10. 2026: „udělej to pro všechno“).
  const t = useTabulkaZFotky({ klic: 'keg', vychoziRezim: 'seznam', posledniZapis, vsechnyDny: true });
  /** Kolik řádků tabulky se přeskočilo, protože mají jen lahve (tady se čtou sudy). */
  const [preskoceno, setPreskoceno] = useState(0);

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
    // (U tabulky se neořezává — ořízne se sama podle data.)
    if (editBeforeOcr && !t.zapnuto && !upraveno[activeIndex] && !editingImage) {
      setEditingImage(currentPhoto.dataUrl);
      return;
    }
    void precti(activeIndex, currentPhoto);
  }, [photos, activeIndex]);

  // Fotka z mobilu má klidně 4–8 MB — jako nezmenšený data URL appku na
  // telefonu spolehlivě sekla (stejný bug jako u stáčení lahví, viz
  // ImportBottlingFromImage.tsx). zmensenyDataUrl ji zmenší na rozumnou
  // velikost, stejně jako FotkyZaznamu.tsx dělá pro nahrávání do úložiště.
  const loadMultipleFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const loaded: PhotoEntry[] = await Promise.all(
        files.map(async (f) => ({ dataUrl: await zmensenyDataUrl(f), name: f.name, soubor: f })),
      );
      setPhotos((prev) => [...prev, ...loaded]);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (file: File) => {
    loadMultipleFiles([file]);
  };

  /** Přečte fotku podle zvoleného režimu: tabulka z Excelu, nebo seznam / zpráva (jak to bylo dřív). */
  const precti = async (idx: number, foto: PhotoEntry, rezim: RezimCteni = t.rezim) => {
    if (rezim === 'tabulka') return runTabulka(idx, foto);
    return runOcrFromBase64(foto.dataUrl.split(',')[1] ?? '', typObrazku(foto.dataUrl), idx);
  };

  /** Tabulka z Excelu: výřez od zvoleného data, sloupce sudů → řádky pivo + sud + počet. */
  const runTabulka = async (idx: number, foto: PhotoEntry) => {
    setBusy(true);
    setProgress(20);
    setErr(null);
    setEntryRows(null);
    setPreskoceno(0);
    try {
      setProgress(40);
      // Jen aktivní piva — v nabídce řádku jiná nejsou, neaktivní by se spárovalo „naslepo“.
      const v = await t.cti(idx, foto, beers.filter((b) => b.is_active));
      if (v.stav === 'chyba') throw new Error(v.zprava);
      if (v.stav === 'nic-od-data') {
        setRowsMap((prev) => { const { [idx]: _x, ...zbytek } = prev; return zbytek; });
        return; // vysvětlení i tlačítko na poslední datum jsou v panelu nad fotkou
      }
      const prevod = radkyObalyZTabulky(v.radky, packages, { sudy: true, lahve: false });
      if (prevod.radky.length === 0) {
        throw new Error('Z tabulky se od zvoleného data nepodařilo přečíst žádné sudy.');
      }
      setProgress(85);
      const rows: KegRow[] = prevod.radky.map((r) => ({ ...r, denZTabulky: r.datum ?? null }));
      setPreskoceno(prevod.preskoceno);
      setEntryRows(rows);
      setRowsMap((prev) => ({ ...prev, [idx]: rows }));
      setProgress(100);
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
      processingRef.current = false;
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
      // Přečtený text fotky se do poznámky už NEDÁVÁ (1. 10. 2026): uložil
      // se ke každému řádku a v Pohybech pak u 12° Světlé stálo „11 Jantar…"
      // — začátek fotky, ne poznámka k tomu stáčení.
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
  // 📊 Tabulka z Excelu: den se dá zúžit klepnutím na něj; jinak jdou všechny dny najednou.
  const viditelny = (r: KegRow) => !t.zapnuto || t.vybranyDen === undefined || !!r._manual || (r.denZTabulky ?? r.datum ?? null) === t.vybranyDen;

  /** Kolik řádků z kolika dnů se vloží (řádky z tabulky mají každý svůj den). */
  const rozsahVlozeni = () => {
    const vse = Object.values({ ...rowsMap, [activeIndex]: entryRows ?? [] }).flat().filter((r) => viditelny(r) && !r._removed);
    return { radku: vse.length, dnu: dnyRadku(vse).length };
  };

  // Datum stočení je den z tabulky (obsluha ho může dál přepsat).
  useEffect(() => {
    if (t.zapnuto && typeof t.vybranyDen === 'string') setDate(t.vybranyDen);
  }, [t.vybranyDen, t.zapnuto]);

  /** Přepnutí seznam ↔ tabulka: řádky z druhého režimu neplatí, fotka se přečte znovu. */
  const zmenRezim = (r: RezimCteni) => {
    t.setRezim(r);
    t.zapomen();
    setRowsMap({});
    setEntryRows(null);
    setErr(null);
    setPreskoceno(0);
    const foto = photos[activeIndex];
    if (foto) void precti(activeIndex, foto, r);
  };

  /** Změněné datum „číst od": fotka se přečte znovu (přepis Vision se nedělá podruhé). */
  const prectiZnovuTabulku = () => {
    const foto = photos[activeIndex];
    if (!foto) return;
    setRowsMap((prev) => { const { [activeIndex]: _x, ...zbytek } = prev; return zbytek; });
    void precti(activeIndex, foto);
  };

  const applyAll = () => {
    const updatedMap = { ...rowsMap, [activeIndex]: entryRows ?? [] };
    const allRows: KegRow[] = [];
    const bezPiva: number[] = [];
    Object.values(updatedMap).forEach((rList) => {
      rList.filter(viditelny).forEach((r, i) => {
        if (r._removed) return;
        if (!r.beerId) { bezPiva.push(i + 1); return; }
        allRows.push(naFormular(r));
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
    if (foto) void precti(idx, foto);
  };
  // Upravená fotka nahradí JEN tu právě otevřenou (dřív přepsala celé pole).
  const onEditorConfirm = (editedDataUrl: string) => {
    const idx = activeIndex;
    setEditingImage(null);
    setUpraveno((prev) => ({ ...prev, [idx]: true }));
    setPhotos((prev) => prev.map((f, i) => (i === idx ? { ...f, dataUrl: editedDataUrl, soubor: undefined } : f)));
    t.zapomen(idx); // fotka je jiná — přepis a zmenšení ze starého souboru neplatí
    void precti(idx, { dataUrl: editedDataUrl, name: photos[idx]?.name ?? '' });
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
                <label className="label" htmlFor="staceni-keg-datum">Datum stočení</label>
                <input id="staceni-keg-datum" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                {t.zapnuto && (
                  <p className="text-udaj text-neutral-600 mt-1">Řádky z tabulky mají každý svůj den. Tohle datum platí pro ručně přidané řádky a pro řádky bez data.</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="label">Poznámka k šarži</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="např. šarže 12 ležák z ležáckého tanku 4..." />
              </div>
            </div>
          </div>

          {/* 📊 Fotka je tabulka z Excelu? Číst od data, bez ořezávání. */}
          <PanelTabulky
            t={t}
            info={t.info[Math.min(activeIndex, Math.max(0, photos.length - 1))]}
            jeFotka={photos.length > 0}
            bezi={busy}
            onPrecist={prectiZnovuTabulku}
            onRezim={zmenRezim}
            nazev="sloupce sudů"
          />
          {t.zapnuto && preskoceno > 0 && (
            <div className="text-udaj text-neutral-600">V tomhle okně se čtou jen sloupce sudů — {preskoceno === 1 ? '1 řádek jen s lahvemi se přeskočil' : `${preskoceno} řádků jen s lahvemi se přeskočilo`}.</div>
          )}

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
              {!t.zapnuto && <PrepinacOrezu zapnuto={editBeforeOcr} onZmena={setEditBeforeOcr} />}
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
                <PhotoReviewPane photos={photos} activeIndex={Math.min(activeIndex, Math.max(0, photos.length - 1))} onChangeIndex={goToPhoto} onOrez={busy ? undefined : () => { const f = photos[activeIndex]; if (f) setEditingImage(f.dataUrl); }} />
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
                        {err ? 'Z fotky se nepodařilo nic přečíst.' : t.zapnuto && t.info[Math.min(activeIndex, Math.max(0, photos.length - 1))]?.stav === 'nic-od-data' ? 'V tabulce od zvoleného data nic není.' : 'Fotka zatím není přečtená.'}
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary !rounded text-xs"
                          onClick={() => {
                            const foto = photos[activeIndex];
                            if (!foto) return;
                            void precti(activeIndex, foto);
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
                  {entryRows.map((r, i) => (!viditelny(r) ? null : (
                    <div key={i} className={`p-3 rounded border-2 transition-all ${r._removed ? 'bg-neutral-100/70 border-neutral-200 opacity-60' : 'bg-white border-neutral-200 hover:border-neutral-300'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-neutral-100">
                        <span className="text-udaj font-black uppercase text-neutral-500">Řádek #{entryRows.slice(0, i).filter(viditelny).length + 1}</span>
                        {r._removed ? (
                          <button type="button" onClick={() => updateLine(i, { _removed: false })} className="text-xs font-bold text-primary-600 flex items-center gap-1"><RotateCcw size={12} /> Obnovit</button>
                        ) : (
                          <button type="button" onClick={() => updateLine(i, { _removed: true })} className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"><Trash2 size={12} /> Odstranit</button>
                        )}
                      </div>
                      {!r._removed && r.cisloRadku !== undefined && (
                        <div className="mb-2">
                          <RadekTabulkyInfo cisloRadku={r.cisloRadku} datum={r.datum} pivoText={r.pivoText} varovani={r.varovani} onDatum={(den) => updateLine(i, { datum: den })} />
                        </div>
                      )}
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
                  )))}
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
              : rozsahVlozeni().dnu > 1
                ? `Vložit ${souhrnDnu(rozsahVlozeni().radku, rozsahVlozeni().dnu)} do stáčení KEG${photos.length > 1 ? ` (${photos.length} fotek)` : ''}`
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
        <ImageEditorOverlay src={editingImage} onConfirm={onEditorConfirm} onCancel={onEditorCancel} />
      )}
    </>
  );
}
