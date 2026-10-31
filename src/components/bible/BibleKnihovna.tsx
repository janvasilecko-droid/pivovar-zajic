// 📚 Odborná knihovna — přehled knih, nahrávání a skutečný stav zpracování.
// ---------------------------------------------------------------------------
// Zadání 30. 10. 2026 (bod 5 knihovny): přehled všech knih, nahrávání,
// informace o dokončení zpracování, počet stran a kapitol. Bod 6: u každé
// knihy skutečný stav — kniha, která není zpracovaná, se tak i ukazuje.
//
// Hledání v obsahu (vzorce, tabulky, pojmy) a otevření pasáže na stránce
// přijdou se zpracováním a vyhledáváním (etapy 2 a 4).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePosledniNacteni } from '../../lib/nacitani';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import {
  DRUH_POPIS, JAZYK_POPIS, STAV_POPIS, intervalObnovy, jeZpracovany, postupText, procentZpracovani, prubehText,
  textCekani, velikostText, type StavDokumentu,
} from '../../lib/bibleKnihovna';
import {
  nactiDokumenty, nastavStav, odkazNaSoubor, smazDokument, ulozenyPopis, upravPopis,
  type BibleDokument, type Nacteno, type Popis,
} from '../../lib/bibleKnihovnaApi';
import { BibleNahrat } from './BibleNahrat';
import { POPISEK, PolePopisu } from './BiblePopisPole';

const BARVA_STAVU: Record<StavDokumentu, string> = {
  nahrava: 'border-amber-400 text-amber-200',
  ceka: 'border-amber-600 text-amber-300',
  zpracovava: 'border-sky-600 text-sky-300',
  hotovo: 'border-emerald-600 text-emerald-300',
  ke_kontrole: 'border-violet-500 text-violet-300',
  chyba: 'border-rose-600 text-rose-300',
  pozastaveno: 'border-neutral-500 text-neutral-200',
};

function StavStitek({ stav, procent }: { stav: StavDokumentu; procent?: number | null }) {
  return (
    <span className={`inline-block rounded-full border bg-neutral-950 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${BARVA_STAVU[stav]}`}>
      {STAV_POPIS[stav]}{stav === 'zpracovava' && procent != null ? ` · ${procent} %` : ''}
    </span>
  );
}

