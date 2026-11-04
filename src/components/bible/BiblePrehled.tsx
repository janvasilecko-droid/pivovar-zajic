// 📝 Přehled tématu: Claude porovnal, co o tématu píšou knihy, s odkazy na stránky.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026: „napíšeš to nejlepší o chmelovaru … s tím, že tam budou
// odkazy na knihy". Citace [n] v textu i seznam zdrojů dole otevřou čtečku na
// té stránce. Text se skládá z dat (lib/bibleText.ts), nikdy přes innerHTML.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { jePostup, nactiPrehled, type PrehledTematu, type ZdrojPrehledu } from '../../lib/bibleHledaniApi';
import { rozlozText } from '../../lib/bibleText';
import { TextListuKnihy, VykresleniTextu } from './BibleKniha';

const misto = (z: ZdrojPrehledu) => (z.tistena ? `s. ${z.tistena}` : `list ${z.pdfIndex}`);

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
  const otevriZdroj = (z: ZdrojPrehledu) => otevri(z.dokumentId, z.pdfIndex);
  const knih = new Set(prehled.zdroje.map((z) => z.dokumentId)).size;
  const postup = jePostup(prehled.klic);
  return (
    <article className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-3" aria-label={`${postup ? 'Postup' : 'Přehled'}: ${prehled.nazev}`}>
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-amber-400">{postup ? 'Pracovní postup' : 'Přehled tématu'}</div>
        <h2 className="text-lg font-black text-neutral-50">{prehled.nazev}</h2>
        <div className="text-xs font-bold text-neutral-300">
          Claude porovnal {prehled.zdroje.length} míst z {knih} {knih === 1 ? 'knihy' : 'knih'}; čísla v závorkách otevřou knihu na té stránce.
        </div>
      </div>
      {postup && (
        <div role="note" className="rounded-lg border border-neutral-600 bg-neutral-950 p-2 text-sm text-neutral-200">
          Postup sestavil Claude jen z knih v bibli. Než podle něj začneš, porovnej ho s návodem k vašemu zařízení, s HACCP a s tím, jak to v pivovaru děláte.
        </div>
      )}
      {prehled.kontrola && (
        <div role="note" className="rounded-lg border border-amber-600 bg-neutral-950 p-2 text-sm font-bold text-amber-200">
          Pozor: {prehled.kontrola}.
        </div>
      )}
      <VykresleniTextu.Provider value={(t) => sOdkazy(t, mapa, otevriZdroj)}>
        <TextListuKnihy bloky={rozlozText(prehled.text, 'ocr')} />
      </VykresleniTextu.Provider>
      {prehled.zdroje.length > 0 && (
        <section className="space-y-2 border-t border-neutral-700 pt-3" aria-label="Zdroje">
          <h3 className="text-sm font-black text-neutral-50">Zdroje</h3>
          <ol className="space-y-1">
            {prehled.zdroje.map((z) => (
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
