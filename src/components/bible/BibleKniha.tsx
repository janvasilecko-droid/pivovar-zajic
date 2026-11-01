// 📖 Čtečka zpracované knihy (etapa 3a): obsah po kapitolách, listy textu,
// tabulky a vzorce. Načítá se líně (vlastní kus), start appky nezvětšuje.
// ---------------------------------------------------------------------------
// Zadání etapy 3: „kniha jde projít po kapitolách a stranách". Místo v knize
// se označuje jen tím, co je jisté: „s. 158" (tištěné číslo), jinak „list 170",
// u souborů bez stran „část 3". Text listu se skládá z dat (lib/bibleText.ts),
// nikdy přes innerHTML. Text knihy zůstává jen v paměti čtečky (R4).
//
// Listování nezapisuje každou stranu do historie stránek — tlačítko Zpět
// prohlížeče vede z knihy rovnou zpátky do knihovny.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Download, ListOrdered, Table } from 'lucide-react';
import { usePosledniNacteni } from '../../lib/nacitani';
import { kapitolaListu, kapitolyProObsah, najdiList, oznaceniListu, sousedniList, ZDROJ_POPIS, type ListKnihy } from '../../lib/bibleCteni';
import {
  LISTU_NARAZ, nactiKnihu, nactiListy, nactiObjekty, type Cteni, type Kniha, type ObjektKnihy, type TextListu,
} from '../../lib/bibleCteniApi';
import { odkazNaSoubor } from '../../lib/bibleKnihovnaApi';
import { castiRadku, rozlozText, type BlokTextu, type CastTextu } from '../../lib/bibleText';

type Pohled = 'obsah' | 'cteni' | 'objekty';

const DRUH_OBJEKTU: Record<ObjektKnihy['druh'], string> = { tabulka: 'Tabulka', vzorec: 'Vzorec', popisek: 'Popisek' };

function Casti({ casti }: { casti: CastTextu[] }) {
  return (
    <>
      {casti.map((c, i) => (c.typ === 'text' ? (
        <span key={i}>{c.text}</span>
      ) : c.typ === 'vzorec' ? (
        <code key={i} className="rounded bg-neutral-800 px-1 font-mono text-amber-100" title="vzorec (LaTeX)">{c.tex}</code>
      ) : (
        <span key={i} className="rounded bg-amber-900 px-1 font-bold text-amber-100">[nečitelné]</span>
      )))}
    </>
  );
}

