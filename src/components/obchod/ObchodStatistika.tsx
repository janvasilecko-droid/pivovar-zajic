// 📊 Obchod → Statistika: tržba a prodej z uzávěrek.
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „statistiky prodeje". Všechno z uzávěrek z pokladny
// (lib/obchodStatistika.ts) — prodej se připisuje ke konci období uzávěrky.
import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../ui';
import { businessDateISO } from '../../lib/businessDate';
import {
  prodejPoObdobich, prodejPoPivech, prodejPoZbozi, souhrnObdobi, type Rozliseni, type VstupStatistiky,
} from '../../lib/obchodStatistika';
import type { DataObchodu } from '../../lib/obchodData';

type Rozsah = 'mesic' | 'minuly' | '30' | 'rok' | 'vse';

const ROZSAHY: { id: Rozsah; popis: string }[] = [
  { id: 'mesic', popis: 'Tento měsíc' },
  { id: 'minuly', popis: 'Minulý měsíc' },
  { id: '30', popis: '30 dní' },
  { id: 'rok', popis: 'Letos' },
  { id: 'vse', popis: 'Vše' },
];
const ROZLISENI: { id: Rozliseni; popis: string }[] = [
  { id: 'den', popis: 'Dny' },
  { id: 'tyden', popis: 'Týdny' },
  { id: 'mesic', popis: 'Měsíce' },
];

const kc = (n: number) => `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n)} Kč`;
const cs = (n: number) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 }).format(n);

function rozsahDat(r: Rozsah, dnes: string): { od?: string; do?: string } {
  const [rok, mesic] = dnes.split('-').map(Number);
  const prvni = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
  const posledni = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  if (r === 'mesic') return { od: prvni(rok, mesic), do: posledni(rok, mesic) };
  if (r === 'minuly') {
    const y = mesic === 1 ? rok - 1 : rok;
    const m = mesic === 1 ? 12 : mesic - 1;
    return { od: prvni(y, m), do: posledni(y, m) };
  }
  if (r === '30') return { od: new Date(Date.parse(dnes + 'T00:00:00Z') - 29 * 86_400_000).toISOString().slice(0, 10), do: dnes };
  if (r === 'rok') return { od: `${rok}-01-01`, do: `${rok}-12-31` };
  return {};
}

function Stitek({ popis, hodnota, podpis }: { popis: string; hodnota: string; podpis?: string }) {
  return (
    <div className="rounded-xl border-2 border-neutral-200 bg-white p-3">
      <div className="text-[11px] font-black uppercase text-neutral-500">{popis}</div>
      <div className="text-xl font-black text-neutral-950 tabular-nums">{hodnota}</div>
      {podpis && <div className="text-[11px] font-semibold text-neutral-600">{podpis}</div>}
    </div>
  );
}

function Pruh({ popis, hodnota, text, max, podpis }: { popis: string; hodnota: number; text: string; max: number; podpis?: string }) {
  const sirka = max > 0 ? Math.max(2, Math.round((hodnota / max) * 100)) : 0;
  return (
    <li className="space-y-0.5">
      <div className="flex justify-between gap-2 text-xs font-bold text-neutral-900">
        <span className="truncate">{popis}</span>
        <span className="font-black tabular-nums shrink-0">{text}</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-primary-500" style={{ width: `${sirka}%` }} />
      </div>
      {podpis && <div className="text-[11px] font-semibold text-neutral-600">{podpis}</div>}
    </li>
  );
}

