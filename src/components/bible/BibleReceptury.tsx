// 🍺 Receptury (etapa 8): cíle, suroviny a kroky receptury. Seznam a formulář;
// data načítá a po zápisu obnovuje BibleVarky (jedno načtení pro obě záložky).
import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  CILE_RECEPTURY, doPole, recepturaKOdeslani, smazRecepturu, ulozRecepturu,
  type KrokVstup, type RecepturaVstup, type SurovinaVstup,
} from '../../lib/bibleVarkyApi';
import { oznam, potvrd } from '../../lib/toast';
import {
  cislo, DRUHY_SUROVIN, FAZE_KROKU, type DruhSuroviny, type FazeKroku, type PrehledVarek, type RecepturaZaznam,
} from '../../../bible/supabase/functions/_shared/varky-popisy.ts';

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
const KARTA = 'rounded-xl border border-neutral-700 bg-neutral-900 p-3';

const prazdnaSurovina = (druh: DruhSuroviny = 'slad'): SurovinaVstup => ({ druh, nazev: '', mnozstvi: '', jednotka: druh === 'slad' ? 'kg' : druh === 'chmel' ? 'g' : '', kdy: '', poznamka: '' });
const prazdnyKrok = (faze: FazeKroku = 'rmutovani'): KrokVstup => ({ faze, nazev: '', teplota: '', minut: '', poznamka: '' });

export const prazdnaReceptura = (pivovarId: string | null): RecepturaVstup => ({
  pivovarId, nazev: '', styl: '', cilObjem: '', cilStupnovitost: '', cilAlkohol: '', cilIbu: '', cilBarva: '',
  suroviny: [prazdnaSurovina('slad'), prazdnaSurovina('chmel'), prazdnaSurovina('kvasnice')],
  kroky: [prazdnyKrok('rmutovani')],
  poznamka: '',
});

export const recepturaDoFormulare = (r: RecepturaZaznam): RecepturaVstup => ({
  pivovarId: r.pivovar_id,
  nazev: r.nazev,
  styl: r.styl ?? '',
  cilObjem: doPole(r.cil_objem_hl),
  cilStupnovitost: doPole(r.cil_stupnovitost),
  cilAlkohol: doPole(r.cil_alkohol),
  cilIbu: doPole(r.cil_ibu),
  cilBarva: doPole(r.cil_barva_ebc),
  suroviny: r.suroviny.map((s) => ({ druh: s.druh, nazev: s.nazev, mnozstvi: doPole(s.mnozstvi), jednotka: s.jednotka ?? '', kdy: s.kdy ?? '', poznamka: s.poznamka ?? '' })),
  kroky: r.kroky.map((k) => ({ faze: k.faze, nazev: k.nazev, teplota: doPole(k.teplota_c), minut: doPole(k.minut), poznamka: k.poznamka ?? '' })),
  poznamka: r.poznamka ?? '',
});

