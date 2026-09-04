// 📗 Export do Excelu — jedno místo pro všechny měsíční zápisy.
// ---------------------------------------------------------------------------
// Dřív měla každá obrazovka vlastní tlačítko „Export Excel" a vznikalo z toho
// pět souborů z pěti míst. Tady se vybere období (výchozí je minulý měsíc,
// protože se to dělá po jeho uzavření) a stáhne se JEDEN sešit, ve kterém má
// každý zápis svůj list — se stejným rozvržením, jaké má pivovar v ručních
// listech, aby se z něj dalo rovnou kopírovat.
import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileSpreadsheet } from 'lucide-react';
import { fetchAllRows, Package } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { chyba, uspech, varovani } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import { nazevSouboru, poctyRadku, stahniSesit, type ListExportu } from '../lib/mesicniExport';
import { prehledDoTsv, sestavPrehled, type VydejRadek } from '../lib/prehledVydeje';

type Nactene = {
  packages: Package[];
  fasovani: any[];
  prodejna: any[];
  odpis: any[];
  bottling: any[];
  kegging: any[];
  tanky: { id: string; label: string | null }[];
};

/** Minulý měsíc — uzávěrka se dělá po jeho konci, ne uprostřed. */
function minulyMesic(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function rozsahMesice(mesic: string): { od: string; do: string } {
  const [r, m] = mesic.split('-').map(Number);
  const posledni = new Date(Date.UTC(r, m, 0)).getUTCDate();
  return { od: `${mesic}-01`, do: `${mesic}-${String(posledni).padStart(2, '0')}` };
}

export default function ExportExcelScreen() {
  const [mesic, setMesic] = useState(minulyMesic);
  const [vlastniObdobi, setVlastniObdobi] = useState(false);
  const [od, setOd] = useState(() => rozsahMesice(minulyMesic()).od);
  const [doKdy, setDoKdy] = useState(() => rozsahMesice(minulyMesic()).do);
  const [data, setData] = useState<Nactene | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [stahuji, setStahuji] = useState(false);
  // 🚫 Záporné řádky jsou ruční opravy přepočtu (viz Stáčení KEG) a do listů,
  // které mají ukazovat, co se doopravdy vydalo/stočilo, nepatří. Výchozí
  // stav je vynechat je; kdo je chce vidět (na dohledání opravy), odškrtne.
  const [bezMinusu, setBezMinusu] = useState(true);
  // Které listy se do sešitu NEDÁVAJÍ (prázdná množina = všechny). Ať jde
  // stáhnout jen KEG nebo jen Lahve, ne pokaždé celý sešit.
  const [vynechane, setVynechane] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (vlastniObdobi) return;
    const r = rozsahMesice(mesic);
    setOd(r.od);
    setDoKdy(r.do);
  }, [mesic, vlastniObdobi]);

  useEffect(() => {
    let zruseno = false;
    (async () => {
      try {
        const [pk, fa, pr, wo, bt, kg, tk] = await Promise.all([
          fetchAllRows('packages', 'id,label,kind,volume_l'),
          fetchAllRows('fasovani', 'entry_date,beer_name,package_id,quantity,who,note'),
          fetchAllRows('fasovani_private', 'entry_date,beer_name,package_id,quantity,who,note'),
          fetchAllRows('writeoffs', 'entry_date,beer_name,package_id,quantity,who,note'),
          fetchAllRows('bottling', 'entry_date,beer_name,package_id,quantity,note,kegs_used,kegs_used_package_id'),
          fetchAllRows('kegging', 'entry_date,beer_name,package_id,quantity,note,cellar_tank_id'),
          fetchAllRows('cellar_tanks', 'id,label'),
        ]);
        if (zruseno) return;
        setData({
          packages: (pk.data as Package[]) ?? [],
          fasovani: (fa.data as any[]) ?? [],
          prodejna: (pr.data as any[]) ?? [],
          odpis: (wo.data as any[]) ?? [],
          bottling: (bt.data as any[]) ?? [],
          kegging: (kg.data as any[]) ?? [],
          tanky: (tk.data as any[]) ?? [],
        });
      } catch (e) {
        chyba(e);
      } finally {
        if (!zruseno) setNacitam(false);
      }
    })();
    return () => { zruseno = true; };
  }, []);

  const listy = useMemo<ListExportu[]>(() => {
    if (!data) return [];
    const mapaTanku = new Map(data.tanky.map((t) => [t.id, (t.label || '').trim()]));

    // U stáčení lahví nejsou sloupce „Z sudů" obal zápisu, ale sudy
    // SPOTŘEBOVANÉ na stočení — proto z jednoho zápisu dvě položky.
    const lahveRadky: VydejRadek[] = data.bottling.flatMap((r: any) => {
      const out: VydejRadek[] = [{
        entry_date: r.entry_date, beer_name: r.beer_name,
        package_id: r.package_id, quantity: r.quantity, note: r.note,
      }];
      if (Number(r.kegs_used) > 0 && r.kegs_used_package_id) {
        out.push({
          entry_date: r.entry_date, beer_name: r.beer_name,
          package_id: r.kegs_used_package_id, quantity: r.kegs_used, note: r.note,
        });
      }
      return out;
    });

    // Záporné řádky jsou ruční opravy přepočtu (někdo omylem zapsal moc a
    // "vrátil" to novým záznamem se záporným počtem, místo aby opravil ten
    // původní přes „Upravit"). Do listu, který má ukazovat, co se doopravdy
    // vydalo/stočilo, nepatří — je to list výdejů, ne účetní deník oprav.
    // Databázi se to nedotýká, mění se jen export; přepínač „bez minusů" to
    // umí vypnout. Platí pro VŠECHNY listy, ne jen pro KEG.
    const bezZapornych = (r: VydejRadek[]) =>
      bezMinusu ? r.filter((x) => Number(x.quantity ?? 0) > 0) : r;

    const kegRadky: VydejRadek[] = data.kegging.map((r: any) => ({
      entry_date: r.entry_date, beer_name: r.beer_name,
      package_id: r.package_id, quantity: r.quantity, note: r.note,
      tank: r.cellar_tank_id ? (mapaTanku.get(r.cellar_tank_id) ?? '') : '',
    }));

    return [
      { nazev: 'Odběr personál', varianta: 'odberatel', radky: bezZapornych(data.fasovani) },
      { nazev: 'Fasování prodejna', varianta: 'odberatel', radky: bezZapornych(data.prodejna) },
      { nazev: 'Vzorky promo a PR', varianta: 'odberatel', radky: bezZapornych(data.odpis), popisOdberatele: 'Komu proč a zač' },
      { nazev: 'Stáčení lahve', varianta: 'staceni_lahve', radky: bezZapornych(lahveRadky) },
      { nazev: 'Stáčení KEG', varianta: 'staceni_keg', radky: bezZapornych(kegRadky) },
    ];
  }, [data, bezMinusu]);

  // Jen zaškrtnuté listy — ať jde stáhnout třeba jen KEG.
  const vybraneListy = useMemo(() => listy.filter((l) => !vynechane.has(l.nazev)), [listy, vynechane]);

  function prepniList(nazev: string) {
    setVynechane((prev) => {
      const next = new Set(prev);
      if (next.has(nazev)) next.delete(nazev); else next.add(nazev);
      return next;
    });
  }

  const prehled = useMemo(() => {
    if (!data) return [];
    return poctyRadku({ listy, obaly: data.packages as any, od, do: doKdy });
  }, [listy, data, od, doKdy]);

  // Řádky jen ze zaškrtnutých listů — podle nich se povoluje stažení.
  const celkemVybranych = prehled
    .filter((p) => !vynechane.has(p.nazev))
    .reduce((s, p) => s + p.pocet, 0);

  /** Zkopíruje jeden list — když nechceš celý sešit, ale jen řádky do ruky. */
  async function kopirujList(nazev: string) {
    if (!data) return;
    const list = listy.find((l) => l.nazev === nazev);
    if (!list) return;
    const radky = sestavPrehled(list.radky, data.packages as any, { od, do: doKdy });
    if (!radky.length) return;
    const tsv = prehledDoTsv(radky, { varianta: list.varianta });
    try {
      await navigator.clipboard.writeText(tsv);
      zavibruj('hotovo');
      uspech(`Zkopírováno ${radky.length} řádků z listu ${nazev}.`);
    } catch {
      chyba('Schránka není dostupná — stáhni radši celý sešit.');
    }
  }

  // Knihovna na Excel (628 kB) se stahuje až tady, při kliknutí na stažení
  // sešitu — proto je funkce async (viz lib/xlsxLazy.ts). Ukazatel „Stahuji…"
  // (setStahuji) tím dostal i skutečný důvod existovat.
  async function stahni() {
    if (!data) return;
    setStahuji(true);
    try {
      const povedlo = await stahniSesit({ listy: vybraneListy, obaly: data.packages as any, od, do: doKdy });
      if (povedlo) {
        zavibruj('hotovo');
        uspech(`Staženo — ${nazevSouboru(od, doKdy)}`);
      } else {
        varovani('V tomhle období není žádný zápis, není co stahovat.');
      }
    } catch (e) {
      chyba(e);
    } finally {
      setStahuji(false);
    }
  }

  if (nacitam) return <Spinner />;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="card p-4 sm:p-5">
        <h1 className="font-display font-extrabold text-lg text-neutral-900 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Export do Excelu
        </h1>
        <p className="text-sm text-neutral-600 font-medium mt-1">
          Jeden sešit, ve kterém má každý zápis svůj list. Rozvržení sedí s ručními listy,
          takže se z něj dá rovnou kopírovat.
        </p>
      </div>

      <div className="card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          {!vlastniObdobi ? (
            <label className="block">
              <span className="label !mb-0.5">Měsíc</span>
              <input
                type="month"
                className="input !min-h-[48px] !w-auto"
                value={mesic}
                onChange={(e) => setMesic(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="label !mb-0.5">Od</span>
                <input type="date" className="input !min-h-[48px]" value={od} onChange={(e) => setOd(e.target.value)} />
              </label>
              <label className="block">
                <span className="label !mb-0.5">Do</span>
                <input type="date" className="input !min-h-[48px]" value={doKdy} onChange={(e) => setDoKdy(e.target.value)} />
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 min-h-[48px] cursor-pointer">
            <input
              type="checkbox"
              checked={vlastniObdobi}
              onChange={(e) => setVlastniObdobi(e.target.checked)}
              className="w-5 h-5 accent-amber-500"
            />
            vlastní období
          </label>
        </div>

        {/* Přepínač záporných řádků — ruční opravy přepočtu se do exportu
            ve výchozím stavu nevypisují (viz komentář u bezZapornych). */}
        <label className="flex items-start gap-2 text-xs font-bold text-neutral-700 cursor-pointer rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <input
            type="checkbox"
            checked={bezMinusu}
            onChange={(e) => setBezMinusu(e.target.checked)}
            className="w-5 h-5 accent-amber-500 mt-0.5 shrink-0"
          />
          <span>
            Vynechat záporné řádky (ruční opravy)
            <span className="block font-medium text-neutral-500 mt-0.5">
              Minusové položky vznikají opravou přepočtu a na skutečný stav nemají vliv.
              Odškrtni, když je chceš v sešitu vidět.
            </span>
          </span>
        </label>

        {/* Náhled a výběr listů — zaškrtni, co má být v sešitu (třeba jen
            KEG). Prázdný list se stáhnout nedá. */}
        <div className="rounded-xl border border-neutral-200 divide-y divide-neutral-100">
          {prehled.map((p) => {
            const vybrany = !vynechane.has(p.nazev);
            return (
              <label
                key={p.nazev}
                className={`flex items-center gap-3 px-3 py-2.5 ${p.pocet ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <input
                  type="checkbox"
                  checked={vybrany && p.pocet > 0}
                  disabled={p.pocet === 0}
                  onChange={() => prepniList(p.nazev)}
                  className="w-5 h-5 accent-amber-500 shrink-0 disabled:opacity-30"
                />
                <span className={`text-sm font-bold flex-1 min-w-0 ${p.pocet ? 'text-neutral-900' : 'text-neutral-400'}`}>{p.nazev}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-black tabular-nums ${p.pocet ? 'text-neutral-900' : 'text-neutral-300'}`}>
                    {p.pocet ? `${p.pocet} ${p.pocet === 1 ? 'řádek' : p.pocet < 5 ? 'řádky' : 'řádků'}` : '—'}
                  </span>
                  {p.pocet > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); kopirujList(p.nazev); }}
                      title="Zkopírovat jen tenhle list"
                      aria-label={`Zkopírovat list ${p.nazev}`}
                      className="w-10 h-10 grid place-items-center rounded-xl text-neutral-400 hover:text-primary-700 hover:bg-primary-50 active:scale-95 transition"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        <p className="text-[11px] font-semibold text-neutral-500">
          Prázdné listy se do sešitu nedávají — sešit s prázdnými kartami jen mate.
          Hektolitry jsou vzorcem, takže se po opravě počtu přepočítají samy.
        </p>

        <button
          onClick={stahni}
          disabled={stahuji || celkemVybranych === 0}
          className="btn-primary !rounded-xl w-full !min-h-[52px] disabled:opacity-50"
        >
          <Download className="w-5 h-5" />
          {stahuji
            ? 'Připravuji…'
            : celkemVybranych === 0
              ? 'Vyber aspoň jeden list'
              : `Stáhnout sešit (${celkemVybranych} řádků)`}
        </button>
      </div>
    </div>
  );
}
