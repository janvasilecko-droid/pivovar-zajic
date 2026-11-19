// 🧭 Nová objednávka — průvodce (okno přes celou obrazovku).
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „návrh, jak by vypadalo zadávání objednávek stejně
// jako zadávání stáčení lahví nebo fasování" a potom „udělej ty objednávky tak
// jako první návrh". Návrh (https://claude.ai/artifact/FQigjkSp65GgXEVsuDPig9)
// měl tři kroky — odběratel a den, pivo, souhrn.
//
// 19. 11. 2026 (screenshoty z telefonu): „tady ať je vše na jedné stránce vidět"
// a „ať je uložit a pod tím uložit a odeslat na WhatsApp". Kroky proto zmizely:
// na telefonu leží odběratel s dnem, pivo a souhrn pod sebou na jedné stránce
// a dole je pořád vidět „Uložit objednávku" a pod ním „Uložit a odeslat na
// WhatsApp"; na počítači jsou ty tři části vedle sebe.
//
// Po uložení se okno samo zavře a na chvilku naskočí krátké potvrzení (toast).
// Potvrzovací stránka „Objednávka uložena" s tlačítky „Zadat další objednávku"
// a „Hotovo" zmizela — majitel 19. 11. 2026: „tohle se nemusí zobrazovat".
//
// Pivo, obal a počet se zadává STEJNÝM panelem jako ve Fasování a Lahvích
// (KrokoveZadavani: jedna otázka, velké pole, pět nejčastějších čísel).
//
// Okno NEUKLÁDÁ samo. Hotový koncept předá obrazovce Objednávky (onUlozit),
// která ho uloží stejnou cestou jako starý formulář — kontrola zdvojené
// objednávky, potvrzení „závoz v minulém týdnu", upomínky, rezervace výčepu.
// Pravidla tak zůstávají na jednom místě.
//
// Tlačítko Zpět (i hardwarové na telefonu) nezahodí rozepsanou objednávku bez
// zeptání; zavře nejdřív panel s počtem kusů.
//
// Půjčení výčepu je jen nenápadné zaškrtávací pole v souhrnu: otevře okno
// rezervace, které patří obrazovce Objednávky (vyberVycep). Rezervace potvrzená
// před uložením se po uložení naváže na objednávku; při odškrtnutí nebo zahození
// rozepsané objednávky se zruší (zrusVycep), ať výčep zbytečně neblokuje.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import type { Beer } from '../../lib/supabase';
import { KrokoveZadavani, type KrokDef } from '../KrokoveZadavani';
import { MaleSudyVolne } from '../MaleSudyVolne';
import { rychleHodnoty } from '../../lib/krokoveZadavani';
import type { QtyHistoryRow } from '../../lib/quickQty';
import { klicVyberu, nactiNaposled, zapamatujVyber } from '../../lib/naposledyPouzite';
import { useViditelnaOblast } from '../../lib/useViditelnaOblast';
import { useZavriNaEscape, useZpetNaKrok } from '../../lib/zavriNaZpet';
import { chyba as ohlasChybu, potvrd, uspech } from '../../lib/toast';
import {
  chybaKroku, konceptMaObsah, mistaKVolbe, mnozstvi, nastavMnozstvi, nastavVycep, nejcastejsiObal, obalyProPanel, odberatelKonceptu,
  popisObalu, popisZavozu, potvrdRezervaciVycepu, prazdnyKoncept, skupinaObalu, stavVycepu,
  ucinnyZavoz, zalohaRychlych,
  type KonceptObjednavky,
} from '../../lib/objednavkaPruvodce';
import { PruvodceOdberatel } from './PruvodceOdberatel';
import { PruvodcePivo } from './PruvodcePivo';
import { PruvodceSouhrn } from './PruvodceSouhrn';
import { PruvodceVycep } from './PruvodceVycep';
import type { DataPruvodce, PrideleniMalychSudu, VolbyUlozeni, VyberVycepu, VysledekUlozeni, ZmenaKonceptu, ZrusVycep } from './pruvodceTypy';

