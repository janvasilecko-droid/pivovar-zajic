// 🏭 Technologie pivovaru (etapa 7): profil pivovaru, zařízení s parametry a provozní postupy.
// ---------------------------------------------------------------------------
// Z architektury § 8: AI odliší obecné znalosti od parametrů konkrétního
// provozu — proto má každý parametr ZDROJ (štítek, dokumentace, změřeno,
// ze Sklepa, odhad) a karta ho ukazuje. Claude profil čte přes konektor
// (nástroj profil_pivovaru). Tanky jdou převzít ze Sklepa hlavní appky:
// Spilka = kvasný tank, ostatní = ležácký, objem z kapacity tanku.
import { useEffect, useRef, useState } from 'react';
import { Download, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { BIBLE_OBLASTI, nazevOblasti } from '../../lib/bibleOblasti';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import {
  cisloZPole, nactiTechnologii, parametrDoFormulare, prevezmiZarizeni, smazPivovar, smazPostup, smazZarizeni, tankyZeSklepa,
  ulozPivovar, ulozPostup, ulozZarizeni,
  type ParametrVstup, type PivovarVstup, type PostupProvozu, type PostupVstup, type Technologie, type Zarizeni, type ZarizeniVstup,
} from '../../lib/bibleTechnologieApi';
import { supabase } from '../../lib/supabase';
import { oznam, potvrd } from '../../lib/toast';
import {
  DRUHY_ZARIZENI, SABLONY_PARAMETRU, ZDROJE_PARAMETRU, hodnotaParametru, nazevZdroje, type DruhZarizeni, type ZdrojParametru,
} from '../../../bible/supabase/functions/_shared/technologie-popisy.ts';

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';

const sablona = (druh: DruhZarizeni): ParametrVstup[] =>
  SABLONY_PARAMETRU[druh].map((s) => ({ nazev: s.nazev, hodnota: '', jednotka: s.jednotka ?? '', zdroj: 'odhad' }));

const podleNazvu = (a: { nazev: string }, b: { nazev: string }) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true });

function Tlacitka({ uklada, jePlny, text, zrusit }: { uklada: boolean; jePlny: boolean; text: string; zrusit: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
      <button type="submit" className="btn-amber" disabled={!jePlny || uklada}>{uklada ? 'Ukládám…' : text}</button>
    </div>
  );
}

/** `zamceno` = proč je pivovar hlavní napevno (první pivovar, nebo už hlavní je); null = jde vybrat. */
function FormularPivovaru({ pocatek, zamceno, uklada, ulozit, zrusit }: {
  pocatek: PivovarVstup; zamceno: string | null; uklada: boolean; ulozit: (p: PivovarVstup) => void; zrusit: () => void;
}) {
  const [p, setP] = useState<PivovarVstup>(pocatek);
  const jePlny = p.nazev.trim().length > 0;
  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Pivovar"
      onSubmit={(e) => { e.preventDefault(); if (jePlny && !uklada) ulozit(p); }}>
      <label className={`block ${POPISEK}`}>
        Název pivovaru
        <input className="input w-full normal-case" maxLength={120} value={p.nazev} onChange={(e) => setP({ ...p, nazev: e.target.value })} placeholder="např. Pivovar Zajíc" />
      </label>
      <label className={`block ${POPISEK}`}>
        Popis provozu (volitelné)
        <textarea className="input w-full min-h-[110px] normal-case" maxLength={4000} value={p.popis} onChange={(e) => setP({ ...p, popis: e.target.value })}
          placeholder="Typ varny, technologické schéma od šrotu po stáčení, zvláštnosti provozu…" />
      </label>
      <label className="flex items-start gap-2 text-sm font-bold text-neutral-100">
        <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0" checked={p.hlavni || zamceno !== null} disabled={zamceno !== null}
          onChange={(e) => setP({ ...p, hlavni: e.target.checked })} />
        <span>
          Hlavní pivovar — výchozí profil pro appku i Clauda
          {zamceno && <span className="block text-xs font-semibold text-neutral-300">{zamceno}</span>}
        </span>
      </label>
      <Tlacitka uklada={uklada} jePlny={jePlny} text="Uložit pivovar" zrusit={zrusit} />
    </form>
  );
}

type StavZarizeni = Omit<ZarizeniVstup, 'pocet'> & { pocet: string };

