import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import { potvrd } from '../lib/toast';
import { type TypZaznamu } from '../lib/fotkyZaznamu';
import { nactiFotky, nahrajFotku, smazFotku, type FotkaZaznamu } from '../lib/fotkyZaznamuApi';

/**
 * 📷 Fotky u jednoho zápisu — tlačítko „Fotka" a náhledy.
 *
 * Používá se u odpisu (zkažené, rozbitá láhev), u objednávky a u sudu.
 * Fotka se před nahráním zmenší v telefonu: snímek z mobilu má 4–8 MB a
 * po zmenšení kolem 200 kB — bez toho by se do sklepa s jedním pruhem
 * signálu nahrávala minuty a stejně by spadla.
 */

/** Nejdelší strana zmenšené fotky. Na doklad o rozbitém sudu to stačí. */
const MAX_STRANA = 1600;
const KVALITA = 0.82;

async function zmensiFotku(soubor: File): Promise<{ blob: Blob; mime: string }> {
  // Průhlednost u fotky z telefonu nehrozí, takže JPEG — PNG by u fotky
  // vyšel několikanásobně větší.
  const mime = 'image/jpeg';
  const bitmapa = await createImageBitmap(soubor);
  const meritko = Math.min(1, MAX_STRANA / Math.max(bitmapa.width, bitmapa.height));
  const sirka = Math.max(1, Math.round(bitmapa.width * meritko));
  const vyska = Math.max(1, Math.round(bitmapa.height * meritko));
  const platno = document.createElement('canvas');
  platno.width = sirka;
  platno.height = vyska;
  const ctx = platno.getContext('2d');
  if (!ctx) return { blob: soubor, mime: soubor.type || mime };
  ctx.drawImage(bitmapa, 0, 0, sirka, vyska);
  const blob = await new Promise<Blob | null>((hotovo) => platno.toBlob(hotovo, mime, KVALITA));
  bitmapa.close?.();
  return blob ? { blob, mime } : { blob: soubor, mime: soubor.type || mime };
}

export function FotkyZaznamu({ typ, zaznamId, kompaktni = false }: {
  typ: TypZaznamu;
  zaznamId: string;
  /** Jen ikona s počtem — pro řádek v seznamu, kde není místo. */
  kompaktni?: boolean;
}) {
  const [fotky, setFotky] = useState<FotkaZaznamu[]>([]);
  const [chybiTabulka, setChybiTabulka] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [otevreno, setOtevreno] = useState(!kompaktni);
  const [zvetsena, setZvetsena] = useState<string | null>(null);
  const vstupRef = useRef<HTMLInputElement | null>(null);

  async function nacti() {
    const { fotky: f, chybiTabulka: ch } = await nactiFotky(typ, zaznamId);
    setFotky(f);
    setChybiTabulka(ch);
  }

  useEffect(() => {
    let zruseno = false;
    if (!otevreno) return;
    void (async () => {
      const { fotky: f, chybiTabulka: ch } = await nactiFotky(typ, zaznamId);
      if (zruseno) return;
      setFotky(f);
      setChybiTabulka(ch);
    })();
    return () => { zruseno = true; };
  }, [typ, zaznamId, otevreno]);

  async function vyber(e: React.ChangeEvent<HTMLInputElement>) {
    const soubor = e.target.files?.[0];
    // Vstup se čistí vždycky, ať jde tu samou fotku zkusit znovu.
    e.target.value = '';
    if (!soubor) return;
    setNahravam(true);
    setChyba(null);
    try {
      const { blob, mime } = await zmensiFotku(soubor);
      const problem = await nahrajFotku(typ, zaznamId, blob, mime);
      if (problem) { setChyba(problem); return; }
      await nacti();
    } catch {
      setChyba('Fotku nešlo přečíst. Zkus ji vyfotit znovu.');
    } finally {
      setNahravam(false);
    }
  }

  async function smaz(f: FotkaZaznamu) {
    if (!(await potvrd('Smazat tuhle fotku?'))) return;
    const problem = await smazFotku(f);
    if (problem) { setChyba(problem); return; }
    await nacti();
  }

  if (chybiTabulka) {
    return kompaktni ? null : (
      <div className="text-[11px] font-semibold text-amber-800">
        Úložiště fotek ještě není nastavené (chybí migrace 20261228020000_fotky_zaznamu.sql).
      </div>
    );
  }

  if (kompaktni && !otevreno) {
    return (
      <button
        type="button"
        onClick={() => setOtevreno(true)}
        className="min-h-[44px] px-2.5 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black transition"
        title="Fotky k zápisu"
      >
        <span className="inline-flex items-center gap-1"><Camera size={16} /></span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => vstupRef.current?.click()}
          disabled={nahravam}
          className="px-3 py-1.5 rounded font-black text-xs transition bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-100 disabled:opacity-40"
        >
          <span className="inline-flex items-center gap-1.5">
            <Camera size={14} /> {nahravam ? 'Nahrávám…' : 'Přidat fotku'}
          </span>
        </button>
        {fotky.length > 0 && (
          <span className="text-[11px] font-bold text-neutral-600">{fotky.length} fotek u zápisu</span>
        )}
        <input
          ref={vstupRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => { void vyber(e); }}
          className="hidden"
        />
      </div>

      {chyba && (
        <div className="p-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold">
          {chyba}
        </div>
      )}

      {fotky.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fotky.map((f) => (
            <div key={f.id} className="relative">
              {f.url ? (
                <img
                  src={f.url}
                  alt={f.popis ?? 'Fotka k zápisu'}
                  // Náhledy se stahují ze storage. `lazy` je tu kvůli
                  // mobilním datům: u záznamu s deseti fotkami se jinak
                  // stáhne všech deset, i když je vidět první řádek.
                  loading="lazy"
                  decoding="async"
                  onClick={() => setZvetsena(f.url)}
                  className="w-20 h-20 object-cover rounded-xl border border-neutral-300 cursor-zoom-in"
                />
              ) : (
                <div className="w-20 h-20 grid place-items-center rounded-xl border border-neutral-300 bg-neutral-100 text-[11px] font-bold text-neutral-600 text-center px-1">
                  fotka se nenačetla
                </div>
              )}
              <button
                type="button"
                onClick={() => { void smaz(f); }}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 grid place-items-center rounded-full bg-white border border-neutral-300 text-rose-700 shadow-2xs"
                title="Smazat fotku"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Zvětšení na celou obrazovku — na náhledu 80 px se rozbitá láhev
          nepozná. */}
      {zvetsena && (
        <div
          className="fixed inset-0 z-[99999] bg-neutral-950/90 flex items-center justify-center p-4"
          onClick={() => setZvetsena(null)}
        >
          <img src={zvetsena} alt="Fotka k zápisu" className="max-h-full max-w-full rounded" />
          <button
            type="button"
            onClick={() => setZvetsena(null)}
            className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white text-neutral-900 shadow-lg"
            title="Zavřít"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
