// 🧑‍🔧 Zkušenosti sládků (etapa 3b): hledání, ruční zápis, úroveň důvěryhodnosti 1–5.
// ---------------------------------------------------------------------------
// Z architektury § 9: zkušenost se nikdy nevydá za obecné pravidlo, proto má
// každá karta viditelný štítek důvěryhodnosti. Úroveň 1–3 (ověřené zdroje)
// nastavuje jen správce; přispěvatel zapisuje 4 nebo 5. Smazat smí autor svůj
// záznam a správce jakýkoli (hlídá i SQL).
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { BIBLE_OBLASTI, nazevOblasti } from '../../lib/bibleOblasti';
import type { BibleRole } from '../../lib/bibleOpravneni';
import {
  DRUHY_ZKUSENOSTI, nactiZkusenosti, nazevDruhu, nazevUrovne, smazZkusenost, UROVNE_ZKUSENOSTI, upravZkusenost, zapisZkusenost,
  type DruhZkusenosti, type Zkusenost, type ZkusenostVstup,
} from '../../lib/bibleZkusenostiApi';
import { oznam, potvrd } from '../../lib/toast';
import { ZvyraznenyUryvek } from './BibleHledani';

const PRAZDNY: ZkusenostVstup = { typ: 'provozni_zkusenost', nazev: '', text: '', oblasti: [], uroven: 4, zdroj: '' };

/** Barva štítku důvěryhodnosti: ověřené zdroje zeleně, jednotlivá zkušenost žlutě, neověřené červeně. */
const BARVA_UROVNE: Record<number, string> = {
  1: 'bg-emerald-900 text-emerald-100 border-emerald-500',
  2: 'bg-emerald-900 text-emerald-100 border-emerald-500',
  3: 'bg-sky-950 text-sky-100 border-sky-500',
  4: 'bg-amber-900 text-amber-100 border-amber-500',
  5: 'bg-rose-950 text-rose-100 border-rose-500',
};

const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('cs-CZ') : '');