/** Bloky textu listu jako React elementy (nadpisy, odstavce, tabulky, vzorce). */
export function TextListuKnihy({ bloky }: { bloky: BlokTextu[] }) {
  if (bloky.length === 0) return <p className="text-sm text-neutral-300">Na tomhle listu není žádný text (obrázek, prázdná strana).</p>;
  return (
    <div className="space-y-3 lze-vybrat">
      {bloky.map((b, i) => {
        if (b.typ === 'nadpis') {
          const Znacka = b.uroven === 1 ? 'h3' : b.uroven === 2 ? 'h4' : 'h5';
          return <Znacka key={i} className={`break-words font-black text-neutral-50 ${b.uroven === 1 ? 'text-base' : 'text-sm'}`}><Casti casti={b.casti} /></Znacka>;
        }
        // break-words: dlouhý odkaz nebo DOI bez mezer by roztáhl celou obrazovku do šířky.
        if (b.typ === 'odstavec') return <p key={i} className="whitespace-pre-line break-words leading-relaxed text-neutral-100"><Casti casti={b.casti} /></p>;
        if (b.typ === 'prosty') return <div key={i} className="whitespace-pre-line break-words leading-relaxed text-neutral-100">{b.text}</div>;
        if (b.typ === 'vzorec') {
          return (
            <div key={i} className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 space-y-1">
              <div className="text-[11px] font-black uppercase tracking-wide text-neutral-300">Vzorec (LaTeX)</div>
              <code className="block overflow-x-auto whitespace-pre font-mono text-sm text-amber-100">{b.tex}</code>
            </div>
          );
        }
        return (
          <div key={i} className="max-w-full overflow-x-auto rounded-xl border border-neutral-700">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {b.hlavicka.map((h, j) => (
                    <th key={j} scope="col" className="border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-left font-black text-neutral-100">
                      <Casti casti={castiRadku(h)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.radky.map((r, j) => (
                  <tr key={j} className={j % 2 ? 'bg-neutral-950' : 'bg-neutral-900'}>
                    {r.map((c, k) => (
                      <td key={k} className="border border-neutral-700 px-2 py-1.5 align-top text-neutral-100"><Casti casti={castiRadku(c)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function BibleKniha({ id, pocatecniList, doKnihovny }: {
  id: string;
  pocatecniList?: number | null;
  doKnihovny?: () => void;
}) {
  const [kniha, setKniha] = useState<Cteni<Kniha> | null>(null);
  const [pohled, setPohled] = useState<Pohled>(pocatecniList ? 'cteni' : 'obsah');
  const [list, setList] = useState<number | null>(pocatecniList ?? null);
  const [texty, setTexty] = useState<Record<number, TextListu>>({});
  // Listy, jejichž načtení selhalo (list → hláška). Po listech, ne jedna hláška:
  // přednačtení dalšího listu může selhat, až když na něm čtenář už je.
  const [selhane, setSelhane] = useState<Record<number, string>>({});
  const [skok, setSkok] = useState('');
  const [chybaSkoku, setChybaSkoku] = useState<string | null>(null);
  const [objekty, setObjekty] = useState<{ polozky: ObjektKnihy[]; dalsi: number | null; nacita: boolean; chyba: string | null } | null>(null);
  const [chybaOriginalu, setChybaOriginalu] = useState<string | null>(null);

  const zacniNacteni = usePosledniNacteni();
  const nacti = useCallback(async () => {
    const smiZapsat = zacniNacteni();
    setKniha(null);
    const r = await nactiKnihu(id);
    if (smiZapsat()) setKniha(r);
  }, [id, zacniNacteni]);
  useEffect(() => { void nacti(); }, [nacti]);

  const data = kniha?.stav === 'ok' ? kniha.data : null;
  const listy: ListKnihy[] = useMemo(() => data?.listy ?? [], [data]);
  const kapitoly = useMemo(() => kapitolyProObsah(data?.kapitoly ?? []), [data]);
  const listPodleCisla = useMemo(() => new Map(listy.map((l) => [l.pdfIndex, l])), [listy]);

  // Čtení bez zvoleného listu začne prvním listem knihy.
  useEffect(() => {
    if (pohled === 'cteni' && list === null && listy.length > 0) setList(listy[0].pdfIndex);
  }, [pohled, list, listy]);

  // Načtení listu (a jednoho dopředu). Požadavky se nesčítají — každý začátek
  // jen jednou. Neúspěch se zapíše k listu (selhane), ať ho čtečka ukáže, i když
  // šlo o přednačtení a čtenář na ten list přešel, než doběhlo (jinak by
  // „Načítám stranu…" viselo navždy).
  const vyzadano = useRef(new Set<number>());
  const nactiOd = useCallback(async (od: number) => {
    if (vyzadano.current.has(od)) return;
    vyzadano.current.add(od);
    const r = await nactiListy(id, od, LISTU_NARAZ);
    vyzadano.current.delete(od);
    if (r.stav !== 'ok') {
      setSelhane((s) => ({ ...s, [od]: r.zprava }));
      return;
    }
    setTexty((t) => {
      const dalsi = { ...t };
      for (const l of r.data) dalsi[l.pdf_index] = l;
      return dalsi;
    });
    // List mezitím z knihy zmizel (nové zpracování): nečekat donekonečna.
    if (!r.data.some((l) => l.pdf_index === od)) {
      setSelhane((s) => ({ ...s, [od]: 'Tenhle list se nepodařilo načíst — kniha se mezitím možná zpracovala znovu.' }));
    }
  }, [id]);

  useEffect(() => {
    if (pohled !== 'cteni' || list === null || !data) return;
    if (!texty[list]) {
      // Po neúspěchu čeká na „Zkusit znovu" nebo na nový příchod na list.
      if (selhane[list] === undefined) void nactiOd(list);
      return;
    }
    const dalsi = sousedniList(listy, list, 1);
    if (dalsi !== null && !texty[dalsi] && selhane[dalsi] === undefined) void nactiOd(dalsi);
  }, [pohled, list, data, texty, listy, selhane, nactiOd]);

  function zapomenSelhani(pdfIndex: number) {
    setSelhane((s) => {
      if (s[pdfIndex] === undefined) return s;
      const dalsi = { ...s };
      delete dalsi[pdfIndex];
      return dalsi;
    });
  }

  // Po přechodu na jiný list zpátky na začátek strany. Appka neroluje oknem,
  // ale obalem obsahu v Layoutu (div.overflow-y-auto) — window.scrollTo by nic
  // neposunul. Roluje se jen, když je začátek čtení nad horní hranou.
  const ctecka = useRef<HTMLDivElement>(null);
  const nahoru = useRef(false);
  useEffect(() => {
    if (!nahoru.current) return;
    nahoru.current = false;
    const el = ctecka.current;
    if (!el) return;
    const rolovac = rolujiciPredek(el);
    const horniHrana = rolovac ? rolovac.getBoundingClientRect().top : 0;
    if (el.getBoundingClientRect().top < horniHrana) el.scrollIntoView?.({ block: 'start' });
  }, [list, pohled]);

  function otevriList(pdfIndex: number) {
    // Starý neúspěch se zkusí znovu (síť se mohla vrátit).
    zapomenSelhani(pdfIndex);
    setList(pdfIndex);
    setChybaSkoku(null);
    setPohled('cteni');
    nahoru.current = true;
  }

  function skocNaStranu(e: React.FormEvent) {
    e.preventDefault();
    const nalezeny = najdiList(listy, skok);
    if (!nalezeny) {
      setChybaSkoku(`Stranu „${skok.trim()}" v knize nevidím.`);
      return;
    }
    setSkok('');
    otevriList(nalezeny.pdfIndex);
  }

  const nactiDalsiObjekty = useCallback(async (po: number) => {
    setObjekty((o) => ({ polozky: o?.polozky ?? [], dalsi: o?.dalsi ?? null, nacita: true, chyba: null }));
    const r = await nactiObjekty(id, po);
    setObjekty((o) => (r.stav === 'ok'
      ? { polozky: [...(o?.polozky ?? []), ...r.data.objekty], dalsi: r.data.dalsi, nacita: false, chyba: null }
      : { polozky: o?.polozky ?? [], dalsi: o?.dalsi ?? null, nacita: false, chyba: r.zprava }));
  }, [id]);

  useEffect(() => {
    if (pohled === 'objekty' && objekty === null && data) void nactiDalsiObjekty(0);
  }, [pohled, objekty, data, nactiDalsiObjekty]);

  async function otevriOriginal() {
    setChybaOriginalu(null);
    const v = await odkazNaSoubor(id);
    if ('url' in v) window.open(v.url, '_blank', 'noopener');
    else setChybaOriginalu(v.chyba);
  }

  if (kniha === null) return <div className="text-sm text-neutral-300">Načítám knihu…</div>;

  if (kniha.stav !== 'ok') {
    const upozorneni = kniha.stav === 'nezpracovano' || kniha.stav === 'nenasazeno';
    return (
      <div role={upozorneni ? 'note' : 'alert'} className={`rounded-xl border bg-neutral-900 text-neutral-100 p-4 space-y-3 ${upozorneni ? 'border-amber-600' : 'border-rose-600'}`}>
        <div className="text-sm font-bold">{kniha.zprava}</div>
        <div className="flex flex-wrap gap-2">
          {kniha.stav !== 'nenalezeno' && kniha.stav !== 'nezpracovano' && (
            <button type="button" className="btn-tmave" onClick={() => void nacti()}>Zkusit znovu</button>
          )}
          {doKnihovny && <button type="button" className="btn-tmave" onClick={doKnihovny}>Zpět do knihovny</button>}
        </div>
      </div>
    );
  }

  const d = kniha.data.dokument;
  const postup = (d.postup ?? {}) as Record<string, unknown>;
  const pocet = (k: string) => (typeof postup[k] === 'number' ? (postup[k] as number) : null);
  const souhrn = [
    `${listy.length} ${listy[0]?.zdroj === 'soubor' ? 'částí' : 'listů'}`,
    `${kapitoly.length} kapitol`,
    pocet('tabulek') !== null ? `${pocet('tabulek')} tabulek` : null,
    pocet('vzorcu') !== null ? `${pocet('vzorcu')} vzorců` : null,
  ].filter(Boolean).join(' · ');
  const podrobnosti = [d.autor, d.rok, d.vydani].filter(Boolean).join(' · ');
  const aktualni = list !== null ? listPodleCisla.get(list) : undefined;
  const text = list !== null ? texty[list] : undefined;
  const chybaListu = list !== null ? selhane[list] ?? null : null;
  const predchozi = list !== null ? sousedniList(listy, list, -1) : null;
  const dalsi = list !== null ? sousedniList(listy, list, 1) : null;
  const kapitola = list !== null ? kapitolaListu(kniha.data.kapitoly, list) : null;
  const poradiListu = list !== null ? listy.findIndex((l) => l.pdfIndex === list) + 1 : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-2">
        <div className="font-black leading-snug lze-vybrat">{d.nazev}</div>
        {podrobnosti && <div className="text-sm text-neutral-200 lze-vybrat">{podrobnosti}</div>}
        <div className="text-xs font-bold text-neutral-300">{souhrn}</div>
        {d.stav === 'ke_kontrole' && (
          <div className="text-xs font-bold text-amber-200">Část listů je ke kontrole — u nich je upozornění. Čísla ověř v originále.</div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-tmave" onClick={otevriOriginal}><Download size={16} /> Originál</button>
        </div>
        {chybaOriginalu && <div role="alert" className="text-sm font-bold text-rose-300">{chybaOriginalu}</div>}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Pohled na knihu">
        <button type="button" aria-pressed={pohled === 'obsah'} className={pohled === 'obsah' ? 'btn-amber' : 'btn-tmave'} onClick={() => setPohled('obsah')}>
          <ListOrdered size={16} /> Obsah
        </button>
        <button type="button" aria-pressed={pohled === 'cteni'} className={pohled === 'cteni' ? 'btn-amber' : 'btn-tmave'} onClick={() => setPohled('cteni')} disabled={listy.length === 0}>
          <BookOpen size={16} /> Čtení
        </button>
        <button type="button" aria-pressed={pohled === 'objekty'} className={pohled === 'objekty' ? 'btn-amber' : 'btn-tmave'} onClick={() => setPohled('objekty')}>
          <Table size={16} /> Tabulky a vzorce
        </button>
      </div>

      {pohled === 'obsah' && (
        kapitoly.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-600 bg-neutral-900 text-neutral-200 p-4 space-y-3 text-sm">
            <div>Kniha nemá rozpoznané kapitoly — čti ji po stranách.</div>
            {listy.length > 0 && <button type="button" className="btn-tmave" onClick={() => otevriList(listy[0].pdfIndex)}>Číst od začátku</button>}
          </div>
        ) : (
          <ol className="space-y-1.5" aria-label="Obsah knihy">
            {kapitoly.map((k) => {
              const misto = k.strana_od !== null ? oznaceniListu(listPodleCisla.get(k.strana_od), k.strana_od) : null;
              return (
                <li key={k.id} className={k.odsazeni === 2 ? 'ml-8' : k.odsazeni === 1 ? 'ml-4' : ''}>
                  <button
                    type="button"
                    className="btn-tmave w-full justify-between text-left"
                    disabled={k.strana_od === null}
                    onClick={() => k.strana_od !== null && otevriList(k.strana_od)}
                  >
                    <span className="min-w-0 break-words">{k.cislo ? `${k.cislo} ` : ''}{k.nazev}</span>
                    {misto && <span className="shrink-0 text-xs font-bold text-neutral-300">{misto}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )
      )}

      {pohled === 'cteni' && list !== null && (
        <div ref={ctecka} className="space-y-3">
          <div className="sticky top-0 z-20 rounded-xl border border-neutral-700 bg-neutral-900 px-2 py-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-tmave w-11 px-0" aria-label="Předchozí strana" disabled={predchozi === null} onClick={() => predchozi !== null && otevriList(predchozi)}>
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0 flex-1 text-center text-sm font-black tabular-nums text-neutral-100">
              {oznaceniListu(aktualni, list)}
              <span className="block text-[11px] font-bold text-neutral-300">{poradiListu > 0 ? `${poradiListu} z ${listy.length}` : ''}</span>
            </div>
            <button type="button" className="btn-tmave w-11 px-0" aria-label="Další strana" disabled={dalsi === null} onClick={() => dalsi !== null && otevriList(dalsi)}>
              <ChevronRight size={20} />
            </button>
            <form className="flex w-full gap-2 sm:w-auto" onSubmit={skocNaStranu}>
              <label className="sr-only" htmlFor="bible-skok">Jdi na stranu</label>
              <input id="bible-skok" className="input w-full sm:w-28" value={skok} placeholder="strana" onChange={(e) => setSkok(e.target.value)} />
              <button type="submit" className="btn-tmave" disabled={!skok.trim()}>Jdi</button>
            </form>
          </div>
          {chybaSkoku && <div role="alert" className="text-sm font-bold text-amber-200">{chybaSkoku}</div>}
          {kapitola && <div className="text-xs font-bold text-neutral-300">Kapitola: {kapitola.cislo ? `${kapitola.cislo} ` : ''}{kapitola.nazev}</div>}

          <article className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-3" aria-label={`Text: ${oznaceniListu(aktualni, list)}`}>
            {text ? (
              <>
                <div className="text-[11px] font-black uppercase tracking-wide text-neutral-300">{ZDROJ_POPIS[text.zdroj_textu]}</div>
                {text.ke_kontrole && (
                  <div role="note" className="rounded-lg border border-amber-600 bg-neutral-950 p-2 text-sm font-bold text-amber-200">
                    Ke kontrole{text.kontrola_duvod ? `: ${text.kontrola_duvod}` : ''} — čísla ověř v originále.
                  </div>
                )}
                <TextListuKnihy bloky={rozlozText(text.text, text.zdroj_textu)} />
              </>
            ) : chybaListu ? (
              <div role="alert" className="space-y-2">
                <div className="text-sm font-bold text-rose-300">{chybaListu}</div>
                <button type="button" className="btn-tmave" onClick={() => { zapomenSelhani(list); void nactiOd(list); }}>Zkusit znovu</button>
              </div>
            ) : (
              <div className="text-sm text-neutral-300">Načítám stranu…</div>
            )}
          </article>
        </div>
      )}

      {pohled === 'objekty' && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-300">
            Tabulky a vzorce rozpoznané v přepisu skenů a v převedených souborech. U digitálních PDF je najdeš v textu strany nebo v originále.
          </p>
          {objekty && !objekty.nacita && !objekty.chyba && objekty.polozky.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-600 bg-neutral-900 text-neutral-200 p-4 text-sm">V knize nejsou rozpoznané tabulky ani vzorce.</div>
          )}
          {objekty && objekty.polozky.length > 0 && (
            <ul className="space-y-2">
              {objekty.polozky.map((o) => {
                const misto = oznaceniListu(listPodleCisla.get(o.strana_od), o.strana_od);
                return (
                  <li key={o.poradi} className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wide text-amber-300">{DRUH_OBJEKTU[o.druh]}</span>
                      <button type="button" className="btn-tmave" onClick={() => otevriList(o.strana_od)}>Otevřít {misto}</button>
                    </div>
                    {o.nahled && (
                      <div className={`max-h-40 overflow-hidden whitespace-pre-wrap break-words text-sm text-neutral-200 lze-vybrat ${o.druh === 'popisek' ? '' : 'font-mono'}`}>{o.nahled}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Hláška pod seznamem (tam, kde bylo „Načíst další"): po chybě další dávky by nad
              dlouhým seznamem byla mimo obrazovku a přehled by vypadal jako úplný. Bez tlačítka
              by po chybě první dávky nešlo načíst nic, dokud se kniha neotevře znovu. */}
          {objekty?.chyba && (
            <div role="alert" className="space-y-2">
              <div className="text-sm font-bold text-rose-300">{objekty.chyba}</div>
              <button type="button" className="btn-tmave" onClick={() => void nactiDalsiObjekty(objekty.dalsi ?? 0)}>Zkusit znovu</button>
            </div>
          )}
          {objekty?.nacita && <div className="text-sm text-neutral-300">Načítám tabulky a vzorce…</div>}
          {objekty && !objekty.nacita && !objekty.chyba && objekty.dalsi !== null && (
            <button type="button" className="btn-tmave" onClick={() => objekty.dalsi !== null && void nactiDalsiObjekty(objekty.dalsi)}>Načíst další</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Nejbližší předek, který opravdu roluje (v appce obal obsahu v Layoutu). */
function rolujiciPredek(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const styl = getComputedStyle(p);
    if (/(auto|scroll|overlay)/.test(styl.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
}

export default BibleKniha;
