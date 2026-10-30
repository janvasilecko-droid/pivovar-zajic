// 📚 Odborná knihovna — přehled knih, nahrávání a skutečný stav zpracování.
// ---------------------------------------------------------------------------
// Zadání 30. 10. 2026 (bod 5 knihovny): přehled všech knih, nahrávání,
// informace o dokončení zpracování, počet stran a kapitol. Bod 6: u každé
// knihy skutečný stav — kniha, která není zpracovaná, se tak i ukazuje.
//
// Hledání v obsahu (vzorce, tabulky, pojmy) a otevření pasáže na stránce
// přijdou se zpracováním a vyhledáváním (etapy 2 a 4).
import { useEffect, useMemo, useState } from 'react';
import { Download, Pause, Pencil, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import {
  DRUH_POPIS, JAZYK_POPIS, STAV_POPIS, jeZpracovany, postupText, velikostText, type StavDokumentu,
} from '../../lib/bibleKnihovna';
import {
  nactiDokumenty, nastavStav, odkazNaSoubor, smazDokument, ulozenyPopis, upravPopis,
  type BibleDokument, type Nacteno, type Popis,
} from '../../lib/bibleKnihovnaApi';
import { BibleNahrat } from './BibleNahrat';
import { POPISEK, PolePopisu } from './BiblePopisPole';

const BARVA_STAVU: Record<StavDokumentu, string> = {
  ceka: 'border-amber-600 text-amber-300',
  zpracovava: 'border-sky-600 text-sky-300',
  hotovo: 'border-emerald-600 text-emerald-300',
  ke_kontrole: 'border-violet-500 text-violet-300',
  chyba: 'border-rose-600 text-rose-300',
  pozastaveno: 'border-neutral-500 text-neutral-200',
};

function StavStitek({ stav }: { stav: StavDokumentu }) {
  return (
    <span className={`inline-block rounded-full border bg-neutral-950 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${BARVA_STAVU[stav]}`}>
      {STAV_POPIS[stav]}
    </span>
  );
}

const popisZDokumentu = (d: BibleDokument): Popis => ({
  nazev: d.nazev, autor: d.autor, vydani: d.vydani, rok: d.rok, isbn: d.isbn, jazyk: d.jazyk,
  druh: d.druh, oblasti: d.oblasti, zdroj: d.zdroj, licence: d.licence,
});

function KartaDokumentu({ d, role, mujId, onZmena, onSmazano }: {
  d: BibleDokument;
  role: BibleRole;
  mujId: string | null;
  onZmena: (d: BibleDokument) => void;
  onSmazano: (id: string) => void;
}) {
  const [uprava, setUprava] = useState<Popis | null>(null);
  const [mazani, setMazani] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const spravce = smiSpravovat(role);
  const smiUpravit = spravce || (smiPrispivat(role) && d.nahral === mujId);
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
        <StavStitek stav={d.stav} />
      </div>
      <div className="text-xs text-neutral-300 space-y-0.5">
        <div>
          {DRUH_POPIS[d.druh]}{d.jazyk ? ` · ${JAZYK_POPIS[d.jazyk]}` : ''}
          {d.oblasti.length > 0 && ` · oblasti ${d.oblasti.join(', ')}`}
        </div>
        <div className="break-all">{d.soubor_nazev} · {velikostText(d.soubor_velikost)}</div>
        {postup && <div className="font-bold text-neutral-100">{postup}</div>}
        {d.stav_zprava && <div className="font-bold text-rose-300">{d.stav_zprava}</div>}
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
          <div className="text-sm font-bold">Opravdu smazat „{d.nazev}"? Zmizí záznam i soubor v úložišti. Originál ve složce u tebe zůstane.</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-danger" disabled={bezi} onClick={() => akce(() => smazDokument(d.id), () => onSmazano(d.id))}>Ano, smazat</button>
            <button type="button" className="btn-tmave" disabled={bezi} onClick={() => setMazani(false)}>Ne</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-tmave btn-sm" onClick={otevriOriginal}><Download size={16} /> Originál</button>
          {smiUpravit && (
            <button type="button" className="btn-tmave btn-sm" onClick={() => setUprava(popisZDokumentu(d))}><Pencil size={16} /> Upravit popis</button>
          )}
          {spravce && d.stav !== 'ceka' && d.stav !== 'zpracovava' && (
            <button type="button" className="btn-tmave btn-sm" disabled={bezi} onClick={() => akce(() => nastavStav(d.id, 'ceka'), () => onZmena({ ...d, stav: 'ceka', stav_zprava: null }))}>
              <RotateCcw size={16} /> Zpracovat znovu
            </button>
          )}
          {spravce && d.stav === 'ceka' && (
            <button type="button" className="btn-tmave btn-sm" disabled={bezi} onClick={() => akce(() => nastavStav(d.id, 'pozastaveno'), () => onZmena({ ...d, stav: 'pozastaveno', stav_zprava: null }))}>
              <Pause size={16} /> Pozastavit
            </button>
          )}
          {spravce && (
            <button type="button" className="btn-tmave btn-sm" onClick={() => setMazani(true)}><Trash2 size={16} /> Smazat</button>
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
  const { profile, user } = useAuth();
  const [nacteno, setNacteno] = useState<Nacteno | null>(null);
  const [nahravani, setNahravani] = useState(false);
  const [hledat, setHledat] = useState('');
  const [stav, setStav] = useState<StavDokumentu | ''>('');
  const [oblast, setOblast] = useState('');

  async function nacti() {
    setNacteno(null);
    setNacteno(await nactiDokumenty());
  }
  useEffect(() => { void nacti(); }, []);

  const dokumenty = useMemo(() => (nacteno?.stav === 'ok' ? nacteno.dokumenty : []), [nacteno]);
  const zmenDokument = (d: BibleDokument) => setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: n.dokumenty.map((x) => (x.id === d.id ? d : x)) } : n));
  const pridejDokument = (d: BibleDokument) => setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: [d, ...n.dokumenty] } : n));
  const odeberDokument = (id: string) => setNacteno((n) => (n?.stav === 'ok' ? { ...n, dokumenty: n.dokumenty.filter((x) => x.id !== id) } : n));

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
        <div className="text-sm font-black">Knihovna potřebuje nové tabulky v databázi.</div>
        <div className="text-sm text-neutral-200">
          Spusť migraci <strong>20261231410000_pivovarska_bible_knihovna</strong> v Systém → Databázové migrace a pak se sem vrať.
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
          Nahrané knihy čekají na zpracování (strany, kapitoly, OCR skenů, tabulky a vzorce). Zpracování přichází v další etapě — do té doby z nich AI neodpovídá.
        </div>
      )}

      {smiPrispivat(role) && (nahravani ? (
        <BibleNahrat
          nahralJmeno={(profile as { display_name?: string | null } | null)?.display_name ?? user?.email ?? null}
          onNahrano={pridejDokument}
          onZavrit={() => setNahravani(false)}
        />
      ) : (
        <button type="button" className="btn-amber" onClick={() => setNahravani(true)}><Upload size={18} /> Nahrát knihy</button>
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
            <KartaDokumentu key={d.id} d={d} role={role} mujId={user?.id ?? null} onZmena={zmenDokument} onSmazano={odeberDokument} />
          ))}
        </ul>
      )}
    </div>
  );
}