/** Pruh průběhu zpracování (worker hlásí stav do postup.prubeh, seznam se sám obnovuje). */
function PrubehZpracovani({ d }: { d: BibleDokument }) {
  const procent = procentZpracovani(d.postup);
  const text = prubehText(d.stav, d.postup);
  return (
    <div className="space-y-1 pt-1">
      <div
        className="h-2.5 w-full rounded-full bg-neutral-700 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={procent ?? undefined}
        aria-valuetext={text ?? 'začíná'}
        aria-label="Zpracování knihy"
      >
        <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${procent ?? 0}%` }} />
      </div>
      {text && <div className="font-bold text-sky-300">{text}</div>}
    </div>
  );
}

const popisZDokumentu = (d: BibleDokument): Popis => ({
  nazev: d.nazev, autor: d.autor, vydani: d.vydani, rok: d.rok, isbn: d.isbn, jazyk: d.jazyk,
  druh: d.druh, oblasti: d.oblasti, zdroj: d.zdroj, licence: d.licence,
});

function KartaDokumentu({ d, role, mujId, onZmena, onSmazano, onRozpracovani, zpracovavaSeJina }: {
  d: BibleDokument;
  role: BibleRole;
  mujId: string | null;
  onZmena: (d: BibleDokument) => void;
  onSmazano: (id: string) => void;
  /** Rozepsaný popis nebo potvrzení mazání: obnova seznamu počká (karta se nesmí ztratit). */
  onRozpracovani: (id: string, ano: boolean) => void;
  /** Právě se zpracovává jiná kniha (čekající přijde na řadu ve stejném běhu). */
  zpracovavaSeJina: boolean;
}) {
  const [uprava, setUprava] = useState<Popis | null>(null);
  const [mazani, setMazani] = useState(false);
  const rozpracovana = uprava !== null || mazani;
  useEffect(() => {
    onRozpracovani(d.id, rozpracovana);
    return () => onRozpracovani(d.id, false);
  }, [d.id, rozpracovana, onRozpracovani]);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const spravce = smiSpravovat(role);
  const vlastni = smiPrispivat(role) && d.nahral === mujId;
  const smiUpravit = spravce || vlastni;
  // Nedokončené nahrání: soubor nedorazil celý — dokončí ho nové nahrání
  // téhož souboru, nebo se zruší (smí i ten, kdo ho začal).
  const nahrava = d.stav === 'nahrava';
  const smiSmazat = spravce || (nahrava && vlastni);
  const podrobnosti = [d.autor, d.rok, d.vydani].filter(Boolean).join(' · ');
  const postup = postupText(d.postup, d.stran_celkem);

  async function akce(fn: () => Promise<string | null>, poUspechu?: () => void) {
    setBezi(true);
    setChyba(null);
    const e = await fn();
    setBezi(false);
    if (e) setChyba(e);
    else poUspechu?.();
  }

  async function otevriOriginal() {
    setChyba(null);
    const v = await odkazNaSoubor(d.id);
    if ('url' in v) window.open(v.url, '_blank', 'noopener');
    else setChyba(v.chyba);
  }

  return (
    <li className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="font-black leading-snug lze-vybrat">{d.nazev}</div>
          {podrobnosti && <div className="text-sm text-neutral-200 lze-vybrat">{podrobnosti}</div>}
        </div>
        <StavStitek stav={d.stav} procent={procentZpracovani(d.postup)} />
      </div>
      <div className="text-xs text-neutral-300 space-y-0.5">
        <div>
          {DRUH_POPIS[d.druh]}{d.jazyk ? ` · ${JAZYK_POPIS[d.jazyk]}` : ''}
          {d.oblasti.length > 0 && ` · oblasti ${d.oblasti.join(', ')}`}
        </div>
        <div className="break-all">{d.soubor_nazev} · {velikostText(d.soubor_velikost)}</div>
        {d.stav === 'zpracovava' && <PrubehZpracovani d={d} />}
        {d.stav === 'ceka' && (
          <div className="font-bold text-amber-200">
            {textCekani(zpracovavaSeJina, d.postup, d.zpracovano_at)}
            {prubehText(d.stav, d.postup) ? ` ${prubehText(d.stav, d.postup)}.` : ''}
          </div>
        )}
        {postup && d.stav !== 'zpracovava' && <div className="font-bold text-neutral-100">{postup}</div>}
        {d.stav_zprava && <div className={`font-bold ${d.stav === 'chyba' ? 'text-rose-300' : 'text-amber-200'}`}>{d.stav_zprava}</div>}
        {nahrava && (smiSmazat ? (
          <div className="font-bold text-amber-200">
            Soubor ještě nedorazil celý. Když se nahrávání přerušilo, vyber v „Nahrát knihy" stejný soubor znovu — nahrání se dokončí. Nebo ho zruš.
          </div>
        ) : (
          <div className="font-bold text-amber-200">
            Rozpracované nahrání{d.nahral_jmeno ? ` (${d.nahral_jmeno})` : ''} — dokončit nebo zrušit ho může jen ten, kdo ho začal, nebo správce knihovny.
          </div>
        ))}
        <div>Nahrál {d.nahral_jmeno ?? '—'}, {new Date(d.created_at).toLocaleDateString('cs-CZ')}</div>
      </div>

      {uprava ? (
        <div className="space-y-3 pt-2">
          <PolePopisu popis={uprava} zmen={setUprava} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-amber"
              disabled={bezi || !uprava.nazev.trim()}
              onClick={() => akce(() => upravPopis(d.id, uprava), () => { onZmena({ ...d, ...ulozenyPopis(uprava) }); setUprava(null); })}
            >
              Uložit popis
            </button>
            <button type="button" className="btn-tmave" disabled={bezi} onClick={() => setUprava(null)}>Zrušit</button>
          </div>
        </div>
      ) : mazani ? (
        <div className="rounded-xl border border-rose-600 bg-neutral-950 text-neutral-100 p-3 space-y-2">
          <div className="text-sm font-bold">
            {nahrava
              ? `Zrušit nedokončené nahrání „${d.nazev}"? Originál ve složce u tebe zůstane.`
              : `Opravdu smazat „${d.nazev}"? Zmizí záznam i soubor v úložišti. Originál ve složce u tebe zůstane.`}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-danger" disabled={bezi} onClick={() => akce(() => smazDokument(d.id), () => onSmazano(d.id))}>{nahrava ? 'Ano, zrušit' : 'Ano, smazat'}</button>
            <button type="button" className="btn-tmave" disabled={bezi} onClick={() => setMazani(false)}>Ne</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          {!nahrava && <button type="button" className="btn-tmave btn-sm" onClick={otevriOriginal}><Download size={16} /> Originál</button>}
          {smiUpravit && (
            <button type="button" className="btn-tmave btn-sm" onClick={() => setUprava(popisZDokumentu(d))}><Pencil size={16} /> Upravit popis</button>
          )}
          {spravce && !nahrava && d.stav !== 'ceka' && d.stav !== 'zpracovava' && (
            <button type="button" className="btn-tmave btn-sm" disabled={bezi} onClick={() => akce(() => nastavStav(d.id, 'ceka'), () => onZmena({ ...d, stav: 'ceka', stav_zprava: null }))}>
              <RotateCcw size={16} /> Zpracovat znovu
            </button>
          )}
          {/* Pozastavit jde i rozpracovaný dokument: worker to pozná a přestane (přepsané strany zůstanou). */}
          {spravce && (d.stav === 'ceka' || d.stav === 'zpracovava') && (
            <button type="button" className="btn-tmave btn-sm" disabled={bezi} onClick={() => akce(() => nastavStav(d.id, 'pozastaveno'), () => onZmena({ ...d, stav: 'pozastaveno', stav_zprava: null }))}>
              <Pause size={16} /> Pozastavit
            </button>
          )}
          {smiSmazat && (
            <button type="button" className="btn-tmave btn-sm" onClick={() => setMazani(true)}><Trash2 size={16} /> {nahrava ? 'Zrušit nahrání' : 'Smazat'}</button>
          )}
        </div>
      )}
      {chyba && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
    </li>
  );
}

