// 🔎 Hledání v knihách bible (etapa 4): originál i český překlad, otevření stránky.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026: „po překladu pokračuj v bibli" a k chatbotu „zatím jen
// hledání". Výsledek ukáže knihu, kapitolu a stranu („s. 158", jinak „list 170")
// a úryvek se zvýrazněnými slovy; klepnutím se otevře čtečka na té stránce.
import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { hledejVKnihach, type VysledekHledani } from '../../lib/bibleHledaniApi';

const bezDiakritiky = (z: string) => z.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Úryvek s vyznačenými slovy dotazu (bez ohledu na diakritiku) — jen React elementy, žádné innerHTML. */
export function ZvyraznenyUryvek({ text, dotaz }: { text: string; dotaz: string }) {
  const slova = bezDiakritiky(dotaz).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  if (slova.length === 0) return <>{text}</>;
  const casti: { t: string; nalez: boolean }[] = [];
  // Slovo textu je nález, když (bez diakritiky) začíná některým slovem dotazu — stejně jako předpony v hledání.
  for (const kus of text.split(/(\s+)/)) {
    const ciste = bezDiakritiky(kus).replace(/^[^a-z0-9]+/, '');
    casti.push({ t: kus, nalez: !!ciste && slova.some((w) => ciste.startsWith(w)) });
  }
  return (
    <>
      {casti.map((c, i) => (c.nalez
        ? <mark key={i} className="rounded bg-amber-300 px-0.5 text-neutral-950">{c.t}</mark>
        : <span key={i}>{c.t}</span>))}
    </>
  );
}

const misto = (v: VysledekHledani) => (v.tistena ? `s. ${v.tistena}` : `list ${v.pdfIndex}`);

export function BibleHledani({ otevri }: { otevri: (dokumentId: string, list: number) => void }) {
  const [dotaz, setDotaz] = useState('');
  const [stav, setStav] = useState<{ dotaz: string; vysledky: VysledekHledani[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hleda, setHleda] = useState(false);
  const poradi = useRef(0);

  async function hledej(e: React.FormEvent) {
    e.preventDefault();
    const q = dotaz.trim();
    if (q.length < 2) { setChyba('Napiš aspoň dva znaky.'); return; }
    const moje = ++poradi.current;
    setHleda(true);
    setChyba(null);
    const r = await hledejVKnihach(q);
    if (moje !== poradi.current) return; // mezitím přišlo novější hledání
    setHleda(false);
    if (r.stav === 'ok') setStav({ dotaz: q, vysledky: r.vysledky });
    else { setStav(null); setChyba(r.zprava); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Hledá v textu zpracovaných knih i v jejich českém překladu — česky najdeš i to, co je v anglické knize.
        Hledají se začátky slov (např. „amyl“ najde amylázu), všechna slova musí být na jedné stránce.
      </p>
      <form className="flex gap-2" onSubmit={hledej} role="search">
        <label className="sr-only" htmlFor="bible-hledani">Hledat v knihách</label>
        <input
          id="bible-hledani"
          className="input w-full"
          value={dotaz}
          placeholder="např. chmelovar odpar"
          onChange={(e) => setDotaz(e.target.value)}
          enterKeyHint="search"
        />
        <button type="submit" className="btn-amber" disabled={hleda}><Search size={18} /> Hledat</button>
      </form>
      {hleda && <div className="text-sm text-neutral-300">Hledám…</div>}
      {chyba && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      {stav && !hleda && (
        stav.vysledky.length === 0 ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">
            Nic jsem nenašel pro „{stav.dotaz}“. Zkus kratší nebo jiné slovo, případně anglický výraz.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-bold text-neutral-300">Nalezeno {stav.vysledky.length}{stav.vysledky.length >= 40 ? ' (nejlepší)' : ''}</div>
            <ul className="space-y-2">
              {stav.vysledky.map((v, i) => (
                <li key={`${v.dokumentId}-${v.zdroj}-${v.pdfIndex}-${i}`}>
                  <button
                    type="button"
                    onClick={() => otevri(v.dokumentId, v.pdfIndex)}
                    className="btn w-full flex-col items-start gap-1 p-3 text-left bg-neutral-900 text-neutral-100 border border-neutral-700 hover:border-amber-500 hover:bg-neutral-800"
                  >
                    <span className="flex w-full flex-wrap items-baseline gap-x-2 text-xs font-bold text-neutral-300">
                      <span className="font-black text-amber-300">{v.nazev}</span>
                      {v.autor && <span>{v.autor}{v.rok ? `, ${v.rok}` : ''}</span>}
                      <span>· {misto(v)}</span>
                      {v.kapitola && <span>· {v.kapitola}</span>}
                      <span className="rounded border border-neutral-600 px-1">{v.zdroj === 'preklad' ? 'český překlad' : 'originál'}</span>
                    </span>
                    <span className="block text-sm font-normal leading-relaxed text-neutral-100 break-words">
                      <ZvyraznenyUryvek text={v.uryvek} dotaz={stav.dotaz} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