const SIRKA_POCITACE = 1024;

/** Je obrazovka dost široká na všechny tři části vedle sebe? Bez `matchMedia` (testy) ne — telefon, jedna stránka pod sebou. */
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

type Props = {
  data: DataPruvodce;
  /** Historie objednaných počtů (pivo, obal, počet, den) — z ní jsou „nejčastější čísla". */
  historie: QtyHistoryRow[];
  idUzivatele?: string | null;
  onUlozit: (koncept: KonceptObjednavky, volby: VolbyUlozeni) => Promise<VysledekUlozeni>;
  onZavrit: () => void;
  /** Kolik malých sudů smí objednávka celkem v obalu (null = obal se nehlídá). */
  volneMaleSudy?: (pkgId: string) => number | null;
  /** Rozdělení malých sudů po řádcích konceptu (lib/maleSudy.ts). */
  prideleniMalychSudu?: (koncept: KonceptObjednavky) => PrideleniMalychSudu;
  /** Okno rezervace výčepu; bez něj se pole „Půjčení výčepu" nenabízí. */
  vyberVycep?: VyberVycepu;
  /** Zrušení rezervace potvrzené před uložením (odškrtnutí, zahození objednávky). */
  zrusVycep?: ZrusVycep;
};

export function ObjednavkaPruvodce({ data, historie, idUzivatele, onUlozit, onZavrit, volneMaleSudy, prideleniMalychSudu, vyberVycep, zrusVycep }: Props) {
  const { places, beers, packages, dnes } = data;
  const siroka = useSirokaObrazovka();
  const nadKlavesnici = useViditelnaOblast();

  const [koncept, setKoncept] = useState<KonceptObjednavky>(prazdnyKoncept);
  const [panel, setPanel] = useState<{ beerId: string; pkgId?: string } | null>(null);
  /** Co se právě ukládá: obyčejné uložení, nebo uložení s odesláním na WhatsApp. */
  const [ukladam, setUkladam] = useState<null | 'ulozit' | 'whatsapp'>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  /** Okno rezervace výčepu je právě otevřené (leží nad průvodcem). */
  const [vycepOtevren, setVycepOtevren] = useState(false);
  const klicPiv = klicVyberu('objednavky', idUzivatele);
  const [naposledPiva, setNaposledPiva] = useState<string[]>(() => nactiNaposled(klicPiv));

  const zmen: ZmenaKonceptu = useCallback((zmena) => {
    setKoncept(zmena);
    setChyba(null);
  }, []);

  const ctx = { odberatele: places, dnes };
  const chybaCelkem = chybaKroku(koncept, 'souhrn', ctx);
  const obalyPanelu = useMemo(() => obalyProPanel(packages), [packages]);
  const prideleni = prideleniMalychSudu?.(koncept);

  // ── Zavírání a Zpět ───────────────────────────────────────────────────────

  async function zavritSPotvrzenim() {
    if (!konceptMaObsah(koncept)
      || await potvrd('Zahodit rozepsanou objednávku?', { potvrdit: 'Zahodit', zrusit: 'Pokračovat v zadávání', nebezpecne: true })) {
      // Rezervace výčepu potvrzená v okně už je v databázi — zahozená objednávka ji nepotřebuje.
      if (koncept.vycepRezervace) await zrusRezervaciVycepu(koncept.vycepRezervace.id);
      onZavrit();
    }
  }

  /** Co udělá Zpět / Escape. 'zustan' = okno zůstává (zavřel se panel, čeká se na odpověď). */
  function zpetLogika(): 'zustan' | 'zavri' {
    if (vycepOtevren) return 'zustan'; // okno rezervace leží nad průvodcem a zavírá se samo
    if (panel) { setPanel(null); return 'zustan'; }
    if (ukladam) return 'zustan';
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

  // ── Půjčení výčepu ────────────────────────────────────────────────────────

  async function zrusRezervaciVycepu(id: string) {
    if (!zrusVycep) return;
    const text = await zrusVycep(id).catch((e: unknown) => (e instanceof Error && e.message ? e.message : 'neznámá chyba'));
    if (text) ohlasChybu(`Rezervaci výčepu se nepodařilo zrušit: ${text}`);
  }

  /** Zaškrtnutí otevře okno rezervace; odškrtnutí rezervaci zruší. */
  async function prepniVycep() {
    if (ukladam) return;
    if (koncept.vycep) {
      const rezervace = koncept.vycepRezervace;
      zmen((k) => nastavVycep(k, false));
      if (rezervace) await zrusRezervaciVycepu(rezervace.id);
      return;
    }
    zmen((k) => nastavVycep(k, true));
    if (!vyberVycep) return;
    setVycepOtevren(true);
    try {
      const rezervace = await vyberVycep({ zakaznik: koncept.placeName, datum: zavoz.datum ?? dnes, poznamka: koncept.poznamka });
      if (rezervace) zmen((k) => potvrdRezervaciVycepu(k, rezervace));
    } catch (e) {
      ohlasChybu(e);
    } finally {
      setVycepOtevren(false);
    }
  }

  // ── Uložení ───────────────────────────────────────────────────────────────

  async function ulozit(poslatNaWhatsApp: boolean) {
    if (ukladam) return;
    if (chybaCelkem) { setChyba(chybaCelkem); return; }
    setUkladam(poslatNaWhatsApp ? 'whatsapp' : 'ulozit');
    setChyba(null);
    let ulozeno = false;
    try {
      const v = await onUlozit(koncept, { whatsapp: poslatNaWhatsApp });
      if (v.stav === 'ulozeno') ulozeno = true;
      else setChyba(v.text);
    } catch (e) {
      setChyba(e instanceof Error && e.message ? e.message : 'Objednávku se nepodařilo uložit. Zkus to znovu.');
    } finally {
      setUkladam(null);
    }
    if (!ulozeno) return;
    // Žádná potvrzovací stránka: okno se zavře a naskočí krátké potvrzení. Rezervace výčepu
    // potvrzená v okně už patří objednávce, proto se tady nemaže (to dělá jen zahození rozepsané).
    const odberatel = odberatelKonceptu(koncept, places);
    const misto = mistaKVolbe(odberatel).find((m) => m.id === koncept.mistoZavozu);
    uspech(`Objednávka uložena: ${koncept.placeName}${misto ? ` · ${misto.nazev}` : ''} · ${popisZavozu(zavoz)}`);
    onZavrit();
  }

  // ── Obsah ─────────────────────────────────────────────────────────────────

  const odberatelEl = <PruvodceOdberatel data={data} koncept={koncept} zmen={zmen} />;
  const pivoEl = <PruvodcePivo data={data} koncept={koncept} zmen={zmen} naposledPiva={naposledPiva} otevriPivo={(id) => otevriPivo(id)} />;

  /** Tužky u „Komu" a „Kdy" v souhrnu: stránku to přeroluje k odběrateli, nebo ke dnům závozu. */
  function naSekci(cil: 'odberatel' | 'kdy') {
    const prvek = document.getElementById(cil === 'kdy' ? 'pruvodce-kdy' : 'pruvodce-hledani');
    prvek?.scrollIntoView?.({ behavior: 'smooth', block: cil === 'kdy' ? 'start' : 'center' });
  }

  // „Uložit" a pod tím „Uložit a odeslat na WhatsApp" (19. 11. 2026). Obojí jde stejnou cestou
  // ukládání jako starý formulář; WhatsApp jen přidá otevření zprávy s hotovou objednávkou.
  const tlacitkaUlozeni = (
    <div className="space-y-2">
      <button type="button" onClick={() => void ulozit(false)} disabled={!!ukladam || !!chybaCelkem} className="btn-primary w-full min-h-[56px] !text-lg">
        <Check size={20} aria-hidden="true" /> {ukladam === 'ulozit' ? 'Ukládám…' : 'Uložit objednávku'}
      </button>
      <button
        type="button"
        onClick={() => void ulozit(true)}
        disabled={!!ukladam || !!chybaCelkem}
        className="btn-emerald w-full min-h-[52px]"
        title="Uloží objednávku a otevře WhatsApp s hotovou zprávou"
      >
        <MessageCircle size={18} aria-hidden="true" /> {ukladam === 'whatsapp' ? 'Ukládám…' : 'Uložit a odeslat na WhatsApp'}
      </button>
    </div>
  );
  const hlaseniUlozeni = (
    <div aria-live="polite" data-testid="pruvodce-hlaseni" className="space-y-1">
      {chyba && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-300 px-3 py-2 text-sm font-bold text-rose-800">{chyba}</p>}
      {!chyba && chybaCelkem && <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{chybaCelkem}</p>}
    </div>
  );

  const souhrnEl = (
    <PruvodceSouhrn
      data={data}
      koncept={koncept}
      zmen={zmen}
      upravPivo={(beerId, pkgId) => otevriPivo(beerId, pkgId)}
      naSekci={naSekci}
      prideleniSudu={prideleni}
      vycep={vyberVycep ? <PruvodceVycep zaskrtnuto={koncept.vycep} stav={stavVycepu(koncept)} prepni={() => void prepniVycep()} /> : undefined}
      patka={siroka ? <div className="space-y-2 pt-1">{hlaseniUlozeni}{tlacitkaUlozeni}</div> : undefined}
    />
  );

  const hlavicka = (
    <header className="flex items-center gap-3 px-4 h-[60px] shrink-0 bg-neutral-900 text-white">
      <button type="button" onClick={() => void zavritSPotvrzenim()} className="w-11 h-11 -ml-2 grid place-items-center rounded-xl hover:bg-white/10" aria-label="Zavřít">
        <X size={22} />
      </button>
      <h2 id="pruvodce-nadpis" className="flex-1 min-w-0 truncate font-display font-black text-xl">Nová objednávka</h2>
      {koncept.placeName && (
        <span className="max-w-[45%] text-sm font-semibold text-neutral-300 truncate">{`${koncept.placeName} · ${popisZavozu(zavoz)}`}</span>
      )}
    </header>
  );

  // Telefon: tlačítka uložení jsou pořád dole (pod nimi už nic není), na počítači v sloupci souhrnu.
  const patkaTelefon = !siroka && (
    <footer className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 pt-3 space-y-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
      {hlaseniUlozeni}
      {tlacitkaUlozeni}
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

      {siroka ? (
        <main className="flex-1 min-h-0 grid grid-cols-[minmax(280px,1fr)_minmax(0,1.3fr)_minmax(320px,1fr)] gap-5 p-4">
          <section aria-label="Pro koho a na kdy" className="overflow-y-auto pr-1 min-h-0">{odberatelEl}</section>
          <section aria-label="Pivo, obal a počet" className="overflow-y-auto pr-1 min-h-0">{pivoEl}</section>
          <section aria-label="Souhrn objednávky" className="overflow-y-auto pr-1 min-h-0">{souhrnEl}</section>
        </main>
      ) : (
        // Horní odsazení je až uvnitř (pt-4), ne na rolovací ploše: lišta písmen u odběratelů se přilepí
        // k úplnému hornímu okraji a pod ní není mezera, kterou by prosvítal rolovaný obsah.
        <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <div className="pt-4 space-y-6">
            {odberatelEl}
            <div className="border-t-2 border-neutral-200 dark:border-neutral-700 pt-6">{pivoEl}</div>
            <div className="border-t-2 border-neutral-200 dark:border-neutral-700 pt-6">{souhrnEl}</div>
          </div>
        </main>
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

