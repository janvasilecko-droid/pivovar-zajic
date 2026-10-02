// 🛢️ Stáčení bez tanku — zápisy, u kterých se z žádného tanku neodečetlo.
// ---------------------------------------------------------------------------
// Zadání 28. 9. 2026: „pokud se přečerpá tank, jen na to upozorni a stáčení
// neodečítej z žádného tanku, dej k tankům záložku, kam se to bude psát,
// a pak můžu ručně přidat to stáčení k nějakému tanku."
//
// Sem padá stáčení, které by tank přečerpalo (Kegging.tsx →
// lib/tankUZapisu.ts odpojPrecerpane), i to, co se uložilo bez tanku
// z jiného důvodu (nebyl zahájený tank, doplněk z inventury „bez tanku").
// Přiřazení zapíše tank k řádku stáčení a odečte litry z tanku.
import { useMemo, useState } from 'react';
import type { Beer, CellarTank, Package } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { chyba, oznam, potvrd } from '../lib/toast';
import { businessDateISO, posunDen } from '../lib/businessDate';
import { EmptyState } from './ui';
import { jeJantar, pivaJantaru, pivoZdrojovehoTanku, rozdelJantar } from '../lib/jantar';
import { odectiTmavouJantaru } from '../lib/jantarZapis';
import { tankRadku } from '../lib/tankUZapisu';
import { SKLEP_OD } from '../lib/sklepOd';

export type RadekStaceni = {
  id: string;
  entry_date: string;
  beer_id: string | null;
  beer_name?: string | null;
  package_id: string | null;
  package_label?: string | null;
  quantity: number | null;
  cellar_tank_id: string | null;
};

/** Jak daleko do minulosti se nepřiřazené stáčení ukazuje. */
const DNU_ZPET = 60;

