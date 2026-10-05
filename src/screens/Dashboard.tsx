import { useEffect, useState } from 'react';
import { supabase, Beer, Package, useRealtime, beerBorder } from '../lib/supabase';
import { Kostra, EmptyState } from '../components/ui';
import { Beer as BeerIcon, Calculator, Megaphone } from 'lucide-react';
import { AnnouncementManagerModal } from '../components/AnnouncementManagerModal';
import SkloPromoScreen from './SkloPromoScreen';
import { buildMovements, stockAsOf, stockKey } from '../lib/stockLedger';
import { QuickCountModal } from '../components/QuickCountModal';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { chyba, oznam, potvrd, toastZpet } from '../lib/toast';
import { usePosledniNacteni } from '../lib/nacitani';
import { IkonaLahev, IkonaSud } from '../components/ikony';
import { businessDateISO } from '../lib/businessDate';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';
import { SkladZalozky } from '../components/SkladZalozky';
import CekaNaOdpocet from '../components/CekaNaOdpocet';
import { odejdeDoKonceTydne, type ObjednavkaProOdchod, type OdpocetProOdchod, type PolozkaProOdchod } from '../lib/odejdeDoKonceTydne';

// 📦 Sklad — zadání 2. 10. 2026: „přepracuj sklad, ať je tam jen stav a
// odejde". Stav = skladová kniha k dnešku (lib/stockLedger.ts, stejné číslo
// jako Pohyby i Inventura). Odejde = kolik toho piva a obalu ještě odjede do
// konce týdne (lib/odejdeDoKonceTydne.ts). Rozpady, detaily a varování,
// které tu dřív byly, jsou v Pohybech a Inventuře.

type Row = {
  entry_date: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
};

// businessDateISO(), NE new Date().toISOString() (vždycky UTC) — jinak kolem
// půlnoci "Stav k" počítal s jiným dnem, než reálně v Praze je.
function todayISO(): string { return businessDateISO(); }

type RadekSkladu = { package_id: string; label: string; kind: string; volume_l: number; stav: number; odejde: number };
type PivoSkladu = { beer: Beer; radky: RadekSkladu[] };