function FormularReceptury({ pocatek, uklada, ulozit, zrusit }: {
  pocatek: RecepturaVstup; uklada: boolean; ulozit: (r: RecepturaVstup) => void; zrusit: () => void;
}) {
  const [r, setR] = useState<RecepturaVstup>(pocatek);
  const kontrola = recepturaKOdeslani(r);
  const chyba = 'chyba' in kontrola ? kontrola.chyba : null;
  const zmenSurovinu = (i: number, z: Partial<SurovinaVstup>) => setR((p) => ({ ...p, suroviny: p.suroviny.map((s, j) => (j === i ? { ...s, ...z } : s)) }));
  const zmenKrok = (i: number, z: Partial<KrokVstup>) => setR((p) => ({ ...p, kroky: p.kroky.map((k, j) => (j === i ? { ...k, ...z } : k)) }));

  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3" aria-label="Receptura"
      onSubmit={(e) => { e.preventDefault(); if (!chyba && !uklada) ulozit(r); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={POPISEK}>
          Název receptury
          <input className="input w-full normal-case" maxLength={120} value={r.nazev} onChange={(e) => setR({ ...r, nazev: e.target.value })} placeholder="např. Světlý ležák 11" />
        </label>
        <label className={POPISEK}>
          Styl (volitelné)
          <input className="input w-full normal-case" maxLength={120} value={r.styl} onChange={(e) => setR({ ...r, styl: e.target.value })} placeholder="např. český ležák" />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Cíle (volitelné)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CILE_RECEPTURY.map((c) => (
            <label key={c.pole} className="space-y-1 text-xs font-bold text-neutral-300">
              {c.nazev} ({c.jednotka})
              <input className="input w-full tabular-nums" inputMode="decimal" value={r[c.pole]} onChange={(e) => setR({ ...r, [c.pole]: e.target.value })} />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Suroviny</legend>
        {r.suroviny.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-700 p-2 sm:grid-cols-[9rem_minmax(0,2fr)_6rem_5rem_minmax(0,1fr)_auto]">
            <select className="input w-full" aria-label={`Druh suroviny ${i + 1}`} value={s.druh} onChange={(e) => zmenSurovinu(i, { druh: e.target.value as DruhSuroviny })}>
              {DRUHY_SUROVIN.map((d) => <option key={d.id} value={d.id}>{d.nazev}</option>)}
            </select>
            <input className="input w-full" aria-label={`Název suroviny ${i + 1}`} maxLength={120} value={s.nazev} onChange={(e) => zmenSurovinu(i, { nazev: e.target.value })} placeholder="Název" />
            <input className="input w-full tabular-nums" aria-label={`Množství suroviny ${i + 1}`} inputMode="decimal" value={s.mnozstvi} onChange={(e) => zmenSurovinu(i, { mnozstvi: e.target.value })} placeholder="Množství" />
            <input className="input w-full" aria-label={`Jednotka suroviny ${i + 1}`} maxLength={20} value={s.jednotka} onChange={(e) => zmenSurovinu(i, { jednotka: e.target.value })} placeholder="Jedn." />
            <input className="input w-full" aria-label={`Kdy (surovina ${i + 1})`} maxLength={60} value={s.kdy} onChange={(e) => zmenSurovinu(i, { kdy: e.target.value })} placeholder="Kdy (60 min, vystírka…)" />
            <button type="button" className="btn-tmave w-11 px-0 justify-self-end" aria-label={`Odebrat surovinu ${s.nazev || i + 1}`}
              onClick={() => setR((p) => ({ ...p, suroviny: p.suroviny.filter((_, j) => j !== i) }))}>
              <X size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-tmave" disabled={r.suroviny.length >= 60} onClick={() => setR((p) => ({ ...p, suroviny: [...p.suroviny, prazdnaSurovina()] }))}>
          <Plus size={16} /> Přidat surovinu
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Kroky (rmutování, scezování, chmelovar, kvašení…)</legend>
        {r.kroky.map((k, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-700 p-2 sm:grid-cols-[9rem_minmax(0,2fr)_5rem_5rem_minmax(0,1fr)_auto]">
            <select className="input w-full" aria-label={`Fáze kroku ${i + 1}`} value={k.faze} onChange={(e) => zmenKrok(i, { faze: e.target.value as FazeKroku })}>
              {FAZE_KROKU.map((f) => <option key={f.id} value={f.id}>{f.nazev}</option>)}
            </select>
            <input className="input w-full" aria-label={`Název kroku ${i + 1}`} maxLength={120} value={k.nazev} onChange={(e) => zmenKrok(i, { nazev: e.target.value })} placeholder="Název (např. Nástřik)" />
            <input className="input w-full tabular-nums" aria-label={`Teplota kroku ${i + 1} (°C)`} inputMode="decimal" value={k.teplota} onChange={(e) => zmenKrok(i, { teplota: e.target.value })} placeholder="°C" />
            <input className="input w-full tabular-nums" aria-label={`Délka kroku ${i + 1} (min)`} inputMode="decimal" value={k.minut} onChange={(e) => zmenKrok(i, { minut: e.target.value })} placeholder="min" />
            <input className="input w-full" aria-label={`Poznámka kroku ${i + 1}`} maxLength={200} value={k.poznamka} onChange={(e) => zmenKrok(i, { poznamka: e.target.value })} placeholder="Poznámka" />
            <button type="button" className="btn-tmave w-11 px-0 justify-self-end" aria-label={`Odebrat krok ${k.nazev || i + 1}`}
              onClick={() => setR((p) => ({ ...p, kroky: p.kroky.filter((_, j) => j !== i) }))}>
              <X size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="btn-tmave" disabled={r.kroky.length >= 40} onClick={() => setR((p) => ({ ...p, kroky: [...p.kroky, prazdnyKrok(p.kroky[p.kroky.length - 1]?.faze)] }))}>
          <Plus size={16} /> Přidat krok
        </button>
      </fieldset>

      <label className={`block ${POPISEK}`}>
        Poznámka (volitelné)
        <textarea className="input w-full min-h-[70px] normal-case" maxLength={4000} value={r.poznamka} onChange={(e) => setR({ ...r, poznamka: e.target.value })} />
      </label>
      {chyba && r.nazev.trim() && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={chyba !== null || uklada}>{uklada ? 'Ukládám…' : 'Uložit recepturu'}</button>
      </div>
    </form>
  );
}

function cileText(r: RecepturaZaznam): string {
  return [
    r.cil_objem_hl !== null ? `${cislo(r.cil_objem_hl, 2)} hl` : null,
    r.cil_stupnovitost !== null ? `${cislo(r.cil_stupnovitost, 2)} °P` : null,
    r.cil_alkohol !== null ? `${cislo(r.cil_alkohol, 2)} % obj.` : null,
    r.cil_ibu !== null ? `${cislo(r.cil_ibu, 1)} IBU` : null,
    r.cil_barva_ebc !== null ? `${cislo(r.cil_barva_ebc, 1)} EBC` : null,
  ].filter(Boolean).join(' · ');
}

export function BibleReceptury({ prehled, smiPsat, smiMazat, pivovarId, obnov }: {
  prehled: PrehledVarek;
  smiPsat: boolean;
  smiMazat: (zapsal: string | null) => boolean;
  pivovarId: string | null;
  obnov: () => void;
}) {
  const [formular, setFormular] = useState<{ id: string | null; pocatek: RecepturaVstup } | null>(null);
  const [uklada, setUklada] = useState(false);

  async function ulozit(r: RecepturaVstup) {
    if (!formular) return;
    setUklada(true);
    const v = await ulozRecepturu(formular.id, r);
    setUklada(false);
    if (v.stav === 'chyba') { oznam(v.zprava); return; }
    oznam(formular.id ? 'Receptura upravena.' : 'Receptura zapsaná.');
    setFormular(null);
    obnov();
  }

  async function smazat(r: RecepturaZaznam) {
    const varek = prehled.varky.filter((v) => v.receptura_id === r.id).length;
    const text = `Smazat recepturu „${r.nazev}“?${varek ? ` Várky (${varek}) zůstanou, jen bez receptury.` : ''} Nejde vrátit.`;
    if (!(await potvrd(text, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    const v = await smazRecepturu(r.id);
    if (v.stav === 'chyba') { oznam(v.zprava); return; }
    oznam('Receptura smazaná.');
    obnov();
  }

  return (
    <div className="space-y-3">
      {smiPsat && !formular && (
        <button type="button" className="btn-amber" onClick={() => setFormular({ id: null, pocatek: prazdnaReceptura(pivovarId) })}>
          <Plus size={18} /> Nová receptura
        </button>
      )}
      {formular && <FormularReceptury pocatek={formular.pocatek} uklada={uklada} ulozit={(r) => void ulozit(r)} zrusit={() => setFormular(null)} />}
      {prehled.receptury.length === 0 && !formular && (
        <p className="text-sm text-neutral-300">Zatím tu žádná receptura není.{smiPsat ? ' Zapiš první tlačítkem výše.' : ''}</p>
      )}
      {prehled.receptury.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2" aria-label="Receptury">
          {prehled.receptury.map((r) => {
            const varek = prehled.varky.filter((v) => v.receptura_id === r.id).length;
            return (
              <li key={r.id} className={`${KARTA} space-y-2`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-black text-neutral-50">{r.nazev}</h3>
                  {r.styl && <span className="text-xs font-semibold text-neutral-300">{r.styl}</span>}
                </div>
                {cileText(r) && <p className="text-sm font-bold text-amber-300">Cíle: {cileText(r)}</p>}
                {r.suroviny.length > 0 && (
                  <ul className="text-sm text-neutral-100 space-y-0.5" aria-label={`Suroviny ${r.nazev}`}>
                    {r.suroviny.map((s, i) => (
                      <li key={i}>
                        {s.nazev}
                        {typeof s.mnozstvi === 'number' && <span className="tabular-nums"> · {cislo(s.mnozstvi, 3)}{s.jednotka ? ` ${s.jednotka}` : ''}</span>}
                        {s.kdy && <span className="text-neutral-300"> · {s.kdy}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {r.kroky.length > 0 && (
                  <ol className="list-decimal pl-5 text-sm text-neutral-100 space-y-0.5" aria-label={`Kroky ${r.nazev}`}>
                    {r.kroky.map((k, i) => (
                      <li key={i}>
                        {k.nazev}
                        {typeof k.teplota_c === 'number' && <span className="tabular-nums"> · {cislo(k.teplota_c, 1)} °C</span>}
                        {typeof k.minut === 'number' && <span className="tabular-nums"> · {cislo(k.minut, 0)} min</span>}
                        {k.poznamka && <span className="text-neutral-300"> · {k.poznamka}</span>}
                      </li>
                    ))}
                  </ol>
                )}
                {r.poznamka && <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{r.poznamka}</p>}
                <p className="text-xs font-semibold text-neutral-300">Várek s touto recepturou: {varek}{r.zapsal_jmeno ? ` · zapsal ${r.zapsal_jmeno}` : ''}</p>
                {smiPsat && !formular && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-tmave" onClick={() => setFormular({ id: r.id, pocatek: recepturaDoFormulare(r) })}><Pencil size={16} /> Upravit</button>
                    {smiMazat(r.zapsal) && <button type="button" className="btn-tmave" onClick={() => void smazat(r)}><Trash2 size={16} /> Smazat</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
