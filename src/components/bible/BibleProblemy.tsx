// 🩺 Analýza problémů (etapa 10, oblast T): problém s příznaky a dotčenými
// várkami, zjištění šesti typů (fakt se zdrojem, výpočet, zkušenost,
// doporučení, hypotéza, chybí), porovnání dotčených várek a trend várek.
// ---------------------------------------------------------------------------
// Architektura § 6 a § 11: „s jasným označením, co je fakt, co hypotéza a co
// chybí". Příčiny hledá Claude — v appce tlačítkem „Najít příčiny s AI
// sládkem" (chatbot, R28) nebo přes konektor (R16) se stejnými nástroji
// (problemy, porovnej_varky, hledej_v_knihach…) — a zjištění zapíše s typem.
// Hypotézu potvrdí nebo vyvrátí člověk.
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import {
  chybaZjisteni, nactiProblemy, nastavStavZjisteni, smazProblem, smazZjisteni, ulozProblem, zapisZjisteni,
  type ProblemVstup, type ZjisteniVstup,
} from '../../lib/bibleProblemyApi';
import { nactiVarky } from '../../lib/bibleVarkyApi';
import { oznam, potvrd } from '../../lib/toast';
import {
  kdoZapsal, nazevStavuProblemu, nazevStavuZjisteni, STAVY_PROBLEMU, TYPY_ZJISTENI,
  type Problem, type StavZjisteni, type TypZjisteni, type Zjisteni,
} from '../../../bible/supabase/functions/_shared/problemy-popisy.ts';
import { popisVarky, type PrehledVarek } from '../../../bible/supabase/functions/_shared/varky-popisy.ts';
import { TabulkaPorovnani } from './BiblePorovnaniVarek';
import { BibleTrendVarek } from './BibleTrendVarek';

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';

/** Štítek typu zjištění: fakt a výpočet zeleně, zkušenost modře, doporučení neutrálně, hypotéza žlutě, chybí červeně. */
const BARVA_TYPU: Record<TypZjisteni, string> = {
  fakt: 'border-emerald-500 text-emerald-300',
  vypocet: 'border-emerald-500 text-emerald-300',
  zkusenost: 'border-sky-500 text-sky-300',
  doporuceni: 'border-neutral-500 text-neutral-200',
  hypoteza: 'border-amber-500 text-amber-300',
  chybi: 'border-rose-500 text-rose-300',
};

const prazdnyProblem = (): ProblemVstup => ({ nazev: '', popis: '', pivo: '', varky: [], oblasti: ['T'], stav: 'otevreny', reseni: '' });

