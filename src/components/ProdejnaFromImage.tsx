import { useState, useRef, useEffect } from 'react';
import { Modal } from './ui';
import type { Beer, Package } from '../lib/supabase';
import { authenticatedFunctionHeaders } from '../lib/functionAuth';
import { AlertCircle, Camera, Check, Folder, Hourglass, Sparkles, Upload } from 'lucide-react';

type PhotoEntry = { dataUrl: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onTextExtracted: (text: string) => void;
};

export function ProdejnaFromImage({ isOpen, onClose, beers, packages, onTextExtracted }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [textMap, setTextMap] = useState<Record<number, string>>({});
  const [ocrText, setOcrText] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

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
      if (files.length) loadMultipleFiles(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, busy]);

  // Auto-open gallery on initial open if no photos loaded
  useEffect(() => {
    if (isOpen && photos.length === 0) {
      const timer = setTimeout(() => { if (fileRef.current && photos.length === 0) { fileRef.current.click(); } }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Trigger OCR automatically when activeIndex changes or new photo loaded
  useEffect(() => {
    if (!photos.length || busy) return;
    if (textMap[activeIndex] !== undefined) {
      setOcrText(textMap[activeIndex]);
      return;
    }
    const currentPhoto = photos[activeIndex];
    if (!currentPhoto) return;
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
      reader.onerror = () => {
        setErr('Nelze načíst obrázek: ' + f.name);
        setBusy(false);
      };
      reader.readAsDataURL(f);
    });
  };

  const handleFile = (file: File) => {
    loadMultipleFiles([file]);
  };

  const runOcrFromBase64 = async (base64: string, mimeType: string, targetIdx = activeIndex) => {
    setBusy(true);
    setErr(null);
    try {
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
      let extracted = '';
      if (items.length) {
        const lines = items.map((it) => {
          const parts: string[] = [];
          if (it.quantity != null && it.quantity !== '') parts.push(String(it.quantity) + 'x');
          if (it.beer_name) parts.push(it.beer_name);
          if (it.package_label) parts.push(it.package_label);
          return parts.join(' ') || it.raw_line || '';
        }).filter(Boolean);
        extracted = lines.join('\n');
      } else {
        extracted = data?.raw_text || '';
      }

      setOcrText(extracted);
      setTextMap((prev) => ({ ...prev, [targetIdx]: extracted }));
    } catch (e: any) {
      setErr('Čtení z fotky selhalo: ' + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentAndNext = () => {
    const updatedMap = { ...textMap, [activeIndex]: ocrText };
    setTextMap(updatedMap);

    if (activeIndex < photos.length - 1) {
      const nextIdx = activeIndex + 1;
      setActiveIndex(nextIdx);
      if (updatedMap[nextIdx] !== undefined) {
        setOcrText(updatedMap[nextIdx]);
      } else {
        setOcrText('');
      }
    } else {
      applyAll(updatedMap);
    }
  };

  const applyAll = (finalMap = textMap) => {
    const updatedMap = { ...finalMap, [activeIndex]: ocrText };
    const allTexts: string[] = [];
    Object.values(updatedMap).forEach((txt) => {
      if (txt && txt.trim()) allTexts.push(txt.trim());
    });
    if (allTexts.length) {
      onTextExtracted(allTexts.join('\n'));
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal open onClose={onClose} title="Číst z fotky / fotoaparátu (Fasování, Odchod, Prodejna)" wide>
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3 items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) loadMultipleFiles(files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
              className="hidden"
            />
            <button className="btn-primary !rounded flex items-center gap-2" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <Camera size={16} /> <Camera className="ikona-text" /> Spustit fotoaparát
            </button>
            <button
              className="btn-secondary flex items-center gap-2 border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload size={16} /> <Folder className="ikona-text" /> Vybrat fotku / fotky z galerie
            </button>
          </div>
          <span className="text-[11px] text-neutral-500">
            <Camera className="ikona-text" /> Můžete vybrat i <strong>více fotek najednou</strong> (např. 30 snímků). Systém je projde postupně po sobě a vše sloučí do tabulky.
          </span>
        </div>

        {photos.length > 1 && (
          <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded border border-amber-300 text-xs font-semibold text-amber-950 shadow-xs">
            <button
              type="button"
              className="btn-secondary !py-1 !px-2 text-xs"
              onClick={() => {
                setTextMap((prev) => ({ ...prev, [activeIndex]: ocrText }));
                const prevIdx = Math.max(0, activeIndex - 1);
                setActiveIndex(prevIdx);
                setOcrText(textMap[prevIdx] ?? '');
              }}
              disabled={activeIndex === 0 || busy}
            >
              ◀ Předchozí fotka
            </button>
            <span className="font-extrabold text-xs sm:text-sm">
              <Camera className="ikona-text" /> Fotka {activeIndex + 1} z {photos.length} {photos[activeIndex]?.name ? `(${photos[activeIndex].name})` : ''}
            </span>
            <button
              type="button"
              className="btn-secondary !py-1 !px-2 text-xs"
              onClick={() => {
                setTextMap((prev) => ({ ...prev, [activeIndex]: ocrText }));
                const nextIdx = Math.min(photos.length - 1, activeIndex + 1);
                setActiveIndex(nextIdx);
                setOcrText(textMap[nextIdx] ?? '');
              }}
              disabled={activeIndex === photos.length - 1 || busy}
            >
              Další fotka ▶
            </button>
          </div>
        )}

        {busy && <div className="text-xs text-neutral-500 animate-pulse"><Hourglass className="ikona-text" /> Čtu text z fotky {activeIndex + 1}/{photos.length || 1}…</div>}
        {err && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          <div className="border border-neutral-200 rounded overflow-hidden bg-neutral-50 min-h-[220px] flex flex-col">
            {photos[activeIndex] ? (
              <img src={photos[activeIndex].dataUrl} alt="foto" className="w-full flex-1 object-contain max-h-[380px] touch-pan-x touch-pan-y" />
            ) : (
              <div className="flex-1 grid place-items-center text-neutral-400 text-xs p-6 text-center">
                <span>Vyberte fotku — náhled se zobrazí zde.</span>
              </div>
            )}
          </div>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-primary-600" />
              <h3 className="text-sm font-black text-neutral-900">
                Přečtený text fotky {activeIndex + 1}/{photos.length || 1}
              </h3>
            </div>
            <textarea
              className="input text-xs font-mono w-full min-h-[220px] resize-y leading-relaxed"
              value={ocrText}
              onChange={(e) => {
                setOcrText(e.target.value);
                setTextMap((prev) => ({ ...prev, [activeIndex]: e.target.value }));
              }}
              placeholder="Po načtení fotky se zde objeví přepsaný text. Můžete ho opravit a pak vložit."
            />
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-100">
              <button type="button" className="btn-ghost !rounded text-xs" onClick={onClose}>Zrušit</button>
              <button
                type="button"
                className="btn-primary !rounded py-2.5 px-5 text-xs font-black shadow-md flex items-center gap-2"
                onClick={saveCurrentAndNext}
                disabled={busy}
              >
                <Check size={14} />
                {activeIndex < photos.length - 1
                  ? `Vložit a další fotka (${activeIndex + 2}/${photos.length}) ▶`
                  : `Vložit VŠECHNO do tabulky (${photos.length || 1} fotek)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
