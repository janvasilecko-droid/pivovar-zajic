// 🍺 Receptury a várky (etapa 8): evidence várek, porovnání a receptury.
// ---------------------------------------------------------------------------
// Z architektury § 8: AI porovnává várky a hledá příčiny odchylek, „pracuje
// jen s uloženými údaji, chybějící hodnoty vyjmenuje, nedomýšlí je".
// Porovnání tady počítá stejný kód jako Claude přes konektor (nástroj
// porovnej_varky): hodnoty, cíle receptury s odchylkou, odvozené hodnoty
// z výpočetního modulu (výtěžek, odpar, prokvašení, alkohol) a co chybí.
// Příčiny odchylek hledá Claude (konektor) — chatbot v appce je odložený (R14).
import { useEffect, useRef, useState } from 'react';
import { GitCompare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { businessDateISO } from '../../lib/businessDate';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { nactiTechnologii } from '../../lib/bibleTechnologieApi';
import { chybaVarky, doPole, nactiVarky, smazVarku, ulozVarku, type VarkaVstup } from '../../lib/bibleVarkyApi';
import { oznam, potvrd } from '../../lib/toast';
import {
  CIL_HODNOTY, cislo, FAZE_VARKY, HODNOTY_VARKY, popisVarky, souhrnVarky,
  type PrehledVarek, type RecepturaZaznam, type VarkaZaznam,
} from '../../../bible/supabase/functions/_shared/varky-popisy.ts';
import { BibleReceptury } from './BibleReceptury';
import { TabulkaPorovnani } from './BiblePorovnaniVarek';

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';
const MAX_POROVNANI = 12;

const prazdnaVarka = (pivovarId: string | null): VarkaVstup => ({
  recepturaId: '', pivovarId, cislo: '', pivo: '', datumVaru: businessDateISO(), hodnoty: {}, poznamka: '',
});

const varkaDoFormulare = (v: VarkaZaznam): VarkaVstup => ({
  recepturaId: v.receptura_id ?? '',
  pivovarId: v.pivovar_id,
  cislo: v.cislo ?? '',
  pivo: v.pivo,
  datumVaru: v.datum_varu,
  hodnoty: Object.fromEntries(Object.entries(v.hodnoty).map(([k, n]) => [k, doPole(n)])),
  poznamka: v.poznamka ?? '',
});

function FormularVarky({ pocatek, receptury, uklada, ulozit, zrusit }: {
  pocatek: VarkaVstup; receptury: readonly RecepturaZaznam[]; uklada: boolean; ulozit: (v: VarkaVstup) => void; zrusit: () => void;
}) {
  const [v, setV] = useState<VarkaVstup>(pocatek);
  const [zkouseno, setZkouseno] = useState(false);
  const chyba = chybaVarky(v);
  const receptura = receptury.find((r) => r.id === v.recepturaId) ?? null;
  const vyberRecepturu = (id: string) => setV((p) => {
    const r = receptury.find((x) => x.id === id);
    // Pivo se předvyplní názvem receptury, jen když je prázdné (nic se nepřepisuje).
    return { ...p, recepturaId: id, pivo: p.pivo.trim() || !r ? p.pivo : r.nazev };
  });

  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Várka"
      onSubmit={(e) => { e.preventDefault(); setZkouseno(true); if (!chyba && !uklada) ulozit(v); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={POPISEK}>
          Receptura (volitelné)
          <select className="input w-full normal-case" value={v.recepturaId} onChange={(e) => vyberRecepturu(e.target.value)}>
            <option value="">Bez receptury</option>
            {receptury.map((r) => <option key={r.id} value={r.id}>{r.nazev}</option>)}
          </select>
        </label>
        <label className={POPISEK}>
          Pivo
          <input className="input w-full normal-case" maxLength={120} value={v.pivo} onChange={(e) => setV({ ...v, pivo: e.target.value })} placeholder="např. Světlý ležák 11" />
        </label>
        <label className={POPISEK}>
          Číslo várky (volitelné)
          <input className="input w-full normal-case" maxLength={40} value={v.cislo} onChange={(e) => setV({ ...v, cislo: e.target.value })} placeholder="např. 112" />
        </label>
        <label className={POPISEK}>
          Datum varu
          <input type="date" className="input w-full" value={v.datumVaru} onChange={(e) => setV({ ...v, datumVaru: e.target.value })} />
        </label>
      </div>
      <p className="text-xs font-semibold text-neutral-300">
        Vyplň, co je změřené nebo zapsané — prázdné pole zůstane „nezapsáno" a porovnání ho vyjmenuje. Desetinná čárka i tečka platí. Objemy mladiny a sladiny jsou horké (jak se měří ve varně).
      </p>
      {FAZE_VARKY.map((f) => (
        <fieldset key={f.id} className="space-y-2">
          <legend className="text-xs font-black uppercase tracking-wide text-amber-300">{f.nazev}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {HODNOTY_VARKY.filter((h) => h.faze === f.id).map((h) => {
              const pole = CIL_HODNOTY[h.klic];
              const cil = receptura && pole ? receptura[pole] : null;
              return (
                <label key={h.klic} className="space-y-1 text-xs font-bold text-neutral-300">
                  <span>
                    {h.nazev}{h.jednotka ? ` (${h.jednotka})` : ''}
                    {typeof cil === 'number' && <span className="text-amber-300"> · cíl {cislo(cil, h.mist)}</span>}
                  </span>
                  <input className="input w-full tabular-nums" inputMode="decimal" value={v.hodnoty[h.klic] ?? ''}
                    onChange={(e) => setV({ ...v, hodnoty: { ...v.hodnoty, [h.klic]: e.target.value } })} />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className={`block ${POPISEK}`}>
        Průběh a odchylky od receptury (volitelné)
        <textarea className="input w-full min-h-[80px] normal-case" maxLength={4000} value={v.poznamka} onChange={(e) => setV({ ...v, poznamka: e.target.value })} />
      </label>
      {chyba && (zkouseno || Object.values(v.hodnoty).some((x) => x.trim())) && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={uklada}>{uklada ? 'Ukládám…' : 'Uložit várku'}</button>
      </div>
    </form>
  );
}

export function BibleVarky({ role }: { role: BibleRole }) {
  const { profile } = useAuth();
  const mojeId = profile?.id ?? null;
  const smiPsat = smiPrispivat(role);
  const smiMazat = (zapsal: string | null) => smiPsat && (smiSpravovat(role) || (zapsal !== null && zapsal === mojeId));

  const [prehled, setPrehled] = useState<PrehledVarek | null>(null);
  const [migrace, setMigrace] = useState(true);
  const [zprava, setZprava] = useState<string | null>(null);
  const [nacita, setNacita] = useState(true);
  const [zalozka, setZalozka] = useState<'varky' | 'receptury'>('varky');
  const [formular, setFormular] = useState<{ id: string | null; pocatek: VarkaVstup } | null>(null);
  const [uklada, setUklada] = useState(false);
  const [vybrane, setVybrane] = useState<string[]>([]);
  const [porovnat, setPorovnat] = useState(false);
  // Várky se přiřadí k jedinému pivovaru z Technologie pivovaru (víc pivovarů = bez přiřazení, nic se nehádá).
  const [pivovarId, setPivovarId] = useState<string | null>(null);
  const poradi = useRef(0);

  async function nacti() {
    const moje = ++poradi.current;
    setNacita(true);
    const r = await nactiVarky();
    if (moje !== poradi.current) return;
    setNacita(false);
    if (r.stav === 'ok') {
      setPrehled(r.prehled);
      setMigrace(r.migrace);
      setZprava(null);
      setVybrane((p) => p.filter((id) => r.prehled.varky.some((v) => v.id === id)));
    } else {
      setZprava(r.zprava);
    }
  }

  useEffect(() => {
    void nacti();
    void nactiTechnologii().then((t) => {
      if (t.stav === 'ok' && t.technologie.pivovary.length === 1) setPivovarId(t.technologie.pivovary[0].id);
    });
    // Jen při otevření obrazovky.
  }, []);

  async function ulozit(v: VarkaVstup) {
    if (!formular) return;
    setUklada(true);
    const r = await ulozVarku(formular.id, v);
    setUklada(false);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(formular.id ? 'Várka upravena.' : 'Várka zapsaná.');
    setFormular(null);
    void nacti();
  }

  async function smazat(v: VarkaZaznam) {
    if (!(await potvrd(`Smazat várku ${popisVarky(v)}? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    const r = await smazVarku(v.id);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam('Várka smazaná.');
    void nacti();
  }

  const prepniVyber = (id: string) => setVybrane((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_POROVNANI ? p : [...p, id]));
  const vybraneVarky = prehled ? prehled.varky.filter((v) => vybrane.includes(v.id)) : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Evidence várek a receptur: sypání, voda, rmutování, scezování, objemy a extrakty, chmelovar, kvašení, ležení a laboratoř. Porovnání ukáže odchylky od receptury,
        výtěžek a prokvašení spočítané výpočetním modulem a vyjmenuje, co chybí — nic si nedomýšlí.
      </p>

      {nacita && !prehled && <div className="text-sm text-neutral-300">Načítám…</div>}
      {zprava && <div role="alert" className="text-sm font-bold text-rose-300">{zprava}</div>}
      {prehled && !migrace && (
        <div className={`${KARTA} text-sm text-neutral-200`}>
          Receptury a várky čekají na migraci databáze bible 20261111010000_bible_varky (Systém → Databázové migrace → Databáze bible).
        </div>
      )}

      {prehled && migrace && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Receptury a várky">
            <button type="button" aria-pressed={zalozka === 'varky'} className={`btn-tmave ${zalozka === 'varky' ? 'ring-2 ring-amber-400 text-amber-300' : ''}`} onClick={() => setZalozka('varky')}>
              Várky ({prehled.varky.length})
            </button>
            <button type="button" aria-pressed={zalozka === 'receptury'} className={`btn-tmave ${zalozka === 'receptury' ? 'ring-2 ring-amber-400 text-amber-300' : ''}`} onClick={() => setZalozka('receptury')}>
              Receptury ({prehled.receptury.length})
            </button>
          </div>

          {zalozka === 'receptury' ? (
            <BibleReceptury prehled={prehled} smiPsat={smiPsat} smiMazat={smiMazat} pivovarId={pivovarId} obnov={() => void nacti()} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {smiPsat && !formular && (
                  <button type="button" className="btn-amber" onClick={() => setFormular({ id: null, pocatek: prazdnaVarka(pivovarId) })}>
                    <Plus size={18} /> Zapsat várku
                  </button>
                )}
                {vybrane.length >= 2 && (
                  <button type="button" className="btn-tmave" aria-pressed={porovnat} onClick={() => setPorovnat((x) => !x)}>
                    <GitCompare size={18} /> {porovnat ? 'Skrýt porovnání' : `Porovnat vybrané (${vybrane.length})`}
                  </button>
                )}
              </div>
              {formular && (
                <FormularVarky pocatek={formular.pocatek} receptury={prehled.receptury} uklada={uklada} ulozit={(v) => void ulozit(v)} zrusit={() => setFormular(null)} />
              )}
              {porovnat && vybraneVarky.length >= 2 && <TabulkaPorovnani varky={vybraneVarky} receptury={prehled.receptury} />}
              {prehled.varky.length === 0 && !formular && (
                <p className="text-sm text-neutral-300">Zatím tu žádná várka není.{smiPsat ? ' Zapiš první tlačítkem výše — stačí, co je známé.' : ''}</p>
              )}
              {prehled.varky.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-neutral-300">Pro porovnání zaškrtni 2 až {MAX_POROVNANI} várek.</p>
                  <ul className="space-y-2" aria-label="Várky">
                    {prehled.varky.map((v) => {
                      const r = prehled.receptury.find((x) => x.id === v.receptura_id);
                      return (
                        <li key={v.id} className={`${KARTA} space-y-2`}>
                          <div className="flex items-start gap-3">
                            <label className="flex min-h-[44px] min-w-[44px] items-center justify-center">
                              <input type="checkbox" className="w-5 h-5" aria-label={`Porovnat várku ${popisVarky(v)}`} checked={vybrane.includes(v.id)}
                                disabled={!vybrane.includes(v.id) && vybrane.length >= MAX_POROVNANI} onChange={() => prepniVyber(v.id)} />
                            </label>
                            <div className="min-w-0 flex-1 space-y-1">
                              <h3 className="text-base font-black text-neutral-50">{popisVarky(v)}</h3>
                              {r && <p className="text-xs font-semibold text-amber-300">Receptura: {r.nazev}</p>}
                              <p className="text-sm text-neutral-100 tabular-nums">{souhrnVarky(v)}</p>
                              {v.poznamka && <p className="text-sm text-neutral-300 whitespace-pre-wrap break-words">{v.poznamka}</p>}
                            </div>
                          </div>
                          {smiPsat && !formular && (
                            <div className="flex flex-wrap gap-2">
                              <button type="button" className="btn-tmave" onClick={() => setFormular({ id: v.id, pocatek: varkaDoFormulare(v) })}><Pencil size={16} /> Upravit</button>
                              {smiMazat(v.zapsal) && <button type="button" className="btn-tmave" onClick={() => void smazat(v)}><Trash2 size={16} /> Smazat</button>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
