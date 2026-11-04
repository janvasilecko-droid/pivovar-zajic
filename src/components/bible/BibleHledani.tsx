// 🔎 Hledání v knihách bible (etapa 4): originál i český překlad, otevření stránky.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026: „po překladu pokračuj v bibli" a k chatbotu „zatím jen
// hledání". Výsledek ukáže knihu, kapitolu a stranu („s. 158", jinak „list 170")
// a úryvek se zvýrazněnými slovy; klepnutím se otevře čtečka na té stránce.
import { useEffect, useRef, useState } from 'react';
import { FileText, ListOrdered, Search } from 'lucide-react';
import { hledejVKnihach, jePostup, nactiPrehledy, nazevPostupu, type PolozkaPrehledu, type VysledekHledani } from '../../lib/bibleHledaniApi';
import { nactiVydani } from '../../lib/bibleKnihovnaApi';
import { jeStarsiVydani, rodokmenVydani, type RodokmenVydani } from '../../lib/bibleKnihovna';
import { BiblePrehled } from './BiblePrehled';

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

/** Přehledy, jejichž název obsahuje slovo dotazu (bez diakritiky, začátek slova). */
export function prehledyKDotazu(prehledy: readonly PolozkaPrehledu[], dotaz: string): PolozkaPrehledu[] {
  const slova = bezDiakritiky(dotaz).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (slova.length === 0) return [];
  return prehledy.filter((p) => {
    const nazev = bezDiakritiky(p.nazev).split(/[^a-z0-9]+/);
    return slova.some((w) => nazev.some((n) => n.startsWith(w) || w.startsWith(n) && n.length >= 4));
  });
}

export function BibleHledani({ otevri, pocatecniDotaz }: {
  otevri: (dokumentId: string, list: number) => void;
  /** Hledání spuštěné odjinud (Výpočtová laboratoř → „Najít v knihách“). */
  pocatecniDotaz?: string;
}) {
  const [dotaz, setDotaz] = useState(pocatecniDotaz ?? '');
  const [stav, setStav] = useState<{ dotaz: string; vysledky: VysledekHledani[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hleda, setHleda] = useState(false);
  const poradi = useRef(0);
  const [prehledy, setPrehledy] = useState<{ seznam: PolozkaPrehledu[]; migrace: boolean } | null>(null);
  const [otevrenyPrehled, setOtevrenyPrehled] = useState<string | null>(null);
  // Vazby vydání (etapa 3c): výsledek ze staršího vydání dostane označení.
  const [vydani, setVydani] = useState<RodokmenVydani | null>(null);

  useEffect(() => {
    let platne = true;
    void nactiPrehledy().then((r) => {
      if (platne && r.stav === 'ok') setPrehledy({ seznam: r.prehledy, migrace: r.migrace });
    });
    void nactiVydani().then((r) => {
      if (platne && r.stav === 'ok' && r.migrace) setVydani(rodokmenVydani(r.vazby));
    });
    return () => { platne = false; };
  }, []);

  // Dotaz předaný odjinud se hledá hned (jen jednou, při otevření).
  useEffect(() => {
    if (pocatecniDotaz?.trim()) void spustHledani(pocatecniDotaz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hledej(e: React.FormEvent) {
    e.preventDefault();
    void spustHledani(dotaz);
  }

  async function spustHledani(text: string) {
    const q = text.trim();
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

  if (otevrenyPrehled) {
    return <BiblePrehled klic={otevrenyPrehled} otevri={otevri} zpet={() => setOtevrenyPrehled(null)} />;
  }
  const kDotazu = stav && prehledy ? prehledyKDotazu(prehledy.seznam, stav.dotaz) : [];

  const tlacitkoPrehledu = (p: PolozkaPrehledu, kratce = false) => (
    <button
      key={p.klic}
      type="button"
      onClick={() => setOtevrenyPrehled(p.klic)}
      className="btn justify-start gap-2 p-3 text-left bg-neutral-900 text-neutral-100 border border-neutral-700 hover:border-amber-500 hover:bg-neutral-800"
    >
      {jePostup(p.klic)
        ? <ListOrdered size={18} className="shrink-0 text-amber-400" />
        : <FileText size={18} className="shrink-0 text-amber-400" />}
      <span className="text-sm font-bold">{kratce && jePostup(p.klic) ? nazevPostupu(p.nazev) : p.nazev}</span>
    </button>
  );
  const temata = prehledy?.seznam.filter((p) => !jePostup(p.klic)) ?? [];
  const postupy = prehledy?.seznam.filter((p) => jePostup(p.klic)) ?? [];

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
      {kDotazu.length > 0 && !hleda && (
        <section className="space-y-2" aria-label="Přehledy k dotazu">
          <div className="text-xs font-black uppercase tracking-wide text-amber-400">Přehled z knih</div>
          <div className="grid gap-2 sm:grid-cols-2">{kDotazu.map((p) => tlacitkoPrehledu(p))}</div>
        </section>
      )}
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
                      {vydani && jeStarsiVydani(vydani, v.dokumentId) && (
                        <span className="rounded border border-amber-600 px-1 text-amber-200">starší vydání — v knihovně je novější</span>
                      )}
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
      {!stav && prehledy && prehledy.migrace && (
        <section className="space-y-2 border-t border-neutral-800 pt-4" aria-label="Přehledy témat">
          <h2 className="text-sm font-black text-neutral-50">Přehledy témat</h2>
          {temata.length === 0 ? (
            <p className="text-sm text-neutral-300">
              Claude napíše přehledy hlavních témat (chmelovar, rmutování, kvašení…) z porovnání všech knih, až budou všechny knihy zpracované a přeložené.
              Každé tvrzení bude mít odkaz na knihu a stránku.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-300">To nejlepší z knih k hlavním tématům; čísla v závorkách otevřou knihu na té stránce.</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{temata.map((p) => tlacitkoPrehledu(p))}</div>
            </>
          )}
        </section>
      )}
      {!stav && prehledy && prehledy.migrace && (
        <section className="space-y-2 border-t border-neutral-800 pt-4" aria-label="Pracovní postupy">
          <h2 className="text-sm font-black text-neutral-50">Pracovní postupy krok za krokem</h2>
          {postupy.length === 0 ? (
            <p className="text-sm text-neutral-300">
              Claude sepíše z knih postupy práce v pivovaru — šrotování, rmutování, scezování, chmelovar, zakvašení, kvašení, sudování,
              filtrace, mytí a plnění sudů, stáčení, sanitace (CIP, varna, výčep), kontrola kvality — až budou všechny knihy zpracované a přeložené.
              Každý krok bude mít odkaz na knihu a stránku.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-300">
                Kroky s hodnotami z knih; čísla v závorkách otevřou knihu na té stránce. Postup je obecný — porovnej ho s návodem k vašemu zařízení.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{postupy.map((p) => tlacitkoPrehledu(p, true))}</div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
