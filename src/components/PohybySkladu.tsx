// 📋 Sklad → Pohyby: každý pohyb za vybraný týden, den po dni, s filtrem.
// ---------------------------------------------------------------------------
// Z provozu 24. 9. 2026: „udělej možnost kouknout se na pohyb ve vybraném
// týdnu, ať těch dat není tolik… sledovat detailně každý pohyb a filtrovat".
//
// Pod každým dnem je stav večer — stejné číslo, jaké by ten den ukázal
// Sklad. Když fyzický stav nesedí, hledá se první den, kdy se appka od
// skutečnosti odchýlila, a v něm řádek, který tam nepatří (nebo chybí).
// Výpočet je v lib/pohybySkladu.ts (testovaný), tady jen načtení a vzhled.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListOrdered } from 'lucide-react';
import { Spinner } from './ui';
import { fetchAllRows, useRealtime } from '../lib/supabase';
import { nactiSkladovouKnihu, type SkladovaKniha } from '../lib/skladovaKnihaData';
import { sestavPohybyObdobi, SKUPINY_POHYBU } from '../lib/pohybySkladu';
import { ChipyPiva, ChipyObalu } from './FiltrPivaAObalu';
import { konecMesice } from '../lib/stockLedger';
import { nazevMesice } from '../lib/inventoryFix';
import { isoWeekKey, shiftWeek, weekRange } from './WeeklyOrderSummaryCard';
import { businessDateISO, posunMesic } from '../lib/businessDate';
import { zalogujANahlas } from '../lib/chybyHlaseni';
import { nactiJson, ulozJson } from '../lib/uloziste';

const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const LS_FILTR = 'pohyby_skladu_filtr_v1';
const LS_REZIM = 'pohyby_skladu_rezim_v1';