function Formular({ role, pocatek, ulozit, zrusit, uklada }: {
  role: BibleRole;
  pocatek: ZkusenostVstup;
  ulozit: (z: ZkusenostVstup) => void;
  zrusit: () => void;
  uklada: boolean;
}) {
  const [z, setZ] = useState<ZkusenostVstup>(pocatek);
  // Přispěvatel smí jen 4 a 5; správce všech pět úrovní.
  const urovne = UROVNE_ZKUSENOSTI.filter((u) => role === 'spravuje' || u.uroven >= 4);
  const jePlny = z.nazev.trim().length > 0 && z.text.trim().length > 0;
  const prepniOblast = (kod: string) =>
    setZ((p) => ({ ...p, oblasti: p.oblasti.includes(kod) ? p.oblasti.filter((o) => o !== kod) : [...p.oblasti, kod].sort() }));

  return (
    <form
      className="rounded-xl border border-amber-600 bg-neutral-900 p-3 space-y-3"
      onSubmit={(e) => { e.preventDefault(); if (jePlny && !uklada) ulozit(z); }}
      aria-label="Zápis zkušenosti"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
          Druh
          <select className="input w-full normal-case" value={z.typ} onChange={(e) => setZ({ ...z, typ: e.target.value as DruhZkusenosti })}>
            {DRUHY_ZKUSENOSTI.map((d) => <option key={d.id} value={d.id}>{d.nazev}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
          Důvěryhodnost
          <select className="input w-full normal-case" value={z.uroven} onChange={(e) => setZ({ ...z, uroven: Number(e.target.value) })}>
            {urovne.map((u) => <option key={u.uroven} value={u.uroven}>{u.uroven} · {u.nazev}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
        Název
        <input className="input w-full normal-case" maxLength={200} value={z.nazev} onChange={(e) => setZ({ ...z, nazev: e.target.value })} placeholder="např. Přepěnění při chmelovaru" />
      </label>
      <label className="block space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
        Co se stalo a co pomohlo
        <textarea className="input w-full min-h-[120px] normal-case" maxLength={8000} value={z.text} onChange={(e) => setZ({ ...z, text: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs font-black uppercase tracking-wide text-neutral-300">
        Odkud to je (volitelné)
        <input className="input w-full normal-case" maxLength={500} value={z.zdroj} onChange={(e) => setZ({ ...z, zdroj: e.target.value })} placeholder="vlastní provoz, rozhovor se sládkem, pivovar…" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-black uppercase tracking-wide text-neutral-300">Oblasti (volitelné)</legend>
        <div className="flex flex-wrap gap-1.5">
          {BIBLE_OBLASTI.map((o) => (
            <button
              key={o.kod}
              type="button"
              aria-pressed={z.oblasti.includes(o.kod)}
              title={o.nazev}
              onClick={() => prepniOblast(o.kod)}
              className={`btn-tmave min-w-11 px-2 ${z.oblasti.includes(o.kod) ? 'ring-2 ring-amber-400 text-amber-300' : ''}`}
            >
              {o.kod}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2 justify-end">
        <button type="button" className="btn-tmave" onClick={zrusit} disabled={uklada}>Zrušit</button>
        <button type="submit" className="btn-amber" disabled={!jePlny || uklada}>{uklada ? 'Ukládám…' : 'Uložit zkušenost'}</button>
      </div>
    </form>
  );
}

export function BibleZkusenosti({ role }: { role: BibleRole }) {
  const { profile } = useAuth();
  const mojeId = profile?.id ?? null;
  const smiPsat = role === 'prispiva' || role === 'spravuje';

  const [dotaz, setDotaz] = useState('');
  const [oblast, setOblast] = useState('');
  const [nejhorsi, setNejhorsi] = useState(5);
  const [seznam, setSeznam] = useState<Zkusenost[] | null>(null);
  const [zprava, setZprava] = useState<string | null>(null);
  const [migrace, setMigrace] = useState(true);
  const [nacita, setNacita] = useState(true);
  const [formular, setFormular] = useState<{ id: string | null; pocatek: ZkusenostVstup } | null>(null);
  const [uklada, setUklada] = useState(false);
  const poradi = useRef(0);
  const [hledaneSlovo, setHledaneSlovo] = useState('');

  async function nacti(q = dotaz) {
    const moje = ++poradi.current;
    setNacita(true);
    const r = await nactiZkusenosti({ dotaz: q, oblast: oblast || undefined, nejhorsi });
    if (moje !== poradi.current) return; // mezitím přišlo novější hledání
    setNacita(false);
    if (r.stav === 'ok') {
      setSeznam(r.zkusenosti);
      setMigrace(r.migrace);
      setZprava(null);
      setHledaneSlovo(q.trim());
    } else {
      setSeznam(null);
      setZprava(r.zprava);
    }
  }

  // Filtr oblasti a důvěryhodnosti se projeví hned; dotaz až po „Hledat".
  useEffect(() => { void nacti(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [oblast, nejhorsi]);

  const smiUpravit = (z: Zkusenost) => smiPsat && (role === 'spravuje' || (z.zapsal === mojeId && z.uroven >= 4));
  const smiSmazat = (z: Zkusenost) => smiPsat && (role === 'spravuje' || z.zapsal === mojeId);

  async function ulozit(z: ZkusenostVstup) {
    if (!formular) return;
    setUklada(true);
    const r = formular.id ? await upravZkusenost(formular.id, z) : await zapisZkusenost(z);
    setUklada(false);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam(formular.id ? 'Zkušenost upravena.' : 'Zkušenost zapsaná.');
    setFormular(null);
    void nacti();
  }

  async function smaz(z: Zkusenost) {
    if (!(await potvrd(`Smazat zkušenost „${z.nazev}“? Nejde vrátit.`))) return;
    const r = await smazZkusenost(z.id);
    if (r.stav === 'chyba') { oznam(r.zprava); return; }
    oznam('Zkušenost smazaná.');
    void nacti();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Praxe sládků: případové studie, postupy a řešení problémů. U každého záznamu je vidět, jak moc se mu dá věřit (1 = ověřená publikace, 5 = neověřená informace).
        Jednotlivá zkušenost není obecné pravidlo.
      </p>

      <form className="flex flex-wrap gap-2" role="search" onSubmit={(e) => { e.preventDefault(); void nacti(); }}>
        <label className="sr-only" htmlFor="bible-zk-dotaz">Hledat ve zkušenostech</label>
        <input id="bible-zk-dotaz" className="input flex-1 min-w-[180px]" value={dotaz} onChange={(e) => setDotaz(e.target.value)} placeholder="např. pěnění chmelovar" enterKeyHint="search" />
        <button type="submit" className="btn-amber" disabled={nacita}><Search size={18} /> Hledat</button>
        <label className="sr-only" htmlFor="bible-zk-oblast">Oblast</label>
        <select id="bible-zk-oblast" className="input" value={oblast} onChange={(e) => setOblast(e.target.value)}>
          <option value="">Všechny oblasti</option>
          {BIBLE_OBLASTI.map((o) => <option key={o.kod} value={o.kod}>{o.kod} · {o.nazev}</option>)}
        </select>
        <label className="sr-only" htmlFor="bible-zk-uroven">Důvěryhodnost</label>
        <select id="bible-zk-uroven" className="input" value={nejhorsi} onChange={(e) => setNejhorsi(Number(e.target.value))}>
          <option value={5}>Všechny úrovně</option>
          <option value={3}>Jen ověřené (1–3)</option>
          <option value={4}>Bez neověřených (1–4)</option>
        </select>
      </form>

      {smiPsat && !formular && (
        <button type="button" className="btn-amber" onClick={() => setFormular({ id: null, pocatek: PRAZDNY })}>
          <Plus size={18} /> Zapsat zkušenost
        </button>
      )}
      {formular && (
        <Formular role={role} pocatek={formular.pocatek} uklada={uklada} ulozit={(z) => void ulozit(z)} zrusit={() => setFormular(null)} />
      )}

      {nacita && !seznam && <div className="text-sm text-neutral-300">Načítám…</div>}
      {zprava && <div role="alert" className="text-sm font-bold text-rose-300">{zprava}</div>}
      {seznam && !migrace && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">
          Zkušenosti čekají na migraci databáze bible 20261104000000_bible_zkusenosti (Systém → Databázové migrace → Databáze bible).
        </div>
      )}
      {seznam && migrace && seznam.length === 0 && !nacita && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">
          {hledaneSlovo || oblast || nejhorsi < 5
            ? 'Nic jsem nenašel. Zkus jiné slovo nebo uvolni filtry.'
            : 'Zatím tu žádná zkušenost není.' + (smiPsat ? ' Zapiš první tlačítkem výše.' : '')}
        </div>
      )}
      {seznam && migrace && seznam.length > 0 && (
        <ul className="space-y-2" aria-label="Zkušenosti">
          {seznam.map((z) => (
            <li key={z.id} className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-black ${BARVA_UROVNE[z.uroven] ?? BARVA_UROVNE[5]}`} title={nazevUrovne(z.uroven)}>
                  Úroveň {z.uroven} · {nazevUrovne(z.uroven)}
                </span>
                <span className="text-xs font-bold text-neutral-300">{nazevDruhu(z.typ)}</span>
              </div>
              <h3 className="text-base font-black text-neutral-50"><ZvyraznenyUryvek text={z.nazev} dotaz={hledaneSlovo} /></h3>
              <p className="text-sm text-neutral-100 whitespace-pre-wrap break-words leading-relaxed"><ZvyraznenyUryvek text={z.text} dotaz={hledaneSlovo} /></p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-neutral-300">
                {z.oblasti.map((o) => <span key={o} className="rounded border border-neutral-600 px-1" title={nazevOblasti(o)}>{o} · {nazevOblasti(o)}</span>)}
                {z.zdroj && <span>Zdroj: {z.zdroj}</span>}
                <span>{z.zapsalJmeno ?? 'Neznámý autor'}, {datum(z.vytvoreno)}</span>
              </div>
              {(smiUpravit(z) || smiSmazat(z)) && (
                <div className="flex flex-wrap gap-2">
                  {smiUpravit(z) && (
                    <button
                      type="button"
                      className="btn-tmave"
                      onClick={() => setFormular({ id: z.id, pocatek: { typ: z.typ, nazev: z.nazev, text: z.text, oblasti: z.oblasti, uroven: z.uroven, zdroj: z.zdroj ?? '' } })}
                    >
                      <Pencil size={16} /> Upravit
                    </button>
                  )}
                  {smiSmazat(z) && <button type="button" className="btn-tmave" onClick={() => void smaz(z)}><Trash2 size={16} /> Smazat</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
