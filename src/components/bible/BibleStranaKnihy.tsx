/**
 * 🖼️ Strana z knihy tak, jak vypadá v originále — s nákresy, tabulkami
 * a fotkami (4. 11. 2026: „přece jen text je takovej ne vše říkající").
 *
 * Vykresluje se z originálního PDF v úložišti bible; stahují se jen kousky
 * souboru potřebné pro tuhle stranu (lib/biblePdf.ts). Dokument zůstává
 * otevřený, dokud je čtečka na stejné knize — listování pak už jen dočítá
 * další kousky. S dodatkem od workeru (vyvážený strom stran) stačí na
 * otevření pár kousků i u knih, kde by pdf.js jinak četlo slovník každé
 * strany; kdyby si s ním pdf.js neporadilo, kniha se otevře znovu bez něj.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { odkazNaSoubor } from '../../lib/bibleKnihovnaApi';
import { ChybaStrany, meritkoStrany, otevriPdf, zdrojRozsahu, type ZdrojRozsahu } from '../../lib/biblePdf';

type Dokument = {
  id: string;
  ukol: PDFDocumentLoadingTask | null;
  pdf: Promise<PDFDocumentProxy>;
  /** Chyba přenosu — pdf.js o ní neví, proto se dokument zavře a ukáže se tahle hláška. */
  chyba: Error | null;
  zdroj: ZdrojRozsahu;
};

const PRIBLIZENI = [1, 1.5, 2, 3] as const;

/** Knihy, u kterých pdf.js s dodatkem selhalo — do zavření appky se otevírají bez něj. */
const bezDodatku = new Set<string>();

function otevri(id: string, velikost: number | null): Dokument {
  const sDodatkem = !bezDodatku.has(id);
  const zdroj = zdrojRozsahu((prvni) => odkazNaSoubor(id, prvni && sDodatkem));
  const dok: Dokument = { id, ukol: null, pdf: Promise.resolve(null as unknown as PDFDocumentProxy), chyba: null, zdroj };
  dok.pdf = (async () => {
    const ukol = await otevriPdf(zdroj, velikost, (e) => {
      if (dok.chyba) return;
      dok.chyba = e;
      void dok.ukol?.destroy();
    });
    dok.ukol = ukol;
    if (dok.chyba) {
      // Zavřený dokument odmítne svůj slib; čtenáři se má ukázat chyba přenosu, ne tahle.
      ukol.promise.catch(() => {});
      void ukol.destroy();
      throw dok.chyba;
    }
    return ukol.promise;
  })();
  // Zamítnutí si přečte až vykreslení; tady jen ať prohlížeč nehlásí „neošetřenou chybu".
  dok.pdf.catch(() => {});
  return dok;
}

function zavri(dok: Dokument | null) {
  if (dok?.ukol) void dok.ukol.destroy();
}

function hlaska(e: unknown, dok: Dokument | null): string {
  if (dok?.chyba) return dok.chyba instanceof ChybaStrany ? dok.chyba.message : 'Stranu se nepodařilo stáhnout.';
  if (e instanceof ChybaStrany) return e.message;
  return 'Stranu z originálu se nepodařilo vykreslit.';
}

