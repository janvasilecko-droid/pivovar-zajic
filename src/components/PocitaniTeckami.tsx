import { useEffect, useRef, useState } from 'react';
import { Spinner } from './ui';
import { najdiVicka, poKlepnuti, STRANA_PRO_HLEDANI, type Tecka } from '../lib/pocitaniVicek';
import { rozmeryPoZmenseni } from '../lib/obrazek';

/**
 * Jak daleko od tečky (v pixelech obrazovky) ji ťuknutí ještě odebere. Bez lupy
 * jsou víčka plné palety na telefonu jen asi 20 px od sebe, proto je dosah
 * i tečka menší — jinak by ťuknutí mezi lahve odebralo sousední tečku.
 */
const DOSAH_PX = 16;
const DOSAH_BEZ_LUPY_PX = 10;
const LUPY = [1, 2, 3];

/**
 * 🔢 Počítání lahví tečkami na fotce.
 *
 * Program najde víčka sám (lib/pocitaniVicek.ts) a na každé položí tečku.
 * Obsluha vidí, co se započítalo: ťuknutím do prázdného místa lahev přidá,
 * ťuknutím na tečku ji odebere. Počet je součet teček — ověřený pohledem,
 * ne odhad, který nejde zkontrolovat.
 */
export function PocitaniTeckami({ src, onPotvrdit, onZrusit }: {
  /** Fotka jako data URL. */
  src: string;
  onPotvrdit: (pocet: number) => void;
  onZrusit: () => void;
}) {
  const [tecky, setTecky] = useState<Tecka[]>([]);
  /** Stavy před každou úpravou, pro krok zpět. */
  const [historie, setHistorie] = useState<Tecka[][]>([]);
  const [stav, setStav] = useState<'hledam' | 'hotovo' | 'nenalezeno'>('hledam');
  const [lupa, setLupa] = useState(1);
  const fotkaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let zruseno = false;
    setStav('hledam');
    setTecky([]);
    setHistorie([]);
    const img = new Image();
    img.onload = () => {
      if (zruseno) return;
      let nalezene: Tecka[] = [];
      try {
        const { sirka, vyska } = rozmeryPoZmenseni(img.naturalWidth, img.naturalHeight, STRANA_PRO_HLEDANI);
        const platno = document.createElement('canvas');
        platno.width = sirka;
        platno.height = vyska;
        const ctx = platno.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, sirka, vyska);
          nalezene = najdiVicka(ctx.getImageData(0, 0, sirka, vyska).data, sirka, vyska)
            .map((v, i) => ({ id: i + 1, x: v.x, y: v.y, rucni: false }));
        }
      } catch {
        // Hledání se nepovedlo (málo paměti na starém telefonu) — počítat ručně jde dál.
      }
      setTecky(nalezene);
      setStav(nalezene.length ? 'hotovo' : 'nenalezeno');
    };
    img.onerror = () => { if (!zruseno) setStav('nenalezeno'); };
    img.src = src;
    return () => { zruseno = true; };
  }, [src]);

  function zmen(nove: Tecka[]) {
    setHistorie((h) => [...h, tecky]);
    setTecky(nove);
  }

  function klepnuti(e: React.MouseEvent<HTMLDivElement>) {
    const r = fotkaRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height || stav === 'hledam') return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const dosah = lupa === 1 ? DOSAH_BEZ_LUPY_PX : DOSAH_PX;
    zmen(poKlepnuti(tecky, x, y, dosah / r.width, dosah / r.height));
  }

  function zpet() {
    if (!historie.length) return;
    setTecky(historie[historie.length - 1]);
    setHistorie((h) => h.slice(0, -1));
  }

  const rucnich = tecky.filter((t) => t.rucni).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-black text-neutral-900">
          Lahví: <span className="text-2xl font-mono" data-testid="pocet-tecek">{tecky.length}</span>
          {rucnich > 0 && <span className="text-udaj font-bold text-neutral-500"> (z toho {rucnich} přidáno ručně)</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setLupa(LUPY[(LUPY.indexOf(lupa) + 1) % LUPY.length])}>
            Lupa {lupa}×
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={zpet} disabled={!historie.length}>
            Krok zpět
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => zmen([])} disabled={!tecky.length}>
            Smazat tečky
          </button>
        </div>
      </div>

      <div className="text-udaj font-medium text-neutral-600 leading-snug">
        {stav === 'hledam' && <><Spinner /> Hledám víčka…</>}
        {stav === 'hotovo' && 'Zkontrolujte tečky: ťuknutím na lahev bez tečky ji přidáte, ťuknutím na tečku ji odeberete.'}
        {stav === 'nenalezeno' && 'Víčka se nepodařilo najít. Označte lahve ťuknutím do fotky.'}
      </div>

      <div className="overflow-auto max-h-[60vh] rounded border border-neutral-300 bg-neutral-950">
        <div
          ref={fotkaRef}
          className="relative cursor-crosshair select-none"
          style={{ width: `${lupa * 100}%` }}
          onClick={klepnuti}
          data-testid="fotka-s-teckami"
        >
          <img src={src} alt="Fotka palety s vyznačenými lahvemi" className="block w-full" draggable={false} />
          {tecky.map((t) => (
            <span
              key={t.id}
              data-testid="tecka"
              className={`absolute rounded-full border-2 pointer-events-none ring-1 ring-black ${lupa === 1 ? 'w-2.5 h-2.5 -ml-[5px] -mt-[5px]' : 'w-4 h-4 -ml-2 -mt-2'} ${t.rucni ? 'border-sky-400 bg-sky-400/30' : 'border-emerald-400 bg-emerald-400/30'}`}
              style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="text-udaj font-medium text-neutral-500 leading-snug">
        Foťte paletu shora. Ležící lahve a spodní vrstvu program nevidí — doplňte je ťuknutím nebo upravte počet v řádku po použití.
      </div>

      <div className="flex justify-end gap-1.5">
        <button type="button" className="btn-secondary btn-sm" onClick={onZrusit}>Zrušit</button>
        <button type="button" className="btn-primary btn-sm" onClick={() => onPotvrdit(tecky.length)} disabled={stav === 'hledam' || tecky.length === 0}>
          Použít počet ({tecky.length})
        </button>
      </div>
    </div>
  );
}
