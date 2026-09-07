// 🔎 Detailní rozpad jednoho piva za libovolné období.
//
// Inventura řekne, že něco nesedí — neřekne kde. Tenhle panel vezme jedno
// pivo a jedno období a vypíše KAŽDÝ pohyb pod sebe: kdo, jaký obal, kolik.
// Vlevo co ubylo (objednávky, fasování, prodejna, odpisy, akce, sudy
// spotřebované na lahve), vpravo co přibylo (stáčení), nahoře stav, se
// kterým se do období vstupovalo.
//
// Počítá se ze stejné skladové knihy jako Sklad a Inventura (lib/rozpadPiva),
// jen se nesčítá do jednoho čísla — vlastní sčítání by byla třetí pravda
// o tomtéž.
import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Search } from 'lucide-react';
import { Spinner } from './ui';
import { chyba } from '../lib/toast';
import { businessDateISO } from '../lib/businessDate';
import { nactiPodkladyRozpadu, mesicJakoObdobi, type PodkladyRozpadu } from '../lib/rozpadPivaData';
import { neprazdneSekce, souhrnPodleObalu, type RozpadPiva } from '../lib/rozpadPiva';

export default function RozpadPivaPanel({ mesic }: { mesic: string }) {
  const [podklady, setPodklady] = useState<PodkladyRozpadu | null>(null);
  const [bezi, setBezi] = useState(true);
  const [beerId, setBeerId] = useState('');
  const vychozi = mesicJakoObdobi(mesic || businessDateISO().slice(0, 7));
  const [od, setOd] = useState(vychozi.od);
  const [doDne, setDo] = useState(vychozi.do);

  useEffect(() => {
    let zruseno = false;
    (async () => {
      setBezi(true);
      try {
        const p = await nactiPodkladyRozpadu();
        if (zruseno) return;
        setPodklady(p);
        // Předvolí se první pivo, ať panel neukazuje prázdno a nebylo nutné
        // hádat, že se nejdřív musí něco vybrat.
        setBeerId((stare) => stare || p.piva[0]?.id || '');
      } catch (e: any) {
        if (!zruseno) chyba('Rozpad se nepodařilo načíst: ' + (e?.message || e));
      } finally {
        if (!zruseno) setBezi(false);
      }
    })();
    return () => { zruseno = true; };
  }, []);

  // Období se drží podle měsíce zvoleného nahoře v Inventuře — když se
  // přepne měsíc, přepne se i rozpad.
  useEffect(() => {
    const o = mesicJakoObdobi(mesic || businessDateISO().slice(0, 7));
    setOd(o.od);
    setDo(o.do);
  }, [mesic]);

  const rozpad: RozpadPiva | null = useMemo(() => {
    if (!podklady || !beerId || !od || !doDne || od > doDne) return null;
    return podklady.rozpad(beerId, od, doDne);
  }, [podklady, beerId, od, doDne]);

  const sekce = rozpad ? neprazdneSekce(rozpad) : [];
  const souhrn = rozpad ? souhrnPodleObalu(rozpad) : [];
  const vydej = sekce.filter((s) => s.smer === 'vydej');
  const prijem = sekce.filter((s) => s.smer === 'prijem');

  return (
    <div className="space-y-4">
      <div className="rounded border-2 border-sky-300 bg-sky-50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sky-900">
          <Search className="ikona-text" />
          <span className="text-xs font-black uppercase tracking-wider">Rozpad piva — každý pohyb za období</span>
        </div>
        <p className="text-[11px] font-bold text-sky-800 leading-snug">
          Vyber pivo a období. Vlevo je všechno, co ubylo (a u koho), vpravo co se stočilo.
          Čísla jsou ze stejné skladové knihy jako Sklad a Inventura.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block">
            <span className="block text-[11px] font-black uppercase text-sky-900 mb-1">Pivo</span>
            <select
              value={beerId}
              onChange={(e) => setBeerId(e.target.value)}
              className="select w-full text-sm font-black min-h-[44px]"
            >
              {(podklady?.piva ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-black uppercase text-sky-900 mb-1">Od</span>
            <input type="date" value={od} onChange={(e) => setOd(e.target.value)} className="input w-full text-sm font-bold min-h-[44px]" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-black uppercase text-sky-900 mb-1">Do</span>
            <input type="date" value={doDne} onChange={(e) => setDo(e.target.value)} className="input w-full text-sm font-bold min-h-[44px]" />
          </label>
        </div>
      </div>

      {bezi && <Spinner />}

      {!bezi && rozpad && (
        <>
          {/* Počáteční stav — „s čím se do období vstupovalo". Po obalech,
              protože sečíst padesátky s lahvemi nedává smysl. */}
          <div className="rounded border border-neutral-300 bg-white p-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-neutral-600 mb-1.5">
              <CalendarRange className="ikona-text" /> Stav k {od} (před začátkem období)
            </div>
            {rozpad.pocatecni.length === 0 ? (
              <p className="text-xs font-bold text-neutral-500">Na začátku období nebylo na skladě nic.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rozpad.pocatecni.map((p) => (
                  <span key={p.obal} className="px-2 py-1 rounded bg-neutral-100 border border-neutral-300 text-xs font-black tabular-nums">
                    {p.obal}: {p.mnozstvi}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Sloupec nadpis="Ubylo" sekce={vydej} barva="rose" prazdno="V tomhle období nic neodešlo." />
            <Sloupec nadpis="Přibylo (stáčení)" sekce={prijem} barva="emerald" prazdno="V tomhle období se nic nestočilo." />
          </div>

          {/* Kontrolní součet — tohle číslo má sedět se Skladem. */}
          <div className="rounded border-2 border-neutral-300 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700">
                  <th className="text-left px-2 py-1.5 font-black">Obal</th>
                  <th className="text-right px-2 py-1.5 font-black">Na začátku</th>
                  <th className="text-right px-2 py-1.5 font-black">Stočeno</th>
                  <th className="text-right px-2 py-1.5 font-black">Ubylo</th>
                  <th className="text-right px-2 py-1.5 font-black">Má být</th>
                </tr>
              </thead>
              <tbody>
                {souhrn.map((s) => (
                  <tr key={s.obal} className="border-t border-neutral-200">
                    <td className="px-2 py-1.5 font-black">{s.obal}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.pocatecni}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-800 font-bold">+{s.prijem}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-rose-800 font-bold">−{s.vydej}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-black ${s.ocekavano < 0 ? 'text-rose-700' : 'text-neutral-900'}`}>{s.ocekavano}</td>
                  </tr>
                ))}
                {souhrn.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-3 text-center text-neutral-500 font-bold">Za tohle období není u tohohle piva žádný pohyb.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Sloupec({ nadpis, sekce, barva, prazdno }: {
  nadpis: string;
  sekce: ReturnType<typeof neprazdneSekce>;
  barva: 'rose' | 'emerald';
  prazdno: string;
}) {
  const ramecek = barva === 'rose' ? 'border-rose-300' : 'border-emerald-300';
  const hlavicka = barva === 'rose' ? 'bg-rose-100 text-rose-950' : 'bg-emerald-100 text-emerald-950';

  return (
    <div className={`rounded border-2 ${ramecek} bg-white overflow-hidden`}>
      <div className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider ${hlavicka}`}>{nadpis}</div>
      {sekce.length === 0 ? (
        <p className="px-3 py-3 text-xs font-bold text-neutral-500">{prazdno}</p>
      ) : (
        sekce.map((s) => (
          <div key={s.nazev} className="border-t border-neutral-200">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-neutral-50">
              <span className="text-xs font-black text-neutral-800">{s.nazev}</span>
              <span className="text-xs font-black tabular-nums text-neutral-700">{s.celkem} ks</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {s.radky.map((r, i) => (
                    <tr key={`${s.nazev}-${i}`} className="border-t border-neutral-100">
                      <td className="px-3 py-1 whitespace-nowrap text-neutral-500 tabular-nums">{r.datum.slice(8, 10)}.{r.datum.slice(5, 7)}.</td>
                      <td className="px-2 py-1 font-bold text-neutral-900 break-words">{r.kdo || r.poznamka || ''}</td>
                      <td className="px-2 py-1 whitespace-nowrap font-bold text-neutral-700">{r.obal}</td>
                      <td className="px-3 py-1 text-right font-black tabular-nums whitespace-nowrap">{r.mnozstvi} ks</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