export function StaceniBezTanku({ kegging, tanks, beers, packages, onZmena }: {
  kegging: RadekStaceni[];
  tanks: CellarTank[];
  beers: Beer[];
  packages: Package[];
  onZmena: () => void;
}) {
  const [vybrano, setVybrano] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState<string | null>(null);

  // Ne dřív než nový začátek sklepa (lib/sklepOd.ts): zářijové stáčení
  // k vyprázdněným tankům přiřazovat nejde.
  const odPred = posunDen(businessDateISO(), -DNU_ZPET);
  const od = odPred > SKLEP_OD ? odPred : SKLEP_OD;
  const radky = useMemo(
    () => kegging
      .filter((r) => !r.cellar_tank_id && r.beer_id && Number(r.quantity) > 0 && r.entry_date >= od)
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    [kegging, od],
  );

  const litry = (r: RadekStaceni) =>
    Number(r.quantity || 0) * Number(packages.find((p) => p.id === r.package_id)?.volume_l || 0);

  /**
   * Tanky, ze kterých se dá odečíst: JEN ty se stejným pivem. Dřív se, když
   * pivo nebylo v žádném tanku, nabízely všechny — u 10° Desítky tak vyskočil
   * Tank 1 s tmavým (28. 9. 2026: „proč je u 10ky tmavý pivo možno přiřadit").
   */
  // Jantar nemá vlastní tank — přiřazuje se k tanku 12° Světlé (80 %),
  // tmavá složka se odečte sama (lib/jantar.ts).
  const moznosti = (r: RadekStaceni) => tanks
    .filter((t) => t.current_beer_id === pivoZdrojovehoTanku(r.beer_id ?? '', beers) && Number(t.current_volume_l) > 0)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  async function priradit(r: RadekStaceni) {
    const tankId = vybrano[r.id] ?? moznosti(r)[0]?.id;
    const t = tanks.find((x) => x.id === tankId);
    if (!t) { oznam('Vyber tank.'); return; }
    const celkemL = litry(r);
    if (celkemL <= 0) { chyba('U obalu chybí objem — nejde spočítat, kolik litrů odečíst.'); return; }
    const jantar = jeJantar(r.beer_id, beers);
    const l = jantar ? rozdelJantar(celkemL).svetlaL : celkemL;
    const pivo = r.beer_name ?? beers.find((b) => b.id === r.beer_id)?.name ?? 'pivo';
    const vTanku = Number(t.current_volume_l || 0);
    const otazka = `Přiřadit ${r.quantity}× ${r.package_label ?? ''} ${pivo} (${Math.round(l)} l) k ${t.label} a odečíst z něj?`
      + (jantar ? `\n\nJantar: z ${t.label} jde 80 % (${l} l), 20 % (${rozdelJantar(celkemL).tmavaL} l) se odečte z tanku tmavého.` : '')
      + (l > vTanku + 1 ? `\n\nPOZOR: v ${t.label} je jen ${Math.round(vTanku)} l — tank skončí na nule.` : '');
    if (!(await potvrd(otazka, { titulek: 'Přiřadit stáčení k tanku', potvrdit: 'Přiřadit' }))) return;

    setUklada(r.id);
    const { error } = await supabase.from('kegging')
      .update({ cellar_tank_id: t.id, source_volume_l: l })
      .eq('id', r.id)
      .is('cellar_tank_id', null);
    if (error) { setUklada(null); chyba(`Nepodařilo se přiřadit: ${error.message}`); return; }
    const { error: errTank } = await supabase.rpc('adjust_tank_volume', { p_tank_id: t.id, p_delta_l: -l });
    setUklada(null);
    if (errTank) {
      chyba(`Stáčení je přiřazené, ale z ${t.label} se nepodařilo odečíst: ${errTank.message}. Zkontroluj stav tanku ve Sklepě.`);
    } else {
      let varovani: string | null = null;
      if (jantar) {
        const { tmava } = pivaJantaru(beers);
        varovani = await odectiTmavouJantaru({
          keggingId: r.id,
          tank: tmava ? tankRadku(tanks, tmava.id) : undefined,
          tmavaL: rozdelJantar(celkemL).tmavaL,
          datum: r.entry_date,
          tmavaPivo: tmava,
          popis: `${r.quantity}× ${r.package_label ?? ''}`,
        });
      }
      oznam(`Přiřazeno k ${t.label}, odečteno ${Math.round(l)} l.${varovani ? ` ${varovani}.` : ''}`);
    }
    onZmena();
  }

  if (radky.length === 0) {
    return <EmptyState text={`Žádné stáčení bez tanku za posledních ${DNU_ZPET} dní.`} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-primary-600">
        Stáčení, u kterého se z žádného tanku neodečetlo — typicky proto, že by tank přečerpalo.
        Vyber tank, ze kterého se opravdu stáčelo, a přiřaď. Ukazuje se posledních {DNU_ZPET} dní.
      </p>
      {radky.map((r) => {
        const pivo = r.beer_name ?? beers.find((b) => b.id === r.beer_id)?.name ?? 'Pivo';
        const tanky = moznosti(r);
        return (
          <div key={r.id} className="card p-3 flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[12rem]">
              <div className="font-bold text-primary-900">{pivo} · {r.package_label ?? ''} × {r.quantity}</div>
              <div className="text-xs text-primary-500">
                {new Date(r.entry_date + 'T00:00:00').toLocaleDateString('cs-CZ')} · {Math.round(litry(r))} l
              </div>
            </div>
            {tanks.length === 0 || tanky.length === 0 ? (
              <span className="text-xs text-primary-500">Toto pivo teď není v žádném tanku.</span>
            ) : (
              <>
                <select
                  className="input !w-auto"
                  aria-label="Tank, ze kterého se stáčelo"
                  value={vybrano[r.id] ?? tanky[0].id}
                  onChange={(e) => setVybrano((v) => ({ ...v, [r.id]: e.target.value }))}
                >
                  {tanky.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} — {t.current_beer_name ?? 'bez piva'} ({Math.round(Number(t.current_volume_l))} l)
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-primary !rounded" disabled={uklada === r.id} onClick={() => priradit(r)}>
                  {uklada === r.id ? 'Ukládám…' : 'Přiřadit'}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
