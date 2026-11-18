// 🧭 Nová objednávka — průvodce (okno přes celou obrazovku).
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „návrh, jak by vypadalo zadávání objednávek stejně
// jako zadávání stáčení lahví nebo fasování" a potom „udělej ty objednávky tak
// jako první návrh". Návrh (https://claude.ai/artifact/FQigjkSp65GgXEVsuDPig9)
// má tři kroky — odběratel a den, pivo, souhrn — a na počítači všechno na
// jedné obrazovce.
//
// Pivo, obal a počet se zadává STEJNÝM panelem jako ve Fasování a Lahvích
// (KrokoveZadavani: jedna otázka, velké pole, pět nejčastějších čísel).
//
// Okno NEUKLÁDÁ samo. Hotový koncept předá obrazovce Objednávky (onUlozit),
// která ho uloží stejnou cestou jako starý formulář — kontrola zdvojené
// objednávky, potvrzení „závoz v minulém týdnu", upomínky, rezervace výčepu.
// Pravidla tak zůstávají na jednom místě.
//
// Tlačítko Zpět (i hardwarové na telefonu) vrací o krok, ne z obrazovky;
// rozepsanou objednávku nezahodí bez zeptání.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Plus, X } from 'lucide-react';
import type { Beer } from '../../lib/supabase';
import { KrokoveZadavani, type KrokDef } from '../KrokoveZadavani';
import { MaleSudyVolne } from '../MaleSudyVolne';
import { rychleHodnoty } from '../../lib/krokoveZadavani';
import type { QtyHistoryRow } from '../../lib/quickQty';
import { klicVyberu, nactiNaposled, zapamatujVyber } from '../../lib/naposledyPouzite';
import { useViditelnaOblast } from '../../lib/useViditelnaOblast';
import { useZavriNaEscape, useZpetNaKrok } from '../../lib/zavriNaZpet';
import { potvrd } from '../../lib/toast';
import {
  chybaKroku, konceptMaObsah, mistaKVolbe, mnozstvi, nastavMnozstvi, nejcastejsiObal, obalyProPanel, odberatelKonceptu,
  popisObalu, popisObsahu, popisZavozu, prazdnyKoncept, skupinaObalu, souctyObjednavky, ucinnyZavoz, zalohaRychlych,
  type KonceptObjednavky, type KrokPruvodce,
} from '../../lib/objednavkaPruvodce';
import { PruvodceOdberatel } from './PruvodceOdberatel';
import { PruvodcePivo } from './PruvodcePivo';
import { PruvodceSouhrn } from './PruvodceSouhrn';
import type { DataPruvodce, PrideleniMalychSudu, VysledekUlozeni, ZmenaKonceptu } from './pruvodceTypy';

const SIRKA_POCITACE = 1024;