/** Chyba formuláře zařízení, nebo null když jde uložit. Čísla se nedomýšlí. */
export function chybaZarizeni(z: StavZarizeni): string | null {
  if (!z.nazev.trim()) return 'Doplň název zařízení.';
  const pocet = cisloZPole(z.pocet);
  if (typeof pocet !== 'number' || !Number.isInteger(pocet) || pocet < 1 || pocet > 999) return 'Počet kusů je celé číslo 1 až 999.';
  const bezNazvu = z.parametry.findIndex((p) => !p.nazev.trim() && p.hodnota.trim());
  if (bezNazvu >= 0) return `Parametr ${bezNazvu + 1} má hodnotu, ale nemá název.`;
  if (z.parametry.length > 40) return 'Nejvýš 40 parametrů u jednoho zařízení.';
  return null;
}

function FormularZarizeni({ pocatek, novy, uklada, ulozit, zrusit }: {
  pocatek: StavZarizeni; novy: boolean; uklada: boolean; ulozit: (z: ZarizeniVstup) => void; zrusit: () => void;
}) {
  const [z, setZ] = useState<StavZarizeni>(pocatek);
  const chyba = chybaZarizeni(z);
  const zmenDruh = (druh: DruhZarizeni) => setZ((p) => ({
    ...p,
    druh,
    // Nové zařízení bez vyplněných hodnot dostane šablonu nového druhu.
    parametry: novy && p.parametry.every((x) => !x.hodnota.trim()) ? sablona(druh) : p.parametry,
  }));
  const zmenParametr = (i: number, zmena: Partial<ParametrVstup>) =>
    setZ((p) => ({ ...p, parametry: p.parametry.map((x, j) => (j === i ? { ...x, ...zmena } : x)) }));

  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Zařízení"
      onSubmit={(e) => {
        e.preventDefault();
        if (chyba || uklada) return;
        ulozit({ ...z, pocet: cisloZPole(z.pocet) as number });
      }}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6rem]">
        <label className={POPISEK}>
          Druh
          <select className="input w-full normal-case" value={z.druh} onChange={(e) => zmenDruh(e.target.value as DruhZarizeni)}>
            {DRUHY_ZARIZENI.map((d) => <option key={d.id} value={d.id}>{d.nazev}</option>)}
          </select>
        </label>
        <label className={POPISEK}>
          Název
          <input className="input w-full normal-case" maxLength={120} value={z.nazev} onChange={(e) => setZ({ ...z, nazev: e.target.value })} placeholder="např. Spilka 1, Čerpadlo mladiny" />
        </label>
        <label className={POPISEK}>
          Kusů
          <input className="input w-full tabular-nums" inputMode="numeric" value={z.pocet} onChange={(e) => setZ({ ...z, pocet: e.target.value })} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Parametry</legend>
        <p className="text-xs font-semibold text-neutral-300">
          Vyplň, co víš — prázdné řádky se neuloží. Číslo piš bez jednotky (jednotka má vlastní pole), jinak se uloží jako text. U každého údaje vyber, odkud je.
        </p>
        {z.parametry.map((par, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-700 p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_minmax(0,10rem)_auto]">
            <input className="input col-span-2 w-full sm:col-span-1" aria-label={`Název parametru ${i + 1}`} maxLength={80} value={par.nazev}
              onChange={(e) => zmenParametr(i, { nazev: e.target.value })} placeholder="Název" />
            <input className="input w-full tabular-nums" aria-label={`Hodnota parametru ${i + 1}`} maxLength={200} value={par.hodnota}
              onChange={(e) => zmenParametr(i, { hodnota: e.target.value })} placeholder="Hodnota" />
            <input className="input w-full" aria-label={`Jednotka parametru ${i + 1}`} maxLength={30} value={par.jednotka}
              onChange={(e) => zmenParametr(i, { jednotka: e.target.value })} placeholder="Jedn." />
            <select className="input w-full" aria-label={`Zdroj parametru ${i + 1}`} value={par.zdroj}
              onChange={(e) => zmenParametr(i, { zdroj: e.target.value as ZdrojParametru })}>
              {ZDROJE_PARAMETRU.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
            </select>
            <button type="button" className="btn-tmave w-11 px-0 justify-self-end" aria-label={`Odebrat parametr ${par.nazev || i + 1}`}
              onClick={() => setZ((p) => ({ ...p, parametry: p.parametry.filter((_, j) => j !== i) }))}>
              <X size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-tmave" disabled={z.parametry.length >= 40}
          onClick={() => setZ((p) => ({ ...p, parametry: [...p.parametry, { nazev: '', hodnota: '', jednotka: '', zdroj: 'odhad' }] }))}>
          <Plus size={16} /> Přidat parametr
        </button>
      </fieldset>

      <label className={`block ${POPISEK}`}>
        Poznámka (volitelné)
        <textarea className="input w-full min-h-[70px] normal-case" maxLength={2000} value={z.poznamka} onChange={(e) => setZ({ ...z, poznamka: e.target.value })} />
      </label>
      {chyba && z.nazev.trim() && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      <Tlacitka uklada={uklada} jePlny={!chyba} text="Uložit zařízení" zrusit={zrusit} />
    </form>
  );
}

function FormularPostupu({ pocatek, uklada, ulozit, zrusit }: {
  pocatek: PostupVstup; uklada: boolean; ulozit: (p: PostupVstup) => void; zrusit: () => void;
}) {
  const [p, setP] = useState<PostupVstup>(pocatek);
  const jePlny = p.nazev.trim().length > 0 && p.kroky.trim().length > 0;
  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Provozní postup"
      onSubmit={(e) => { e.preventDefault(); if (jePlny && !uklada) ulozit(p); }}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className={POPISEK}>
          Název postupu
          <input className="input w-full normal-case" maxLength={200} value={p.nazev} onChange={(e) => setP({ ...p, nazev: e.target.value })} placeholder="např. CIP spilky, Vystírání" />
        </label>
        <label className={POPISEK}>
          Oblast (volitelné)
          <select className="input w-full normal-case" value={p.oblast} onChange={(e) => setP({ ...p, oblast: e.target.value })}>
            <option value="">Bez oblasti</option>
            {BIBLE_OBLASTI.map((o) => <option key={o.kod} value={o.kod}>{o.kod} · {o.nazev}</option>)}
          </select>
        </label>
      </div>
      <label className={`block ${POPISEK}`}>
        Kroky
        <textarea className="input w-full min-h-[140px] normal-case" maxLength={12000} value={p.kroky} onChange={(e) => setP({ ...p, kroky: e.target.value })}
          placeholder={'1. …\n2. …'} />
      </label>
      <label className={`block ${POPISEK}`}>
        Odkud postup je (volitelné)
        <input className="input w-full normal-case" maxLength={500} value={p.zdroj} onChange={(e) => setP({ ...p, zdroj: e.target.value })} placeholder="návod výrobce, vlastní praxe…" />
      </label>
      <Tlacitka uklada={uklada} jePlny={jePlny} text="Uložit postup" zrusit={zrusit} />
    </form>
  );
}

function KartaZarizeni({ z, smiPsat, upravit, smazat }: { z: Zarizeni; smiPsat: boolean; upravit: () => void; smazat: () => void }) {
  return (
    <li className={`${KARTA} space-y-2`}>
      <h4 className="text-base font-black text-neutral-50">{z.nazev}{z.pocet > 1 && <span className="text-neutral-300"> · {z.pocet} ks</span>}</h4>
      {z.parametry.length > 0 ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
          {z.parametry.map((p, i) => (
            <div key={i} className="contents">
              <dt className="font-semibold text-neutral-300">{p.nazev}</dt>
              <dd className="text-right">
                <span className="font-bold text-neutral-50 tabular-nums">{hodnotaParametru(p)}</span>
                <span className={`ml-2 rounded border px-1 text-[11px] font-black ${p.zdroj === 'odhad' ? 'border-amber-500 text-amber-300' : 'border-neutral-600 text-neutral-300'}`}>
                  {nazevZdroje(p.zdroj)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-neutral-300">Parametry zatím nejsou zapsané.</p>
      )}
      {z.poznamka && <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{z.poznamka}</p>}
      {smiPsat && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-tmave" onClick={upravit}><Pencil size={16} /> Upravit</button>
          <button type="button" className="btn-tmave" onClick={smazat}><Trash2 size={16} /> Smazat</button>
        </div>
      )}
    </li>
  );
}

function KartaPostupu({ s, smiPsat, upravit, smazat }: { s: PostupProvozu; smiPsat: boolean; upravit: () => void; smazat: () => void }) {
  return (
    <li className={`${KARTA} space-y-2`}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-black text-neutral-50">{s.nazev}</h4>
        {s.oblast && <span className="rounded border border-neutral-600 px-1 text-xs font-semibold text-neutral-300">{s.oblast} · {nazevOblasti(s.oblast)}</span>}
      </div>
      <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words leading-relaxed">{s.kroky}</p>
      {s.zdroj && <p className="text-xs font-semibold text-neutral-300">Zdroj: {s.zdroj}</p>}
      {smiPsat && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-tmave" onClick={upravit}><Pencil size={16} /> Upravit</button>
          <button type="button" className="btn-tmave" onClick={smazat}><Trash2 size={16} /> Smazat</button>
        </div>
      )}
    </li>
  );
}

type Formular =
  | { co: 'pivovar'; id: string | null; pocatek: PivovarVstup; zamceno: string | null }
  | { co: 'zarizeni'; id: string | null; pocatek: StavZarizeni }
  | { co: 'postup'; id: string | null; pocatek: PostupVstup };

export function BibleTechnologie({ role }: { role: BibleRole }) {
  const smiPsat = smiPrispivat(role);
  const smiMazatPivovar = smiSpravovat(role);
  const [tech, setTech] = useState<Technologie | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [uklada, setUklada] = useState(false);
  const poradi = useRef(0);

  async function nacti(pivovarId: string | null = tech?.pivovarId ?? null) {
    const moje = ++poradi.current;
    setNacita(true);
    const r = await nactiTechnologii(pivovarId);
    if (moje !== poradi.current) return;
    setNacita(false);
    if (r.stav === 'ok') {
      // Vybraný pivovar mezitím zmizel → načíst hlavní.
      if (pivovarId && r.technologie.pivovarId !== pivovarId && r.technologie.pivovary.length > 0) { void nacti(null); return; }
      setTech(r.technologie);
      setZprava(null);
    } else {
      setZprava(r.zprava);
    }
  }

  useEffect(() => {
    void nacti(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen při otevření obrazovky
  }, []);

  const pivovar = tech?.pivovary.find((p) => p.id === tech.pivovarId) ?? null;

  /** Zápis přes bible-api; pak znovu načte vybraný pivovar (`cil` ho může změnit, null = hlavní). */
  async function proved<T>(
    akce: () => Promise<{ stav: 'ok'; data: T } | { stav: 'chyba'; zprava: string }>,
    hotovo: string | ((d: T) => string),
    cil?: (d: T) => string | null,
  ) {
    setUklada(true);
    const r = await akce();
    setUklada(false);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(typeof hotovo === 'string' ? hotovo : hotovo(r.data));
    setFormular(null);
    void nacti(cil ? cil(r.data) : tech?.pivovarId ?? null);
  }

  function ulozFormular(hodnota: PivovarVstup | ZarizeniVstup | PostupVstup) {
    if (!formular) return;
    if (formular.co === 'pivovar') {
      void proved(() => ulozPivovar(formular.id, hodnota as PivovarVstup), formular.id ? 'Pivovar upraven.' : 'Pivovar založen.', (id) => id);
    } else if (formular.co === 'zarizeni' && pivovar) {
      void proved(() => ulozZarizeni(formular.id, pivovar.id, hodnota as ZarizeniVstup), formular.id ? 'Zařízení upraveno.' : 'Zařízení zapsáno.');
    } else if (formular.co === 'postup' && pivovar) {
      void proved(() => ulozPostup(formular.id, pivovar.id, hodnota as PostupVstup), formular.id ? 'Postup upraven.' : 'Postup zapsán.');
    }
  }

  async function smazPiv() {
    if (!pivovar) return;
    const text = `Smazat celý profil „${pivovar.nazev}“ i se zařízením a postupy? Nejde vrátit.`;
    if (!(await potvrd(text, { nebezpecne: true, potvrdit: 'Smazat pivovar' }))) return;
    void proved(() => smazPivovar(pivovar.id), 'Pivovar smazán.', () => null);
  }

  async function smazZar(z: Zarizeni) {
    if (!(await potvrd(`Smazat zařízení „${z.nazev}“? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    void proved(() => smazZarizeni(z.id), 'Zařízení smazáno.');
  }

  async function smazPost(s: PostupProvozu) {
    if (!(await potvrd(`Smazat postup „${s.nazev}“? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    void proved(() => smazPostup(s.id), 'Postup smazán.');
  }

  async function prevzitZeSklepa() {
    if (!pivovar) return;
    setUklada(true);
    const { data, error } = await supabase.from('cellar_tanks').select('label,capacity_l').order('label');
    setUklada(false);
    if (error) { oznam('Tanky ze Sklepa se nenačetly — zkus to znovu.'); return; }
    const seznam = tankyZeSklepa((data ?? []) as { label: string; capacity_l: number | null }[]);
    if (seznam.length === 0) { oznam('Ve Sklepu nejsou žádné tanky.'); return; }
    const jmena = seznam.map((t) => t.nazev).sort((a, b) => a.localeCompare(b, 'cs', { numeric: true })).join(', ');
    const ok = await potvrd(
      `Převzít ze Sklepa ${seznam.length} nádob (${jmena}) s objemem z kapacity tanku? Ty, které už v profilu jsou (stejný název), se přeskočí.`,
      { potvrdit: 'Převzít' },
    );
    if (!ok) return;
    void proved(
      () => prevezmiZarizeni(pivovar.id, seznam),
      (n) => (n === 0 ? 'Všechny nádoby ze Sklepa už v profilu jsou.' : `Převzato ze Sklepa: ${n} ${n === 1 ? 'nádoba' : n < 5 ? 'nádoby' : 'nádob'}.`),
    );
  }

  const zalozitPivovar = () => {
    const prvni = (tech?.pivovary.length ?? 0) === 0;
    setFormular({ co: 'pivovar', id: null, pocatek: { nazev: '', popis: '', hlavni: prvni }, zamceno: prvni ? 'První pivovar je hlavní sám od sebe.' : null });
  };
  const formularOtevren = formular !== null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Parametry našeho provozu: varna, nádoby, tanky, čerpadla, potrubí, výměníky, chlazení a provozní postupy. Claude je bere jako údaje provozu,
        odděleně od literatury — proto u každého čísla zapiš, odkud je (štítek, dokumentace, změřeno, odhad).
      </p>

      {nacita && !tech && <div className="text-sm text-neutral-300">Načítám…</div>}
      {zprava && <div role="alert" className="text-sm font-bold text-rose-300">{zprava}</div>}
      {tech && !tech.migrace && (
        <div className={`${KARTA} text-sm text-neutral-200`}>
          Technologie pivovaru čeká na migraci databáze bible 20261111000000_bible_technologie (Systém → Databázové migrace → Databáze bible).
        </div>
      )}

      {tech?.migrace && formular?.co === 'pivovar' && (
        <FormularPivovaru pocatek={formular.pocatek} zamceno={formular.zamceno} uklada={uklada} ulozit={ulozFormular} zrusit={() => setFormular(null)} />
      )}

      {tech?.migrace && tech.pivovary.length === 0 && !formularOtevren && (
        <div className={`${KARTA} space-y-2 text-sm text-neutral-200`}>
          <p>Zatím tu žádný pivovar není.{smiPsat ? ' Založ náš pivovar a zapiš zařízení — tanky jdou převzít ze Sklepa jedním tlačítkem.' : ''}</p>
          {smiPsat && <button type="button" className="btn-amber" onClick={zalozitPivovar}><Plus size={18} /> Založit pivovar</button>}
        </div>
      )}

      {tech?.migrace && pivovar && (
        <>
          {tech.pivovary.length > 1 && (
            <label className={`block ${POPISEK}`}>
              Pivovar
              <select className="input w-full normal-case sm:w-auto" value={pivovar.id} disabled={formularOtevren || nacita}
                onChange={(e) => void nacti(e.target.value)}>
                {tech.pivovary.map((p) => <option key={p.id} value={p.id}>{p.nazev}{p.hlavni ? ' (hlavní)' : ''}</option>)}
              </select>
            </label>
          )}

          <section className={`${KARTA} space-y-2`} aria-label="Profil pivovaru">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-neutral-50">{pivovar.nazev}</h2>
              {pivovar.hlavni && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500 px-1.5 py-0.5 text-[11px] font-black text-amber-300">
                  <Star size={12} /> Hlavní
                </span>
              )}
            </div>
            {pivovar.popis
              ? <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words leading-relaxed">{pivovar.popis}</p>
              : <p className="text-sm text-neutral-300">Popis provozu (typ varny, technologické schéma) zatím chybí.</p>}
            {(smiPsat || smiMazatPivovar) && !formularOtevren && (
              <div className="flex flex-wrap gap-2">
                {smiPsat && (
                  <button type="button" className="btn-tmave"
                    onClick={() => setFormular({
                      co: 'pivovar', id: pivovar.id, pocatek: { nazev: pivovar.nazev, popis: pivovar.popis ?? '', hlavni: pivovar.hlavni },
                      zamceno: pivovar.hlavni ? 'Hlavní se změní tím, že jako hlavní označíš jiný pivovar.' : null,
                    })}>
                    <Pencil size={16} /> Upravit pivovar
                  </button>
                )}
                {smiPsat && <button type="button" className="btn-tmave" onClick={zalozitPivovar}><Plus size={16} /> Další pivovar</button>}
                {smiMazatPivovar && <button type="button" className="btn-tmave" onClick={() => void smazPiv()}><Trash2 size={16} /> Smazat pivovar</button>}
              </div>
            )}
          </section>

          <section className="space-y-3" aria-label="Zařízení">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-neutral-50 mr-auto">Zařízení</h3>
              {smiPsat && !formularOtevren && (
                <>
                  <button type="button" className="btn-tmave" disabled={uklada} onClick={() => void prevzitZeSklepa()}>
                    <Download size={16} /> Převzít tanky ze Sklepa
                  </button>
                  <button type="button" className="btn-amber"
                    onClick={() => setFormular({ co: 'zarizeni', id: null, pocatek: { druh: 'varna', nazev: '', pocet: '1', parametry: sablona('varna'), poznamka: '' } })}>
                    <Plus size={16} /> Přidat zařízení
                  </button>
                </>
              )}
            </div>
            {formular?.co === 'zarizeni' && (
              <FormularZarizeni pocatek={formular.pocatek} novy={formular.id === null} uklada={uklada} ulozit={ulozFormular} zrusit={() => setFormular(null)} />
            )}
            {tech.zarizeni.length === 0 && formular?.co !== 'zarizeni' && (
              <p className="text-sm text-neutral-300">Zařízení zatím není zapsané.</p>
            )}
            {DRUHY_ZARIZENI.map((d) => {
              const toho = tech.zarizeni.filter((z) => z.druh === d.id).sort(podleNazvu);
              if (toho.length === 0) return null;
              return (
                <div key={d.id} className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wide text-amber-300">{d.mnozne}</h4>
                  <ul className="grid gap-2 md:grid-cols-2" aria-label={d.mnozne}>
                    {toho.map((z) => (
                      <KartaZarizeni key={z.id} z={z} smiPsat={smiPsat && !formularOtevren}
                        upravit={() => setFormular({ co: 'zarizeni', id: z.id, pocatek: {
                          druh: z.druh, nazev: z.nazev, pocet: String(z.pocet), parametry: z.parametry.map(parametrDoFormulare), poznamka: z.poznamka ?? '',
                        } })}
                        smazat={() => void smazZar(z)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className="space-y-3" aria-label="Provozní postupy">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-neutral-50 mr-auto">Provozní postupy</h3>
              {smiPsat && !formularOtevren && (
                <button type="button" className="btn-amber" onClick={() => setFormular({ co: 'postup', id: null, pocatek: { nazev: '', oblast: '', kroky: '', zdroj: '' } })}>
                  <Plus size={16} /> Přidat postup
                </button>
              )}
            </div>
            {formular?.co === 'postup' && (
              <FormularPostupu pocatek={formular.pocatek} uklada={uklada} ulozit={ulozFormular} zrusit={() => setFormular(null)} />
            )}
            {tech.postupy.length === 0 && formular?.co !== 'postup' && (
              <p className="text-sm text-neutral-300">Provozní postupy zatím nejsou zapsané (např. CIP spilky, vystírání, stáčení).</p>
            )}
            {tech.postupy.length > 0 && (
              <ul className="space-y-2" aria-label="Seznam postupů">
                {[...tech.postupy].sort(podleNazvu).map((s) => (
                  <KartaPostupu key={s.id} s={s} smiPsat={smiPsat && !formularOtevren}
                    upravit={() => setFormular({ co: 'postup', id: s.id, pocatek: { nazev: s.nazev, oblast: s.oblast ?? '', kroky: s.kroky, zdroj: s.zdroj ?? '' } })}
                    smazat={() => void smazPost(s)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {tech?.migrace && !pivovar && tech.pivovary.length > 0 && !nacita && (
        <div className={`${KARTA} space-y-2 text-sm text-neutral-200`}>
          <p>Pivovar se nenačetl.</p>
          <button type="button" className="btn-tmave" onClick={() => void nacti(null)}>Načíst znovu</button>
        </div>
      )}
    </div>
  );
}