export function ObchodStatistika({ data }: { data: DataObchodu }) {
  const dnes = businessDateISO();
  const [rozsah, setRozsah] = useState<Rozsah>('mesic');
  const [rozliseni, setRozliseni] = useState<Rozliseni>('den');
  const { od, do: doDne } = rozsahDat(rozsah, dnes);

  const vstup: VstupStatistiky = useMemo(() => ({
    zbozi: data.zbozi, uzaverky: data.uzaverky, radky: data.radky, obaly: data.obaly, piva: data.piva,
  }), [data.zbozi, data.uzaverky, data.radky, data.obaly, data.piva]);

  const souhrn = useMemo(() => souhrnObdobi(vstup, od, doDne), [vstup, od, doDne]);
  const obdobi = useMemo(() => prodejPoObdobich(vstup, rozliseni, od, doDne), [vstup, rozliseni, od, doDne]);
  const zbozi = useMemo(() => prodejPoZbozi(vstup, od, doDne), [vstup, od, doDne]);
  const piva = useMemo(() => prodejPoPivech(vstup, od, doDne), [vstup, od, doDne]);

  if (data.uzaverky.length === 0) {
    return <EmptyState icon={BarChart3} text="Statistiky se počítají z uzávěrek z pokladny. Zadej první uzávěrku a objeví se tu tržba i prodej po pivech." />;
  }

  const maxTrzba = Math.max(0, ...obdobi.map((o) => o.trzba));
  const maxLitry = Math.max(0, ...piva.map((p) => p.litry));
  const maxKs = Math.max(0, ...zbozi.slice(0, 15).map((z) => z.ks));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Období">
        {ROZSAHY.map((r) => (
          <button key={r.id} type="button" className={`btn-zalozka px-3 ${rozsah === r.id ? 'btn-zalozka-aktivni' : ''}`} aria-pressed={rozsah === r.id} onClick={() => setRozsah(r.id)}>
            {r.popis}
          </button>
        ))}
      </div>

      {souhrn.uzaverek === 0 ? (
        <div className="text-sm font-semibold text-neutral-600">V tomhle období není žádná uzávěrka.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stitek popis="Tržba" hodnota={kc(souhrn.trzba)} podpis={`z toho ostatní zboží ${kc(souhrn.trzbaOstatni)}`} />
            <Stitek popis="Piva" hodnota={`${cs(souhrn.litry)} l`} podpis={`${cs(souhrn.ks)} ks`} />
            <Stitek popis="Uzávěrek" hodnota={String(souhrn.uzaverek)} />
            <Stitek popis="Průměr na uzávěrku" hodnota={kc(souhrn.uzaverek ? souhrn.trzba / souhrn.uzaverek : 0)} />
          </div>

          <section aria-label="Vývoj prodeje" className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Tržba v čase</h3>
              <div className="flex gap-1" role="group" aria-label="Rozlišení">
                {ROZLISENI.map((r) => (
                  <button key={r.id} type="button" className={`btn-zalozka px-2.5 ${rozliseni === r.id ? 'btn-zalozka-aktivni' : ''}`} aria-pressed={rozliseni === r.id} onClick={() => setRozliseni(r.id)}>
                    {r.popis}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-2">
              {obdobi.map((o) => (
                <Pruh key={o.klic} popis={o.popis} hodnota={o.trzba} text={kc(o.trzba)} max={maxTrzba} podpis={`${cs(o.litry)} l piva · ${cs(o.ks)} ks`} />
              ))}
            </ul>
          </section>

          <section aria-label="Prodej po pivech" className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Piva podle litrů</h3>
            {piva.length === 0 ? <div className="text-xs text-neutral-600">Žádné pivo v tomhle období.</div> : (
              <ul className="space-y-2">
                {piva.map((p) => <Pruh key={p.beerId} popis={p.nazev} hodnota={p.litry} text={`${cs(p.litry)} l`} max={maxLitry} podpis={`${cs(p.ks)} ks · ${kc(p.trzba)}`} />)}
              </ul>
            )}
          </section>

          <section aria-label="Nejprodávanější zboží" className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Nejprodávanější zboží</h3>
            <ul className="space-y-2">
              {zbozi.slice(0, 15).map((z) => <Pruh key={z.kod} popis={z.nazev} hodnota={z.ks} text={`${cs(z.ks)} ks`} max={maxKs} podpis={`${kc(z.trzba)}${z.litry ? ` · ${cs(z.litry)} l` : ''}`} />)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
