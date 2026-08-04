import { useState, useRef } from 'react';
import { Modal } from './ui';
import { Beer, Package } from '../lib/supabase';
import { Camera, Upload, Sparkles, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

type RowInput = { beerId: string; pkgId: string; pkg2Id: string; pkg3Id: string; kegPkgId: string; kegQty: string; qty: string; qty2: string; qty3: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onApply: (rows: RowInput[], note?: string) => void;
};

export function BottlingFromImageModal({ isOpen, onClose, beers, packages, onApply }: Props) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<RowInput[] | null>(null);
  const [note, setNote] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const bottlePackages = packages.filter((p) => p.kind === 'bottle');
  const kegPackages = packages.filter((p) => p.kind === 'keg');

  const handleFileSelect = (file: File) => {
    setError(null);
    setParsedRows(null);
    setMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      const commaIdx = result.indexOf(',');
      if (commaIdx !== -1) {
        setBase64(result.slice(commaIdx + 1));
      } else {
        setBase64(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleParseImage = async () => {
    if (!base64) {
      setError('Vyber nejprve fotku stočení.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
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

      // Map parsed AI items to Bottling RowInput structure
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const rows: RowInput[] = [];

      for (const item of items) {
        const raw = item.raw_line || '';
        const itemBeerName = item.beer_name || '';
        const itemDegree = item.degree || '';
        const itemPkgLabel = item.package_label || '';
        const itemQty = item.quantity ? String(item.quantity) : '';

        // 1. Find Beer
        let matchedBeer = beers.find((b) => norm(b.name) === norm(itemBeerName));
        if (!matchedBeer && itemDegree) {
          matchedBeer = beers.find((b) => b.degree && norm(b.degree) === norm(itemDegree));
        }
        if (!matchedBeer && itemBeerName) {
          matchedBeer = beers.find((b) => norm(b.name).includes(norm(itemBeerName)) || norm(itemBeerName).includes(norm(b.name)));
        }

        // 2. Find Bottle Package
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

        // 3. Find Kegs / Sudy (ONLY if written on photo!)
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
          kegPkgId: kegPkgId, // Empty if not mentioned on photo!
          kegQty: kegQty,     // Empty if not mentioned on photo!
          qty: itemQty,
          qty2: '',
          qty3: '',
        });
      }

      // Consolidate items of same beer & keg into pkg1, pkg2, pkg3 slots of a single row
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

      setParsedRows(consolidatedRows);
      if (data?.raw_text) setNote(data.raw_text.slice(0, 100));
    } catch (err: any) {
      setError(err?.message ?? 'Nepodařilo se přečíst fotku stočení.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!parsedRows || !parsedRows.length) return;
    onApply(parsedRows, note);
    onClose();
  };

  return (
    <Modal open={isOpen} title="📷 Zadání stočení lahví podle fotky" onClose={onClose}>
      <div className="space-y-4">
        {/* Upload / Camera Dropzone */}
        {!imagePreview ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-primary-300 hover:border-primary-500 bg-primary-50/50 hover:bg-primary-50 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
          >
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-700">
              <Camera size={28} />
            </div>
            <div>
              <p className="font-bold text-primary-900 text-sm">Vyfoť nebo nahraj fotku výkazu stočení</p>
              <p className="text-xs text-primary-600 mt-1">Vyfoť mobilní tabulku, papír nebo výkaz stočení do lahví</p>
            </div>
            <button type="button" className="btn-secondary !py-1.5 !px-4 text-xs font-bold mt-2 flex items-center gap-2">
              <Upload size={14} /> Vybrat fotku
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-neutral-200 bg-black/5 max-h-56 flex items-center justify-center">
              <img src={imagePreview} alt="Fotka stočení" className="max-h-56 object-contain" />
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  setBase64(null);
                  setParsedRows(null);
                }}
                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 text-xs transition flex items-center gap-1 px-2.5 font-bold"
              >
                <RefreshCw size={12} /> Změnit fotku
              </button>
            </div>

            {!parsedRows && !loading && (
              <button
                type="button"
                onClick={handleParseImage}
                className="w-full btn-primary py-3 text-sm font-black shadow-md flex items-center justify-center gap-2"
              >
                <Sparkles size={18} /> Přečíst fotku stočení pomocí AI
              </button>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="card p-6 text-center space-y-3 bg-primary-50/60 border border-primary-200">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
            <p className="font-bold text-primary-900 text-sm">Přečítám záznam stočení z fotky…</p>
            <p className="text-xs text-primary-700">Identifikuji piva, obaly a počty kusů lahví.</p>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 font-medium">
            <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Nepodařilo se přečíst fotku</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Parsed Rows Preview Table */}
        {parsedRows && parsedRows.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-primary-950 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600" /> Načtené položky z fotky ({parsedRows.length})
              </h4>
              <span className="text-[11px] font-semibold text-neutral-500">
                Chybějící KEGy zůstaly prázdné — doplň je v tabulce.
              </span>
            </div>

            <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 border-b border-neutral-200 font-bold text-neutral-700">
                  <tr>
                    <th className="p-2.5">Pivo (Druh)</th>
                    <th className="p-2.5">Obal</th>
                    <th className="p-2.5 text-right">Počet (ks)</th>
                    <th className="p-2.5 text-center">KEG sud (Zdroj)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {parsedRows.map((r, i) => {
                    const b = beers.find((x) => x.id === r.beerId);
                    const p = packages.find((x) => x.id === r.pkgId);
                    const kegP = kegPackages.find((x) => x.id === r.kegPkgId);

                    return (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="p-2.5 font-bold text-primary-900">
                          {b ? b.name : <span className="text-rose-600 font-normal">Vyber pivo…</span>}
                        </td>
                        <td className="p-2.5 text-neutral-800">
                          {p ? p.label : <span className="text-neutral-400">Lahve</span>}
                        </td>
                        <td className="p-2.5 text-right font-black text-primary-950">
                          {r.qty || '0'} ks
                        </td>
                        <td className="p-2.5 text-center">
                          {r.kegQty ? (
                            <span className="chip bg-amber-100 text-amber-900 font-bold text-[11px]">
                              {r.kegQty}x {kegP?.label ?? 'KEG'}
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px] italic">
                              (nepoznáno — doplň ručně)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={onClose}>
                Zrušit
              </button>
              <button
                type="button"
                className="btn-primary py-2.5 px-5 text-xs font-black shadow-md flex items-center gap-2"
                onClick={handleApply}
              >
                ✓ Vložit do tabulky stočení
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