export default function Dashboard({ setPage, initialTab = 'sklad' }: { setPage?: (p: any) => void; initialTab?: 'sklad' | 'sklo_promo' }) {
  const [activeTab, setActiveTab] = useState<'sklad' | 'sklo_promo'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState<PivoSkladu[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuickCount, setShowQuickCount] = useState(false);
  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);
  const [doKdy, setDoKdy] = useState('');

  async function handleConfirmQuickCount(items: { beerId: string; packageId: string; count: number }[]) {
    if (!items.length) return;
    const today = todayISO();
    const payloads = items.map((it) => {
      const beer = beers.find((b) => b.id === it.beerId);
      const pkg = packages.find((p) => p.id === it.packageId);
      return {
        entry_date: today,
        beer_id: it.beerId,
        beer_name: beer?.name ?? null,
        package_id: it.packageId,
        package_label: pkg?.label ?? null,
        quantity: it.count,
        note: 'Rychlé dotykové sčítadlo',
      };
    });

    // ⚠️ Inventura není jen poznámka: skladová kniha ji bere jako RESET —
    // od tohohle dne se stav počítá od napočítaných čísel a starší pohyby už
    // do výsledku nevstupují (viz lib/stockLedger.ts). Proto se appka ptá a
    // napíše, co to značí — v týdenní kontrole témž sčítadlo jen vyplňuje
    // pole a nezapisuje nic.
    const prehled = payloads
      .slice(0, 10)
      .map((r) => `\u2022 ${r.quantity}× ${r.package_label ?? ''} ${r.beer_name ?? ''}`)
      .join('\n') + (payloads.length > 10 ? `\n\u2022 … a dalších ${payloads.length - 10}` : '');
    const ok = await potvrd(
      `Uložit inventuru k ${today}?\n\n${prehled}\n\n`
      + 'Od tohohle dne se skladový stav počítá od těchto čísel — co bylo předtím, '
      + 'se do něj už nepromítá. Stáčení ani výdeje se nemění.',
      { titulek: 'Uložit inventuru', potvrdit: `Uložit ${payloads.length} položek` },
    );
    if (!ok) return;

    const { data: vlozene, error } = await supabase.from('inventory').insert(payloads).select('id');
    if (error) {
      chyba(`Chyba při ukládání inventury: ${error.message}`);
    } else {
      // Vzít zpět podle id právě vložených řádků, ne podle data — jinak by
      // se smazala i inventura, kterou dnes uložil někdo jiný.
      const ids = ((vlozene as { id: string }[]) ?? []).map((r) => r.id);
      if (ids.length > 0) {
        toastZpet(`Inventura uložena (${items.length} položek).`, async () => {
          const { error: chybaMazani } = await supabase.from('inventory').delete().in('id', ids);
          if (chybaMazani) throw chybaMazani;
          load();
        });
      } else {
        oznam(`Inventura (${items.length} položek) úspěšně uložena!`);
      }
      load();
    }
  }

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load(silent = false) {
    const smiZapsat = zacniNacteni();
    if (!silent) setLoading(true);
    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: wo }, { data: inv }, { data: oi }, { data: ord }, { data: ak }, { data: fa }, { data: fp }, { data: zd }, { data: adj }, { data: pf }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      nactiSdilenouTabulku('bottling'),
      nactiSdilenouTabulku('kegging'),
      nactiSdilenouTabulku('writeoffs'),
      nactiSdilenouTabulku('inventory'),
      nactiSdilenouTabulku('order_items'),
      nactiSdilenouTabulku('orders'),
      nactiSdilenouTabulku('akce'),
      nactiSdilenouTabulku('fasovani'),
      nactiSdilenouTabulku('fasovani_private'),
      nactiSdilenouTabulku('zavoz_deductions'),
      nactiSdilenouTabulku('inventory_adjustments'),
      nactiSdilenouTabulku('keg_prefuk'),
    ]);
    // Mezitím mohlo začít novější načtení (realtime po cizím zápisu),
    // nebo už obrazovka není vidět. Výsledek se pak zahodí.
    if (!smiZapsat()) return;
    const beerList = (b as Beer[]) ?? [];
    const pkgList = (pk as Package[]) ?? [];
    setBeers(beerList); setPackages(pkgList);

    const dnes = todayISO();
    const { start, end } = weekRange(isoWeekKey(dnes));
    const zacatekTydne = start.toISOString().slice(0, 10);
    const konecTydne = end.toISOString().slice(0, 10);
    setDoKdy(konecTydne);

    // 📒 Skladová kniha — jediný zdroj pravdy o stavu skladu.
    const ledger = stockAsOf(buildMovements({
      inventoryRows: (inv as Row[]) ?? [],
      bottlingRows: (bt as any[]) ?? [],
      keggingRows: (kg as Row[]) ?? [],
      fasovaniRows: (fa as Row[]) ?? [],
      prodejnaRows: (fp as Row[]) ?? [],
      writeoffsRows: (wo as Row[]) ?? [],
      zavozDeductionRows: (zd as any[]) ?? [],
      akceRows: (ak as any[]) ?? [],
      prefukRows: (pf as any[]) ?? [],
      adjustmentRows: (adj as any[]) ?? [],
      packages: pkgList,
    }), dnes);

    const odejde = odejdeDoKonceTydne(
      (ord as ObjednavkaProOdchod[]) ?? [],
      (oi as PolozkaProOdchod[]) ?? [],
      (zd as OdpocetProOdchod[]) ?? [],
      { zacatekTydne, konecTydne, dnes },
    );

    const result: PivoSkladu[] = beerList.map((beer) => {
      const radky: RadekSkladu[] = pkgList
        .map((pkg) => {
          const k = stockKey(beer.id, pkg.id);
          return {
            package_id: pkg.id,
            label: String(pkg.label ?? '').trim(),
            kind: pkg.kind,
            volume_l: Number(pkg.volume_l) || 0,
            // Bez ořezání na nulu: záporný stav = evidence nesedí, má být vidět.
            stav: ledger.get(k)?.qty ?? 0,
            odejde: odejde.get(k) ?? 0,
          };
        })
        .filter((r) => r.stav !== 0 || r.odejde > 0)
        .sort((a, z) => z.volume_l - a.volume_l);
      return { beer, radky };
    });
    setStats(result);
    if (!silent) setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'orders', 'order_items', 'akce', 'akce_items', 'zavoz_deductions', 'inventory_adjustments', 'keg_prefuk'], () => load(true));

  if (loading && activeTab === 'sklad') return <Kostra />;

  const tabulka = (nadpis: React.ReactNode, radky: RadekSkladu[]) => (
    <div className="bg-white/70 rounded-xl p-3 border border-neutral-200/50">
      <div className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1.5 flex items-center gap-1">{nadpis}</div>
      <table className="w-full text-sm font-semibold border-collapse">
        <thead>
          <tr className="text-udaj font-bold uppercase tracking-wide text-neutral-500">
            <th scope="col" className="text-left pb-1 pr-2">Obal</th>
            <th scope="col" className="text-center pb-1 px-2">Stav</th>
            <th scope="col" className="text-center pb-1 pl-2">Odejde</th>
          </tr>
        </thead>
        <tbody>
          {radky.map((r) => (
            <tr key={r.package_id}>
              <td className="py-1 pr-2 whitespace-nowrap text-neutral-700 text-xs font-bold">{r.label}</td>
              <td className={`py-1 px-2 text-center font-extrabold rounded-md tabular-nums ${r.stav < 0 ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-900'}`}>{r.stav}</td>
              <td className={`py-1 pl-2 text-center font-extrabold rounded-md tabular-nums ${r.odejde > 0 ? 'bg-amber-50 text-amber-900' : 'text-neutral-500'}`}>{r.odejde > 0 ? r.odejde : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const doKdyText = doKdy ? `${Number(doKdy.slice(8, 10))}. ${Number(doKdy.slice(5, 7))}.` : 'konce týdne';

  return (
    <div>
      {/* Záložky Skladu (Stav · Pohyby · Inventura · Sklo) — jedna lišta pro
          všechny čtyři obrazovky, viz components/SkladZalozky.tsx. */}
      <SkladZalozky aktivni={activeTab === 'sklad' ? 'dashboard' : 'sklo_promo'} setPage={setPage} />

      {activeTab === 'sklad' ? (
        <>
          {showAnnouncementManager && <AnnouncementManagerModal onClose={() => setShowAnnouncementManager(false)} />}
          {showQuickCount && (
            <QuickCountModal
              isOpen={showQuickCount}
              onClose={() => setShowQuickCount(false)}
              beers={beers}
              packages={packages}
              onConfirmCount={handleConfirmQuickCount}
              popisUlozeni="Uloží se jako inventura k dnešnímu dni — od něj se skladový stav počítá od těchto čísel."
            />
          )}

          <div className="flex items-end justify-between gap-2 flex-wrap mb-4">
            <div>
              <div className="font-display font-black text-neutral-900 text-xl">Sklad k {Number(todayISO().slice(8, 10))}. {Number(todayISO().slice(5, 7))}.</div>
              <div className="text-xs font-bold text-neutral-600 mt-0.5">
                <b>Stav</b> = kolik je teď na skladě · <b>Odejde</b> = kolik ještě odjede do {doKdyText} (objednávky, co ještě neodjely)
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowQuickCount(true)} className="btn-primary !rounded !py-2 !px-3.5 text-xs font-black">
                <Calculator size={16} /> Rychlé sčítadlo skladu
              </button>
              <button onClick={() => setShowAnnouncementManager(true)} className="btn-ghost !rounded !py-2 !px-3.5 text-xs font-black">
                <Megaphone size={16} /> Hlášení
              </button>
            </div>
          </div>

          {/* Závoz do dneška, který ještě není odečtený — Stav by jinak tiše
              ukazoval víc, než je na skladě (5. 10. 2026). */}
          <CekaNaOdpocet
            className="mb-4"
            jmenoPiva={(id) => beers.find((b) => b.id === id)?.name ?? '?'}
            jmenoObalu={(id) => String(packages.find((p) => p.id === id)?.label ?? '').trim() || '?'}
          />

          {stats.length === 0 ? <EmptyState text="Žádná piva v evidenci." icon={BeerIcon} /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {stats.filter((s) => s.radky.length > 0).map((s) => {
                const sudy = s.radky.filter((r) => r.kind === 'keg');
                const lahve = s.radky.filter((r) => r.kind !== 'keg');
                return (
                  <div key={s.beer.id} className="card !rounded p-4 border-2 space-y-2" style={{ borderColor: beerBorder(s.beer) }}>
                    <div className="font-display font-extrabold text-lg text-neutral-900">{s.beer.name}</div>
                    {sudy.length > 0 && tabulka(<><IkonaSud className="ikona-text" /> Sudy</>, sudy)}
                    {lahve.length > 0 && tabulka(<><IkonaLahev className="ikona-text" /> Lahve</>, lahve)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <SkloPromoScreen setPage={setPage} />
      )}
    </div>
  );
}
