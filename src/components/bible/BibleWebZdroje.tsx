// 🌐 Rešerše z internetu (etapa 9) ve Správě znalostí: zdroje, které našel
// Claude (konektor) nebo zapsal člověk — adresa, titulek, datum publikace
// a zjištění, důvěra 1–5 a stav. Nový zdroj je vždy neověřený; ověří nebo
// zamítne ho správce. Web je vždy odděleně od literatury (architektura § 10).
import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';
import { smiPrispivat, smiSpravovat, type BibleRole } from '../../lib/bibleOpravneni';
import { chybaWebZdroje, nactiWebZdroje, overWebZdroj, smazWebZdroj, ulozWebZdroj, type WebZdrojVstup } from '../../lib/bibleWebApi';
import { oznam, potvrd } from '../../lib/toast';
import {
  DUVERA_WEBU, filtrujWeb, nazevDuvery, nazevStavuWebu, type StavWebu, type WebZdroj,
} from '../../../bible/supabase/functions/_shared/web-popisy.ts';

const POPISEK = 'space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300';
const BARVA_STAVU: Record<StavWebu, string> = {
  neovereno: 'border-amber-500 text-amber-300',
  overeno: 'border-emerald-500 text-emerald-300',
  zamitnuto: 'border-rose-500 text-rose-300',
};

const datum = (iso: string | null) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : 'neuvedeno';
};

const PRAZDNY: WebZdrojVstup = { url: '', titulek: '', vydavatel: '', datumPublikace: '', shrnuti: '', oblasti: [], duvera: 5 };

