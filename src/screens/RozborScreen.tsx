// 🔎 Rozbor — objednané i stočené položky tohoto týdne a proklik do historie pohybů.
// ---------------------------------------------------------------------------
// Z provozu 30. 9. 2026: „ať je to rozbor všech položek, když na to kliknu,
// ať se jednoduše prokliknu k historii (stočeno, objednáno…), nejčastěji
// týden" a „udělej to jako dlaždici — kliknu na to, jen když budu potřebovat
// vidět pohyb". Dlaždice na ploše vede sem; klepnutí na položku otevře
// Sklad → Pohyby předvybrané na to pivo a obal za aktuální týden.
//
// 9. 10. 2026: „nemám v rozboru započítané stáčení lahví" — Rozbor bral jen
// objednané položky, lahve stočené do zásoby v něm chyběly. Teď jsou v něm
// i stočené položky bez objednávky (lib/rozbor.ts).
//
// 15. 10. 2026: „ten rozbor udělej i měsíční s tím, že si tam můžu vyfiltrovat
// i odběratele." Nahoře je přepínač Týden / Měsíc (měsíc se listuje šipkami)
// a výběr odběratele. Týden bez odběratele zůstal jak byl — počítá se z plánu
// stáčení (stočit, mínus ve skladu, inventura). Měsíc a odběratel se počítají
// přímo z objednávek (lib/rozborObdobi.ts).
import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { beerBg, beerName, supabase, useRealtime } from '../lib/supabase';
import { businessDateISO, posunMesic } from '../lib/businessDate';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { usePlanStaceni } from '../lib/usePlanStaceni';
import { mergeWeekPlan } from '../lib/keggingPlan';
import { radkyRozboru, slucInventuruSKonceptem, type InventuraRozboru, type RadekRozboru } from '../lib/rozbor';
import { odberateleObdobi, pocetObjednavek, radkyRozboruObdobi, type OdberatelRozboru } from '../lib/rozborObdobi';
import { useObjednavkyRozboru } from '../lib/useObjednavkyRozboru';
import { nazevMesice } from '../lib/inventoryFix';
import { konecMesice } from '../lib/stockLedger';
import { nactiJson } from '../lib/uloziste';
import { predvyberPohyby } from '../lib/pohybyPredvyber';
import { Spinner, EmptyState } from '../components/ui';
import type { Page } from '../components/Layout';

function kratkyObal(label: string): string {
  const m = label.match(/\d+(?:[,.]\d+)?\s*l\b/i);
  return m ? m[0].replace(/\s+/g, '') : label;
}

