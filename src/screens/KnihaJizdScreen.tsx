import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { mnozne } from '../lib/cisla';
import { Kostra, Modal } from '../components/ui';
import KnihaJizdJizdaModal, { VYCHOZI_UCEL } from '../components/KnihaJizdJizdaModal';
import KnihaJizdUzaverkaModal, { popisMesice } from '../components/KnihaJizdUzaverkaModal';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { AlertTriangle, Bird, Calendar, CheckCircle2, ChevronLeft, Download, Fuel, Lock, Pencil, Plus, Printer, Trash2, Zap } from 'lucide-react';
import { jeKachna } from '../lib/zavozSecondCar';
import { preneseMistniKachnu } from '../lib/zavozKachnaDb';
import { printTable } from '../lib/safePrint';
import { computeRouteDistanceKm, popisTrasyDne } from '../lib/routeDistance';
import { jeMimoKnihuJizd, priplatekDne, PRIPLATEK_MESTO_KM } from '../lib/knihaJizdPravidla';
import { POZNAMKA_VYGENEROVANO, posledniTachometrPred, rozepisTachometr } from '../lib/knihaJizd';
import {
  type DavkaJizd,
  type StavUzavrenychMesicu,
  type VstupUzavreni,
  nactiUzavreneMesice,
  otevritMesic,
  smiOtevritMesic,
  ulozDavku,
  ulozDavkuStarymZpusobem,
  uzavritMesic,
} from '../lib/knihaJizdDb';
import {
  HOME_BASE,
  davkaSmazani,
  jeTankovaniZaznam,
  klicMesice,
  kolikPosunuteSmazanim,
  radekProVlozeni,
} from '../lib/knihaJizdFormular';
import { porovnejJizdy } from '../lib/knihaJizdUzaverka';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { DAYS } from '../lib/shared';
import { chyba, oznam, potvrd } from '../lib/toast';
import { businessDateISO } from '../lib/businessDate';
import { useAuth } from '../lib/auth';
import { canUserEdit, getUserPermissions } from '../lib/permissions';

export type LogbookEntry = {
  id: string;
  date: string;          // ISO YYYY-MM-DD
  vehicle_id?: string;
  vehicle_name: string;  // e.g. Velké auto (Peugeot Boxer)
  driver: string;        // e.g. Petr Bednář
  route_from: string;    // Kynšperk nad Ohří (Pivovar)
  route_to: string;      // e.g. Sokolov → Karlovy Vary → Kynšperk nad Ohří
  purpose: string;       // Rozvoz piva z objednávek & Svoz obalů
  km_start: number;      // Stav tachometru začátek
  km_end: number;        // Stav tachometru konec
  km_driven: number;     // Ujeté km
  fuel_liters?: number;  // Načerpáno paliva (l)
  note?: string;
  /** Km z trasy před dorovnáním podle tachometru (migrace 20261231390000); u starších jízd chybí. */
  km_trasa?: number | null;
  /** Díl rozdílu proti tachometru, který přidala uzávěrka měsíce. */
  km_dorovnani?: number | null;
  /** Kdy byl měsíc auta uzavřen — jízda je pak zamčená. */
  uzavreno_at?: string | null;
  created_at?: string | null;
};

type Vehicle = { id: string; name: string; spz?: string };

const VYCHOZI_RIDIC = 'Petr Bednář';

const KM_FORMAT = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const km = (x: number) => KM_FORMAT.format(x);
const znamenko = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '');

// Sloupec v DB je entry_date; ve zbytku obrazovky (a v LogbookEntry typu výše)
// se pole jmenuje `date`, ať se nemusí přejmenovávat na desítkách míst.
function rowToEntry(r: any): LogbookEntry {
  return {
    id: r.id,
    date: r.entry_date,
    vehicle_id: r.vehicle_id ?? undefined,
    vehicle_name: r.vehicle_name,
    driver: r.driver,
    route_from: r.route_from,
    route_to: r.route_to,
    purpose: r.purpose,
    km_start: Number(r.km_start) || 0,
    km_end: Number(r.km_end) || 0,
    km_driven: Number(r.km_driven) || 0,
    fuel_liters: r.fuel_liters != null ? Number(r.fuel_liters) : undefined,
    note: r.note ?? undefined,
    km_trasa: r.km_trasa != null ? Number(r.km_trasa) : undefined,
    km_dorovnani: r.km_dorovnani != null ? Number(r.km_dorovnani) : undefined,
    uzavreno_at: r.uzavreno_at ?? undefined,
    created_at: r.created_at ?? undefined,
  };
}

const vehicleLabel = (v: Vehicle) => (v.spz ? `${v.name} (${v.spz})` : v.name);

/** Co se v okně jízdy právě dělá. */
type OknoJizdy = { rezim: 'jizda' | 'tankovani'; puvodni?: LogbookEntry };