function Formular({ pocatek, uklada, ulozit, zrusit }: { pocatek: WebZdrojVstup; uklada: boolean; ulozit: (z: WebZdrojVstup) => void; zrusit: () => void }) {
  const [z, setZ] = useState<WebZdrojVstup>(pocatek);
  const chyba = chybaWebZdroje(z);
  const prepni = (kod: string) => setZ((p) => ({ ...p, oblasti: p.oblasti.includes(kod) ? p.oblasti.filter((o) => o !== kod) : [...p.oblasti, kod].sort() }));
  return (
    <form className="rounded-xl border border-amber-600 bg-neutral-950 p-3 space-y-3" aria-label="Webový zdroj"
      onSubmit={(e) => { e.preventDefault(); if (!chyba && !uklada) ulozit(z); }}>
      <label className={`block ${POPISEK}`}>
        Adresa (https://…)
        <input className="input w-full normal-case" inputMode="url" maxLength={2000} value={z.url} onChange={(e) => setZ({ ...z, url: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={POPISEK}>
          Titulek
          <input className="input w-full normal-case" maxLength={300} value={z.titulek} onChange={(e) => setZ({ ...z, titulek: e.target.value })} />
        </label>
        <label className={POPISEK}>
          Vydavatel (volitelné)
          <input className="input w-full normal-case" maxLength={200} value={z.vydavatel} onChange={(e) => setZ({ ...z, vydavatel: e.target.value })} placeholder="web, instituce, autor" />
        </label>
        <label className={POPISEK}>
          Datum publikace (volitelné)
          <input type="date" className="input w-full" value={z.datumPublikace} onChange={(e) => setZ({ ...z, datumPublikace: e.target.value })} />
        </label>
        <label className={POPISEK}>
          Důvěra
          <select className="input w-full normal-case" value={z.duvera} onChange={(e) => setZ({ ...z, duvera: Number(e.target.value) })}>
            {DUVERA_WEBU.map((d) => <option key={d.uroven} value={d.uroven}>{d.uroven} · {d.nazev}</option>)}
          </select>
        </label>
      </div>
      <label className={`block ${POPISEK}`}>
        Shrnutí vlastními slovy (žádné dlouhé citace)
        <textarea className="input w-full min-h-[100px] normal-case" maxLength={4000} value={z.shrnuti} onChange={(e) => setZ({ ...z, shrnuti: e.target.value })} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Oblasti (volitelné)</legend>
        <div className="flex flex-wrap gap-1.5">
          {BIBLE_OBLASTI.map((o) => (
            <button key={o.kod} type="button" aria-pressed={z.oblasti.includes(o.kod)} title={o.nazev} onClick={() => prepni(o.kod)}
              className={`btn-tmave min-w-11 px-2 ${z.oblasti.includes(o.kod) ? 'ring-2 ring-amber-400 text-amber-300' : ''}`}>
              {o.kod}
            </button>
          ))}
        </div>
      </fieldset>
      {chyba && (z.url || z.titulek || z.shrnuti) && <div role="alert" className="text-sm font-bold text-rose-300">{chyba}</div>}
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={chyba !== null || uklada}>{uklada ? 'Ukládám…' : 'Uložit zdroj'}</button>
      </div>
    </form>
  );
}

export function BibleWebZdroje({ role }: { role: BibleRole }) {
  const { profile } = useAuth();
  const mojeId = profile?.id ?? null;
  const smiPsat = smiPrispivat(role);
  const smiOverit = smiSpravovat(role);
  const [zdroje, setZdroje] = useState<WebZdroj[] | null>(null);
  const [migrace, setMigrace] = useState(true);
  const [zprava, setZprava] = useState<string | null>(null);
  const [filtr, setFiltr] = useState<'aktivni' | StavWebu | 'vse'>('aktivni');
  const [dotaz, setDotaz] = useState('');
  const [formular, setFormular] = useState<{ id: string | null; pocatek: WebZdrojVstup } | null>(null);
  const [uklada, setUklada] = useState(false);
  const poradi = useRef(0);

  async function nacti() {
    const moje = ++poradi.current;
    const r = await nactiWebZdroje();
    if (moje !== poradi.current) return;
    if (r.stav === 'ok') { setZdroje(r.zdroje); setMigrace(r.migrace); setZprava(null); } else setZprava(r.zprava);
  }
  useEffect(() => { void nacti(); }, []);

  async function ulozit(z: WebZdrojVstup) {
    if (!formular) return;
    setUklada(true);
    const r = await ulozWebZdroj(formular.id, z);
    setUklada(false);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(formular.id ? 'Zdroj upraven.' : r.data.novy ? 'Zdroj zapsaný jako neověřený.' : 'Tahle adresa už v rešerši je — nic se nezměnilo.');
    setFormular(null);
    void nacti();
  }

  async function overit(z: WebZdroj, stav: StavWebu) {
    if (stav === 'zamitnuto' && !(await potvrd(`Zamítnout zdroj „${z.titulek}“? Claude ho pak nebude nabízet.`, { potvrdit: 'Zamítnout' }))) return;
    const r = await overWebZdroj(z.id, stav, '');
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(stav === 'overeno' ? 'Zdroj ověřen.' : stav === 'zamitnuto' ? 'Zdroj zamítnut.' : 'Zdroj vrácen mezi neověřené.');
    void nacti();
  }

  async function smazat(z: WebZdroj) {
    if (!(await potvrd(`Smazat zdroj „${z.titulek}“? Nejde vrátit.`, { nebezpecne: true, potvrdit: 'Smazat' }))) return;
    const r = await smazWebZdroj(z.id);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam('Zdroj smazán.');
    void nacti();
  }

  const stavy: StavWebu[] | undefined = filtr === 'aktivni' ? ['neovereno', 'overeno'] : filtr === 'vse' ? undefined : [filtr];
  const vybrane = zdroje ? filtrujWeb(zdroje, { dotaz, stavy }) : [];
  const neoverenych = (zdroje ?? []).filter((z) => z.stav === 'neovereno').length;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-3" aria-label="Rešerše z internetu">
      <h2 className="font-black">Rešerše z internetu{neoverenych > 0 ? ` · ${neoverenych} neověřených` : ''}</h2>
      <p className="text-sm text-neutral-200">
        Zdroje z webu jsou vždy odděleně od knih, s datem a důvěryhodností. Ukládá je hlavně Claude přes konektor („najdi na webu… a ulož zdroj") —
        vždy jako neověřené. {smiOverit ? 'Ty je tady ověříš nebo zamítneš.' : 'Ověřuje je správce.'}
      </p>
      {zprava && <div role="alert" className="text-sm font-bold text-rose-300">{zprava}</div>}
      {zdroje && !migrace && (
        <p className="text-sm text-neutral-200">Rešerše čeká na migraci databáze bible 20261111020000_bible_web_problemy (Systém → Databázové migrace → Databáze bible).</p>
      )}
      {zdroje && migrace && (
        <>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="bible-web-dotaz">Hledat ve webových zdrojích</label>
            <input id="bible-web-dotaz" className="input flex-1 min-w-[160px]" value={dotaz} onChange={(e) => setDotaz(e.target.value)} placeholder="Hledat (titulek, shrnutí, web)" />
            <label className="sr-only" htmlFor="bible-web-stav">Stav</label>
            <select id="bible-web-stav" className="input" value={filtr} onChange={(e) => setFiltr(e.target.value as typeof filtr)}>
              <option value="aktivni">Neověřené a ověřené</option>
              <option value="neovereno">Jen neověřené</option>
              <option value="overeno">Jen ověřené</option>
              <option value="zamitnuto">Zamítnuté</option>
              <option value="vse">Všechny</option>
            </select>
            {smiPsat && !formular && (
              <button type="button" className="btn-tmave" onClick={() => setFormular({ id: null, pocatek: PRAZDNY })}><Plus size={16} /> Přidat zdroj</button>
            )}
          </div>
          {formular && <Formular pocatek={formular.pocatek} uklada={uklada} ulozit={(z) => void ulozit(z)} zrusit={() => setFormular(null)} />}
          {vybrane.length === 0 && !formular && (
            <p className="text-sm text-neutral-300">{zdroje.length === 0 ? 'Zatím tu žádný webový zdroj není.' : 'Výběru neodpovídá žádný zdroj.'}</p>
          )}
          {vybrane.length > 0 && (
            <ul className="space-y-2" aria-label="Webové zdroje">
              {vybrane.map((z) => (
                <li key={z.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-black ${BARVA_STAVU[z.stav]}`}>{nazevStavuWebu(z.stav)}</span>
                    <span className="rounded border border-neutral-600 px-1.5 py-0.5 text-[11px] font-black text-neutral-200" title={nazevDuvery(z.duvera)}>Důvěra {z.duvera} · {nazevDuvery(z.duvera)}</span>
                  </div>
                  <a className="inline-flex items-start gap-1 text-base font-black text-amber-300 underline underline-offset-2 break-words" href={z.url} target="_blank" rel="noopener noreferrer nofollow">
                    {z.titulek} <ExternalLink size={14} className="mt-1 shrink-0" />
                  </a>
                  <p className="text-xs font-semibold text-neutral-300 break-all">{z.url}</p>
                  <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words">{z.shrnuti}</p>
                  <p className="text-xs font-semibold text-neutral-300">
                    Publikováno {datum(z.datum_publikace)} · zjištěno {datum(z.zjisteno)}{z.vydavatel ? ` · ${z.vydavatel}` : ''}
                    {z.oblasti.length ? ` · oblasti ${z.oblasti.join(', ')}` : ''}
                    {' · '}zapsal {z.pres_claude ? `Claude (konektor)${z.zapsal_jmeno ? ` za ${z.zapsal_jmeno}` : ''}` : z.zapsal_jmeno ?? 'neznámý autor'}
                    {z.stav !== 'neovereno' && z.overil_jmeno ? ` · ${z.stav === 'overeno' ? 'ověřil' : 'zamítl'} ${z.overil_jmeno}` : ''}
                  </p>
                  {(smiPsat || smiOverit) && !formular && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {smiOverit && z.stav !== 'overeno' && <button type="button" className="btn-tmave" onClick={() => void overit(z, 'overeno')}><Check size={16} /> Ověřit</button>}
                      {smiOverit && z.stav !== 'zamitnuto' && <button type="button" className="btn-tmave" onClick={() => void overit(z, 'zamitnuto')}><X size={16} /> Zamítnout</button>}
                      {smiOverit && z.stav !== 'neovereno' && <button type="button" className="btn-tmave" onClick={() => void overit(z, 'neovereno')}><RotateCcw size={16} /> Vrátit mezi neověřené</button>}
                      {smiPsat && (
                        <button type="button" className="btn-tmave" onClick={() => setFormular({ id: z.id, pocatek: {
                          url: z.url, titulek: z.titulek, vydavatel: z.vydavatel ?? '', datumPublikace: z.datum_publikace ?? '', shrnuti: z.shrnuti, oblasti: z.oblasti, duvera: z.duvera,
                        } })}><Pencil size={16} /> Upravit</button>
                      )}
                      {(smiOverit || (smiPsat && z.zapsal === mojeId)) && <button type="button" className="btn-tmave" onClick={() => void smazat(z)}><Trash2 size={16} /> Smazat</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
