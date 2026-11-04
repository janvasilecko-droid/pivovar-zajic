// 📝 Přehled tématu: Claude porovnal, co o tématu píšou knihy, s odkazy na stránky.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026: „napíšeš to nejlepší o chmelovaru … s tím, že tam budou
// odkazy na knihy". Citace [n] v textu i seznam zdrojů dole otevřou čtečku na
// té stránce. Text se skládá z dat (lib/bibleText.ts), nikdy přes innerHTML.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { nactiPrehled, type PrehledTematu, type ZdrojPrehledu } from '../../lib/bibleHledaniApi';
import { rozlozText } from '../../lib/bibleText';
import { TextListuKnihy, VykresleniTextu } from './BibleKniha';

const misto = (z: ZdrojPrehledu) => (z.tistena ? `s. ${z.tistena}` : `list ${z.pdfIndex}`);

const SKUPINA_CITACI = /\[((?:\s*(?:zdroje?|zdrojích|viz|č\.)\s*)?\d{1,3}(?:\s*(?:,|;|–|-|\ba\b|\band\b)\s*\d{1,3})+\s*|\s*(?:zdroje?|zdrojích|viz|č\.)\s*\d{1,3}\s*)\]/gi;

/** [2, 5] / [2–4] / [zdroj 2] → [2][5] / [2][3][4] / [2] (stejně jako worker, prehledy.normalizuj_citace). */
export function normalizujCitace(text: string): string {
  return text.replace(SKUPINA_CITACI, (celek: string, obsah: string) => {
    const cisla: number[] = [];
    for (const cast of obsah.replace(/zdrojích|zdroje?|viz|č\./gi, '').trim().split(/\s*(?:,|;|\ba\b|\band\b)\s*/)) {
      const rozsah = /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.exec(cast);
      if (rozsah) {
        const a = Number(rozsah[1]);
        const b = Number(rozsah[2]);
        if (b - a > 0 && b - a <= 30) for (let i = a; i <= b; i++) cisla.push(i);
        else cisla.push(a, b);
      } else if (/^\d+$/.test(cast)) cisla.push(Number(cast));
    }
    const jedinecna = [...new Set(cisla)];
    return jedinecna.length ? jedinecna.map((c) => `[${c}]`).join('') : celek;
  });
}

/** Čísla citací [n] v textu (po normalizaci). */
export function citovaneZdroje(text: string): Set<number> {
  return new Set([...normalizujCitace(text).matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
}


/** Text s citacemi [n] jako odkazy (tlačítka) na stránku knihy. */
export function sOdkazy(text: string, zdroje: Map<number, ZdrojPrehledu>, otevri: (z: ZdrojPrehledu) => void): ReactNode {
  const casti = text.split(/(\[\d{1,3}\])/);
  if (casti.length === 1) return text;
  return casti.map((c, i) => {
    const m = /^\[(\d{1,3})\]$/.exec(c);
    const z = m ? zdroje.get(Number(m[1])) : undefined;
    if (!z) return <span key={i}>{c}</span>;
    return (
      <button
        key={i}
        type="button"
        onClick={() => otevri(z)}
        title={`${z.nazev}, ${misto(z)}`}
        aria-label={`Zdroj ${z.n}: ${z.nazev}, ${misto(z)}`}
        className="tap mx-0.5 rounded px-0.5 align-baseline text-xs font-black text-amber-300 underline decoration-2 underline-offset-2 hover:text-amber-200"
      >
        [{z.n}]
      </button>
    );
  });
}

export function BiblePrehled({ klic, otevri, zpet }: {
  klic: string;
  otevri: (dokumentId: string, list: number) => void;
  zpet: () => void;
}) {
  const [stav, setStav] = useState<{ prehled: PrehledTematu } | { chyba: string } | null>(null);

  useEffect(() => {
    let platne = true;
    setStav(null);
    void nactiPrehled(klic).then((r) => {
      if (platne) setStav(r.stav === 'ok' ? { prehled: r.prehled } : { chyba: r.zprava });
    });
    return () => { platne = false; };
  }, [klic]);

  return (
    <div className="space-y-4">
      <button type="button" className="btn-tmave" onClick={zpet}><ArrowLeft size={18} /> Zpět na hledání</button>
      {stav === null ? (
        <div className="text-sm text-neutral-300">Načítám přehled…</div>
      ) : 'chyba' in stav ? (
        <div role="alert" className="text-sm font-bold text-rose-300">{stav.chyba}</div>
      ) : (
        <PrehledObsah prehled={stav.prehled} otevri={otevri} />
      )}
    </div>
  );
}

function PrehledObsah({ prehled, otevri }: { prehled: PrehledTematu; otevri: (dokumentId: string, list: number) => void }) {
  const mapa = new Map(prehled.zdroje.map((z) => [z.n, z]));
  const text = normalizujCitace(prehled.text);
  const citovane = citovaneZdroje(text);
  // Ve zdrojích dole jen citované (worker ukládá všechny nalezené); bez citací všechny.
  const zdroje = prehled.zdroje.some((z) => citovane.has(z.n)) ? prehled.zdroje.filter((z) => citovane.has(z.n)) : prehled.zdroje;
  const otevriZdroj = (z: ZdrojPrehledu) => otevri(z.dokumentId, z.pdfIndex);
  const knih = new Set(zdroje.map((z) => z.dokumentId)).size;
  return (
    <article className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-3" aria-label={`Přehled: ${prehled.nazev}`}>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-amber-400">Přehled tématu</div>
        <h2 className="text-lg font-black text-neutral-50">{prehled.nazev}</h2>
        <div className="text-xs font-bold text-neutral-300">
          Claude porovnal {zdroje.length} míst z {knih} {knih === 1 ? 'knihy' : 'knih'}; čísla v závorkách otevřou knihu na té stránce.
        </div>
      </div>
      {prehled.kontrola && (
        <div role="note" className="rounded-lg border border-amber-600 bg-neutral-950 p-2 text-sm font-bold text-amber-200">
          Pozor: {prehled.kontrola}.
        </div>
      )}
      <VykresleniTextu.Provider value={(t) => sOdkazy(t, mapa, otevriZdroj)}>
        <TextListuKnihy bloky={rozlozText(text, 'ocr')} />
      </VykresleniTextu.Provider>
      {zdroje.length > 0 && (
        <section className="space-y-2 border-t border-neutral-700 pt-3" aria-label="Zdroje">
          <h3 className="text-sm font-black text-neutral-50">Zdroje</h3>
          <ol className="space-y-1">
            {zdroje.map((z) => (
              <li key={z.n}>
                <button type="button" className="tap w-full rounded-lg px-2 py-1.5 text-left text-sm hover:underline" onClick={() => otevriZdroj(z)}>
                  <span className="font-black text-amber-300">[{z.n}]</span>{' '}
                  <span className="font-bold">{z.nazev}</span>, {misto(z)}
                  {z.kapitola ? ` · ${z.kapitola}` : ''}
                  <span className="text-neutral-400"> ({z.zdroj === 'preklad' ? 'český překlad' : 'originál'})</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