/** Tlačítka u záznamu: upravit a smazat, u uzavřeného měsíce zámek. */
function AkceZaznamu({ e, smiZapisovat, jdeUpravit, onUpravit, onSmazat }: {
  e: LogbookEntry;
  /** Smí uživatel do knihy zapisovat. */
  smiZapisovat: boolean;
  /** Databáze má migraci, takže jde záznam upravit (před ní jen smazat). */
  jdeUpravit: boolean;
  onUpravit: (e: LogbookEntry) => void;
  onSmazat: (e: LogbookEntry) => void;
}) {
  if (e.uzavreno_at) {
    return (
      <span className="btn-ikona text-neutral-500" role="img" title="Měsíc je uzavřený — jízdu nejde měnit" aria-label="Měsíc je uzavřený">
        <Lock size={16} />
      </span>
    );
  }
  if (!smiZapisovat) return null;
  return (
    <>
      {jdeUpravit && (
        <button
          type="button"
          onClick={() => onUpravit(e)}
          className="btn-ikona tap text-amber-800 hover:bg-amber-100"
          title="Upravit" aria-label="Upravit"
        >
          <Pencil size={16} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onSmazat(e)}
        className="btn-ikona tap text-rose-600 hover:bg-rose-100"
        title="Smazat" aria-label="Smazat"
      >
        <Trash2 size={16} />
      </button>
    </>
  );
}

export default function KnihaJizdScreen({ setPage, uvodniAkce }: {
  setPage?: (p: any) => void;
  /** Dlaždice na ploše („Zapsat tankování PHM“, „nová jízda“) rovnou otevřou příslušné okno. */
  uvodniAkce?: string;
}) {
  const { profile, user } = useAuth();
  const mozeUpravit = canUserEdit(profile?.role, user?.id, 'kniha_jizd', getUserPermissions(user?.id ?? '', (profile as any)?.permissions));
  const mozeOtevirat = smiOtevritMesic(profile?.role);

  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [uzavrenyStav, setUzavrenyStav] = useState<StavUzavrenychMesicu>({ dostupne: false, mesice: [] });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(() => businessDateISO().slice(0, 7));

  // Okno nové jízdy / tankování / úpravy a okno uzávěrky měsíce.
  const [oknoJizdy, setOknoJizdy] = useState<OknoJizdy | null>(null);
  const [oknoUzaverky, setOknoUzaverky] = useState<{ vozidlo: string; mesic: string } | null>(null);

  // Auto Generator Modal state — dvoukrokové: 1) měsíc/řidič/počáteční km → načte dny
  // z objednávek, 2) náhled dnů s editovatelným km a přepínačem vozidla (Velké auto/Kachna).
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoStep, setAutoStep] = useState<'form' | 'preview'>('form');
  const [autoMonth, setAutoMonth] = useState<string>(() => businessDateISO().slice(0, 7));
  const [autoDriver, setAutoDriver] = useState(VYCHOZI_RIDIC);
  // Každé auto má vlastní tachometr (lib/knihaJizd.ts) — dřív byl jeden pro
  // obě a km Kachny se přičítaly Velkému autu.
  const [autoStartKm, setAutoStartKm] = useState<string>('120000');
  const [autoStartKmKachna, setAutoStartKmKachna] = useState<string>('0');
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [previewDays, setPreviewDays] = useState<{ date: string; routeTo: string; stopsCount: number; isKachna: boolean; zavozCislo: number; km: string; missingCoords: string[]; priplatekKm?: number; mesta?: string[] }[]>([]);

  function openAutoModal() {
    setAutoStep('form');
    setPreviewDays([]);
    setShowAutoModal(true);
  }

  async function loadVehicles() {
    const { data } = await supabase.from('vehicles').select('*').order('name');
    const vList = (data as Vehicle[]) ?? [];
    setVehicles(vList);
  }

  async function loadEntries() {
    const [{ data }, uzavrene] = await Promise.all([
      fetchAllRows('logbook_entries', '*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      nactiUzavreneMesice(),
    ]);
    setEntries(((data as any[]) ?? []).map(rowToEntry));
    // Spadlé spojení nesmí zamčené měsíce na chvíli odemknout (zámek stejně hlídá databáze).
    if (!uzavrene.chyba) setUzavrenyStav(uzavrene);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadVehicles(), loadEntries()]).finally(() => setLoading(false));
  }, []);
  useRealtime(['vehicles'], loadVehicles);
  // Tabulka uzavřených měsíců vzniká až migrací — bez ní by odběr změn nad neexistující
  // tabulkou shodil celý kanál, tak se přidává, jakmile ji databáze má.
  useRealtime(uzavrenyStav.dostupne ? ['logbook_entries', 'logbook_closures'] : ['logbook_entries'], loadEntries);

  const novaVerze = uzavrenyStav.dostupne;

  const uzavreneKlice = useMemo(
    () => new Set(uzavrenyStav.mesice.map((m) => klicMesice(m.vehicle_name, m.month))),
    [uzavrenyStav],
  );

  /**
   * Zapíše dávku změn jízd. Vrátí text chyby, nebo `null`, když se zapsalo.
   * S migrací v jedné transakci; bez ní starým způsobem (jen vložit a smazat).
   */
  async function zapisDavku(davka: DavkaJizd): Promise<string | null> {
    let v = novaVerze ? await ulozDavku(davka) : await ulozDavkuStarymZpusobem(davka);
    if (!v.ok && v.chybiMigrace && novaVerze) {
      // Tabulka uzavřených měsíců je, funkce zápisu ale ne — zápis starým způsobem.
      v = await ulozDavkuStarymZpusobem(davka);
    }
    if (!v.ok) return v.chyba;
    await loadEntries();
    return null;
  }

  // Poslední tankování/jízda: hlavní vozidlo a řidiči pro předvyplnění okna.
  const ridici = useMemo(() => {
    const pocty = new Map<string, number>();
    for (const e of entries) {
      const jmeno = (e.driver ?? '').trim();
      if (jmeno) pocty.set(jmeno, (pocty.get(jmeno) ?? 0) + 1);
    }
    const seznam = [...pocty.entries()].sort((a, b) => b[1] - a[1]).map(([jmeno]) => jmeno);
    return seznam.includes(VYCHOZI_RIDIC) ? seznam : [VYCHOZI_RIDIC, ...seznam];
  }, [entries]);

  async function handleDelete(e: LogbookEntry) {
    const posun = novaVerze ? kolikPosunuteSmazanim(entries, e.id) : { pocet: 0, km: 0 };
    const text = posun.pocet > 0 && posun.km !== 0
      ? `Opravdu smazat tento záznam? Tachometr ${mnozne(posun.pocet, ['další jízdy', 'dalších jízd', 'dalších jízd'])} v měsíci se vrátí o ${km(posun.km)} km.`
      : 'Opravdu smazat tento záznam z Knihy jízd?';
    if (!(await potvrd(text, { nebezpecne: true }))) return;
    const davka = novaVerze ? davkaSmazani(entries, e.id) : { smazat: [e.id] };
    if (!davka) {
      chyba('Jízda je v uzavřeném měsíci — nejdřív měsíc otevři.');
      return;
    }
    const err = await zapisDavku(davka);
    if (err) chyba(`Nepodařilo se smazat záznam: ${err}`);
  }

  async function uzavritMesicAuta(v: VstupUzavreni): Promise<string | null> {
    const r = await uzavritMesic(v);
    if (!r.ok) return r.chyba;
    oznam(`Měsíc ${popisMesice(v.mesic)} auta ${v.vozidlo} je uzavřený.`);
    setOknoUzaverky(null);
    await loadEntries();
    return null;
  }

  async function otevritMesicAuta(vozidlo: string, mesic: string) {
    if (!(await potvrd(`Otevřít měsíc ${popisMesice(mesic)} auta ${vozidlo}? Jízdy půjde zase upravovat a mazat.`))) return;
    const r = await otevritMesic(vozidlo, mesic);
    if (!r.ok) {
      chyba(`Měsíc se nepodařilo otevřít: ${r.chyba}`);
      return;
    }
    oznam(`Měsíc ${popisMesice(mesic)} auta ${vozidlo} je zase otevřený.`);
    await loadEntries();
  }

  // Seřazeno od nejnovější jízdy; záznamy z jednoho dne podle pořadí na tachometru.
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => e.date.startsWith(filterMonth)).sort((a, b) => porovnejJizdy(b, a));
  }, [entries, filterMonth]);

  const pocetJizd = useMemo(() => filteredEntries.filter((e) => !jeTankovaniZaznam(e)).length, [filteredEntries]);
  const pocetTankovani = filteredEntries.length - pocetJizd;

  const totalKmMonth = useMemo(() => {
    const soucet = filteredEntries.reduce((sum, e) => sum + Number(e.km_driven || 0), 0);
    return Math.round(soucet * 10) / 10;
  }, [filteredEntries]);

  // ⛽ Průměrná spotřeba za měsíc: součet natankovaných litrů / ujeté km × 100.
  // Ukáže se jen když je za měsíc zapsané aspoň nějaké tankování — bez litrů
  // by to bylo dělení nulou a „0,0" by mátlo. (Kč/km zatím ne — cena paliva
  // se u jízdy neeviduje; to by chtělo sloupec navíc v databázi.)
  const spotreba100 = useMemo(() => {
    const litry = filteredEntries.reduce((s, e) => s + Number(e.fuel_liters || 0), 0);
    return litry > 0 && totalKmMonth > 0 ? (litry / totalKmMonth) * 100 : null;
  }, [filteredEntries, totalKmMonth]);

  // Auta, která v měsíci jezdila — pro kartu uzávěrky.
  const autaVMesici = useMemo(() => {
    const podleAuta = new Map<string, { vozidlo: string; jizd: number; km: number }>();
    for (const e of filteredEntries) {
      const a = podleAuta.get(e.vehicle_name) ?? { vozidlo: e.vehicle_name, jizd: 0, km: 0 };
      if (!jeTankovaniZaznam(e)) a.jizd += 1;
      a.km += Number(e.km_driven) || 0;
      podleAuta.set(e.vehicle_name, a);
    }
    return [...podleAuta.values()]
      .sort((a, b) => a.vozidlo.localeCompare(b.vozidlo, 'cs'))
      .map((a) => ({
        ...a,
        km: Math.round(a.km * 10) / 10,
        zavreno: uzavrenyStav.mesice.find((m) => m.vehicle_name === a.vozidlo && m.month === filterMonth) ?? null,
      }));
  }, [filteredEntries, uzavrenyStav, filterMonth]);

  // Velké auto — výchozí vozidlo pro vygenerované jízdy z objednávek
  const bigVehicleLabel = useMemo(() => {
    const big =
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return n.includes('velk') || n.includes('boxer') || n.includes('transit');
      }) ?? vehicles[0];
    return big ? vehicleLabel(big) : 'Velké auto (Peugeot Boxer / 3K1 2244)';
  }, [vehicles]);

  // Druhé vozidlo pivovaru (Kachna / Kačena) — dny označené v Závozu se zapíšou na něj
  const secondVehicleLabel = useMemo(() => {
    const second =
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return n.includes('kachna') || n.includes('kačena') || n.includes('kacena');
      }) ??
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return !n.includes('velk') && !n.includes('boxer') && !n.includes('transit');
      }) ??
      vehicles[1];
    return second ? vehicleLabel(second) : 'Kachna (Kačena)';
  }, [vehicles]);

  const vozidlaLabels = useMemo(() => vehicles.map(vehicleLabel), [vehicles]);

  // Dlaždice na ploše odkazují rovnou na zápis jízdy / tankování. Okno se otevře jednou po
  // načtení; zavření a návrat na obrazovku ho znovu neotvírá.
  const zpracovanaAkce = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (loading || !mozeUpravit || !uvodniAkce || zpracovanaAkce.current === uvodniAkce) return;
    zpracovanaAkce.current = uvodniAkce;
    if (uvodniAkce === 'jizdy') setOknoJizdy({ rezim: 'jizda' });
    else if (uvodniAkce === 'tankovani') setOknoJizdy({ rezim: 'tankovani' });
  }, [loading, mozeUpravit, uvodniAkce]);

  // Tachometry na začátku generovaného měsíce se předvyplní z poslední jízdy
  // každého auta PŘED tím měsícem — ne z poslední jízdy vůbec, jinak by se
  // při opakovaném generování měsíc napojil sám na sebe.
  useEffect(() => {
    if (!showAutoModal) return;
    const zacatek = `${autoMonth}-01`;
    const velke = posledniTachometrPred(entries, bigVehicleLabel, zacatek);
    const kachna = posledniTachometrPred(entries, secondVehicleLabel, zacatek);
    if (velke != null) setAutoStartKm(String(velke));
    if (kachna != null) setAutoStartKmKachna(String(kachna));
    // Jen při otevření a změně měsíce — ne při každé změně jízd, jinak by
    // realtime přepsal číslo, které člověk zrovna opravuje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAutoModal, autoMonth, bigVehicleLabel, secondVehicleLabel]);

  // Ručně zapsané jízdy ve dnech, které se generují — generátor je nechá být
  // (dřív je smazal spolu se starými vygenerovanými), ale je potřeba na ně
  // upozornit, ať se tatáž jízda nezapíše dvakrát.
  const rucneZapsaneVeDnech = useMemo(() => {
    const dny = new Set(previewDays.map((d) => d.date));
    return entries.filter((e) => dny.has(e.date) && !(e.note ?? '').startsWith(POZNAMKA_VYGENEROVANO) && !jeTankovaniZaznam(e));
  }, [entries, previewDays]);

  // ---- KROK 1: NAČÍST DNY ZÁVOZU Z OBJEDNÁVEK ----
  async function handleBuildPreview(e: React.FormEvent) {
    e.preventDefault();
    setAutoGenerating(true);

    try {
      // Většina objednávek nemá vyplněné konkrétní delivery_date (to se ukládá
      // jen u výslovně napsaného data) — místo toho mají delivery_day (den v
      // týdnu: po/ut/st/ct/pa/so/ne) + order_date, ze kterých appka jinde
      // (Orders.tsx, isoWeekKey(o.delivery_date || o.order_date)) dopočítává
      // skutečné datum. Bez tohoto dopočtu by generátor přeskočil naprostou
      // většinu reálných rozvozů (viz bug: srpen nabídl jen objednávky s ručně
      // vyplněným přesným datem, zbytek — vč. několika jízd do Prahy — chyběl).
      //
      // Načteme širší okno podle order_date (± 1 týden přes hranice měsíce,
      // pro případ přelivu týdne přes konec/začátek měsíce) SJEDNOCENÉ s
      // objednávkami, co mají explicitní delivery_date přímo v měsíci (to může
      // být naplánováno i mimo okno order_date, viz orders s delivery_date o
      // dost dní/týdny později než order_date).
      const monthStart = `${autoMonth}-01`;
      const [yy, mm] = autoMonth.split('-').map(Number);
      const monthEnd = `${autoMonth}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`;
      const addDaysISO = (iso: string, delta: number) => {
        const d = new Date(iso + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + delta);
        return d.toISOString().slice(0, 10);
      };
      const bufStart = addDaysISO(monthStart, -7);
      const bufEnd = addDaysISO(monthEnd, 7);

      const [{ data: rawOrders }, { data: rawPlaces }] = await Promise.all([
        fetchAllRows('orders', '*')
          .neq('status', 'storno')
          .or(
            `and(delivery_date.gte.${monthStart},delivery_date.lte.${monthEnd}),and(order_date.gte.${bufStart},order_date.lte.${bufEnd})`
          )
          .order('order_date', { ascending: true }),
        supabase.from('places').select('id, name, lat, lng, address'),
      ]);

      const dayCodeOffset = (code: string | null | undefined): number | null => {
        if (!code) return null;
        const idx = DAYS.findIndex((d) => d.v === code);
        return idx >= 0 ? idx : null;
      };

      // Skutečné datum dodání: explicitní delivery_date má přednost, jinak
      // dopočet z týdne objednávky (order_date) + den v týdnu (delivery_day).
      const effectiveDeliveryDate = (o: any): string | null => {
        if (o.delivery_date) return o.delivery_date;
        const offset = dayCodeOffset(o.delivery_day);
        if (offset === null || !o.order_date) return null;
        const weekStart = weekRange(isoWeekKey(o.order_date)).start;
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };

      // Označení Kačeny, která jsou jen v tomhle prohlížeči, se nejdřív přenesou do databáze
      // (jinak by se jízda Kačeny zapsala na velké auto) — viz Závoz.
      const nactene = (rawOrders as any[]) ?? [];
      const preneseno = await preneseMistniKachnu(nactene, businessDateISO());
      const objednavky = preneseno.length ? nactene.map((o) => (preneseno.includes(o.id) ? { ...o, second_car: true } : o)) : nactene;

      const ordersList = objednavky
        .map((o) => ({ ...o, _effectiveDate: effectiveDeliveryDate(o) }))
        .filter((o) => o._effectiveDate && o._effectiveDate >= monthStart && o._effectiveDate <= monthEnd)
        // Matěs, Petr a Restaurace se do Knihy jízd nepočítají (11. 10. 2026).
        .filter((o) => !jeMimoKnihuJizd(o.place_name));

      const skippedNoDay = objednavky.filter((o) => !effectiveDeliveryDate(o)).length;

      const placesById = new Map<string, { lat: number | null; lng: number | null; address: string | null }>(
        ((rawPlaces as any[]) ?? []).map((p) => [p.id, { lat: p.lat, lng: p.lng, address: p.address ?? null }])
      );

      if (!ordersList.length) {
        oznam(`V měsíci ${autoMonth} nebyly nalezeny žádné objednávky s rozpoznatelným dnem rozvozu (Matěs, Petr, Restaurace a prodejna se do knihy jízd nepočítají).`);
        setAutoGenerating(false);
        return;
      }

      if (skippedNoDay > 0) {
        console.warn(`Kniha jízd: ${skippedNoDay} objednávek přeskočeno — chybí den v týdnu (delivery_day) i konkrétní datum.`);
      }

      // Objednávky dne rozdělíme podle toho, kterou objednávku odbavil v Závozu
      // zaškrtnutím "🦆 Kačena" — smíšený den (část objednávek Kačenou, část
      // velkým autem) vytvoří DVĚ samostatné jízdy pro stejné datum.
      const dateGroups = new Map<string, any[]>();
      ordersList.forEach((o) => {
        const d = o._effectiveDate as string;
        const arr = dateGroups.get(d) ?? [];
        arr.push(o);
        dateGroups.set(d, arr);
      });

      const buildRoute = (dayOrders: any[]) => {
        const placeNames = Array.from(new Set(dayOrders.map((o) => o.place_name || 'Místní odběratel')));
        return popisTrasyDne(placeNames);
      };

      // Zastávky dne v pořadí prvního výskytu — pro OSRM výpočet reálné jízdní
      // vzdálenosti pivovar → zastávky → pivovar (jedna okružní jízda). Zastávky bez uložených
      // souřadnic (u odběratele) se do výpočtu nezapočítají.
      const buildStops = (dayOrders: any[]) => {
        const seen = new Set<string>();
        const stops: { name: string; lat: number | null; lng: number | null; address?: string | null }[] = [];
        dayOrders.forEach((o) => {
          const name = o.place_name || 'Místní odběratel';
          const key = o.place_id || name;
          if (seen.has(key)) return;
          seen.add(key);
          const p = o.place_id ? placesById.get(o.place_id) : undefined;
          stops.push({ name, lat: p?.lat ?? null, lng: p?.lng ?? null, address: p?.address ?? null });
        });
        return stops;
      };

      const groups: { date: string; routeTo: string; stopsCount: number; isKachna: boolean; zavozCislo: number; stops: { name: string; lat: number | null; lng: number | null; address?: string | null }[] }[] = [];
      [...dateGroups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([dDate, dayOrders]) => {
          const kachnaOrders = dayOrders.filter((o) => jeKachna(o));
          const bigOrders = dayOrders.filter((o) => !jeKachna(o));
          // Jedno auto = jedna okružní jízda NA KAŽDÝ ZÁVOZ (zadání 20. 10. 2026:
          // „pokud jsou 2 závozy, tak to bude 2×, Kačena se počítá zvlášť").
          // Závoz číslo 2 se pozná podle `zavoz_cislo` objednávky, výchozí je 1.
          const pridejJizdy = (carOrders: any[], isKachna: boolean) => {
            [1, 2].forEach((cislo) => {
              const zavozOrders = carOrders.filter((o) => ((o.zavoz_cislo ?? 1) === 2 ? 2 : 1) === cislo);
              if (zavozOrders.length === 0) return;
              groups.push({
                date: dDate,
                routeTo: buildRoute(zavozOrders),
                stopsCount: new Set(zavozOrders.map((o) => o.place_name)).size,
                isKachna,
                zavozCislo: cislo,
                stops: buildStops(zavozOrders),
              });
            });
          };
          pridejJizdy(bigOrders, false);
          pridejJizdy(kachnaOrders, true);
        });

      // Reálná jízdní vzdálenost přes OSRM — pro každý den/auto zvlášť, ať se
      // dá km po vygenerování náhledu ještě ručně opravit.
      const days: typeof previewDays = await Promise.all(
        groups.map(async (g) => {
          const { km: kmDne, missingCoords } = await computeRouteDistanceKm(g.stops);
          // +30 km za každou jízdu do velkého města (Praha, Hradec…) — viz
          // lib/knihaJizdPravidla.ts. Zahrnuto v km, které jde v náhledu ručně opravit.
          const priplatek = priplatekDne(g.stops);
          const celkem = Math.round((kmDne + priplatek.km) * 10) / 10;
          return {
            date: g.date,
            routeTo: g.routeTo,
            stopsCount: g.stopsCount,
            isKachna: g.isKachna,
            zavozCislo: g.zavozCislo,
            km: celkem > 0 ? String(celkem) : '',
            missingCoords,
            priplatekKm: priplatek.km,
            mesta: priplatek.mesta,
          };
        })
      );

      setPreviewDays(days);
      setAutoStep('preview');
    } catch (err: any) {
      chyba(`Chyba při načítání objednávek: ${err?.message || err}`);
    } finally {
      setAutoGenerating(false);
    }
  }

  // ---- KROK 2: Z NÁHLEDU (upravené km + vozidlo na den) VYTVOŘIT ZÁZNAMY ----
  async function handleGenerateFromPreview() {
    if (previewDays.some((d) => !d.km || Number(d.km) <= 0)) {
      if (!(await potvrd('Některé dny nemají vyplněné ujeté km. Pokračovat i tak (budou mít 0 km)?'))) return;
    }
    const tachometr = rozepisTachometr(
      previewDays.map((d) => ({ date: d.date, isKachna: d.isKachna, km: Number(d.km) || 0 })),
      { velke: Number(autoStartKm) || 0, kachna: Number(autoStartKmKachna) || 0 },
    );
    const generatedEntries: LogbookEntry[] = previewDays.map((d, i) => {
      const maVicZavozu = previewDays.filter((x) => x.date === d.date && x.isKachna === d.isKachna).length > 1;
      const missingNote = d.missingCoords.length > 0
        ? ` — km odhad neúplný, chybí souřadnice u: ${d.missingCoords.join(', ')} (doplň v Odběratelích)`
        : '';
      return {
        id: crypto.randomUUID(),
        date: d.date,
        vehicle_name: d.isKachna ? secondVehicleLabel : bigVehicleLabel,
        driver: autoDriver || VYCHOZI_RIDIC,
        route_from: HOME_BASE,
        route_to: d.routeTo,
        purpose: VYCHOZI_UCEL,
        km_start: tachometr[i].km_start,
        km_end: tachometr[i].km_end,
        km_driven: tachometr[i].km_driven,
        // Km z trasy jsou základ, ze kterého uzávěrka měsíce počítá dorovnání podle tachometru.
        km_trasa: tachometr[i].km_driven,
        km_dorovnani: 0,
        note: `${POZNAMKA_VYGENEROVANO} (${d.stopsCount} zastávek v daný den, jedna okružní jízda z Kynšperka a zpět${maVicZavozu ? `, ${d.zavozCislo}. závoz` : ''})${d.isKachna ? ' — auto Kachna' : ' — Velké auto'}${d.priplatekKm ? ` — v km je příplatek +${PRIPLATEK_MESTO_KM} km za každou jízdu do města (${(d.mesta ?? []).join(', ')})` : ''}${missingNote}`,
      };
    });

    // Do uzavřeného měsíce auta se nezapisuje — jinak by generátor přepsal čísla, která už
    // jsou odevzdaná podle tachometru.
    const uzavrene = [...new Set(generatedEntries
      .filter((e) => uzavreneKlice.has(klicMesice(e.vehicle_name, e.date.slice(0, 7))))
      .map((e) => e.vehicle_name))];
    if (uzavrene.length > 0) {
      chyba(`Měsíc ${popisMesice(autoMonth)} je u auta ${uzavrene.join(', ')} uzavřený — nejdřív ho otevři (Kniha jízd → Uzávěrka měsíce).`);
      return;
    }

    // Znovu-vygenerování za stejné dny nahradí předchozí VYGENEROVANÉ
    // záznamy pro tyto dny, ať se při opakovaném běhu nehromadí duplicity.
    // Ručně zapsané jízdy (třeba pro sladovnu nebo do servisu) zůstanou —
    // dřív se mazalo všechno z těch dnů a ruční zápis tiše zmizel.
    // Staré záznamy se hledají přímo v databázi (ne v paměti obrazovky), ať žádný neunikne.
    const affectedDates = Array.from(new Set(previewDays.map((d) => d.date)));
    // Stránkovaně (fetchAllRows), ať se dotaz na rostoucí tabulku nikdy tiše neořízne na 1000 řádků.
    const { data: stare, error: stareError } = await fetchAllRows('logbook_entries', 'id')
      .in('entry_date', affectedDates)
      .filter('note', 'like', `${POZNAMKA_VYGENEROVANO}%`);
    if (stareError) {
      chyba(`Nepodařilo se najít stávající záznamy: ${stareError.message}`);
      return;
    }

    // Smazání starých a vložení nových je jedna transakce — při výpadku spojení nezůstane
    // měsíc bez jízd ani s polovinou.
    const err = await zapisDavku({
      smazat: ((stare as { id: string }[]) ?? []).map((s) => s.id),
      vlozit: generatedEntries.map(radekProVlozeni),
    });
    if (err) {
      chyba(`Nepodařilo se uložit vygenerované jízdy: ${err}`);
      return;
    }
    setFilterMonth(autoMonth);
    setShowAutoModal(false);
    setAutoStep('form');
    setPreviewDays([]);
    oznam(`Úspěšně vygenerováno ${generatedEntries.length} závozových jízd!`);
  }

  function exportExcelLogbook() {
    const dataToExport = filteredEntries.map((e) => ({
      Datum: new Date(e.date).toLocaleDateString('cs-CZ'),
      Vozidlo: e.vehicle_name,
      Řidič: e.driver,
      'Odkud': e.route_from,
      'Kam / Trasa': e.route_to,
      'Účel jízdy': e.fuel_liters ? `${e.purpose} (${km(e.fuel_liters)} l)` : e.purpose,
      'Tachometr start': e.km_start,
      'Tachometr konec': e.km_end,
      'Ujeté km': e.km_driven,
      Poznámka: e.note || '—',
    }));

    exportHistoryDetailToExcel(
      dataToExport,
      ['Datum', 'Vozidlo', 'Řidič', 'Odkud', 'Trasa', 'Účel', 'Km Start', 'Km Konec', 'Ujeté km', 'Poznámka'],
      ['Datum', 'Vozidlo', 'Řidič', 'Odkud', 'Kam / Trasa', 'Účel jízdy', 'Tachometr start', 'Tachometr konec', 'Ujeté km', 'Poznámka'],
      `Kniha_jizd_${filterMonth}.xlsx`
    );
  }

  function printLogbook() {
    printTable({
      title: `Kniha jízd — ${filterMonth}`,
      heading: `Kniha jízd pivovaru — Měsíc ${filterMonth}`,
      summary: `Kynšperský pivovar s.r.o. · Celkem ujeto v měsíci: ${km(totalKmMonth)} km`,
      columns: [
        { label: 'Datum' },
        { label: 'Vozidlo' },
        { label: 'Řidič' },
        { label: 'Trasa (Odkud → Kam)' },
        { label: 'Účel jízdy' },
        { label: 'Start (km)', align: 'right' },
        { label: 'Konec (km)', align: 'right' },
        { label: 'Ujeto (km)', align: 'right' },
      ],
      rows: filteredEntries.map((entry) => [
        new Date(entry.date).toLocaleDateString('cs-CZ'),
        entry.vehicle_name,
        entry.driver,
        `${entry.route_from} → ${entry.route_to}`,
        entry.fuel_liters ? `${entry.purpose} (${km(entry.fuel_liters)} l)` : entry.purpose,
        `${entry.km_start} km`,
        `${entry.km_end} km`,
        `${entry.km_driven} km`,
      ]),
      emptyMessage: 'Žádné jízdní záznamy',
    });
  }

  // Vedlejší akce (Excel, tisk) jsou schované pod „⋯" —
  // na telefonu je hlavní akce jediná, která má být hned vidět.
  const [dalsiAkce, setDalsiAkce] = useState(false);

  // Kostra místo kolečka: obsah se neodmountuje do prázdna, takže se
  // stránka po načtení neposkočí. Viz Kostra v components/ui.tsx.
  if (loading) return <Kostra radku={6} />;

  return (
    <div className="space-y-6 pb-12">
      {/* Lišta akcí (docs/jednotny-styl.md, kámen K1).
          Hlavní akce a zápis jízdy/tankování jsou vidět hned, export a tisk
          jsou pod „⋯". Jízda mimo objednávky je stejně běžná jako generování,
          proto má vlastní tlačítko, ne schování pod „⋯". */}
      <div className="space-y-2">
        <div className="lista-akci">
          {mozeUpravit && (
            <button onClick={openAutoModal} className="btn-primary !text-xs" title="Automaticky spočítat trasy z objednávek podle dnů s rovnoměrným rozpočítáním tachometru">
              <Zap size={16} /> Generovat z objednávek
            </button>
          )}
          <button
            type="button"
            onClick={() => setDalsiAkce((v) => !v)}
            className="btn-ghost jen-ikona"
            title="Další akce" aria-label="Další akce"
            aria-expanded={dalsiAkce}
          >
            ⋯
          </button>
        </div>

        <div className="lista-akci">
          <label className="btn-ghost !flex-none !px-3 !gap-2 cursor-pointer">
            <Calendar size={16} className="text-amber-700" />
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-transparent font-mono font-black text-xs border-none focus:outline-none"
              aria-label="Měsíc"
            />
          </label>
          {mozeUpravit && (
            <>
              <button type="button" onClick={() => setOknoJizdy({ rezim: 'jizda' })} className="btn-ghost !text-xs">
                <Plus size={16} /> Jízda
              </button>
              <button
                type="button"
                onClick={() => setOknoJizdy({ rezim: 'tankovani' })}
                className="btn-ghost jen-ikona"
                title="Zapsat tankování" aria-label="Zapsat tankování"
              >
                <Fuel size={16} />
              </button>
            </>
          )}
        </div>

        {dalsiAkce && (
          <div className="lista-akci">
            <button onClick={exportExcelLogbook} className="btn-ghost !text-xs">
              <Download size={16} /> Excel
            </button>
            <button onClick={printLogbook} className="btn-ghost !text-xs">
              <Printer size={16} /> Tisk
            </button>
          </div>
        )}
      </div>

      {/* Dokud v databázi není migrace, nové možnosti (úprava jízdy, uzávěrka měsíce) se
          nenabízejí — vedení to řekne, kde je zapnout. */}
      {!novaVerze && mozeOtevirat && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 bg-amber-50 border border-amber-300 rounded px-3 py-2 font-semibold">
          <span>
            <AlertTriangle className="ikona-text" /> Úprava jízd a uzávěrka měsíce se zapnou po spuštění migrace databáze: Systém → Databázové migrace.
          </span>
          {setPage && (
            <button type="button" onClick={() => setPage('audit')} className="btn-ghost btn-sm">Otevřít Systém</button>
          )}
        </div>
      )}

      {/* Pruh čísel (kámen K3): tři karty zabíraly 540 px, aby ukázaly
          tři nuly. Pruh to zvládne na 72 px a zbytek obrazovky patří
          evidenčnímu listu. */}
      <div className="pruh-cisel">
        <div>
          <div className="nazev">Km</div>
          <div className="cislo text-amber-700">{km(totalKmMonth)}</div>
        </div>
        <div>
          <div className="nazev">Jízdy</div>
          <div className="cislo">{pocetJizd}</div>
        </div>
        <div>
          <div className="nazev">Vozidla</div>
          <div className="cislo">{vehicles.length || 1}</div>
        </div>
        {spotreba100 != null && (
          <div>
            <div className="nazev">l/100 km</div>
            <div className="cislo text-amber-700">{spotreba100.toFixed(1)}</div>
          </div>
        )}
      </div>

      {/* Uzávěrka měsíce po autech: zadá se stav tachometru, rozdíl proti trasám se rozpočítá
          mezi jízdy a měsíc se zamkne. */}
      {novaVerze && autaVMesici.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="font-display font-black text-base text-neutral-900">Uzávěrka měsíce</h3>
          {autaVMesici.map((a) => (
            <div key={a.vozidlo} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <div className="font-black text-sm text-neutral-950">{a.vozidlo}</div>
                {a.zavreno ? (
                  <div className="text-xs text-emerald-800 font-semibold">
                    <Lock className="ikona-text" /> Uzavřeno {new Date(a.zavreno.closed_at).toLocaleDateString('cs-CZ')} · tachometr {km(a.zavreno.km_start)} → {km(a.zavreno.km_end)} km
                    {a.zavreno.km_dorovnani !== 0 && ` · dorovnáno ${znamenko(a.zavreno.km_dorovnani)}${km(Math.abs(a.zavreno.km_dorovnani))} km`}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-600">Otevřeno · {mnozne(a.jizd, ['jízda', 'jízdy', 'jízd'])} · {km(a.km)} km</div>
                )}
              </div>
              {a.zavreno
                ? mozeOtevirat && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => otevritMesicAuta(a.vozidlo, filterMonth)}>Otevřít měsíc</button>
                )
                : mozeUpravit && a.jizd > 0 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setOknoUzaverky({ vozidlo: a.vozidlo, mesic: filterMonth })}>
                    <Lock size={14} /> Uzavřít měsíc
                  </button>
                )}
            </div>
          ))}
        </div>
      )}

      {/* Main Table */}
      <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <span>
              Evidenční list — {mnozne(pocetJizd, ['jízda', 'jízdy', 'jízd'])}
              {pocetTankovani > 0 && <span className="text-sm font-bold text-neutral-500"> + {mnozne(pocetTankovani, ['tankování', 'tankování', 'tankování'])}</span>}
            </span>
          </h3>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-xs font-bold text-neutral-500 space-y-3">
            <p>V měsíci {filterMonth} zatím nebyly zapsané žádné jízdy.</p>
            {mozeUpravit && (
              <div className="lista-akci max-w-sm mx-auto">
                <button onClick={openAutoModal} className="btn-primary !text-xs">
                  <Zap size={16} /> Generovat z objednávek
                </button>
                <button onClick={() => setOknoJizdy({ rezim: 'jizda' })} className="btn-ghost !text-xs">
                  <Plus size={16} /> Zadat ručně
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filteredEntries.map((e) => {
              const tankovani = jeTankovaniZaznam(e);
              return (
                <div key={e.id} className="rounded border border-neutral-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-sm text-neutral-950">{e.vehicle_name}</div>
                      <div className="text-udaj text-neutral-500 font-bold">{new Date(e.date).toLocaleDateString('cs-CZ')} · {e.driver}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-black text-sm text-amber-600 whitespace-nowrap">
                        {tankovani ? `${km(e.fuel_liters ?? 0)} l` : `${e.km_driven.toLocaleString('cs-CZ')} km`}
                      </span>
                      <AkceZaznamu
                        e={e} smiZapisovat={mozeUpravit} jdeUpravit={novaVerze}
                        onUpravit={(z) => setOknoJizdy({ rezim: tankovani ? 'tankovani' : 'jizda', puvodni: z })}
                        onSmazat={handleDelete}
                      />
                    </div>
                  </div>
                  {tankovani ? (
                    <div className="text-xs text-neutral-700 font-medium">
                      <Fuel className="ikona-text" /> Tankování · <strong className="text-amber-900">{e.route_to}</strong>
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-700 font-medium">
                      <span className="text-neutral-500">{e.route_from}</span> → <strong className="text-amber-900">{e.route_to}</strong>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-udaj text-neutral-500 font-mono">
                    {!tankovani && <span>{e.purpose}</span>}
                    <span>{tankovani ? `na ${e.km_start.toLocaleString('cs-CZ')} km` : `${e.km_start.toLocaleString('cs-CZ')} → ${e.km_end.toLocaleString('cs-CZ')} km`}</span>
                    {!tankovani && e.fuel_liters ? <span>⛽ {km(e.fuel_liters)} l</span> : null}
                    {!!e.km_dorovnani && e.km_trasa != null && (
                      <span>trasa {km(e.km_trasa)} {znamenko(e.km_dorovnani)}{km(Math.abs(e.km_dorovnani))}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Vozidlo</th>
                  <th scope="col">Řidič</th>
                  <th scope="col">Trasa (Odkud → Kam)</th>
                  <th scope="col">Účel jízdy</th>
                  <th scope="col" className="text-right">Tachometr Start</th>
                  <th scope="col" className="text-right">Tachometr Konec</th>
                  <th scope="col" className="text-right font-black text-amber-950">Ujeté km</th>
                  <th scope="col" className="w-20"><span className="sr-only">Akce</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => {
                  const tankovani = jeTankovaniZaznam(e);
                  return (
                    <tr key={e.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="font-bold text-xs text-neutral-900 whitespace-nowrap">
                        {new Date(e.date).toLocaleDateString('cs-CZ')}
                      </td>
                      <td className="font-black text-xs text-neutral-950">{e.vehicle_name}</td>
                      <td className="font-bold text-xs text-neutral-700">{e.driver}</td>
                      <td className="font-medium text-xs text-neutral-900">
                        {tankovani ? (
                          <><Fuel className="ikona-text" /> Tankování · <strong className="text-amber-900">{e.route_to}</strong></>
                        ) : (
                          <><span className="text-neutral-500">{e.route_from}</span> → <strong className="text-amber-900">{e.route_to}</strong></>
                        )}
                      </td>
                      <td className="text-xs text-neutral-600 font-medium">{tankovani ? '—' : e.purpose}</td>
                      <td className="text-right font-mono text-xs text-neutral-700">{e.km_start.toLocaleString('cs-CZ')} km</td>
                      <td className="text-right font-mono text-xs text-neutral-700">{tankovani ? '—' : `${e.km_end.toLocaleString('cs-CZ')} km`}</td>
                      <td className="text-right font-mono font-black text-sm text-amber-600 whitespace-nowrap">
                        {tankovani ? `${km(e.fuel_liters ?? 0)} l` : `${e.km_driven.toLocaleString('cs-CZ')} km`}
                        {!tankovani && !!e.km_dorovnani && e.km_trasa != null && (
                          <span className="block text-udaj font-semibold text-neutral-500">trasa {km(e.km_trasa)} {znamenko(e.km_dorovnani)}{km(Math.abs(e.km_dorovnani))}</span>
                        )}
                        {!tankovani && e.fuel_liters ? <span className="block text-udaj font-semibold text-neutral-500">⛽ {km(e.fuel_liters)} l</span> : null}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <AkceZaznamu
                            e={e} smiZapisovat={mozeUpravit} jdeUpravit={novaVerze}
                            onUpravit={(z) => setOknoJizdy({ rezim: tankovani ? 'tankovani' : 'jizda', puvodni: z })}
                            onSmazat={handleDelete}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* NOVÁ JÍZDA / TANKOVÁNÍ / ÚPRAVA */}
      {oknoJizdy && (
        <KnihaJizdJizdaModal
          key={oknoJizdy.puvodni?.id ?? `nova-${oknoJizdy.rezim}`}
          rezim={oknoJizdy.rezim}
          puvodni={oknoJizdy.puvodni ?? null}
          jizdy={entries}
          uzavrene={uzavreneKlice}
          vozidla={vozidlaLabels}
          vychoziVozidlo={bigVehicleLabel}
          ridici={ridici}
          vychoziRidic={VYCHOZI_RIDIC}
          vychoziDatum={businessDateISO()}
          onClose={() => setOknoJizdy(null)}
          onUlozit={async (davka) => {
            const err = await zapisDavku(davka);
            if (!err) setOknoJizdy(null);
            return err;
          }}
        />
      )}

      {/* UZÁVĚRKA MĚSÍCE */}
      {oknoUzaverky && (
        <KnihaJizdUzaverkaModal
          vozidlo={oknoUzaverky.vozidlo}
          mesic={oknoUzaverky.mesic}
          jizdy={entries}
          uzavrene={uzavrenyStav.mesice}
          dnes={businessDateISO()}
          onClose={() => setOknoUzaverky(null)}
          onUzavrit={uzavritMesicAuta}
        />
      )}

      {/* MODAL PRO AUTOMATICKÉ VYGENEROVÁNÍ Z OBJEDNÁVEK */}
      <Modal open={showAutoModal} onClose={() => setShowAutoModal(false)} title="Generovat Knihu jízd z objednávek" maxWidth="max-w-lg">
        {autoStep === 'form' ? (
          <form onSubmit={handleBuildPreview} className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 font-medium space-y-1">
              <p className="font-bold flex items-center gap-1 text-amber-900">
                <CheckCircle2 size={14} className="text-amber-600" />
                <span>Km počítá zvlášť pro každou zastávku</span>
              </p>
              <p>
                Trasa je pivovar → zastávka → pivovar, samostatně pro <strong>každou</strong> zastávku dne — auto se mezi dodávkami vrací naložit, ne jeden okruh přes všechny. Načtou se dny s nastaveným <strong>dnem závozu</strong>. V dalším kroku pro každý den zvolíš vozidlo (výchozí Velké auto, nebo zaškrtneš Kachnu) a km jde ještě ručně opravit.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Měsíc objednávek</label>
                <input
                  type="month"
                  required
                  value={autoMonth}
                  onChange={(e) => setAutoMonth(e.target.value)}
                  className="input font-mono font-bold text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Řidič</label>
                <input
                  type="text"
                  required
                  value={autoDriver}
                  onChange={(e) => setAutoDriver(e.target.value)}
                  className="input font-bold text-xs"
                />
              </div>
            </div>

            {/* Každé auto svůj tachometr — předvyplněno z jeho poslední
                jízdy před tímhle měsícem. */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Tachometr {bigVehicleLabel} na začátku měsíce (km)</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  required
                  value={autoStartKm}
                  onChange={(e) => setAutoStartKm(e.target.value)}
                  className="input font-mono font-bold text-xs"
                  placeholder="Např. 120000"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Tachometr {secondVehicleLabel} na začátku měsíce (km)</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  required
                  value={autoStartKmKachna}
                  onChange={(e) => setAutoStartKmKachna(e.target.value)}
                  className="input font-mono font-bold text-xs"
                  placeholder="Např. 85000"
                />
              </div>
            </div>

            <div className="lista-akci pt-3 border-t border-neutral-100">
              <button type="button" onClick={() => setShowAutoModal(false)} className="btn-ghost">
                Zrušit
              </button>
              <button type="submit" disabled={autoGenerating} className="btn-primary">
                <Zap size={16} />
                <span>{autoGenerating ? 'Načítám dny…' : 'Načíst dny z objednávek →'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-udaj text-neutral-500 font-bold leading-snug">
              Nalezeno <strong>{previewDays.length}</strong> {previewDays.length === 1 ? 'jízda' : 'jízd'} se závozem v {autoMonth} — vozidlo je předvyplněné podle značení <strong><Bird className="ikona-text" /> Kačena</strong> u jednotlivých objednávek v Závozu (smíšený den = dvě jízdy, 2. závoz = další jízda). Klidně přeškrtni, jinak se použije <strong>{bigVehicleLabel}</strong>. Km jsou předvyplněná podle mapy jako jedna okružní jízda pivovar → všechny zastávky → pivovar (každý závoz zvlášť) — klidně uprav podle tachometru, pokud se liší.
            </p>

            {rucneZapsaneVeDnech.length > 0 && (
              <div className="text-udaj text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 font-semibold leading-snug">
                <AlertTriangle className="ikona-text" /> V těchto dnech už {rucneZapsaneVeDnech.length === 1 ? 'je 1 ručně zapsaná jízda' : `jsou ${rucneZapsaneVeDnech.length} ručně zapsané jízdy`} ({Array.from(new Set(rucneZapsaneVeDnech.map((e) => new Date(e.date).toLocaleDateString('cs-CZ')))).join(', ')}). Zůstanou — zkontroluj, ať tentýž rozvoz nebude zapsaný dvakrát.
              </div>
            )}

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {previewDays.map((d, i) => (
                <div key={`${d.date}-${d.isKachna ? 'kachna' : 'velke'}-${i}`} className="rounded border border-neutral-200 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs text-neutral-900 flex items-center gap-1.5">
                      {new Date(d.date).toLocaleDateString('cs-CZ')}
                      <span className={`px-1.5 py-0.5 rounded-full text-udaj font-black uppercase ${d.isKachna ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {d.isKachna ? 'Kačena' : 'Velké auto'}
                      </span>
                      {previewDays.filter((x) => x.date === d.date && x.isKachna === d.isKachna).length > 1 && (
                        <span className="px-1.5 py-0.5 rounded-full text-udaj font-black bg-neutral-100 text-neutral-800">{d.zavozCislo}. závoz</span>
                      )}
                    </span>
                    <span className="text-udaj font-bold text-neutral-500">{d.stopsCount} zastávek</span>
                  </div>
                  <div className="text-udaj text-neutral-600 font-medium leading-snug">{d.routeTo}</div>
                  {!!d.priplatekKm && (
                    <div className="text-udaj text-sky-800 bg-sky-50 border border-sky-200 rounded px-2 py-1 font-semibold leading-snug">
                      V km je příplatek +{d.priplatekKm} km za jízdu do města ({(d.mesta ?? []).join(', ')}).
                    </div>
                  )}
                  {d.missingCoords.length > 0 && (
                    <div className="text-udaj text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-semibold leading-snug">
                      <AlertTriangle className="ikona-text" /> Chybí souřadnice u: {d.missingCoords.join(', ')} — tahle zastávka se do km nezapočítala, doplň souřadnice v Odběratelích nebo km uprav ručně.
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 shrink-0">
                      <input
                        type="checkbox"
                        checked={d.isKachna}
                        onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, isKachna: e.target.checked } : r))}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500"
                      />
                      <Bird className="ikona-text" /> Kachna
                    </label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      min={0}
                      step="0.1"
                      inputMode="decimal"
                      className="input !py-1.5 flex-1 font-mono font-bold text-xs"
                      placeholder="km za tento den"
                      value={d.km}
                      onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, km: e.target.value.replace(/[^0-9.]/g, '') } : r))}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="lista-akci pt-3 border-t border-neutral-100">
              <button type="button" onClick={() => setAutoStep('form')} className="btn-ghost">
                <ChevronLeft className="ikona-text" /> Zpět
              </button>
              <button type="button" onClick={handleGenerateFromPreview} className="btn-primary">
                <Zap size={16} />
                <span>Vygenerovat {previewDays.length} jízd</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