export function BibleKnihovna({ role, setPage }: {
  role: BibleRole;
  setPage?: (p: any, sec?: string, sub?: string) => void;
}) {
  const { user } = useAuth();
  const [nacteno, setNacteno] = useState<Nacteno | null>(null);
  const [nahravani, setNahravani] = useState(false);
  const [hledat, setHledat] = useState('');
  const [stav, setStav] = useState<StavDokumentu | ''>('');
  const [oblast, setOblast] = useState('');

  // Platí jen poslední načtení: starší odpověď (pomalá síť, studený start
  // bible-api) nesmí přepsat novější stav ani vlastní změnu v appce.
  const zacniNacteni = usePosledniNacteni();
  const nacti = useCallback(async () => {
    const smiZapsat = zacniNacteni();
    setNacteno(null);
    const n = await nactiDokumenty();
    if (smiZapsat()) setNacteno(n);
  }, [zacniNacteni]);
  useEffect(() => { void nacti(); }, [nacti]);

  // Dokud se něco zpracovává (nebo čeká), seznam se sám obnoví — procenta
  // a stav se mění bez ručního obnovení stránky. Potichu: při chybě sítě
  // zůstane poslední načtený stav. Nenačítá se na skryté záložce, při
  // otevřeném nahrávání (právě nahrávaný soubor by vypadal jako přerušený)
  // ani při rozepsaném popisu nebo potvrzení mazání (karta by se ztratila).
  const zpracovavaSe = (nacteno?.stav === 'ok' ? nacteno.dokumenty : []).some((d) => d.stav === 'zpracovava');
  const nekdoCeka = (nacteno?.stav === 'ok' ? nacteno.dokumenty : []).some((d) => d.stav === 'ceka');
  const rozpracovane = useRef(new Set<string>());
  // Otevřená úprava (nebo nahrávání) zahodí i obnovu, která už letí — jinak
  // by její odpověď kartu s rozepsaným textem s filtrem stejně schovala.
  const hlasRozpracovani = useCallback((id: string, ano: boolean) => {
    if (ano) {
      rozpracovane.current.add(id);
      zacniNacteni();
    } else rozpracovane.current.delete(id);
  }, [zacniNacteni]);
  const obnovPotichu = useCallback(() => {
    if (nahravani || rozpracovane.current.size > 0) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const smiZapsat = zacniNacteni();
    void nactiDokumenty().then((n) => { if (smiZapsat() && n.stav === 'ok') setNacteno(n); });
  }, [nahravani, zacniNacteni]);
  const interval = intervalObnovy(zpracovavaSe, nekdoCeka);
  useEffect(() => {
    if (interval === null) return;
    const casovac = setInterval(obnovPotichu, interval);
    const priNavratu = () => { if (!document.hidden) obnovPotichu(); };
    document.addEventListener('visibilitychange', priNavratu);
    return () => { clearInterval(casovac); document.removeEventListener('visibilitychange', priNavratu); };
  }, [interval, obnovPotichu]);

  const dokumenty = useMemo(() => (nacteno?.stav === 'ok' ? nacteno.dokumenty : []), [nacteno]);
  // Vlastní změna je novější než obnova, která už letí — ta se zahodí.
  const zmenDokument = (d: BibleDokument) => { zacniNacteni(); setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: n.dokumenty.map((x) => (x.id === d.id ? d : x)) } : n)); };
  // Dokončené dřívější nahrání má stejné id — nahradí se, nepřidá podruhé.
  const pridejDokument = (d: BibleDokument) => { zacniNacteni(); setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: [d, ...n.dokumenty.filter((x) => x.id !== d.id)] } : n)); };
  const odeberDokument = (id: string) => { zacniNacteni(); setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: n.dokumenty.filter((x) => x.id !== id) } : n)); };

  const filtrovane = useMemo(() => {
    const q = hledat.trim().toLocaleLowerCase('cs');
    return dokumenty.filter((d) =>
      (!stav || d.stav === stav)
      && (!oblast || d.oblasti.includes(oblast))
      && (!q || [d.nazev, d.autor, d.soubor_nazev, d.isbn].some((t) => (t ?? '').toLocaleLowerCase('cs').includes(q))));
  }, [dokumenty, hledat, stav, oblast]);

  const zpracovanych = dokumenty.filter((d) => jeZpracovany(d.stav)).length;
  const cekajicich = dokumenty.filter((d) => d.stav === 'ceka' || d.stav === 'zpracovava').length;
  const chyb = dokumenty.filter((d) => d.stav === 'chyba').length;
  const velikost = dokumenty.reduce((s, d) => s + d.soubor_velikost, 0);

  if (nacteno === null) return <div className="text-sm text-neutral-300">Načítám knihovnu…</div>;

  if (nacteno.stav === 'bez_migrace') {
    return (
      <div role="alert" className="rounded-xl border-2 border-amber-500 bg-neutral-900 text-neutral-100 p-4 space-y-2">
        <div className="text-sm font-black">Databáze bible ještě nemá tabulky.</div>
        <div className="text-sm text-neutral-200">
          Bible má vlastní databázi (samostatný projekt Supabase). Spusť migraci <strong>20261101000000_bible_zaklad</strong> v Systém → Databázové migrace → Databáze bible a pak se sem vrať.
        </div>
        {setPage && <button type="button" className="btn-amber" onClick={() => setPage('audit')}>Otevřít Systém → Databázové migrace</button>}
      </div>
    );
  }

  if (nacteno.stav === 'chyba') {
    return (
      <div role="alert" className="rounded-xl border border-rose-600 bg-neutral-900 text-neutral-100 p-4 space-y-2">
        <div className="text-sm font-bold">Knihovnu se nepodařilo načíst: {nacteno.zprava}</div>
        <button type="button" className="btn-tmave" onClick={() => void nacti()}>Zkusit znovu</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Dokumentů', String(dokumenty.length)],
          ['Zpracováno', String(zpracovanych)],
          ['Čeká', String(cekajicich)],
          ['Velikost', velikostText(velikost)],
        ].map(([nazev, hodnota]) => (
          <div key={nazev} className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 px-3 py-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-300">{nazev}</div>
            <div className="text-xl font-black tabular-nums">{hodnota}</div>
          </div>
        ))}
      </div>

      {chyb > 0 && <div className="text-sm font-bold text-rose-300">{chyb} dokumentů se nepodařilo zpracovat — důvod je u knihy.</div>}

      {cekajicich > 0 && zpracovanych === 0 && (
        <div role="note" className="rounded-xl border border-amber-700 bg-neutral-900 text-neutral-100 p-3 text-sm">
          Nahrané knihy čekají na zpracování (strany, kapitoly, OCR skenů, tabulky a vzorce). Zpracování běží samo každé tři hodiny — u každé knihy je napsáno, kdy přijde na řadu. Dokud kniha není zpracovaná, AI z ní neodpovídá.
        </div>
      )}

      {smiPrispivat(role) && (nahravani ? (
        <BibleNahrat onNahrano={pridejDokument} onZavrit={() => setNahravani(false)} />
      ) : (
        <button type="button" className="btn-amber" onClick={() => { zacniNacteni(); setNahravani(true); }}><Upload size={18} /> Nahrát knihy</button>
      ))}

      {dokumenty.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className={POPISEK}>Hledat v názvech</span>
            <input className="input" value={hledat} placeholder="název, autor, soubor, ISBN" onChange={(e) => setHledat(e.target.value)} />
          </label>
          <label className="block">
            <span className={POPISEK}>Stav</span>
            <select className="input" value={stav} onChange={(e) => setStav(e.target.value as StavDokumentu | '')}>
              <option value="">Všechny</option>
              {(Object.keys(STAV_POPIS) as StavDokumentu[]).map((s) => <option key={s} value={s}>{STAV_POPIS[s]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={POPISEK}>Oblast</span>
            <select className="input" value={oblast} onChange={(e) => setOblast(e.target.value)}>
              <option value="">Všechny</option>
              {BIBLE_OBLASTI.map((o) => <option key={o.kod} value={o.kod}>{o.kod} · {o.nazev}</option>)}
            </select>
          </label>
        </div>
      )}

      {dokumenty.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-600 bg-neutral-900 text-neutral-200 p-6 text-center text-sm">
          V knihovně zatím nic není.{smiPrispivat(role) ? ' Nahraj první knihy tlačítkem „Nahrát knihy".' : ''}
        </div>
      ) : filtrovane.length === 0 ? (
        <div className="text-sm text-neutral-300">Filtru nic neodpovídá.</div>
      ) : (
        <ul className="space-y-3">
          {filtrovane.map((d) => (
            <KartaDokumentu key={d.id} d={d} role={role} mujId={user?.id ?? null} onZmena={zmenDokument} onSmazano={odeberDokument}
              onRozpracovani={hlasRozpracovani} zpracovavaSeJina={zpracovavaSe} />
          ))}
        </ul>
      )}
    </div>
  );
}