/** Je obrazovka dost široká na všechny tři kroky vedle sebe? Bez `matchMedia` (testy) ne — telefon. */
function useSirokaObrazovka(): boolean {
  const dotaz = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(min-width: ${SIRKA_POCITACE}px)`)
    : null);
  const [siroka, setSiroka] = useState(() => dotaz()?.matches ?? false);
  useEffect(() => {
    const mq = dotaz();
    if (!mq) return;
    const naZmenu = () => setSiroka(mq.matches);
    naZmenu();
    mq.addEventListener?.('change', naZmenu);
    return () => mq.removeEventListener?.('change', naZmenu);
  }, []);
  return siroka;
}

const STITKY_KROKU: Record<KrokPruvodce, string> = { odberatel: 'Odběratel', pivo: 'Pivo', souhrn: 'Souhrn' };
const KROKY_CISLO: Record<KrokPruvodce, number> = { odberatel: 1, pivo: 2, souhrn: 3 };

type Props = {
  data: DataPruvodce;
  /** Historie objednaných počtů (pivo, obal, počet, den) — z ní jsou „nejčastější čísla". */
  historie: QtyHistoryRow[];
  idUzivatele?: string | null;
  onUlozit: (koncept: KonceptObjednavky) => Promise<VysledekUlozeni>;
  onZavrit: () => void;
  /** Kolik malých sudů smí objednávka celkem v obalu (null = obal se nehlídá). */
  volneMaleSudy?: (pkgId: string) => number | null;
  /** Rozdělení malých sudů po řádcích konceptu (lib/maleSudy.ts). */
  prideleniMalychSudu?: (koncept: KonceptObjednavky) => PrideleniMalychSudu;
};

export function ObjednavkaPruvodce({ data, historie, idUzivatele, onUlozit, onZavrit, volneMaleSudy, prideleniMalychSudu }: Props) {
  const { places, beers, packages, dnes } = data;
  const siroka = useSirokaObrazovka();
  const nadKlavesnici = useViditelnaOblast();

  const [koncept, setKoncept] = useState<KonceptObjednavky>(prazdnyKoncept);
  const [krok, setKrok] = useState<KrokPruvodce>('odberatel');
  const [panel, setPanel] = useState<{ beerId: string; pkgId?: string } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<{ komu: string; kdy: string; obsah: string } | null>(null);
  const klicPiv = klicVyberu('objednavky', idUzivatele);
  const [naposledPiva, setNaposledPiva] = useState<string[]>(() => nactiNaposled(klicPiv));

  const zmen: ZmenaKonceptu = useCallback((zmena) => {
    setKoncept(zmena);
    setChyba(null);
  }, []);

  const ctx = { odberatele: places, dnes };
  const chybaOdberatel = chybaKroku(koncept, 'odberatel', ctx);
  const chybaCelkem = chybaKroku(koncept, 'souhrn', ctx);
  const soucty = souctyObjednavky(koncept.radky, packages);
  const obalyPanelu = useMemo(() => obalyProPanel(packages), [packages]);
  const prideleni = prideleniMalychSudu?.(koncept);

  // ── Zavírání a Zpět ───────────────────────────────────────────────────────

  async function zavritSPotvrzenim() {
    if (!konceptMaObsah(koncept) || hotovo
      || await potvrd('Zahodit rozepsanou objednávku?', { potvrdit: 'Zahodit', zrusit: 'Pokračovat v zadávání', nebezpecne: true })) {
      onZavrit();
    }
  }

  /** Co udělá Zpět / Escape. 'zustan' = okno zůstává (vrátil se krok, zavřel panel, čeká se na odpověď). */
  function zpetLogika(): 'zustan' | 'zavri' {
    if (panel) { setPanel(null); return 'zustan'; }
    if (ukladam) return 'zustan';
    if (hotovo) { onZavrit(); return 'zavri'; }
    if (!siroka && krok !== 'odberatel') { setKrok(krok === 'souhrn' ? 'pivo' : 'odberatel'); return 'zustan'; }
    if (konceptMaObsah(koncept)) { void zavritSPotvrzenim(); return 'zustan'; }
    onZavrit();
    return 'zavri';
  }
  useZpetNaKrok(true, zpetLogika);
  useZavriNaEscape(true, () => { zpetLogika(); });

  // ── Pivo: krokové zadávání obalu a počtu (jako Fasování) ───────────────────

  function otevriPivo(beerId: string, pkgId?: string) {
    setNaposledPiva(zapamatujVyber(klicPiv, beerId));
    setPanel({ beerId, pkgId });
  }

  function krokObjednavky(beer: Beer, vychoziObal?: string): KrokDef {
    const zadanoJinde = (pkgId: string) => koncept.radky
      .filter((r) => r.pkgId === pkgId && r.beerId !== beer.id)
      .reduce((s, r) => s + r.qty, 0);
    return {
      stitek: 'Kolik kusů',
      otazka: 'Kolik kusů?',
      obaly: obalyPanelu.map((p) => ({ id: p.id, label: popisObalu(p), skupina: skupinaObalu(p) })),
      jednotka: (o) => `${packages.find((p) => p.id === o.id)?.kind === 'keg' ? 'sudů' : 'lahví'} ${o.label}`,
      mnozstvi: (id) => mnozstvi(koncept.radky, beer.id, id),
      nastav: (id, n) => zmen((k) => ({ ...k, radky: nastavMnozstvi(k.radky, beer.id, id, n) })),
      rychle: (id) => rychleHodnoty(historie, beer.id, id, zalohaRychlych(packages.find((p) => p.id === id))),
      vychozi: vychoziObal
        ?? obalyPanelu.find((p) => mnozstvi(koncept.radky, beer.id, p.id) > 0)?.id
        ?? nejcastejsiObal(historie, beer.id, obalyPanelu)?.id,
      dalsiText: '+ další obal',
      pod: volneMaleSudy
        ? (obalId, rozepsano) => <MaleSudyVolne volne={volneMaleSudy(obalId)} zadano={zadanoJinde(obalId) + rozepsano} />
        : undefined,
    };
  }

  const panelPivo = panel ? beers.find((b) => b.id === panel.beerId) : undefined;
  const zavoz = ucinnyZavoz(koncept, places, dnes);

  // ── Uložení ───────────────────────────────────────────────────────────────

  async function ulozit() {
    if (ukladam) return;
    if (chybaCelkem) { setChyba(chybaCelkem); return; }
    setUkladam(true);
    setChyba(null);
    try {
      const v = await onUlozit(koncept);
      if (v.stav === 'ulozeno') {
        const odberatel = odberatelKonceptu(koncept, places);
        const misto = mistaKVolbe(odberatel).find((m) => m.id === koncept.mistoZavozu);
        setHotovo({
          komu: `${koncept.placeName}${misto ? ` · ${misto.nazev}` : ''}`,
          kdy: popisZavozu(zavoz),
          obsah: popisObsahu(soucty),
        });
      } else {
        setChyba(v.text);
      }
    } catch (e) {
      setChyba(e instanceof Error && e.message ? e.message : 'Objednávku se nepodařilo uložit. Zkus to znovu.');
    } finally {
      setUkladam(false);
    }
  }

  function zacitZnovu() {
    setKoncept(prazdnyKoncept());
    setKrok('odberatel');
    setChyba(null);
    setHotovo(null);
    setPanel(null);
  }

  // ── Obsah ─────────────────────────────────────────────────────────────────

  const odberatelEl = <PruvodceOdberatel data={data} koncept={koncept} zmen={zmen} />;
  const pivoEl = <PruvodcePivo data={data} koncept={koncept} zmen={zmen} naposledPiva={naposledPiva} otevriPivo={(id) => otevriPivo(id)} />;

  const tlacitkoUlozit = (
    <button type="button" onClick={() => void ulozit()} disabled={ukladam || !!chybaCelkem} className="btn-primary w-full min-h-[56px] !text-lg">
      <Check size={20} aria-hidden="true" /> {ukladam ? 'Ukládám…' : 'Uložit objednávku'}
    </button>
  );
  const hlaseniUlozeni = (
    <div aria-live="polite" className="space-y-1">
      {chyba && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-sm font-bold text-rose-800">{chyba}</p>}
      {!chyba && chybaCelkem && koncept.radky.length > 0 && <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{chybaCelkem}</p>}
    </div>
  );

  const souhrnEl = (
    <PruvodceSouhrn
      data={data}
      koncept={koncept}
      zmen={zmen}
      upravPivo={(beerId, pkgId) => otevriPivo(beerId, pkgId)}
      zpetNaOdberatele={() => setKrok('odberatel')}
      prideleniSudu={prideleni}
      patka={siroka ? <div className="space-y-2 pt-1">{hlaseniUlozeni}{tlacitkoUlozit}</div> : undefined}
    />
  );

  const hlavicka = (
    <header className="flex items-center gap-3 px-4 h-[60px] shrink-0 bg-neutral-900 text-white">
      {!siroka && krok !== 'odberatel' && !hotovo ? (
        <button type="button" onClick={() => setKrok(krok === 'souhrn' ? 'pivo' : 'odberatel')} className="w-11 h-11 -ml-2 grid place-items-center rounded-xl hover:bg-white/10" aria-label={krok === 'souhrn' ? 'Zpět na výběr piva' : 'Zpět na výběr odběratele'}>
          <ChevronLeft size={22} />
        </button>
      ) : (
        <button type="button" onClick={() => void zavritSPotvrzenim()} className="w-11 h-11 -ml-2 grid place-items-center rounded-xl hover:bg-white/10" aria-label="Zavřít">
          <X size={22} />
        </button>
      )}
      <h2 id="pruvodce-nadpis" className="flex-1 min-w-0 truncate font-display font-black text-xl">Nová objednávka</h2>
      {hotovo ? null : siroka
        ? <span className="text-sm font-semibold text-neutral-300 truncate">{koncept.placeName ? `${koncept.placeName} · ${popisZavozu(zavoz)}` : ''}</span>
        : <span className="text-sm font-semibold text-neutral-300">{KROKY_CISLO[krok]} ze 3</span>}
    </header>
  );

  const lista = !siroka && (
    <ol className="grid grid-cols-3 gap-2 px-4 pt-3 shrink-0" aria-label="Kroky objednávky">
      {(['odberatel', 'pivo', 'souhrn'] as const).map((k) => {
        const aktualni = k === krok;
        const hotovoUz = KROKY_CISLO[k] < KROKY_CISLO[krok];
        return (
          <li key={k} aria-current={aktualni ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1.5 rounded-full ${aktualni || hotovoUz ? 'bg-primary-600' : 'bg-neutral-300'}`} aria-hidden="true" />
            <span className={`text-xs ${aktualni ? 'font-black text-primary-800' : 'font-semibold text-neutral-700'}`}>{KROKY_CISLO[k]} · {STITKY_KROKU[k]}</span>
          </li>
        );
      })}
    </ol>
  );

  const patkaTelefon = !siroka && !hotovo && (
    <footer className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 pt-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
      {krok === 'odberatel' && (
        <>
          {chybaOdberatel && <p role="status" className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{chybaOdberatel}</p>}
          <button type="button" onClick={() => setKrok('pivo')} disabled={!!chybaOdberatel} className="btn-primary w-full min-h-[56px] !text-lg">
            Dál — vybrat pivo <ArrowRight size={20} aria-hidden="true" />
          </button>
        </>
      )}
      {krok === 'pivo' && (
        <div className="flex items-center gap-3">
          <p className="flex-1 min-w-0 text-xs font-semibold text-neutral-600 dark:text-neutral-300 leading-snug">
            V objednávce zatím<br /><span className="text-sm font-black text-neutral-900 dark:text-neutral-100">{popisObsahu(soucty)}</span>
          </p>
          <button type="button" onClick={() => setKrok('souhrn')} disabled={koncept.radky.length === 0} className="btn-primary min-h-[56px] !px-6 !text-lg">
            Souhrn <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      {krok === 'souhrn' && (
        <>
          {hlaseniUlozeni}
          <button type="button" onClick={() => setKrok('pivo')} className="btn-ghost w-full min-h-[48px]">
            <Plus size={16} aria-hidden="true" /> Přidat další pivo
          </button>
          {tlacitkoUlozit}
        </>
      )}
    </footer>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pruvodce-nadpis"
      className="fixed inset-0 z-50 flex flex-col bg-neutral-100 dark:bg-neutral-900"
      style={nadKlavesnici ? { top: nadKlavesnici.odshora, height: nadKlavesnici.vyska, bottom: 'auto' } : undefined}
    >
      {hlavicka}

      {hotovo ? (
        <main className="flex-1 overflow-y-auto grid place-items-center p-6">
          <div role="status" className="w-full max-w-sm text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-800 grid place-items-center"><Check size={34} aria-hidden="true" /></div>
            <h2 className="font-display font-black text-2xl text-neutral-900 dark:text-neutral-100">Objednávka uložena</h2>
            <p className="text-base font-bold text-neutral-800 dark:text-neutral-200">{hotovo.komu} · {hotovo.kdy}</p>
            <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{hotovo.obsah}</p>
            <div className="grid gap-2 pt-2">
              <button type="button" onClick={zacitZnovu} className="btn-primary min-h-[56px] !text-lg"><Plus size={20} aria-hidden="true" /> Zadat další objednávku</button>
              <button type="button" onClick={onZavrit} className="btn-ghost min-h-[52px]">Hotovo</button>
            </div>
          </div>
        </main>
      ) : siroka ? (
        <main className="flex-1 min-h-0 grid grid-cols-[minmax(280px,1fr)_minmax(0,1.3fr)_minmax(320px,1fr)] gap-5 p-4">
          <section aria-label="Pro koho a na kdy" className="overflow-y-auto pr-1 min-h-0">{odberatelEl}</section>
          <section aria-label="Pivo, obal a počet" className="overflow-y-auto pr-1 min-h-0">{pivoEl}</section>
          <section aria-label="Souhrn objednávky" className="overflow-y-auto pr-1 min-h-0">{souhrnEl}</section>
        </main>
      ) : (
        <>
          {lista}
          <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {krok === 'odberatel' && odberatelEl}
            {krok === 'pivo' && pivoEl}
            {krok === 'souhrn' && souhrnEl}
          </main>
        </>
      )}

      {patkaTelefon}

      {panelPivo && panel && (
        <KrokoveZadavani
          key={`${panelPivo.id}:${panel.pkgId ?? ''}`}
          beer={panelPivo}
          podtitul={`Nová objednávka${koncept.placeName ? ` · ${koncept.placeName}` : ''}`}
          den={zavoz.datum ?? 'dnes'}
          kroky={[krokObjednavky(panelPivo, panel.pkgId)]}
          onZavrit={() => setPanel(null)}
          skrytUlozene
        />
      )}
    </div>
  );
}