function denPopis(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${DNY[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

function nactiFiltr(): { beerId: string; packageId: string } {
  const s = nactiJson<{ beerId?: string; packageId?: string }>(LS_FILTR, {});
  return { beerId: String(s?.beerId || ''), packageId: String(s?.packageId || '') };
}

export default function PohybySkladu() {
  const [kniha, setKniha] = useState<SkladovaKniha | null>(null);
  const [jmena, setJmena] = useState<Map<string, string>>(new Map());
  const [bezi, setBezi] = useState(true);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);

  // 🗓️/📅 Týden, nebo celý měsíc — obojí sdílí stejný výpočet (lib/pohybySkladu.ts
  // je jen na 'od'/'doDne', nezáleží mu, jak dlouhé období to je).
  const [rezim, setRezim] = useState<'tyden' | 'mesic'>(() => nactiJson<'tyden' | 'mesic'>(LS_REZIM, 'tyden'));
  const [tyden, setTyden] = useState(() => isoWeekKey(businessDateISO()));
  const [mesic, setMesic] = useState(() => businessDateISO().slice(0, 7));
  const [beerId, setBeerId] = useState(() => nactiFiltr().beerId);
  const [packageId, setPackageId] = useState(() => nactiFiltr().packageId);
  const [skupiny, setSkupiny] = useState<string[]>([]);

  useEffect(() => {
    ulozJson(LS_FILTR, { beerId, packageId });
  }, [beerId, packageId]);
  useEffect(() => { ulozJson(LS_REZIM, rezim); }, [rezim]);

  const nacti = useCallback(async () => {
    try {
      const [k, { data: objednavky }] = await Promise.all([
        nactiSkladovouKnihu(),
        fetchAllRows('orders', 'id,place_name'),
      ]);
      setKniha(k);
      setJmena(new Map(((objednavky as { id: string; place_name: string | null }[]) ?? [])
        .map((o) => [o.id, (o.place_name ?? '').trim()])));
      setChybaNacteni(null);
    } catch (e: any) {
      zalogujANahlas('[PohybySkladu] načtení selhalo', e);
      setChybaNacteni(String(e?.message || e));
    } finally {
      setBezi(false);
    }
  }, []);

  useEffect(() => { void nacti(); }, [nacti]);
  useRealtime(
    ['kegging', 'bottling', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments', 'zavoz_deductions', 'akce', 'akce_items', 'keg_prefuk'],
    () => { void nacti(); },
  );

  const { od, doDne, label } = useMemo(() => {
    if (rezim === 'mesic') return { od: `${mesic}-01`, doDne: konecMesice(mesic), label: nazevMesice(mesic) };
    const { start, end, label: l } = weekRange(tyden);
    return { od: start.toISOString().slice(0, 10), doDne: end.toISOString().slice(0, 10), label: l };
  }, [rezim, tyden, mesic]);

  function posunObdobi(delta: number) {
    if (rezim === 'mesic') setMesic((m) => posunMesic(m, delta));
    else setTyden((t) => shiftWeek(t, delta));
  }
  function zpetNaAktualni() {
    if (rezim === 'mesic') setMesic(businessDateISO().slice(0, 7));
    else setTyden(isoWeekKey(businessDateISO()));
  }
  const jeAktualni = rezim === 'mesic'
    ? mesic === businessDateISO().slice(0, 7)
    : tyden === isoWeekKey(businessDateISO());

  // Tlačítko jen pro aktivní piva — stejný filtr jako dlaždice ve Stáčení
  // (BeerTileGrid). Zrušené/sezónní pivo nezabírá místo v tlačítkách, ale
  // dá se pořád dohledat výběrem "Všechna piva" a hledáním v seznamu dní.
  const aktivniPiva = useMemo(
    () => (kniha?.piva ?? []).filter((b) => b.is_active !== false).map((b) => ({ ...b, beer_color: b.beer_color ?? null })),
    [kniha],
  );

  const vysledek = useMemo(() => {
    if (!kniha) return null;
    return sestavPohybyObdobi(kniha.pohyby, { od, doDne, beerId, packageId, skupiny }, (id) => jmena.get(id) || undefined);
  }, [kniha, jmena, od, doDne, beerId, packageId, skupiny]);

  const nazevPiva = useMemo(() => new Map((kniha?.piva ?? []).map((b) => [b.id, b.name])), [kniha]);
  const nazevObalu = useMemo(() => new Map((kniha?.obaly ?? []).map((p) => [p.id, String(p.label ?? '').trim()])), [kniha]);
  // Název klíče: s vybraným pivem stačí obal, jinak pivo + obal.
  const nazevKlice = (b: string, p: string) =>
    beerId ? (nazevObalu.get(p) || '?') : `${nazevPiva.get(b) || '?'} · ${nazevObalu.get(p) || '?'}`;

  const prepniSkupinu = (id: string) =>
    setSkupiny((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const pocetRadku = vysledek?.dny.reduce((a, d) => a + d.radky.length, 0) ?? 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-3">
        <div className="flex items-center gap-2 text-amber-950">
          <ListOrdered className="ikona-text" />
          <span className="text-xs font-black uppercase tracking-wider">Pohyby skladu — každý pohyb ve vybraném období</span>
        </div>

        {/* Týden, nebo celý měsíc */}
        <div className="flex items-stretch gap-1 rounded bg-white/70 border border-amber-200 p-1">
          {([['tyden', 'Týden'], ['mesic', 'Měsíc']] as const).map(([r, popisek]) => (
            <button
              key={r}
              type="button"
              onClick={() => setRezim(r)}
              className={`flex-1 !rounded !px-3 !py-2 !min-h-[44px] font-black text-xs transition ${rezim === r ? 'btn-amber' : 'btn-ghost !border-none'}`}
            >
              {popisek}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => posunObdobi(-1)} aria-label={rezim === 'mesic' ? 'Předchozí měsíc' : 'Předchozí týden'}>
            <ChevronLeft className="ikona-text" />
          </button>
          <div className="flex-1 text-center">
            <div className="text-sm font-black text-neutral-950 tabular-nums">{label}</div>
            {rezim === 'tyden' && <div className="text-udaj font-bold text-neutral-600">týden {tyden.split('-')[1]}</div>}
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => posunObdobi(1)} aria-label={rezim === 'mesic' ? 'Další měsíc' : 'Další týden'}>
            <ChevronRight className="ikona-text" />
          </button>
        </div>
        {!jeAktualni && (
          <button type="button" className="btn-ghost btn-sm w-full" onClick={zpetNaAktualni}>
            {rezim === 'mesic' ? 'Zpět na tento měsíc' : 'Zpět na tento týden'}
          </button>
        )}

        {/* Pivo a obal — sdílené chipy (components/FiltrPivaAObalu.tsx), stejné jako v Stáčení a Objednávkách. */}
        <ChipyPiva piva={aktivniPiva} vybrane={beerId} onVybrat={setBeerId} />
        <ChipyObalu obaly={kniha?.obaly ?? []} vybrane={packageId} onVybrat={setPackageId} />

        {/* Druh pohybu — nic vybráno = všechno */}
        <div>
          <span className="label">Druh pohybu {skupiny.length === 0 && <span className="normal-case font-semibold text-neutral-600">(ukazuje se všechno)</span>}</span>
          <div className="flex flex-wrap gap-1.5">
            {SKUPINY_POHYBU.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={skupiny.includes(s.id)}
                onClick={() => prepniSkupinu(s.id)}
                className={`btn-zalozka px-3 ${skupiny.includes(s.id) ? 'btn-zalozka-aktivni' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {bezi && <Spinner />}
      {!bezi && chybaNacteni && (
        <p className="rounded border-2 border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-800">
          Pohyby se nepodařilo načíst: {chybaNacteni}
        </p>
      )}

      {!bezi && vysledek && (
        <>
          {/* Souhrn týdne — tohle číslo „konec" je stav ve Skladu k neděli. */}
          <div className="rounded-xl border-2 border-neutral-300 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700">
                  <th scope="col" className="text-left px-2 py-1.5 font-black">{beerId ? 'Obal' : 'Pivo · obal'}</th>
                  <th scope="col" className="text-right px-2 py-1.5 font-black">Po ráno</th>
                  <th scope="col" className="text-right px-2 py-1.5 font-black">Přibylo</th>
                  <th scope="col" className="text-right px-2 py-1.5 font-black">Ubylo</th>
                  <th scope="col" className="text-right px-2 py-1.5 font-black">Konec</th>
                </tr>
              </thead>
              <tbody>
                {vysledek.souhrn.map((s) => (
                  <tr key={`${s.beer_id}-${s.package_id}`} className="border-t border-neutral-200">
                    <td className="px-2 py-1.5 font-black text-neutral-900">
                      {nazevKlice(s.beer_id, s.package_id)}
                      {s.inventura && <span className="ml-1 text-udaj font-bold text-sky-800">(inventura v týdnu)</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.rano}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-800">+{s.prijem}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold text-rose-800">−{s.vydej}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-black ${s.konec < 0 ? 'text-rose-700' : 'text-neutral-950'}`}>{s.konec}</td>
                  </tr>
                ))}
                {vysledek.souhrn.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-3 text-center font-bold text-neutral-500">V tomhle období se s vybraným pivem nic nehýbalo.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {skupiny.length > 0 && (
            <p className="text-udaj font-bold text-neutral-600">
              Ukazují se jen vybrané druhy pohybu ({pocetRadku} řádků). Stav večer je pořád celý — stejný jako ve Skladu.
            </p>
          )}

          {/* Den po dni. Dny se střídají odstínem, ať je hranice dne vidět. */}
          <div className="space-y-2">
            {vysledek.dny.map((d, i) => (
              <div key={d.datum} className={`rounded-xl border overflow-hidden ${i % 2 === 0 ? 'border-neutral-300 bg-white' : 'border-neutral-300 bg-neutral-50'}`}>
                <div className={`px-3 py-1.5 text-sm font-black ${i % 2 === 0 ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-950'}`}>
                  {denPopis(d.datum)}
                </div>
                {d.radky.length === 0 ? (
                  <p className="px-3 py-2 text-xs font-bold text-neutral-500">Žádný pohyb.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {d.radky.map((r, j) => (
                        <tr key={j} className="border-t border-neutral-100 first:border-t-0 align-top">
                          <td className={`px-3 py-1.5 w-16 text-right font-black tabular-nums whitespace-nowrap ${
                            r.druh === 'inventura' ? 'text-sky-800' : r.mnozstvi > 0 ? 'text-emerald-800' : 'text-rose-800'
                          }`}>
                            {r.druh === 'inventura' ? `= ${r.mnozstvi}` : r.mnozstvi > 0 ? `+${r.mnozstvi}` : `−${-r.mnozstvi}`}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-black text-neutral-900">{r.popis}{r.kdo && <span className="font-bold text-neutral-700"> · {r.kdo}</span>}</div>
                            <div className="text-udaj font-semibold text-neutral-600">{nazevKlice(r.beer_id, r.package_id)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {d.vecer.length > 0 && (
                  <div className="px-3 py-1.5 border-t border-neutral-200 flex flex-wrap gap-x-3 gap-y-1 text-udaj font-bold text-neutral-700">
                    <span className="uppercase tracking-wide text-neutral-500">Stav večer:</span>
                    {d.vecer.map((v) => (
                      <span key={`${v.beer_id}-${v.package_id}`} className="tabular-nums">
                        {nazevKlice(v.beer_id, v.package_id)}{' '}
                        <b className={v.mnozstvi < 0 ? 'text-rose-700' : 'text-neutral-950'}>{v.mnozstvi}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
