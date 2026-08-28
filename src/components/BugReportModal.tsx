import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Modal } from './ui';
import { Bug, Camera, Check, Image as ImageIcon, Lightbulb, Loader2 } from 'lucide-react';

type Category = 'bug' | 'feature' | 'question' | 'other';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const { profile, user } = useAuth();
  const [category, setCategory] = useState<Category>('bug');
  const [defectType, setDefectType] = useState('Chybný stav skladu');
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commonDefects = [
    'Chybný stav skladu',
    'Chyba při ukládání / načítání',
    'Nesedí data v objednávce',
    'Aplikace se seká / neodpovídá',
    'Nápad na nové vylepšení',
    'Jiná závada (popište níže)'
  ];

  function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800; // Resize large photos to max 800px width/height
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6)); // Compress with 60% quality
        };
        img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Chyba při čtení souboru.'));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      setBusy(true);
      const compressed = await compressImage(file);
      setPhotoDataUrl(compressed);
    } catch (error: any) {
      setErr(error.message || 'Chyba při zpracování fotky.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    
    const finalTitle = customTitle.trim() || (category === 'bug' ? defectType : 'Návrh / Vylepšení');
    if (!finalTitle) {
      setErr('Zadejte prosím předmět.');
      return;
    }

    setBusy(true);
    try {
      // Body will contain custom description + base64 image identifier
      let finalBody = description.trim();
      if (photoDataUrl) {
        finalBody += (finalBody ? '\n\n' : '') + `[FOTO]:${photoDataUrl}`;
      }

      const { error } = await supabase.from('feedback_notes').insert({
        title: finalTitle,
        body: finalBody || null,
        category,
        author_name: profile?.display_name ?? user?.email ?? 'Uživatel',
        status: 'open'
      });

      if (error) throw error;
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
        // Reset state
        setCategory('bug');
        setDefectType('Chybný stav skladu');
        setCustomTitle('');
        setDescription('');
        setPhotoDataUrl(null);
        setSuccess(false);
      }, 1500);
    } catch (error: any) {
      setErr(error.message || 'Nepodařilo se odeslat hlášení.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Nahlásit chybu / vylepšení">
      {success ? (
        <div className="text-center py-8 space-y-3 animate-fade-in">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto border border-emerald-200">
            <Check size={28} />
          </div>
          <h4 className="font-bold text-emerald-950 text-base">Hlášení odesláno!</h4>
          <p className="text-xs text-neutral-600">Děkujeme, zprávu najdete v přehledu poznámek.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {err && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {err}
            </div>
          )}

          <div>
            <label className="label">Kategorie</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCategory('bug')}
                className={`py-2 px-3 rounded text-xs font-black border text-center transition ${
                  category === 'bug'
                    ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-2xs'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Bug className="ikona-text" /> Chyba / Vada
              </button>
              <button
                type="button"
                onClick={() => setCategory('feature')}
                className={`py-2 px-3 rounded text-xs font-black border text-center transition ${
                  category === 'feature'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Lightbulb className="ikona-text" /> Vylepšení
              </button>
            </div>
          </div>

          {category === 'bug' ? (
            <div>
              <label className="label">O co se jedná?</label>
              <select
                value={defectType}
                onChange={(e) => setDefectType(e.target.value)}
                className="input w-full"
              >
                {commonDefects.map((def) => (
                  <option key={def} value={def}>{def}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">Předmět nápadu / vylepšení</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Např. Přidat rychlé vyhledávání piv"
                className="input w-full"
                maxLength={80}
                required
              />
            </div>
          )}

          {category === 'bug' && (
            <div>
              <label className="label">Doplňující název chyby (nepovinné)</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Např. Nejde smazat závoz z pondělí"
                className="input w-full"
                maxLength={80}
              />
            </div>
          )}

          <div>
            <label className="label">Podrobný popis</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Popište prosím co nejdetailněji, co nefunguje, nebo jaký máte nápad..."
              className="input w-full"
              rows={3}
              maxLength={1000}
              required
            />
          </div>

          <div>
            <label className="label">Fotka z galerie / fotoaparátu (nepovinné)</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-4 rounded border border-neutral-200 bg-white hover:bg-neutral-50 font-black text-xs text-neutral-800 flex items-center gap-2 transition"
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <ImageIcon size={16} />}
                Vybrat fotku
              </button>
              {photoDataUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(null)}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Odebrat fotku
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            {photoDataUrl && (
              <div className="mt-2 rounded overflow-hidden border border-neutral-200 max-h-32 flex items-center justify-center bg-neutral-50 relative">
                <img src={photoDataUrl} alt="Náhled přílohy" className="object-contain max-h-32" />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={busy}
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="btn-primary !rounded flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 border-rose-500"
              disabled={busy}
            >
              {busy && <Loader2 className="animate-spin" size={14} />}
              Odeslat hlášení
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
