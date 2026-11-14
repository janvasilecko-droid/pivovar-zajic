// 💬 AI sládek — chatbot Pivovarské bible v appce (etapa 5).
// ---------------------------------------------------------------------------
// Majitel 11. 11. 2026: „hlavně ať v aplikaci funguje vyhledávání a hledání
// komplexních odpovědí na problémy — má to být chatbot". Claude hledá
// v knihách, várkách, profilu pivovaru a výpočtech (stejné nástroje jako
// konektor) a odpovídá s citacemi [n]: číslo otevře knihu na stránce, ze
// které odpověď je. Průběžně ukazuje, co právě hledá. Konverzace jsou vidět
// jen tomu, kdo se ptal; útratu hlídá měsíční strop (Správa znalostí).
// Text se skládá z dat (lib/bibleText.ts), nikdy přes innerHTML.
//
// Na předplatné (R31, R33): „Zeptat se v Claude" otevře aplikaci Claude
// s otázkou; otázka se zároveň uloží sem (id dotazu je v zadání) a Claude
// hotovou odpověď uloží konektorem zpátky — appka ji tu sama načte.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, ExternalLink, Globe, History, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import {
  cekajiciNaClauda, nactiKonverzace, nactiKonverzaci, nactiStavChatu, smazKonverzaci, usdText, zalozDotazClaude, zeptejSe,
  type Konverzace, type StavChatu, type UdalostChatu, type ZdrojOdpovedi, type ZpravaChatu,
} from '../../lib/bibleChatApi';
import { odkazNaClaude, KONEKTOR, noveIdDotazu, zadaniProClaude } from '../../lib/bibleClaude';
import { rozlozText } from '../../lib/bibleText';
import { potvrd } from '../../lib/toast';
import { TextListuKnihy, VykresleniTextu } from './BibleKniha';

const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';
const PRIKLADY = [
  'Proč mi pivo málo pění a pěna rychle padá?',
  'Jak upravit rmutování pro plnější tělo ležáku?',
  'Porovnej poslední várky Desítky — proč kolísá varní výtěžek?',
];

const misto = (z: ZdrojOdpovedi) => (z.tistena ? `s. ${z.tistena}` : `list ${z.pdfIndex}`);

/** Jak často se appka ptá, jestli už odpověď z aplikace Claude přišla (prvních 10 min, pak řidčeji). */
export const KONTROLA_ODPOVEDI_MS = 8_000;
const KONTROLA_POZDEJI_MS = 30_000;
/** Po této době bez odpovědi appka napoví, co zkontrolovat. */
const DLOUHO_MS = 15 * 60_000;

/** Číslo citace [n] jako odkaz: kniha otevře čtečku, web novou kartu. */
function Citace({ z, otevri }: { z: ZdrojOdpovedi; otevri: (dokumentId: string, list: number) => void }) {
  const tridy = 'tap mx-0.5 rounded px-0.5 align-baseline text-xs font-black text-amber-300 underline decoration-2 underline-offset-2 hover:text-amber-200';
  if (z.zdroj === 'web' && z.url) {
    return <a href={z.url} target="_blank" rel="noopener noreferrer" className={tridy} aria-label={`Zdroj ${z.n}: ${z.nazev} (web)`}>[{z.n}]</a>;
  }
  return (
    <button type="button" onClick={() => z.dokumentId && z.pdfIndex && otevri(z.dokumentId, z.pdfIndex)} className={tridy}
      title={`${z.nazev}, ${misto(z)}`} aria-label={`Zdroj ${z.n}: ${z.nazev}, ${misto(z)}`}>
      [{z.n}]
    </button>
  );
}