export default function RozborScreen({ setPage }: { setPage: (p: Page) => void }) {
  const dnes = businessDateISO();
  const weekKey = isoWeekKey(dnes);
  const { data, chyba, planySudy, planyLahve, zasoba } = usePlanStaceni(weekKey);
  const objednavky = useObjednavkyRozboru();
  // Týden (jako dřív), nebo celý měsíc; navíc volitelně jediný odběratel.
  const [rezim, setRezim] = useState<'tyden' | 'mesic'>('tyden');
  const [mesic, setMesic] = useState(() => dnes.slice(0, 7));
  const [odberatel, setOdberatel] = useState<{ klic: string; jmeno: string } | null>(null);
  // 🧮 Napočítáno v týdenní inventuře — tento týden, jinak minulý
  // (11. 10. 2026: „v rozboru chci vidět i počet u týdenní inventury").
  const pondeli = weekRange(weekKey).start.toISOString().slice(0, 10);
  const [inventura, setInventura] = useState<Map<string, InventuraRozboru>>(new Map());
  const nactiInventuru = () => {
    const minule = new Date(pondeli + 'T00:00:00Z');
    minule.setUTCDate(minule.getUTCDate() - 7);
    const minulePondeli = minule.toISOString().slice(0, 10);
    supabase.from('tydenni_inventura').select('beer_id,package_id,napocitano,updated_at,tyden_od')
      .in('tyden_od', [pondeli, minulePondeli])
      .then(({ data: radky }) => {
        const m = new Map<string, InventuraRozboru>();
        // Minulý týden napřed, tento ho přepíše.
        const serazene = ((radky as any[]) ?? []).sort((a, b) => String(a.tyden_od).localeCompare(String(b.tyden_od)));
        for (const r of serazene) {
          if (!r.beer_id || !r.package_id || r.napocitano == null) continue;
          m.set(`${r.beer_id}__${r.package_id}`, {
            kusu: Number(r.napocitano),
            den: r.updated_at ? businessDateISO(new Date(r.updated_at)) : String(r.tyden_od),
            minulyTyden: r.tyden_od !== pondeli,
          });
        }
        setInventura(m);
      });
  };
  useEffect(() => { nactiInventuru(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pondeli]);
  useRealtime(['tydenni_inventura'], () => nactiInventuru());
  if (chyba && !data) return <EmptyState varianta="chyba" text="Rozbor se nepodařilo načíst." />;
  if (!data) return <Spinner />;
  const pivoPodleId = new Map(data.beers.map((b) => [b.id, b]));
  const { start, end } = weekRange(weekKey);
  const obdobi = rezim === 'mesic'
    ? { od: `${mesic}-01`, doDne: konecMesice(mesic) }
    : { od: start.toISOString().slice(0, 10), doDne: end.toISOString().slice(0, 10) };
  const obsahujeDnes = obdobi.od <= dnes && dnes <= obdobi.doDne;
  // Týden bez odběratele jde z plánu stáčení (stočit, mínus ve skladu,
  // inventura) — tak jako vždycky. Všechno ostatní z objednávek.
  const zPlanu = rezim === 'tyden' && odberatel === null;

  const nabidka: OdberatelRozboru[] = objednavky.data ? odberateleObdobi(objednavky.data.objednavky, obdobi.od, obdobi.doDne) : [];
  // Vybraný odběratel zůstane v nabídce, i když v tomhle období nic neobjednal
  // (po přepnutí na jiný měsíc) — výběr by jinak tiše zmizel.
  const moznosti = odberatel && !nabidka.some((n) => n.klic === odberatel.klic)
    ? [...nabidka, { klic: odberatel.klic, jmeno: odberatel.jmeno, objednavek: 0 }]
    : nabidka;

  let polozky: RadekRozboru[];
  let pocetObj = 0;
  if (zPlanu) {
    // Rozepsané (zatím neuložené) počty z týdenní inventury — leží v zařízení.
    const koncept = nactiJson<Record<string, string>>(`tydenni_napocitano_${pondeli}`, {});
    polozky = radkyRozboru({
      planSudy: mergeWeekPlan(planySudy, 'týden').items,
      planLahve: mergeWeekPlan(planyLahve, 'týden').items,
      kegging: data.kegging,
      bottling: data.bottling,
      od: obdobi.od,
      doDne: obdobi.doDne,
      zasoba,
      piva: data.beers,
      obaly: data.packages,
      inventura: slucInventuruSKonceptem(inventura, koncept, dnes),
    });
  } else if (objednavky.data) {
    const vysledek = radkyRozboruObdobi({
      objednavky: objednavky.data.objednavky,
      polozky: objednavky.data.polozky,
      kegging: data.kegging,
      bottling: data.bottling,
      od: obdobi.od,
      doDne: obdobi.doDne,
      odberatel: odberatel ? odberatel.klic : null,
      piva: data.beers,
      obaly: data.packages,
      // Sklad je stav TEĎ — v minulém měsíci by byl k ničemu.
      zasoba: obsahujeDnes ? zasoba : undefined,
    });
    polozky = vysledek.radky;
    pocetObj = vysledek.objednavek;
  } else {
    polozky = [];
  }

  const obdobiText = rezim === 'mesic' ? nazevMesice(mesic) : 'tento týden';
  const uvod = zPlanu
    ? 'Objednáno a stočeno tento týden — sudy i lahve, „inv." = napočítáno v týdenní inventuře. Klepni na položku — otevře se historie pohybů (stočeno, závozy…).'
    : odberatel
      ? `Objednáno — ${odberatel.jmeno}, ${obdobiText} (${pocetObjednavek(pocetObj)}). Stočeno a sklad se u odběratele neukazují: pivo se stáčí do zásoby, ne pro odběratele. Klepni na položku — otevře se historie pohybů.`
      : `Objednáno a stočeno — ${obdobiText}, sudy i lahve${obsahujeDnes ? '; „sklad" je stav teď' : ''}. Klepni na položku — otevře se historie pohybů za měsíc.`;
  const prazdno = zPlanu
    ? 'Tento týden nic objednaného ani stočeného.'
    : odberatel
      ? `${odberatel.jmeno}: v tomhle období žádná objednávka.`
      : `Za ${obdobiText} nic objednaného ani stočeného.`;

  let seznam: ReactNode;
  if (!zPlanu && !objednavky.data) {
    seznam = objednavky.chyba ? <EmptyState varianta="chyba" text="Objednávky se nepodařilo načíst." /> : <Spinner />;
  } else if (polozky.length === 0) {
    seznam = <EmptyState text={prazdno} />;
  } else {
    seznam = (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {polozky.map((it) => {
          const pivo = pivoPodleId.get(it.beer_id);
          return (
            <button
              key={it.key}
              type="button"
              data-testid="radek-rozboru"
              onClick={() => { predvyberPohyby(it.beer_id, it.package_id, rezim === 'mesic' ? mesic : undefined); setPage('stock_pohyby'); }}
              className="w-full min-h-[48px] flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white hover:bg-amber-50 px-3 py-2 text-left text-sm font-bold text-neutral-950 shadow-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg(pivo) }} />
                <span className="truncate font-black">{pivo ? beerName(pivo) : it.beer_name} {kratkyObal(it.package_label)}</span>
              </span>
              <span className="shrink-0 tabular-nums text-xs text-right">
                {it.stoceno > 0 && <span className="text-emerald-800">stoč. {it.stoceno}</span>}
                {it.stoceno > 0 && it.objednano > 0 && ' · '}
                {it.objednano > 0 && <>obj. {it.objednano}</>}
                {zPlanu && it.objednano > 0 && (it.stocit > 0
                  ? <span className="font-black text-amber-800"> · stočit {it.stocit}</span>
                  : <span className="text-emerald-700"> · <Check size={12} className="inline" /></span>)}
                {it.dluh > 0 && <span className="font-black text-rose-700"> (−{it.dluh} sklad)</span>}
                {it.skladem !== null && <span className={it.skladem < 0 ? 'font-black text-rose-700' : 'text-neutral-600'}> · sklad {it.skladem}</span>}
                {it.inventura && (
                  <span className="font-black text-sky-800" title={it.inventura.minulyTyden ? 'Napočítáno v týdenní inventuře minulého týdne' : 'Napočítáno v týdenní inventuře'}>
                    {' '}· inv. {it.inventura.kusu} {it.inventura.rozepsano ? '(rozepsáno)' : `(${Number(it.inventura.den.slice(8, 10))}. ${Number(it.inventura.den.slice(5, 7))}.)`}
                  </span>
                )}
                <ChevronRight size={14} className="inline ml-1" />
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-12">
      {/* Období a odběratel (15. 10. 2026) — stejný vzhled jako výběr období v Pohybech skladu. */}
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-3">
        <div role="group" aria-label="Období" className="flex items-stretch gap-1 rounded bg-white/70 border border-amber-200 p-1">
          {([['tyden', 'Týden'], ['mesic', 'Měsíc']] as const).map(([r, popisek]) => (
            <button
              key={r}
              type="button"
              aria-pressed={rezim === r}
              onClick={() => setRezim(r)}
              className={`flex-1 !rounded !px-3 !py-2 !min-h-[44px] font-black text-xs transition ${rezim === r ? 'btn-amber' : 'btn-ghost !border-none'}`}
            >
              {popisek}
            </button>
          ))}
        </div>

        {rezim === 'mesic' && (
          <>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMesic((m) => posunMesic(m, -1))} aria-label="Předchozí měsíc">
                <ChevronLeft className="ikona-text" />
              </button>
              <div className="flex-1 text-center text-sm font-black text-neutral-950 tabular-nums first-letter:uppercase" data-testid="rozbor-mesic">{nazevMesice(mesic)}</div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setMesic((m) => posunMesic(m, 1))} aria-label="Další měsíc">
                <ChevronRight className="ikona-text" />
              </button>
            </div>
            {mesic !== dnes.slice(0, 7) && (
              <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setMesic(dnes.slice(0, 7))}>
                Zpět na tento měsíc
              </button>
            )}
          </>
        )}

        <div>
          <label htmlFor="rozbor-odberatel" className="label">Odběratel</label>
          <select
            id="rozbor-odberatel"
            className="input"
            value={odberatel ? odberatel.klic : ''}
            onChange={(e) => {
              const vybrany = moznosti.find((o) => o.klic === e.target.value);
              setOdberatel(vybrany ? { klic: vybrany.klic, jmeno: vybrany.jmeno } : null);
            }}
          >
            <option value="">Všichni odběratelé</option>
            {moznosti.map((o) => <option key={o.klic} value={o.klic}>{o.jmeno} ({o.objednavek})</option>)}
          </select>
        </div>
      </div>

      <p className="text-sm font-bold text-neutral-700">{uvod}</p>
      {seznam}
    </div>
  );
}