export function BibleStranaKnihy({ id, pdfIndex, velikost, oznaceni }: {
  id: string;
  /** Číslo strany v PDF (od 1) — stejné jako list ve čtečce. */
  pdfIndex: number;
  /** Velikost souboru z knihovny — jen záloha, kdyby ji úložiště neřeklo. */
  velikost: number | null;
  /** Popis strany pro čtečky obrazovky („s. 12"). */
  oznaceni: string;
}) {
  const kontejner = useRef<HTMLDivElement>(null);
  const cil = useRef<HTMLDivElement>(null);
  const dokument = useRef<Dokument | null>(null);
  const [stav, setStav] = useState<{ druh: 'nacitam' } | { druh: 'hotovo' } | { druh: 'chyba'; zprava: string }>({ druh: 'nacitam' });
  const [priblizeni, setPriblizeni] = useState(0);
  const [sirka, setSirka] = useState(0);
  const [pokus, setPokus] = useState(0);

  // Šířka pro vykreslení: při otočení telefonu se strana vykreslí znovu.
  useEffect(() => {
    const el = kontejner.current;
    if (!el) return;
    const zmer = () => setSirka((s) => {
      const w = Math.round(el.clientWidth);
      return Math.abs(w - s) > 24 ? w : s;
    });
    zmer();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', zmer);
      return () => window.removeEventListener('resize', zmer);
    }
    const ro = new ResizeObserver(zmer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Jiná kniha = jiný dokument; při odchodu z čtečky se zavře (pracovní vlákno pdf.js).
  useEffect(() => () => { zavri(dokument.current); dokument.current = null; }, [id]);

  useEffect(() => {
    let platne = true;
    let ukol: RenderTask | null = null;
    setStav({ druh: 'nacitam' });
    let dok = dokument.current;
    if (!dok || dok.id !== id || dok.chyba) {
      zavri(dok);
      dok = otevri(id, velikost);
      dokument.current = dok;
    }
    const aktualni = dok;
    (async () => {
      try {
        const pdf = await aktualni.pdf;
        if (!platne) return;
        if (pdfIndex < 1 || pdfIndex > pdf.numPages) throw new ChybaStrany(`Originál má jen ${pdf.numPages} stran — tahle v něm není.`);
        const strana = await pdf.getPage(pdfIndex);
        if (!platne) return;
        const zaklad = strana.getViewport({ scale: 1 });
        const sirkaCss = Math.max(sirka || kontejner.current?.clientWidth || 0, 240) * PRIBLIZENI[priblizeni];
        const viewport = strana.getViewport({ scale: meritkoStrany(zaklad.width, zaklad.height, sirkaCss, window.devicePixelRatio) });
        // Kreslí se do nového plátna a vymění se až hotové — při listování zůstane
        // vidět předchozí strana, ne prázdné místo.
        const platno = document.createElement('canvas');
        platno.width = Math.max(1, Math.floor(viewport.width));
        platno.height = Math.max(1, Math.floor(viewport.height));
        ukol = strana.render({ canvas: platno, viewport });
        await ukol.promise;
        if (!platne) return;
        platno.style.width = `${Math.round(sirkaCss)}px`;
        platno.style.maxWidth = 'none';
        platno.style.height = 'auto';
        platno.setAttribute('role', 'img');
        platno.setAttribute('aria-label', `Strana z knihy: ${oznaceni}`);
        platno.className = 'block bg-white';
        cil.current?.replaceChildren(platno);
        setStav({ druh: 'hotovo' });
      } catch (e) {
        if (!platne) return;
        // pdf.js si s dodatkem neporadilo (ne přenos, ne chybějící strana):
        // hned znovu z holého originálu — jen pomaleji, jako dřív.
        if (!aktualni.chyba && !(e instanceof ChybaStrany) && aktualni.zdroj.sDodatkem() && !bezDodatku.has(id)) {
          bezDodatku.add(id);
          zavri(aktualni);
          if (dokument.current === aktualni) dokument.current = null;
          setPokus((p) => p + 1);
          return;
        }
        // Nesmí zůstat vidět předchozí strana pod číslem nové.
        cil.current?.replaceChildren();
        setStav({ druh: 'chyba', zprava: hlaska(e, aktualni) });
      }
    })();
    return () => {
      platne = false;
      ukol?.cancel();
    };
  }, [id, pdfIndex, velikost, sirka, priblizeni, pokus, oznaceni]);

  const zkusitZnovu = useCallback(() => {
    if (dokument.current) {
      zavri(dokument.current);
      dokument.current = null;
    }
    setPokus((p) => p + 1);
  }, []);

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-2 sm:p-3 space-y-2" aria-label={`Strana z knihy: ${oznaceni}`}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-wide text-neutral-300">Strana z knihy (originál)</div>
        <button type="button" className="btn-tmave w-11 px-0" aria-label="Zmenšit stranu" disabled={priblizeni === 0} onClick={() => setPriblizeni((p) => Math.max(0, p - 1))}>
          <ZoomOut size={18} />
        </button>
        <span className="w-12 text-center text-xs font-bold tabular-nums text-neutral-300" aria-live="polite">{Math.round(PRIBLIZENI[priblizeni] * 100)} %</span>
        <button type="button" className="btn-tmave w-11 px-0" aria-label="Zvětšit stranu" disabled={priblizeni === PRIBLIZENI.length - 1} onClick={() => setPriblizeni((p) => Math.min(PRIBLIZENI.length - 1, p + 1))}>
          <ZoomIn size={18} />
        </button>
      </div>
      <div ref={kontejner} className="relative overflow-x-auto rounded-lg bg-neutral-950">
        <div ref={cil} className={stav.druh === 'nacitam' ? 'opacity-50' : ''} />
        {stav.druh === 'nacitam' && (
          <div className="flex min-h-[10rem] items-center justify-center p-3 text-sm font-bold text-neutral-200" role="status">Načítám stranu z knihy…</div>
        )}
      </div>
      {stav.druh === 'chyba' && (
        <div role="alert" className="space-y-2">
          <div className="text-sm font-bold text-rose-300">{stav.zprava}</div>
          <button type="button" className="btn-tmave" onClick={zkusitZnovu}>Zkusit znovu</button>
        </div>
      )}
    </section>
  );
}

export default BibleStranaKnihy;
