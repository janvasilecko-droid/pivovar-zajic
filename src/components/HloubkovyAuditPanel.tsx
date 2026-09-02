// 🔬 Hloubkový audit — kontrolní tabulka za týden nebo měsíc.
//
// Ukazuje KAŽDOU kontrolu, i tu, co dopadla dobře. Seznam samých problémů by
// se dal přečíst jako „nic dalšího se nekontrolovalo"; před uzávěrkou je ale
// podstatné vidět i to, co se prověřilo a sedí. Zelený řádek je výsledek.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { sestavAudit, OBLASTI, type Nalez, type Oblast, type VysledekAuditu, type Zavaznost } from '../lib/hloubkovyAudit';
import { nactiPodkladyAuditu, type RezimAuditu } from '../lib/hloubkovyAuditData';
import { businessDateISO } from '../lib/businessDate';
import { Spinner } from './ui';

const BARVA: Record<Zavaznost, { odznak: string; ram: string; ikona: typeof CheckCircle2 }> = {
  ok: { odznak: 'bg-emerald-100 text-emerald-900 border-emerald-300', ram: 'border-emerald-200', ikona: CheckCircle2 },
  pozor: { odznak: 'bg-amber-100 text-amber-900 border-amber-300', ram: 'border-amber-300', ikona: AlertTriangle },
  chyba: { odznak: 'bg-rose-100 text-rose-900 border-rose-300', ram: 'border-rose-300', ikona: ShieldAlert },
};

const POPIS: Record<Zavaznost, string> = { ok: 'Sedí', pozor: 'Pozor', chyba: 'Nesedí' };

function ZavaznostOdznak({ z }: { z: Zavaznost }) {
  const b = BARVA[z];
  const Ikona = b.ikona;
  return (
    <span className={`chip ${b.odznak} shrink-0`}>
      <Ikona size={13} /> {POPIS[z]}
    </span>
  );
}

function RadekNalezu({ n }: { n: Nalez }) {
  const [otevreno, setOtevreno] = useState(false);
  const maDetail = n.detaily.length > 0 || !!n.rada;
  return (
    <div className={`card border ${BARVA[n.zavaznost].ram} p-0 overflow-hidden`}>
      <button
        type="button"
        onClick={() => maDetail && setOtevreno((o) => !o)}
        className={`w-full text-left px-3.5 py-3 flex items-start gap-3 ${maDetail ? 'hover:bg-neutral-50' : 'cursor-default'}`}
      >
        <ZavaznostOdznak z={n.zavaznost} />
        <span className="min-w-0 flex-1">
          <span className="block font-black text-sm text-neutral-900">{n.nazev}</span>
          <span className="block text-xs text-neutral-600 font-medium mt-0.5">{n.shrnuti}</span>
        </span>
        {maDetail && (
          <span className="shrink-0 text-neutral-400 mt-0.5">
            {otevreno ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
        )}
      </button>

      {otevreno && (
        <div className="px-3.5 pb-3 border-t border-neutral-100 pt-2.5 space-y-2">
          {n.rada && (
            <p className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
              {n.rada}
            </p>
          )}
          {n.detaily.length > 0 && (
            <ul className="text-xs text-neutral-700 font-medium space-y-1 max-h-64 overflow-y-auto scrollbar-thin">
              {n.detaily.map((d, i) => (
                <li key={i} className="border-b border-neutral-100 pb-1 last:border-b-0">{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function HloubkovyAuditPanel() {
  const [rezim, setRezim] = useState<RezimAuditu>('tyden');
  const [vysledek, setVysledek] = useState<VysledekAuditu | null>(null);
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const spust = useCallback(async (r: RezimAuditu) => {
    setBezi(true);
    setChyba(null);
    try {
      const podklady = await nactiPodkladyAuditu(r, businessDateISO());
      setVysledek(sestavAudit(podklady, new Date()));
    } catch (e: any) {
      setChyba(e?.message || 'Audit se nepodařilo spustit.');
    } finally {
      setBezi(false);
    }
  }, []);

  // Pustí se sám při otevření záložky — audit, který se musí ručně spouštět,
  // nikdo nespustí a přesně proto se dvoudenní výpadek WhatsAppu našel pozdě.
  useEffect(() => { spust(rezim); }, [rezim, spust]);

  return (
    <div className="space-y-4">
      <div className="card p-3.5 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
          {(['tyden', 'mesic'] as RezimAuditu[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRezim(r)}
              className={`px-4 py-2.5 rounded font-black text-xs transition min-h-[44px] ${
                rezim === r
                  ? 'bg-amber-500 text-neutral-950 shadow-md'
                  : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              {r === 'tyden' ? 'Tento týden' : 'Tento měsíc'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => spust(rezim)}
            disabled={bezi}
            className="btn-secondary !rounded col-span-2 sm:col-span-1 sm:ml-auto"
          >
            <RefreshCw size={15} className={bezi ? 'animate-spin' : ''} /> Spustit znovu
          </button>
        </div>

        {vysledek && !bezi && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="text-neutral-600">
              Období {new Date(vysledek.od + 'T00:00:00Z').toLocaleDateString('cs-CZ')} – {new Date(vysledek.do + 'T00:00:00Z').toLocaleDateString('cs-CZ')}
            </span>
            <span className="chip bg-emerald-100 text-emerald-900 border-emerald-300">
              <ShieldCheck size={13} /> {vysledek.ok} sedí
            </span>
            {vysledek.pozor > 0 && (
              <span className="chip bg-amber-100 text-amber-900 border-amber-300">
                <AlertTriangle size={13} /> {vysledek.pozor} pozor
              </span>
            )}
            {vysledek.chyb > 0 && (
              <span className="chip bg-rose-100 text-rose-900 border-rose-300">
                <ShieldAlert size={13} /> {vysledek.chyb} nesedí
              </span>
            )}
          </div>
        )}
      </div>

      {chyba && (
        <div className="card border border-rose-300 bg-rose-50 p-3.5 text-sm font-bold text-rose-900">
          {chyba}
        </div>
      )}

      {bezi && <Spinner />}

      {vysledek && !bezi && OBLASTI.map((oblast: Oblast) => {
        const radky = vysledek.nalezy.filter((n) => n.oblast === oblast);
        if (radky.length === 0) return null;
        const nejhorsi: Zavaznost = radky.some((r) => r.zavaznost === 'chyba')
          ? 'chyba'
          : radky.some((r) => r.zavaznost === 'pozor') ? 'pozor' : 'ok';
        return (
          <section key={oblast} className="space-y-2">
            <h3 className="flex items-center gap-2 font-display font-black text-sm text-neutral-800 uppercase tracking-wider">
              {oblast}
              <ZavaznostOdznak z={nejhorsi} />
            </h3>
            <div className="space-y-2">
              {radky.map((n) => <RadekNalezu key={n.id} n={n} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
