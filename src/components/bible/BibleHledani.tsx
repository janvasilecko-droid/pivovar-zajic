// 🔎 Hledání v knihách bible (etapa 4): originál i český překlad, otevření stránky.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026: „po překladu pokračuj v bibli" a k chatbotu „zatím jen
// hledání". Výsledek ukáže knihu, kapitolu a stranu („s. 158", jinak „list 170")
// a úryvek se zvýrazněnými slovy; klepnutím se otevře čtečka na té stránce.
// 11. 11. 2026 („hlavně ať funguje vyhledávání"): otázka v běžné řeči najde
// stránky s nejvíc slovy otázky, když všechna na jedné stránce nejsou.
import { useEffect, useRef, useState } from 'react';
import { Bot, FileText, ListOrdered, Search, SlidersHorizontal } from 'lucide-react';
import {
  hledejVKnihach, jePostup, nactiPrehledy, nazevPostupu, type FiltrHledani, type PolozkaPrehledu, type VysledekHledani,
} from '../../lib/bibleHledaniApi';
import { nactiDokumenty, nactiVydani } from '../../lib/bibleKnihovnaApi';
import { nactiZkusenosti, nazevDruhu, nazevUrovne, type Zkusenost } from '../../lib/bibleZkusenostiApi';
import { DRUH_POPIS, JAZYK_POPIS, jeStarsiVydani, jeZpracovany, rodokmenVydani, type RodokmenVydani } from '../../lib/bibleKnihovna';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import { BiblePrehled } from './BiblePrehled';

