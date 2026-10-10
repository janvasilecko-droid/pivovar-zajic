// ✂️ Záložka Řezání ve stáčení — pivo smíchané ze dvou tanků v poměru.
// Pravidla jsou v lib/rezani.ts, zápis přetočení v lib/jantarZapis.ts.
import { useMemo, useState } from 'react';
import { Minus, Plus, Scissors } from 'lucide-react';
import { supabase, type Beer, type CellarTank, type Package } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { litryRezu, popisRezu, problemyRezu, rozdelPodilB, rozdelRez, tankyKRezu } from '../lib/rezani';
import { odectiSudyDoRezu } from '../lib/rezaniSudy';
import { odectiPodilRezu } from '../lib/jantarZapis';
import { chyba, oznam, potvrd, uspech } from '../lib/toast';

const PRESETY = [50, 60, 70, 80];

export default function RezaniPiva({
  beers,
  kegPackages,
  cellarTanks,
  mesicUzamcen,
  skladKusu,
  onUlozeno,
}: {
  beers: Beer[];
  kegPackages: Package[];
  cellarTanks: CellarTank[];
  /** Zápis do už napočítaného měsíce se potvrzuje (lib/mesicUzamcen.ts). */
  mesicUzamcen: (datum: string) => boolean;
  /** Kolik sudů daného piva a obalu je podle skladové knihy na skladě (pro sudy ze skladu). */
  skladKusu?: (beerId: string, pkgId: string) => number;
  onUlozeno: () => void;
}) {
  const [datum, setDatum] = useState(businessDateISO());
  const [pivoId, setPivoId] = useState('');
  const [tankAId, setTankAId] = useState('');
  const [tankBId, setTankBId] = useState('');
  const [podilA, setPodilA] = useState(50);
  const [pocty, setPocty] = useState<Record<string, number>>({});
  // Sudy ze skladu jako (část) podílu B — viz lib/rezani.ts a lib/rezaniSudy.ts.
  const [sudyPivoId, setSudyPivoId] = useState('');
  const [sudyPocty, setSudyPocty] = useState<Record<string, number>>({});
  const [poznamka, setPoznamka] = useState('');
  const [uklada, setUklada] = useState(false);

  const tanky = useMemo(() => tankyKRezu(cellarTanks), [cellarTanks]);
  const tankA = tanky.find((t) => t.id === tankAId);
  const tankB = tanky.find((t) => t.id === tankBId);
  const radky = kegPackages
    .map((p) => ({ obal: p, pocet: pocty[p.id] ?? 0 }))
    .filter((r) => r.pocet > 0);
  const litry = litryRezu(radky.map((r) => ({ pocet: r.pocet, objemL: Number(r.obal.volume_l) })));
  const { aL, bL } = rozdelRez(litry, podilA);
  const sudyRadky = kegPackages
    .map((p) => ({ obal: p, pocet: sudyPocty[p.id] ?? 0 }))
    .filter((r) => r.pocet > 0);
  const sudyL = litryRezu(sudyRadky.map((r) => ({ pocet: r.pocet, objemL: Number(r.obal.volume_l) })));
  const tankBL = rozdelPodilB(bL, sudyL).tankBL;
  const sudyPrebyva = sudyL > bL + 1;

  function vyberTankA(id: string) {
    setTankAId(id);
    // Pivo se předvyplní podle tanku A — jde přepsat.
    const t = tanky.find((x) => x.id === id);
    if (!pivoId && t?.current_beer_id) setPivoId(t.current_beer_id);
  }

  function zmenPocet(pkgId: string, delta: number) {
    setPocty((p) => ({ ...p, [pkgId]: Math.max(0, (p[pkgId] ?? 0) + delta) }));
  }
  function zmenSudy(pkgId: string, delta: number) {
    setSudyPocty((p) => ({ ...p, [pkgId]: Math.max(0, (p[pkgId] ?? 0) + delta) }));
  }

  async function uloz() {
    const chyby = problemyRezu({
      pivoId,
      tankA,
      tankB,
      podilA,
      radky: radky.map((r) => ({ pocet: r.pocet, objemL: Number(r.obal.volume_l) })),
      sudy: sudyL > 0 ? { litry: sudyL, pivoId: sudyPivoId } : undefined,
    });
    if (chyby.length) { chyba(chyby.join(' ')); return; }
    // Sudy ze skladu: stejně jako u Přefuku se předem zeptáme, když sklad na tolik nestačí
    // (skladová kniha nic neořezává, viz stockLedger.ts — jen ať to není omyl v počtu).
    if (sudyL > 0 && skladKusu) {
      const nedostatek = sudyRadky
        .map((r) => ({ obal: r.obal, chce: r.pocet, je: skladKusu(sudyPivoId, r.obal.id) }))
        .filter((r) => r.chce > r.je);
      if (nedostatek.length) {
        const pivoSudu = beers.find((b) => b.id === sudyPivoId)?.name ?? 'to pivo';
        const ok = await potvrd(
          `Ve skladu podle skladové knihy není dost sudů (${pivoSudu}): ${nedostatek.map((r) => `${r.obal.label} je ${r.je}, chce se ${r.chce}`).join('; ')}.\n\nSklad by šel do mínusu — opravdu pokračovat?`,
          { titulek: 'Sklad na tohle nestačí', potvrdit: 'Ano, zapsat i tak' },
        );
        if (!ok) return;
      }
    }
    if (mesicUzamcen(datum)) {
      const ok = await potvrd(
        `Měsíc ${datum.slice(0, 7)} už má napočítanou inventuru. Zápis do něj změní číslo, které je už uzavřené.\n\nOpravdu zapsat do už napočítaného měsíce?`,
        { titulek: 'Měsíc je už napočítaný', potvrdit: 'Ano, zapsat' },
      );
      if (!ok) return;
    }
    const pivo = beers.find((b) => b.id === pivoId);
    const popis = popisRezu(tankA!.label, tankB?.label ?? null, podilA, sudyL);
    setUklada(true);
    try {
      // Každý řádek se dělí zvlášť, ať úprava nebo smazání jednoho řádku
      // vrátí do tanků přesně to, co se za něj odečetlo.
      const payloads = radky.map((r) => {
        const { aL: radekA } = rozdelRez(r.pocet * Number(r.obal.volume_l), podilA);
        return {
          entry_date: datum,
          beer_id: pivoId,
          beer_name: pivo?.name ?? null,
          package_id: r.obal.id,
          package_label: r.obal.label,
          quantity: r.pocet,
          note: poznamka.trim() ? `${popis} · ${poznamka.trim()}` : popis,
          cellar_tank_id: tankA!.id,
          source_volume_l: radekA || null,
        };
      });
      const { data: vlozene, error } = await supabase
        .from('kegging')
        .insert(payloads)
        .select('id, quantity, package_id');
      if (error) { chyba(`Řez se neuložil: ${error.message}`); return; }

      const upozorneni: string[] = [];
      let odectenoA = 0;
      for (const v of ((vlozene as any[]) ?? [])) {
        const obal = kegPackages.find((p) => p.id === v.package_id);
        if (!obal) continue;
        const dil = rozdelRez(Number(v.quantity) * Number(obal.volume_l), podilA);
        odectenoA += dil.aL;
        // Z tanku B jen to, co nepokryly sudy ze skladu — poměrně k řádku.
        const zTankuB = tankB && bL > 0 ? Math.round(dil.bL * (tankBL / bL) * 10) / 10 : 0;
        if (tankB && zTankuB > 0) {
          const varovani = await odectiPodilRezu({
            keggingId: v.id,
            tank: tankB,
            litry: zTankuB,
            datum,
            popis: `${pivo?.name ?? 'pivo'} ${v.quantity}× ${obal.label}`,
          });
          if (varovani) upozorneni.push(varovani);
        }
      }
      // Sudy ze skladu se vážou na první řádek řezu (smaže-li se, vrátí se na sklad).
      if (sudyL > 0 && ((vlozene as any[]) ?? [])[0]) {
        const pivoSudu = beers.find((b) => b.id === sudyPivoId);
        const e = await odectiSudyDoRezu({
          keggingId: ((vlozene as any[])[0]).id,
          beer: { id: sudyPivoId, name: pivoSudu?.name ?? '' },
          sudy: sudyRadky.map((r) => ({ pkgId: r.obal.id, label: r.obal.label, pocet: r.pocet })),
          datum,
          popis,
        });
        if (e) upozorneni.push(e);
      }
      // Tank A: stejně jako běžné stáčení — relativně přes RPC.
      const { error: chybaA } = await supabase.rpc('adjust_tank_volume', { p_tank_id: tankA!.id, p_delta_l: -Math.round(odectenoA * 10) / 10 });
      if (chybaA) upozorneni.push(`Objem ${tankA!.label} se nepodařilo snížit (${chybaA.message})`);
      else if (tankA!.status !== 'emptying') {
        await supabase.from('cellar_tanks').update({ status: 'emptying', updated_at: new Date().toISOString() }).eq('id', tankA!.id);
      }

      if (upozorneni.length) oznam(`Řez uložen, ale: ${upozorneni.join('; ')}`);
      else {
        const zdroje = [`z ${tankA!.label} ${aL} l`];
        if (tankB && tankBL > 0) zdroje.push(`z ${tankB.label} ${tankBL} l`);
        if (sudyL > 0) zdroje.push(`ze sudů ze skladu ${sudyL} l`);
        uspech(`Řez uložen: ${zdroje.join(', ')}.`);
      }
      setPocty({});
      setSudyPocty({});
      setPoznamka('');
      onUlozeno();
    } finally {
      setUklada(false);
    }
  }

  const popisTanku = (t: CellarTank) =>
    `${t.label} · ${t.current_beer_name ?? 'bez piva'} · ${Math.round(Number(t.current_volume_l ?? 0))} l`;

  return (
    <div className="card p-4 sm:p-5 space-y-4">
      <div>
        <div className="text-sm font-display font-black text-amber-950 mb-1"><Scissors className="ikona-text" /> Řezání piva ze dvou tanků</div>
        <p className="text-xs text-neutral-500">
          Stáčí se pivo smíchané ze dvou tanků. Sudy se přičtou do skladu jako vybrané pivo a z tanků se odečte každému jeho díl podle poměru.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="rez-datum">Datum</label>
          <input id="rez-datum" type="date" className="input" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="rez-pivo">Pivo (co jde do sudů)</label>
          <select id="rez-pivo" className="input" value={pivoId} onChange={(e) => setPivoId(e.target.value)}>
            <option value="">— vyber pivo —</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rez-tank-a">Tank A</label>
          <select id="rez-tank-a" className="input" value={tankAId} onChange={(e) => vyberTankA(e.target.value)}>
            <option value="">— vyber tank —</option>
            {tanky.map((t) => <option key={t.id} value={t.id} disabled={t.id === tankBId}>{popisTanku(t)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rez-tank-b">Tank B</label>
          <select id="rez-tank-b" className="input" value={tankBId} onChange={(e) => setTankBId(e.target.value)}>
            <option value="">{sudyL > 0 ? '— bez tanku B (podíl B pokryjí sudy) —' : '— vyber tank —'}</option>
            {tanky.map((t) => <option key={t.id} value={t.id} disabled={t.id === tankAId}>{popisTanku(t)}</option>)}
          </select>
        </div>
      </div>
      {tanky.length < 2 && (
        <p className="text-xs font-bold text-rose-700">Řezat jde jen ze dvou tanků v provozu, ve kterých je pivo. Teď jich tolik ve Sklepě není.</p>
      )}

      <div>
        <label className="label" htmlFor="rez-podil">Poměr — tank A %</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="rez-podil"
            type="number"
            onWheel={(e) => e.currentTarget.blur()}
            min={1}
            max={99}
            step={1}
            inputMode="numeric"
            className="input !w-24"
            value={podilA}
            onChange={(e) => setPodilA(Math.round(Number(e.target.value)))}
          />
          <span className="text-sm font-bold text-neutral-700">: {100 - podilA} % tank B</span>
          {PRESETY.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPodilA(p)}
              aria-pressed={podilA === p}
              className={`${podilA === p ? 'btn-primary' : 'btn-ghost'} !px-3 !py-2 text-xs min-h-[44px]`}
            >
              {p}/{100 - p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Stočené sudy</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {kegPackages.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-3 py-1.5">
              <span className="text-sm font-bold text-neutral-800">{p.label}</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={`Méně ${p.label}`} onClick={() => zmenPocet(p.id, -1)} className="btn-pocet !min-h-[44px]"><Minus size={16} /></button>
                <input
                  type="number"
                  onWheel={(e) => e.currentTarget.blur()}
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label={`Počet ${p.label}`}
                  className="input !w-16 text-center"
                  value={pocty[p.id] ?? 0}
                  onChange={(e) => setPocty((x) => ({ ...x, [p.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                />
                <button type="button" aria-label={`Více ${p.label}`} onClick={() => zmenPocet(p.id, 1)} className="btn-pocet !min-h-[44px]"><Plus size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="label">Sudy ze skladu do podílu B (nepovinné)</div>
        <p className="text-xs text-neutral-500">
          Když část piva do řezu nešla z tanku, ale z hotových sudů na skladě (třeba 1× 30 l, 1× 20 l a 1× 15 l desítky). Odečtou se ze skladu a jejich litry se počítají do podílu B.
        </p>
        <div>
          <label className="label" htmlFor="rez-sudy-pivo">Pivo ze sudů ze skladu</label>
          <select id="rez-sudy-pivo" className="input" value={sudyPivoId} onChange={(e) => setSudyPivoId(e.target.value)}>
            <option value="">— vyber pivo —</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {kegPackages.map((p) => {
            const naSklade = skladKusu && sudyPivoId ? skladKusu(sudyPivoId, p.id) : null;
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white px-3 py-1.5">
                <span className="text-sm font-bold text-neutral-800">
                  {p.label}
                  {naSklade != null && <span className="block text-[11px] font-semibold text-neutral-500">na skladě {naSklade}</span>}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Méně ${p.label} ze skladu`} onClick={() => zmenSudy(p.id, -1)} className="btn-pocet !min-h-[44px]"><Minus size={16} /></button>
                  <input
                    type="number"
                    onWheel={(e) => e.currentTarget.blur()}
                    min={0}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Počet ${p.label} ze skladu`}
                    className="input !w-16 text-center"
                    value={sudyPocty[p.id] ?? 0}
                    onChange={(e) => setSudyPocty((x) => ({ ...x, [p.id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  />
                  <button type="button" aria-label={`Více ${p.label} ze skladu`} onClick={() => zmenSudy(p.id, 1)} className="btn-pocet !min-h-[44px]"><Plus size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="rez-poznamka">Poznámka (nepovinné)</label>
        <input id="rez-poznamka" type="text" className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} />
      </div>

      {litry > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Celkem <b>{litry} l</b> → z {tankA?.label ?? 'tanku A'} <b>{aL} l</b>
          {sudyL > 0 ? (
            <>
              , podíl B <b>{bL} l</b>: sudy ze skladu <b>{sudyL} l</b>
              {tankBL > 0 && <> + z {tankB?.label ?? 'tanku B'} <b>{tankBL} l</b></>}
              {sudyPrebyva && <span className="block mt-1 font-bold text-rose-700">Sudy ze skladu jsou víc než podíl B — uprav poměr nebo počet sudů.</span>}
            </>
          ) : (
            <>, z {tankB?.label ?? 'tanku B'} <b>{bL} l</b></>
          )}
        </div>
      )}

      <button type="button" onClick={uloz} disabled={uklada} className="btn-primary w-full min-h-[44px]">
        {uklada ? 'Ukládám…' : 'Uložit řez'}
      </button>
    </div>
  );
}