/** Text odpovědi: odrážky, **tučně** a citace [n] (jen React elementy). */
export function vykresliOdpoved(text: string, zdroje: Map<number, ZdrojOdpovedi>, otevri: (dokumentId: string, list: number) => void): ReactNode {
  const sCitacemi = (t: string, klic: string): ReactNode[] => t.split(/(\[\d{1,3}\])/).map((kus, i) => {
    const m = /^\[(\d{1,3})\]$/.exec(kus);
    const z = m ? zdroje.get(Number(m[1])) : undefined;
    return z ? <Citace key={`${klic}-${i}`} z={z} otevri={otevri} /> : kus ? <span key={`${klic}-${i}`}>{kus}</span> : null;
  });
  return text.replace(/^(\s*)[-*] (?=\S)/gm, '$1• ').split(/(\*\*[^*\n]+?\*\*)/).map((kus, i) => {
    const tucne = /^\*\*([^*\n]+?)\*\*$/.exec(kus);
    return tucne
      ? <strong key={i} className="font-black text-neutral-50">{sCitacemi(tucne[1], `b${i}`)}</strong>
      : <span key={i}>{sCitacemi(kus, `t${i}`)}</span>;
  });
}

function Zdroje({ zdroje, otevri }: { zdroje: ZdrojOdpovedi[]; otevri: (dokumentId: string, list: number) => void }) {
  if (zdroje.length === 0) return null;
  return (
    <section className="space-y-2 border-t border-neutral-700 pt-3" aria-label="Zdroje odpovědi">
      <h3 className="text-sm font-black text-neutral-50">Zdroje</h3>
      <ol className="space-y-1">
        {zdroje.map((z) => (
          <li key={z.n}>
            {z.zdroj === 'web' && z.url ? (
              <a href={z.url} target="_blank" rel="noopener noreferrer" className="tap block rounded-lg px-2 py-1.5 text-sm hover:underline">
                <span className="font-black text-amber-300">[{z.n}]</span>{' '}
                <span className="font-bold">{z.nazev}</span>
                <span className="text-neutral-300"> (web, neověřený zdroj)</span> <ExternalLink size={14} className="inline" aria-hidden="true" />
                {z.citat && <span className="block text-xs text-neutral-300">„{z.citat}“</span>}
              </a>
            ) : (
              <button type="button" className="tap w-full rounded-lg px-2 py-1.5 text-left text-sm hover:underline"
                onClick={() => z.dokumentId && z.pdfIndex && otevri(z.dokumentId, z.pdfIndex)}>
                <span className="font-black text-amber-300">[{z.n}]</span>{' '}
                <span className="font-bold">{z.nazev}</span>, {misto(z)}{z.kapitola ? ` · ${z.kapitola}` : ''}
                <span className="text-neutral-300"> ({z.zdroj === 'preklad' ? 'český překlad' : 'originál'})</span>
                {z.citat && <span className="block text-xs text-neutral-300">„{z.citat}“</span>}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Kroky({ kroky }: { kroky: { popis: string; chyba: boolean }[] }) {
  if (kroky.length === 0) return null;
  return (
    <details className="text-xs text-neutral-300">
      <summary className="tap cursor-pointer select-none py-1 font-bold">Jak jsem hledal ({kroky.length} {kroky.length === 1 ? 'krok' : kroky.length < 5 ? 'kroky' : 'kroků'})</summary>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        {kroky.map((k, i) => <li key={i} className={k.chyba ? 'text-rose-300' : ''}>{k.popis}{k.chyba ? ' — nepovedlo se' : ''}</li>)}
      </ol>
    </details>
  );
}

function Odpoved({ z, otevri }: { z: ZpravaChatu; otevri: (dokumentId: string, list: number) => void }) {
  const mapa = new Map(z.citace.map((c) => [c.n, c]));
  return (
    <article className={`${KARTA} space-y-3`} aria-label="Odpověď AI sládka">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-amber-400"><Bot size={16} aria-hidden="true" /> AI sládek</div>
      <Kroky kroky={z.kroky} />
      <VykresleniTextu.Provider value={(t) => vykresliOdpoved(t, mapa, otevri)}>
        <TextListuKnihy bloky={rozlozText(z.text, 'ocr')} />
      </VykresleniTextu.Provider>
      <Zdroje zdroje={z.citace} otevri={otevri} />
      <div className="text-xs text-neutral-400">
        {z.neuplna && <span className="mr-2 rounded border border-amber-600 px-1 font-bold text-amber-200">neúplná odpověď</span>}
        {z.odpovedNa ? 'Odpověď z aplikace Claude · předplatné' : `${z.model ? `${z.model} · ` : ''}${usdText(z.cenaUsd)}`}
      </div>
    </article>
  );
}

/** Otázka je v aplikaci Claude — odpověď sem uloží konektor; appka ji průběžně načítá. */
function CekaNaClauda({ kontroluj, kontroluji, dlouho }: { kontroluj: () => void; kontroluji: boolean; dlouho: boolean }) {
  return (
    <article className={`${KARTA} space-y-2`} aria-label="Čeká na odpověď z aplikace Claude" aria-busy="true">
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-amber-400">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Čeká na odpověď z aplikace Claude
      </div>
      <p className="text-sm text-neutral-200">
        Otázku odešli v aplikaci Claude (v mobilu ji tam vlož ze schránky). Claude odpověď uloží sem — appka ji načte sama, i když se sem vrátíš později.
      </p>
      {dlouho && (
        <p className="text-sm text-amber-200">
          Odpověď zatím nepřišla. Je otázka v Claude odeslaná a je tam zapnutý konektor „{KONEKTOR}“? Kdyby ji Claude neuložil, napiš mu „ulož odpověď do appky“.
        </p>
      )}
      <button type="button" className="btn-tmave" onClick={kontroluj} disabled={kontroluji}>{kontroluji ? 'Kontroluji…' : 'Zkontrolovat teď'}</button>
    </article>
  );
}

function Otazka({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[90%] rounded-xl bg-amber-900 px-3 py-2 text-sm text-amber-50 whitespace-pre-wrap break-words" aria-label="Tvoje otázka">
      {text}
    </div>
  );
}

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function BibleChat({ otevri, problem, otazkaZvenku }: {
  otevri: (dokumentId: string, list: number) => void;
  /** Analýza problému z Analýzy problémů: Claude si ho načte a zapíše zjištění. */
  problem?: { id: string; nazev: string } | null;
  /** Otázka položená odjinud (hledání → „Zeptat se AI sládka", Analýza problémů) — pošle se hned, každý klíč jednou. */
  otazkaZvenku?: { text: string; klic: number } | null;
}) {
  const [stav, setStav] = useState<StavChatu | null>(null);
  const [chybaStavu, setChybaStavu] = useState<string | null>(null);
  const [konverzace, setKonverzace] = useState<Konverzace[] | null>(null);
  const [historie, setHistorie] = useState(false);
  const [aktivni, setAktivni] = useState<{ id: string | null; nazev: string | null; problemId: string | null }>({ id: null, nazev: null, problemId: problem?.id ?? null });
  const [zpravy, setZpravy] = useState<ZpravaChatu[]>([]);
  const [probiha, setProbiha] = useState<{ kroky: string[]; text: string } | null>(null);
  const [otazka, setOtazka] = useState('');
  const [web, setWeb] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  // Claude API bez kreditu (zjištěno z odpovědi) — appka doporučí dotaz přes předplatné v Claude.
  const [bezKreditu, setBezKreditu] = useState(false);
  // Otázka předaná do aplikace Claude (předplatné) — vysvětlení, co dál.
  const [predano, setPredano] = useState(false);
  // Id dalšího dotazu pro aplikaci Claude: je v zadání, ať Claude ví, kam odpověď uložit (R33).
  const [dotazId, setDotazId] = useState(() => noveIdDotazu());
  const [kontroluji, setKontroluji] = useState(false);
  const [dlouho, setDlouho] = useState(false);
  // Otázky pro Clauda, které se právě ukládají (načtení konverzace je nesmí smazat) a kdy odešly.
  const docasne = useRef(new Set<string>());
  const odeslanoKdy = useRef(new Map<string, number>());
  // Která konverzace je právě otevřená — pozdní odpověď serveru nesmí přepsat jinou.
  const aktivniId = useRef<string | null>(null);
  const policko = useRef<HTMLTextAreaElement | null>(null);
  const zruseni = useRef<AbortController | null>(null);
  const odeslano = useRef<number | null>(null);
  const konec = useRef<HTMLDivElement | null>(null);

  const nactiHistorii = () => { void nactiKonverzace().then((r) => setKonverzace(r.stav === 'ok' ? r.data : [])); };

  useEffect(() => {
    void nactiStavChatu().then((r) => {
      if (r.stav === 'ok') setStav(r.data);
      else setChybaStavu(r.zprava);
    });
    nactiHistorii();
    return () => zruseni.current?.abort();
  }, []);

  // Otázka odjinud (Hledání, Analýza problémů) se jen připraví do políčka — kudy se zeptat
  // (předplatné v Claude, nebo tady přes kreditové API), vybere člověk.
  useEffect(() => {
    if (otazkaZvenku?.text.trim() && odeslano.current !== otazkaZvenku.klic) {
      odeslano.current = otazkaZvenku.klic;
      setOtazka(otazkaZvenku.text);
      setPredano(false);
      policko.current?.focus();
    }
  }, [otazkaZvenku?.klic, otazkaZvenku?.text]);

  const vypnuto = stav !== null && (!stav.migrace || !stav.klic || stav.stropUsd <= 0 || stav.utracenoUsd >= stav.stropUsd);
  const ulozitOdpoved = stav?.dotazy === true;
  useEffect(() => { aktivniId.current = aktivni.id; }, [aktivni.id]);
  const cekajici = cekajiciNaClauda(zpravy);
  const cekaNaClauda = cekajici.size > 0 && aktivni.id !== null;

  /** Načte aktivní konverzaci znovu (přišla odpověď z Claude?) — rozepsané otázky nechá. */
  const obnovKonverzaci = useCallback(async (konverzaceId: string): Promise<void> => {
    const r = await nactiKonverzaci(konverzaceId);
    if (r.stav !== 'ok' || aktivniId.current !== konverzaceId) return;
    const naServeru = new Set(r.data.zpravy.map((z) => z.id));
    setZpravy((puv) => [...r.data.zpravy, ...puv.filter((z) => docasne.current.has(z.id) && !naServeru.has(z.id))]);
    const zbyva = cekajiciNaClauda(r.data.zpravy);
    const nejstarsi = Math.min(...r.data.zpravy.filter((z) => zbyva.has(z.id))
      .map((z) => odeslanoKdy.current.get(z.id) ?? (z.vytvoreno ? Date.parse(z.vytvoreno) : Date.now())));
    setDlouho(zbyva.size > 0 && Date.now() - nejstarsi > DLOUHO_MS);
    if (zbyva.size === 0) void nactiKonverzace().then((h) => setKonverzace(h.stav === 'ok' ? h.data : []));
  }, []);

  // Čeká se na odpověď z aplikace Claude: kontrola po pár sekundách (jen když je appka vidět)
  // a hned po návratu do appky (z aplikace Claude).
  useEffect(() => {
    if (!cekaNaClauda || !aktivni.id) return;
    const konverzaceId = aktivni.id;
    const zacatek = Date.now();
    let casovac: ReturnType<typeof setTimeout> | undefined;
    let konec = false;
    const zkontroluj = async () => {
      if (konec) return;
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await obnovKonverzaci(konverzaceId);
      if (!konec) casovac = setTimeout(() => void zkontroluj(), Date.now() - zacatek < 10 * 60_000 ? KONTROLA_ODPOVEDI_MS : KONTROLA_POZDEJI_MS);
    };
    casovac = setTimeout(() => void zkontroluj(), KONTROLA_ODPOVEDI_MS);
    const naNavrat = () => { if (document.visibilityState === 'visible') void obnovKonverzaci(konverzaceId); };
    document.addEventListener('visibilitychange', naNavrat);
    window.addEventListener('focus', naNavrat);
    return () => {
      konec = true;
      clearTimeout(casovac);
      document.removeEventListener('visibilitychange', naNavrat);
      window.removeEventListener('focus', naNavrat);
    };
  }, [cekaNaClauda, aktivni.id, obnovKonverzaci]);

  async function zkontrolujTed() {
    if (!aktivni.id || kontroluji) return;
    setKontroluji(true);
    try { await obnovKonverzaci(aktivni.id); } finally { setKontroluji(false); }
  }

  async function posli(text: string) {
    const q = text.trim();
    if (q.length < 2 || probiha) return;
    setChyba(null);
    const docasna: ZpravaChatu = {
      id: `nova-${Date.now()}`, role: 'uzivatel', text: q, kroky: [], citace: [], model: null, cenaUsd: 0, neuplna: false, vytvoreno: null, proClaude: false, odpovedNa: null,
    };
    setZpravy((z) => [...z, docasna]);
    setOtazka('');
    setProbiha({ kroky: [], text: '' });
    setTimeout(() => konec.current?.scrollIntoView?.({ block: 'nearest' }), 0);
    const ctl = new AbortController();
    zruseni.current = ctl;
    let zacala = false;
    const naUdalost = (u: UdalostChatu) => {
      if (u.typ === 'start') { zacala = true; setAktivni((a) => ({ ...a, id: u.konverzaceId, nazev: a.nazev ?? q })); return; }
      if (u.typ === 'krok') { setProbiha((p) => (p ? { ...p, kroky: [...p.kroky, u.popis] } : p)); return; }
      if (u.typ === 'text') { setProbiha((p) => (p ? { ...p, text: p.text + u.text } : p)); return; }
      if (u.typ === 'mezikrok') { setProbiha((p) => (p ? { ...p, text: '' } : p)); return; }
      if (u.typ === 'hotovo') {
        if (u.chybaKod === 'kredit') { setBezKreditu(true); setOtazka(q); }
        setZpravy((z) => [...z, {
          id: u.zpravaId ?? `odpoved-${Date.now()}`, role: 'asistent', text: u.text, kroky: u.kroky, citace: u.citace,
          model: u.model, cenaUsd: u.cenaUsd, neuplna: u.neuplna, vytvoreno: null, proClaude: false, odpovedNa: null,
        }]);
        setStav((s) => (s ? { ...s, utracenoUsd: u.utracenoUsd, stropUsd: u.stropUsd } : s));
        setProbiha(null);
        return;
      }
      if (u.typ === 'chyba') {
        if (u.kod === 'kredit') { setBezKreditu(true); setOtazka(q); }
        setChyba(u.zprava);
        setProbiha(null);
      }
    };
    const r = await zeptejSe({ otazka: q, konverzaceId: aktivni.id, problemId: problem?.id ?? aktivni.problemId, web }, naUdalost, ctl.signal);
    if (zruseni.current === ctl) zruseni.current = null;
    setProbiha(null);
    if (!r.ok && r.chyba.kod !== 'zruseno') {
      if (r.chyba.kod === 'kredit') setBezKreditu(true);
      setChyba(r.chyba.zprava);
      // Otázka se neuložila (strop, chybí klíč…) — vrátí se do políčka, ať se neztratí.
      if (!zacala) { setZpravy((z) => z.filter((x) => x.id !== docasna.id)); setOtazka(q); }
    }
    nactiHistorii();
  }

  async function otevriKonverzaci(k: Konverzace) {
    if (probiha) return;
    setChyba(null);
    const r = await nactiKonverzaci(k.id);
    if (r.stav !== 'ok') { setChyba(r.zprava); return; }
    setAktivni({ id: r.data.id, nazev: r.data.nazev, problemId: r.data.problemId });
    setZpravy(r.data.zpravy);
    setHistorie(false);
  }

  async function smaz(k: Konverzace) {
    if (!(await potvrd(`Smazat konverzaci „${k.nazev}“? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    const r = await smazKonverzaci(k.id);
    if (r.stav !== 'ok') { setChyba(r.zprava); return; }
    if (aktivni.id === k.id) novaKonverzace();
    nactiHistorii();
  }

  /**
   * Předání do aplikace Claude: odkaz otevře chat s otázkou, zadání jde i do
   * schránky (mobilní aplikace). S `id` se otázka zároveň uloží do konverzace
   * a appka čeká na odpověď, kterou sem Claude uloží konektorem (R33).
   */
  function predejClaudovi(zadani: string, q: string, id: string | null) {
    setPredano(true);
    try {
      void navigator.clipboard?.writeText(zadani).catch(() => {});
    } catch {
      // Schránka není (starý prohlížeč) — odkaz otázku předvyplní i tak.
    }
    if (!id) return;
    const konverzaceId = aktivni.id;
    const problemId = problem?.id ?? aktivni.problemId;
    // Změny stavu až po klepnutí: odkaz se musí otevřít s adresou, na kterou člověk klepl.
    setTimeout(() => {
      docasne.current.add(id);
      odeslanoKdy.current.set(id, Date.now());
      setZpravy((z) => [...z, {
        id, role: 'uzivatel', text: q, kroky: [], citace: [], model: null, cenaUsd: 0, neuplna: false, vytvoreno: null, proClaude: true, odpovedNa: null,
      }]);
      setOtazka('');
      setDlouho(false);
      setDotazId(noveIdDotazu());
      setTimeout(() => konec.current?.scrollIntoView?.({ block: 'nearest' }), 0);
      void zalozDotazClaude({ dotazId: id, otazka: q, konverzaceId, problemId }).then((r) => {
        docasne.current.delete(id);
        // Mezitím otevřel jinou konverzaci (nebo novou otázku) — tam nic neměnit.
        const jinde = aktivniId.current !== konverzaceId;
        if (r.stav === 'ok') {
          if (r.data.konverzaceId && !jinde) setAktivni((a) => ({ ...a, id: r.data.konverzaceId, nazev: a.nazev ?? q }));
          nactiHistorii();
          return;
        }
        if (jinde) { setChyba(`Otázka „${q.slice(0, 60)}“ se do appky neuložila — odpověď uvidíš jen v aplikaci Claude.`); return; }
        setZpravy((z) => z.filter((x) => x.id !== id));
        setOtazka(q);
        setChyba(r.kod === 'bez_migrace'
          ? 'Otázka se do appky neuložila — ukládání odpovědí čeká na migraci databáze bible 20261114000000_bible_dotazy_claude. Odpověď uvidíš v aplikaci Claude.'
          : `Otázka se do appky neuložila (${r.zprava}) — odpověď uvidíš jen v aplikaci Claude.`);
      });
    }, 0);
  }

  function novaKonverzace() {
    zruseni.current?.abort();
    setAktivni({ id: null, nazev: null, problemId: problem?.id ?? null });
    setZpravy([]);
    setProbiha(null);
    setChyba(null);
    setDlouho(false);
  }

  const zadaniClaude = zadaniProClaude(otazka, problem ?? null, ulozitOdpoved ? { id: dotazId, navazuje: zpravy.length > 0 } : null);

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Zeptej se jako sládka — na problém, postup, hodnotu nebo várky. AI sládek (Claude) hledá v knihách, várkách, profilu pivovaru
        a ve zkušenostech, čísla počítá výpočetním modulem a u každého tvrzení z knih dá odkaz na stránku. Na tvoje předplatné Claude
        odpovídá v aplikaci Claude přes konektor „{KONEKTOR}“{ulozitOdpoved ? ' a odpověď uloží sem' : ''}; přímo tady v appce přes Claude API (platí se kredit).
      </p>

      {chybaStavu && <div role="alert" className="text-sm font-bold text-rose-300">{chybaStavu}</div>}
      {stav && (
        !stav.migrace ? (
          <div role="note" className={`${KARTA} text-sm text-amber-100`}>AI sládek čeká na migraci databáze bible (Systém → Databázové migrace → Databáze bible → 20261111030000_bible_chat).</div>
        ) : !stav.klic ? (
          <div role="note" className={`${KARTA} text-sm text-amber-100`}>AI sládek ještě nemá klíč k Claude API — doplní ho příští nasazení appky z app_secrets (ANTHROPIC_API_KEY). Přes předplatné se zeptáš tlačítkem „Zeptat se v Claude“.</div>
        ) : stav.stropUsd <= 0 ? (
          <div role="note" className={`${KARTA} text-sm text-amber-100`}>AI sládek je vypnutý (měsíční strop útraty je 0 USD). Zapne ho správce ve Správě znalostí → Útrata za AI. Přes předplatné se zeptáš tlačítkem „Zeptat se v Claude“.</div>
        ) : (
          <div className={`text-xs ${stav.utracenoUsd >= stav.stropUsd ? 'font-bold text-rose-300' : 'text-neutral-300'}`}>
            Útrata za AI tento měsíc: {usdText(stav.utracenoUsd)} z {usdText(stav.stropUsd)}{stav.model ? ` · model ${stav.model}` : ''}
            {stav.utracenoUsd >= stav.stropUsd && ' — strop je vyčerpaný, zvýšit ho může správce ve Správě znalostí.'}
          </div>
        )
      )}

      {(problem || aktivni.problemId) && (
        <div role="note" className="rounded-lg border border-amber-700 bg-neutral-900 p-2 text-sm text-amber-100">
          Analýza problému{problem ? ` „${problem.nazev}“` : ''}: AI sládek si načte příznaky a dotčené várky a podstatná zjištění zapíše k problému
          (hypotézy potvrzuje člověk v Analýze problémů).
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-tmave" onClick={novaKonverzace} disabled={!!probiha}><Plus size={18} /> Nová otázka</button>
        <button type="button" className="btn-tmave" aria-expanded={historie} onClick={() => setHistorie((h) => !h)}>
          <History size={18} /> Historie{konverzace && konverzace.length > 0 ? ` (${konverzace.length})` : ''}
        </button>
      </div>

      {historie && (
        <section className={`${KARTA} space-y-2`} aria-label="Historie konverzací">
          {konverzace === null ? <div className="text-sm text-neutral-300">Načítám…</div>
            : konverzace.length === 0 ? <div className="text-sm text-neutral-300">Zatím žádné konverzace.</div> : (
              <ul className="space-y-1">
                {konverzace.map((k) => (
                  <li key={k.id} className="flex items-center gap-2">
                    <button type="button" className={`tap min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm hover:underline ${aktivni.id === k.id ? 'font-black text-amber-200' : 'text-neutral-100'}`}
                      onClick={() => void otevriKonverzaci(k)}>
                      <span className="block truncate">{k.nazev}</span>
                      <span className="block text-xs text-neutral-400">{datum(k.upraveno)} · {k.zprav} zpráv{k.problemId ? ' · problém' : ''}{k.cekaClaude ? ' · čeká na odpověď z Claude' : ''}</span>
                    </button>
                    <button type="button" className="btn-tmave w-11 px-0" aria-label={`Smazat konverzaci ${k.nazev}`} onClick={() => void smaz(k)}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}

      <div className="space-y-3" aria-live="polite">
        {zpravy.length === 0 && !probiha && !problem && (
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-amber-400">Například</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {PRIKLADY.map((p) => (
                <button key={p} type="button" className="btn justify-start p-3 text-left text-sm font-bold bg-neutral-900 text-neutral-100 border border-neutral-700 hover:border-amber-500 hover:bg-neutral-800"
                  onClick={() => setOtazka(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {zpravy.map((z) => (z.role === 'uzivatel' ? <Otazka key={z.id} text={z.text} /> : <Odpoved key={z.id} z={z} otevri={otevri} />))}
        {cekajici.size > 0 && <CekaNaClauda kontroluj={() => void zkontrolujTed()} kontroluji={kontroluji || !cekaNaClauda} dlouho={dlouho} />}
        {probiha && (
          <article className={`${KARTA} space-y-2`} aria-label="AI sládek odpovídá" aria-busy="true">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-amber-400">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> AI sládek {probiha.text ? 'píše odpověď' : 'hledá'}…
            </div>
            {probiha.kroky.length > 0 && (
              <ol className="list-decimal space-y-0.5 pl-5 text-xs text-neutral-300">
                {probiha.kroky.map((k, i) => <li key={i}>{k}</li>)}
              </ol>
            )}
            {probiha.text && <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-100">{probiha.text}</div>}
            <button type="button" className="btn-tmave" onClick={() => zruseni.current?.abort()}>Přestat čekat</button>
          </article>
        )}
        {chyba && <div role="alert" className="rounded-lg border border-rose-700 bg-neutral-900 p-2 text-sm font-bold text-rose-200 break-words">{chyba}</div>}
        <div ref={konec} />
      </div>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void posli(otazka); }}>
        <label className="sr-only" htmlFor="bible-chat-otazka">Otázka pro AI sládka</label>
        <textarea
          id="bible-chat-otazka"
          ref={policko}
          className="input w-full min-h-[90px] normal-case"
          maxLength={4000}
          value={otazka}
          placeholder={problem ? 'Např. Najdi možné příčiny a co mám ověřit.' : 'Např. Proč mi pivo málo pění?'}
          onChange={(e) => { setOtazka(e.target.value); setPredano(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void posli(otazka); } }}
        />
        {bezKreditu && (
          <div role="note" className="rounded-lg border border-amber-700 bg-neutral-900 p-2 text-sm text-amber-100">
            Claude API nemá kredit. Zeptej se zdarma přes svoje předplatné — tlačítkem „Zeptat se v Claude (předplatné)“, otázka je v políčku.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {otazka.trim().length >= 2 ? (
            <a className="btn-amber" href={odkazNaClaude(zadaniClaude)} target="_blank" rel="noopener noreferrer"
              onClick={() => predejClaudovi(zadaniClaude, otazka.trim(), ulozitOdpoved ? dotazId : null)}>
              <ExternalLink size={18} aria-hidden="true" /> Zeptat se v Claude (předplatné)
            </a>
          ) : (
            <button type="button" className="btn-amber" disabled>
              <ExternalLink size={18} aria-hidden="true" /> Zeptat se v Claude (předplatné)
            </button>
          )}
          <button type="submit" className="btn-tmave" disabled={!!probiha || otazka.trim().length < 2 || vypnuto}>
            <Send size={18} /> Odpovědět tady (Claude API)
          </button>
          <label className="tap flex items-center gap-2 text-sm text-neutral-200">
            <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={web} onChange={(e) => setWeb(e.target.checked)} />
            <Globe size={16} aria-hidden="true" /> Hledat i na internetu
          </label>
        </div>
        {predano && (
          <div role="status" className="rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm text-neutral-100">
            Otázka je v Claude — odeslat ji musíš tam. Je i ve schránce: v mobilní aplikaci Claude ji stačí vložit. Konektor „{KONEKTOR}“
            musí být v Claude připojený (Pivovarská bible → Správa znalostí → Aplikace Claude).
            {ulozitOdpoved
              ? ' Claude odpověď uloží sem do konverzace a appka ji načte sama.'
              : ' Aby se odpovědi ukládaly i sem, je potřeba pustit migraci bible 20261114000000_bible_dotazy_claude (Systém → Databázové migrace → Databáze bible).'}
          </div>
        )}
        <p className="text-xs text-neutral-400">
          „Zeptat se v Claude“: odpovídá tvoje předplatné Claude přes konektor „{KONEKTOR}“; v Claude otázku jen odešli
          {ulozitOdpoved ? ' a odpověď i s odkazy na stránky knih se uloží sem (i do historie)' : ' — odpověď s odkazy na stránky knih je v aplikaci Claude'}.
          „Odpovědět tady“: odpověď přímo v appce přes Claude API — obvykle 20–90 sekund, řádově desetníky dolaru z kreditu. Internet je pomalejší
          a dražší; web se v odpovědi uvádí zvlášť jako neověřený zdroj.
        </p>
      </form>
    </div>
  );
}