const bezDiakritiky = (z: string) => z.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Úryvek s vyznačenými slovy dotazu (bez ohledu na diakritiku) — jen React elementy, žádné innerHTML. */
export function ZvyraznenyUryvek({ text, dotaz, slova: hledanaSlova }: { text: string; dotaz: string; slova?: readonly string[] }) {
  const slova = hledanaSlova && hledanaSlova.length > 0
    ? hledanaSlova.map(bezDiakritiky)
    : bezDiakritiky(dotaz).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
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

/** Zkušeností sládků ukázaných hned; zbytek po rozbalení. */
const ZKUSENOSTI_HNED = 3;
const ZKRACENY_TEXT = 280;

/** Zkrácení na celé slovo (dlouhý text zkušenosti v přehledu). */
function zkrat(text: string, max: number): string {
  if (text.length <= max) return text;
  const kus = text.slice(0, max);
  const mezera = kus.lastIndexOf(' ');
  return `${(mezera > max * 0.6 ? kus.slice(0, mezera) : kus).trimEnd()}…`;
}

/**
 * Zkušenosti sládků k dotazu — praxe, ne literatura: každá s úrovní
 * důvěryhodnosti (1 ověřená publikace … 5 neověřená informace).
 */
function ZkusenostiKDotazu({ zkusenosti, dotaz, slova }: { zkusenosti: readonly Zkusenost[]; dotaz: string; slova?: readonly string[] }) {
  const [rozbalene, setRozbalene] = useState<string | null>(null);
  const [vse, setVse] = useState(false);
  const ukazat = vse ? zkusenosti : zkusenosti.slice(0, ZKUSENOSTI_HNED);
  return (
    <section className="space-y-2" aria-label="Zkušenosti sládků k dotazu">
      <div className="text-xs font-black uppercase tracking-wide text-amber-400">
        Zkušenosti sládků ({zkusenosti.length}) · praxe, ne literatura
      </div>
      <ul className="space-y-2">
        {ukazat.map((z) => {
          const cely = rozbalene === z.id;
          const dlouhy = z.text.length > ZKRACENY_TEXT;
          return (
            <li key={z.id} className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold text-neutral-300">
                <span className="font-black text-amber-300">{z.nazev}</span>
                <span className="rounded border border-neutral-600 px-1">úroveň {z.uroven}: {nazevUrovne(z.uroven)}</span>
                <span>{nazevDruhu(z.typ)}</span>
                {z.zapsalJmeno && <span>· {z.zapsalJmeno}</span>}
              </div>
              <div className="text-sm leading-relaxed text-neutral-100 whitespace-pre-line break-words">
                <ZvyraznenyUryvek text={cely || !dlouhy ? z.text : zkrat(z.text, ZKRACENY_TEXT)} dotaz={dotaz} slova={slova} />
              </div>
              {z.zdroj && <div className="text-xs text-neutral-300">Zdroj: {z.zdroj}</div>}
              {dlouhy && (
                <button type="button" className="btn-tmave" aria-expanded={cely} onClick={() => setRozbalene(cely ? null : z.id)}>
                  {cely ? 'Zkrátit' : 'Celý text'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!vse && zkusenosti.length > ZKUSENOSTI_HNED && (
        <button type="button" className="btn-tmave" onClick={() => setVse(true)}>
          Další zkušenosti ({zkusenosti.length - ZKUSENOSTI_HNED})
        </button>
      )}
    </section>
  );
}

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
type Filtr = FiltrHledani & { kniha?: string };

/** Filtr slovy pro řádek nad výsledky, např. „oblast D · němčina · 1970–1989“. */
export function popisFiltru(f: Filtr, knihy: readonly { id: string; nazev: string }[] = []): string {
  const kniha = f.kniha ? knihy.find((k) => k.id === f.kniha)?.nazev ?? 'jedna kniha' : '';
  return [
    kniha,
    f.oblast ? `oblast ${f.oblast}` : '',
    f.jazyk ? JAZYK_POPIS[f.jazyk as keyof typeof JAZYK_POPIS] ?? f.jazyk : '',
    f.druh ? DRUH_POPIS[f.druh as keyof typeof DRUH_POPIS] ?? f.druh : '',
    f.rokOd !== undefined || f.rokDo !== undefined ? `${f.rokOd ?? '…'}–${f.rokDo ?? '…'}` : '',
    f.autor?.trim() ? `autor „${f.autor.trim()}“` : '',
  ].filter(Boolean).join(' · ');
}

const pocetFiltru = (f: Filtr) => [f.kniha, f.oblast, f.jazyk, f.druh, f.autor?.trim(), f.rokOd, f.rokDo].filter((x) => x !== undefined && x !== '').length;

/** Přehledy, jejichž název obsahuje slovo dotazu (bez diakritiky, začátek slova). */
export function prehledyKDotazu(prehledy: readonly PolozkaPrehledu[], dotaz: string): PolozkaPrehledu[] {
  const slova = bezDiakritiky(dotaz).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  if (slova.length === 0) return [];
  return prehledy.filter((p) => {
    const nazev = bezDiakritiky(p.nazev).split(/[^a-z0-9]+/);
    return slova.some((w) => nazev.some((n) => n.startsWith(w) || w.startsWith(n) && n.length >= 4));
  });
}

export function BibleHledani({ otevri, pocatecniDotaz, zeptatSe }: {
  otevri: (dokumentId: string, list: number) => void;
  /** Hledání spuštěné odjinud (Výpočtová laboratoř → „Najít v knihách“). */
  pocatecniDotaz?: string;
  /** Položit stejnou otázku AI sládkovi (chatbot odpoví z knih, várek a výpočtů). */
  zeptatSe?: (otazka: string) => void;
}) {
  const [dotaz, setDotaz] = useState(pocatecniDotaz ?? '');
  const [stav, setStav] = useState<{
    dotaz: string; vysledky: VysledekHledani[]; volne: boolean; slova: string[]; filtr: Filtr; zkusenosti: Zkusenost[];
  } | null>(null);
  // Filtry (etapa 4b): kniha, oblast, jazyk, druh, rok vydání, autor.
  const [filtr, setFiltr] = useState<Filtr>({});
  const [filtry, setFiltry] = useState(false);
  const [knihy, setKnihy] = useState<{ id: string; nazev: string; rok: number | null }[] | null>(null);
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

  async function spustHledani(text: string, f: Filtr = filtr) {
    const q = text.trim();
    if (q.length < 2) { setChyba('Napiš aspoň dva znaky.'); return; }
    const moje = ++poradi.current;
    setHleda(true);
    setChyba(null);
    const { kniha, ...ostatni } = f;
    // Zkušenosti sládků souběžně — jen bez filtru vázaného na knihu (kniha, autor,
    // rok, jazyk, druh); oblast platí pro obojí. Jejich chyba hledání v knihách nezastaví.
    const knizniFiltr = !!(kniha || ostatni.autor || ostatni.rokOd || ostatni.rokDo || ostatni.jazyk || ostatni.druh);
    const [r, zk] = await Promise.all([
      hledejVKnihach(q, kniha, ostatni),
      knizniFiltr ? Promise.resolve(null) : nactiZkusenosti({ dotaz: q, oblast: ostatni.oblast }, { volne: true }).catch(() => null),
    ]);
    if (moje !== poradi.current) return; // mezitím přišlo novější hledání
    setHleda(false);
    const zkusenosti = zk?.stav === 'ok' ? zk.zkusenosti.slice(0, 15) : [];
    if (r.stav === 'ok') setStav({ dotaz: q, vysledky: r.vysledky, volne: r.volne === true, slova: r.slova ?? [], filtr: f, zkusenosti });
    else { setStav(null); setChyba(r.zprava); }
  }

  function otevriFiltry() {
    setFiltry((o) => !o);
    if (knihy === null) {
      void nactiDokumenty().then((r) => setKnihy(r.stav === 'ok'
        ? r.dokumenty.filter((d) => jeZpracovany(d.stav)).map((d) => ({ id: d.id, nazev: d.nazev, rok: d.rok })).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'))
        : []));
    }
  }

  /** Změna filtru; u výběru se hned hledá znovu (u textu až po opuštění políčka). */
  function zmenFiltr(zmena: Partial<Filtr>, hned: boolean) {
    const novy = { ...filtr, ...zmena };
    setFiltr(novy);
    if (hned && stav) void spustHledani(stav.dotaz, novy);
  }
  const rok = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : undefined);

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
        Hledají se začátky slov (např. „amyl“ najde amylázu) i odborné varianty v němčině a angličtině („mladina“ najde i Würze a wort).
        Nejdřív stránky se všemi slovy; když takové nejsou, stránky s nejvíc slovy z otázky — klidně napiš celou otázku.
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-tmave" aria-expanded={filtry} aria-controls="bible-filtry" onClick={otevriFiltry}>
          <SlidersHorizontal size={18} /> Filtry{pocetFiltru(filtr) ? ` (${pocetFiltru(filtr)})` : ''}
        </button>
        {pocetFiltru(filtr) > 0 && (
          <button type="button" className="btn-tmave" onClick={() => { setFiltr({}); if (stav) void spustHledani(stav.dotaz, {}); }}>Zrušit filtry</button>
        )}
      </div>
      {filtry && (
        <section id="bible-filtry" className="rounded-xl border border-neutral-700 bg-neutral-900 p-3" aria-label="Filtry hledání">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={POPISEK}>
              <span className="block">Kniha</span>
              <select className="input w-full normal-case" value={filtr.kniha ?? ''} onChange={(e) => zmenFiltr({ kniha: e.target.value || undefined }, true)}>
                <option value="">všechny knihy</option>
                {(knihy ?? []).map((k) => <option key={k.id} value={k.id}>{k.nazev}{k.rok ? ` (${k.rok})` : ''}</option>)}
              </select>
            </label>
            <label className={POPISEK}>
              <span className="block">Oblast</span>
              <select className="input w-full normal-case" value={filtr.oblast ?? ''} onChange={(e) => zmenFiltr({ oblast: e.target.value || undefined }, true)}>
                <option value="">všechny oblasti</option>
                {BIBLE_OBLASTI.map((o) => <option key={o.kod} value={o.kod}>{o.kod} — {o.nazev}</option>)}
              </select>
            </label>
            <label className={POPISEK}>
              <span className="block">Jazyk knihy</span>
              <select className="input w-full normal-case" value={filtr.jazyk ?? ''} onChange={(e) => zmenFiltr({ jazyk: e.target.value || undefined }, true)}>
                <option value="">všechny jazyky</option>
                {Object.entries(JAZYK_POPIS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </label>
            <label className={POPISEK}>
              <span className="block">Druh dokumentu</span>
              <select className="input w-full normal-case" value={filtr.druh ?? ''} onChange={(e) => zmenFiltr({ druh: e.target.value || undefined }, true)}>
                <option value="">všechny druhy</option>
                {Object.entries(DRUH_POPIS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </label>
            <label className={POPISEK}>
              <span className="block">Autor</span>
              <input className="input w-full normal-case" maxLength={100} value={filtr.autor ?? ''} placeholder="část jména"
                onChange={(e) => zmenFiltr({ autor: e.target.value }, false)} onBlur={() => { if (stav) void spustHledani(stav.dotaz); }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={POPISEK}>
                <span className="block">Rok od</span>
                <input className="input w-full normal-case" type="number" inputMode="numeric" min={1400} max={2100} value={filtr.rokOd ?? ''}
                  onChange={(e) => zmenFiltr({ rokOd: rok(e.target.value) }, false)} onBlur={() => { if (stav) void spustHledani(stav.dotaz); }} />
              </label>
              <label className={POPISEK}>
                <span className="block">Rok do</span>
                <input className="input w-full normal-case" type="number" inputMode="numeric" min={1400} max={2100} value={filtr.rokDo ?? ''}
                  onChange={(e) => zmenFiltr({ rokDo: rok(e.target.value) }, false)} onBlur={() => { if (stav) void spustHledani(stav.dotaz); }} />
              </label>
            </div>
          </div>
        </section>
      )}
      {kDotazu.length > 0 && !hleda && (
        <section className="space-y-2" aria-label="Přehledy k dotazu">
          <div className="text-xs font-black uppercase tracking-wide text-amber-400">Přehled z knih</div>
          <div className="grid gap-2 sm:grid-cols-2">{kDotazu.map((p) => tlacitkoPrehledu(p))}</div>
        </section>
      )}
      {hleda && <div className="text-sm text-neutral-300">Hledám…</div>}
      {chyba && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      {stav && !hleda && stav.zkusenosti.length > 0 && (
        <ZkusenostiKDotazu zkusenosti={stav.zkusenosti} dotaz={stav.dotaz} slova={stav.slova.length > 0 ? stav.slova : undefined} />
      )}
      {stav && !hleda && (
        stav.vysledky.length === 0 ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200 space-y-2">
            <div>
              {stav.zkusenosti.length > 0 ? 'V knihách jsem nic nenašel' : 'Nic jsem nenašel'} pro „{stav.dotaz}“{pocetFiltru(stav.filtr) > 0 ? ` s filtrem ${popisFiltru(stav.filtr, knihy ?? [])}` : ''}.
              Zkus kratší nebo jiné slovo{pocetFiltru(stav.filtr) > 0 ? ', nebo filtr zruš' : ''}.
            </div>
            {zeptatSe && (
              <button type="button" className="btn-tmave" onClick={() => zeptatSe(stav.dotaz)}>
                <Bot size={18} /> Zeptat se AI sládka
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {stav.volne && (
              <div role="note" className="rounded-lg border border-amber-700 bg-neutral-900 p-2 text-sm text-amber-100 space-y-2">
                <div>
                  Všechna slova na jedné stránce nejsou. Ukazuji stránky s nejvíc slovy z otázky
                  {stav.slova.length > 0 && <> (hledám začátky slov: {stav.slova.map((w) => `${w}…`).join(', ')})</>} — ověř, že opravdu odpovídají.
                </div>
                {zeptatSe && (
                  <button type="button" className="btn-tmave" onClick={() => zeptatSe(stav.dotaz)}>
                    <Bot size={18} /> Zeptat se AI sládka — odpoví celou odpovědí s odkazy
                  </button>
                )}
              </div>
            )}
            <div className="text-xs font-bold text-neutral-300">
              Nalezeno {stav.vysledky.length}{stav.vysledky.length >= 40 ? ' (nejlepší)' : ''}
              {pocetFiltru(stav.filtr) > 0 && <> · filtr: {popisFiltru(stav.filtr, knihy ?? [])}</>}
            </div>
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
                      {stav.volne && v.shoda && v.slov ? (
                        <span className="rounded border border-neutral-600 px-1">shoda {v.shoda} z {v.slov} slov</span>
                      ) : null}
                    </span>
                    <span className="block text-sm font-normal leading-relaxed text-neutral-100 break-words">
                      <ZvyraznenyUryvek text={v.uryvek} dotaz={stav.dotaz} slova={stav.slova.length > 0 ? stav.slova : undefined} />
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