function FormularProblemu({ pocatek, novy, prehled, uklada, ulozit, zrusit }: {
  pocatek: ProblemVstup; novy: boolean; prehled: PrehledVarek | null; uklada: boolean; ulozit: (p: ProblemVstup) => void; zrusit: () => void;
}) {
  const [p, setP] = useState<ProblemVstup>(pocatek);
  const jePlny = p.nazev.trim().length > 0;
  const prepniOblast = (kod: string) => setP((x) => ({ ...x, oblasti: x.oblasti.includes(kod) ? x.oblasti.filter((o) => o !== kod) : [...x.oblasti, kod].sort() }));
  const prepniVarku = (id: string) => setP((x) => ({ ...x, varky: x.varky.includes(id) ? x.varky.filter((v) => v !== id) : x.varky.length >= 12 ? x.varky : [...x.varky, id] }));
  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Problém"
      onSubmit={(e) => { e.preventDefault(); if (jePlny && !uklada) ulozit(p); }}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className={POPISEK}>
          Název problému
          <input className="input w-full normal-case" maxLength={200} value={p.nazev} onChange={(e) => setP({ ...p, nazev: e.target.value })} placeholder="např. Nižší výtěžek posledních várek" />
        </label>
        <label className={POPISEK}>
          Pivo (volitelné)
          <input className="input w-full normal-case" maxLength={120} value={p.pivo} onChange={(e) => setP({ ...p, pivo: e.target.value })} />
        </label>
        <label className={POPISEK}>
          Stav
          <select className="input w-full normal-case" value={p.stav} onChange={(e) => setP({ ...p, stav: e.target.value as ProblemVstup['stav'] })}>
            {STAVY_PROBLEMU.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
          </select>
        </label>
      </div>
      <label className={`block ${POPISEK}`}>
        Příznaky — co se děje, od kdy, jak se to projevuje
        <textarea className="input w-full min-h-[90px] normal-case" maxLength={4000} value={p.popis} onChange={(e) => setP({ ...p, popis: e.target.value })} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Oblasti</legend>
        <div className="flex flex-wrap gap-1.5">
          {BIBLE_OBLASTI.map((o) => (
            <button key={o.kod} type="button" aria-pressed={p.oblasti.includes(o.kod)} title={o.nazev} onClick={() => prepniOblast(o.kod)}
              className={`btn-tmave min-w-11 px-2 ${p.oblasti.includes(o.kod) ? 'ring-2 ring-amber-400 text-amber-300' : ''}`}>
              {o.kod}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Dotčené várky ({p.varky.length} z nejvýš 12)</legend>
        {!prehled || prehled.varky.length === 0 ? (
          <p className="text-sm text-neutral-300">V evidenci várek zatím nic není (Receptury a várky).</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-neutral-700 p-2" aria-label="Várky k výběru">
            {prehled.varky.map((v) => (
              <li key={v.id}>
                <label className="flex min-h-[44px] items-center gap-3 text-sm text-neutral-100">
                  <input type="checkbox" className="w-5 h-5 shrink-0" checked={p.varky.includes(v.id)} disabled={!p.varky.includes(v.id) && p.varky.length >= 12} onChange={() => prepniVarku(v.id)} />
                  {popisVarky(v)}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      {!novy && (
        <label className={`block ${POPISEK}`}>
          Řešení (volitelné)
          <textarea className="input w-full min-h-[70px] normal-case" maxLength={4000} value={p.reseni} onChange={(e) => setP({ ...p, reseni: e.target.value })} />
        </label>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={!jePlny || uklada}>{uklada ? 'Ukládám…' : 'Uložit problém'}</button>
      </div>
    </form>
  );
}

function FormularZjisteni({ uklada, ulozit, zrusit }: { uklada: boolean; ulozit: (z: ZjisteniVstup) => void; zrusit: () => void }) {
  const [z, setZ] = useState<ZjisteniVstup>({ typ: 'hypoteza', text: '', zdroj: '' });
  const chyba = chybaZjisteni(z);
  const typ = TYPY_ZJISTENI.find((t) => t.id === z.typ)!;
  return (
    <form className="rounded-lg border border-amber-600 bg-neutral-950 p-3 space-y-2" aria-label="Zjištění"
      onSubmit={(e) => { e.preventDefault(); if (!chyba && !uklada) ulozit(z); }}>
      <label className={`block ${POPISEK}`}>
        Typ zjištění
        <select className="input w-full normal-case" value={z.typ} onChange={(e) => setZ({ ...z, typ: e.target.value as TypZjisteni })}>
          {TYPY_ZJISTENI.map((t) => <option key={t.id} value={t.id}>{t.nazev} — {t.popis}</option>)}
        </select>
      </label>
      <label className={`block ${POPISEK}`}>
        Zjištění
        <textarea className="input w-full min-h-[70px] normal-case" maxLength={2000} value={z.text} onChange={(e) => setZ({ ...z, text: e.target.value })} />
      </label>
      <label className={`block ${POPISEK}`}>
        Zdroj{typ.zdrojPovinny ? '' : ' (volitelné)'}
        <input className="input w-full normal-case" maxLength={500} value={z.zdroj} onChange={(e) => setZ({ ...z, zdroj: e.target.value })} placeholder="kniha a strana, várka č., výpočet, adresa…" />
      </label>
      {chyba && z.text.trim() && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={chyba !== null || uklada}>{uklada ? 'Ukládám…' : 'Zapsat zjištění'}</button>
      </div>
    </form>
  );
}

function SeznamZjisteni({ zjisteni, smiPsat, smiMazat, nastavStav, smazat }: {
  zjisteni: Zjisteni[]; smiPsat: boolean; smiMazat: (z: Zjisteni) => boolean;
  nastavStav: (z: Zjisteni, s: StavZjisteni) => void; smazat: (z: Zjisteni) => void;
}) {
  if (zjisteni.length === 0) return <p className="text-sm text-neutral-300">Zatím žádné zjištění.</p>;
  return (
    <div className="space-y-3">
      {TYPY_ZJISTENI.map((t) => {
        const toho = zjisteni.filter((z) => z.typ === t.id);
        if (toho.length === 0) return null;
        return (
          <div key={t.id} className="space-y-1">
            <h5 className="text-xs font-black uppercase tracking-wide text-neutral-300">{t.nazev} ({toho.length})</h5>
            <ul className="space-y-1.5" aria-label={t.nazev}>
              {toho.map((z) => (
                <li key={z.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-black ${BARVA_TYPU[z.typ]}`}>{t.nazev}</span>
                    {(z.typ === 'hypoteza' || z.stav !== 'navrzeno') && (
                      <span className="text-[11px] font-black text-neutral-200">{nazevStavuZjisteni(z.stav)}</span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{z.text}</p>
                  <p className="text-xs font-semibold text-neutral-300">{z.zdroj ? `Zdroj: ${z.zdroj} · ` : ''}{kdoZapsal(z)}</p>
                  {smiPsat && (
                    <div className="flex flex-wrap gap-2">
                      {z.typ === 'hypoteza' && z.stav !== 'potvrzeno' && <button type="button" className="btn-tmave" onClick={() => nastavStav(z, 'potvrzeno')}><Check size={16} /> Potvrdit</button>}
                      {z.typ === 'hypoteza' && z.stav !== 'vyvraceno' && <button type="button" className="btn-tmave" onClick={() => nastavStav(z, 'vyvraceno')}><X size={16} /> Vyvrátit</button>}
                      {z.stav !== 'navrzeno' && <button type="button" className="btn-tmave" onClick={() => nastavStav(z, 'navrzeno')}><RotateCcw size={16} /> Zpět na navrženo</button>}
                      {smiMazat(z) && <button type="button" className="btn-tmave" onClick={() => smazat(z)}><Trash2 size={16} /> Smazat</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function BibleProblemy({ role, najdiPriciny }: {
  role: BibleRole;
  /** Otevře AI sládka (chatbot) s tímto problémem — příčiny najde z knih, várek a výpočtů. */
  najdiPriciny?: (p: { id: string; nazev: string }) => void;
}) {
  const { profile } = useAuth();
  const mojeId = profile?.id ?? null;
  const smiPsat = smiPrispivat(role);
  const smiMazat = (zapsal: string | null) => smiPsat && (smiSpravovat(role) || (zapsal !== null && zapsal === mojeId));

  const [problemy, setProblemy] = useState<Problem[] | null>(null);
  const [migrace, setMigrace] = useState(true);
  const [prehled, setPrehled] = useState<PrehledVarek | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [vsechny, setVsechny] = useState(false);
  const [otevreny, setOtevreny] = useState<string | null>(null);
  const [formular, setFormular] = useState<{ id: string | null; pocatek: ProblemVstup } | null>(null);
  const [zjisteniPro, setZjisteniPro] = useState<string | null>(null);
  const [uklada, setUklada] = useState(false);
  const poradi = useRef(0);

  async function nacti() {
    const moje = ++poradi.current;
    const [p, v] = await Promise.all([nactiProblemy(), nactiVarky()]);
    if (moje !== poradi.current) return;
    if (p.stav === 'ok') { setProblemy(p.problemy); setMigrace(p.migrace); setZprava(null); } else setZprava(p.zprava);
    setPrehled(v.stav === 'ok' && v.migrace ? v.prehled : null);
  }
  useEffect(() => { void nacti(); }, []);

  async function proved(akce: () => Promise<{ stav: 'ok' } | { stav: 'chyba'; zprava: string }>, hotovo: string, potom?: () => void) {
    setUklada(true);
    const r = await akce();
    setUklada(false);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(hotovo);
    potom?.();
    void nacti();
  }

  const vybrane = (problemy ?? []).filter((p) => vsechny || p.stav === 'otevreny');

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Technologické problémy (oblast T): příznaky, dotčené várky a zjištění s jasným označením, co je doložený fakt, výpočet, zkušenost, doporučení, hypotéza a co chybí.
        Příčiny najde AI sládek: otevři problém a klepni na „Najít příčiny s AI sládkem" (nebo napiš Claudovi přes konektor „analyzuj problém …"). Zjištění zapíše sem.
      </p>
      {!problemy && !zprava && <div className="text-sm text-neutral-300">Načítám…</div>}
      {zprava && <div role="alert" className="text-sm font-bold text-rose-300">{zprava}</div>}
      {problemy && !migrace && (
        <div className={`${KARTA} text-sm text-neutral-200`}>
          Analýza problémů čeká na migraci databáze bible 20261111020000_bible_web_problemy (Systém → Databázové migrace → Databáze bible).
        </div>
      )}
      {problemy && migrace && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {smiPsat && !formular && (
              <button type="button" className="btn-amber" onClick={() => setFormular({ id: null, pocatek: prazdnyProblem() })}><Plus size={18} /> Nový problém</button>
            )}
            <button type="button" className="btn-tmave" aria-pressed={vsechny} onClick={() => setVsechny((x) => !x)}>
              {vsechny ? 'Jen otevřené' : `Všechny problémy (${problemy.length})`}
            </button>
          </div>
          {formular && (
            <FormularProblemu pocatek={formular.pocatek} novy={formular.id === null} prehled={prehled} uklada={uklada} zrusit={() => setFormular(null)}
              ulozit={(p) => void proved(() => ulozProblem(formular.id, p), formular.id ? 'Problém upraven.' : 'Problém založen.', () => setFormular(null))} />
          )}
          {vybrane.length === 0 && !formular && (
            <p className="text-sm text-neutral-300">{problemy.length === 0 ? `Zatím tu žádný problém není.${smiPsat ? ' Založ první tlačítkem výše.' : ''}` : 'Otevřený problém žádný není.'}</p>
          )}
          {vybrane.length > 0 && (
            <ul className="space-y-2" aria-label="Problémy">
              {vybrane.map((p) => {
                const rozbaleno = otevreny === p.id;
                const dotcene = prehled ? prehled.varky.filter((v) => p.varky.includes(v.id)) : [];
                const pocetHypotez = p.zjisteni.filter((z) => z.typ === 'hypoteza' && z.stav === 'navrzeno').length;
                return (
                  <li key={p.id} className={`${KARTA} space-y-2`}>
                    <button type="button" className="flex w-full min-h-[44px] items-start justify-between gap-2 text-left" aria-expanded={rozbaleno} onClick={() => setOtevreny(rozbaleno ? null : p.id)}>
                      <span className="space-y-0.5">
                        <span className="block text-base font-black text-neutral-50">{p.nazev}</span>
                        <span className="block text-xs font-semibold text-neutral-300">
                          {nazevStavuProblemu(p.stav)}{p.pivo ? ` · ${p.pivo}` : ''} · várek {p.varky.length} · zjištění {p.zjisteni.length}{pocetHypotez ? ` · ${pocetHypotez} nepotvrzených hypotéz` : ''}
                        </span>
                      </span>
                      {rozbaleno ? <ChevronUp size={20} className="mt-1 shrink-0 text-neutral-300" /> : <ChevronDown size={20} className="mt-1 shrink-0 text-neutral-300" />}
                    </button>
                    {rozbaleno && (
                      <div className="space-y-3">
                        {p.popis && <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{p.popis}</p>}
                        {p.reseni && (
                          <div className="rounded-lg border border-emerald-600 bg-neutral-950 p-2">
                            <h4 className="text-xs font-black uppercase tracking-wide text-emerald-300">Řešení</h4>
                            <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{p.reseni}</p>
                          </div>
                        )}
                        <p className="text-xs font-semibold text-neutral-300">Založil {kdoZapsal(p)}{p.oblasti.length ? ` · oblasti ${p.oblasti.join(', ')}` : ''}</p>
                        {najdiPriciny && (
                          <button type="button" className="btn-amber" onClick={() => najdiPriciny({ id: p.id, nazev: p.nazev })}>
                            <Bot size={18} /> Najít příčiny s AI sládkem
                          </button>
                        )}
                        {dotcene.length > 0 ? <TabulkaPorovnani varky={dotcene} receptury={prehled?.receptury ?? []} /> : (
                          <p className="text-sm text-neutral-300">{p.varky.length > 0 ? 'Přiřazené várky už v evidenci nejsou.' : 'K problému nejsou přiřazené várky (Upravit → Dotčené várky).'}</p>
                        )}
                        <h4 className="text-sm font-black text-neutral-50">Zjištění</h4>
                        <SeznamZjisteni zjisteni={p.zjisteni} smiPsat={smiPsat} smiMazat={(z) => smiMazat(z.zapsal)}
                          nastavStav={(z, s) => void proved(() => nastavStavZjisteni(z.id, s), s === 'potvrzeno' ? 'Hypotéza potvrzena.' : s === 'vyvraceno' ? 'Hypotéza vyvrácena.' : 'Vráceno na navrženo.')}
                          smazat={(z) => void (async () => {
                            if (!(await potvrd('Smazat zjištění? Nejde vrátit.', { nebezpecne: true, potvrdit: 'Smazat' }))) return;
                            void proved(() => smazZjisteni(z.id), 'Zjištění smazáno.');
                          })()} />
                        {smiPsat && zjisteniPro === p.id && (
                          <FormularZjisteni uklada={uklada} zrusit={() => setZjisteniPro(null)}
                            ulozit={(z) => void proved(() => zapisZjisteni(p.id, z), 'Zjištění zapsané.', () => setZjisteniPro(null))} />
                        )}
                        {smiPsat && !formular && (
                          <div className="flex flex-wrap gap-2">
                            {zjisteniPro !== p.id && <button type="button" className="btn-tmave" onClick={() => setZjisteniPro(p.id)}><Plus size={16} /> Zapsat zjištění</button>}
                            <button type="button" className="btn-tmave" onClick={() => setFormular({ id: p.id, pocatek: {
                              nazev: p.nazev, popis: p.popis ?? '', pivo: p.pivo ?? '', varky: p.varky, oblasti: p.oblasti, stav: p.stav, reseni: p.reseni ?? '',
                            } })}><Pencil size={16} /> Upravit</button>
                            {smiMazat(p.zapsal) && (
                              <button type="button" className="btn-tmave" onClick={() => void (async () => {
                                if (!(await potvrd(`Smazat problém „${p.nazev}“ i se zjištěními? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
                                void proved(() => smazProblem(p.id), 'Problém smazán.', () => setOtevreny(null));
                              })()}><Trash2 size={16} /> Smazat</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {prehled && prehled.varky.length > 0 && <BibleTrendVarek varky={prehled.varky} receptury={prehled.receptury} />}
    </div>
  );
}
