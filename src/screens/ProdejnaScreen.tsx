import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerName, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Modal, Spinner } from '../components/ui';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ProdejnaFromImage } from '../components/ProdejnaFromImage';
import { posledniRucniZapis } from '../lib/posledniZapis';
import { BarChart3, CalendarDays, Camera, Check, ClipboardList, Package as PackageIcon, Pencil, PenLine, RotateCcw, Store, Trash2, X, type LucideIcon } from 'lucide-react';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';
import { TapReservationModal } from '../components/TapReservationModal';
import { detectTapType } from '../lib/tapReservations';
import { BeerTileGrid, TileTotalBar } from '../components/BeerTileGrid';
import { DnesUlozeno, KrokoveZadavani, type KrokDef } from '../components/KrokoveZadavani';
import { rychleHodnoty } from '../lib/krokoveZadavani';
import { dnesPodleObalu, objemObalu } from '../lib/dnesUlozeno';
import { chyba, potvrd, toastZpet } from '../lib/toast';
import { jeMesicUzamcen } from '../lib/mesicUzamcen';
import { ZNACKA_V_POCITANI, jeVPocitani } from '../lib/stockLedger';
import { podezreleMnozstvi } from '../lib/kontrolaZadani';
import { zavibruj } from '../lib/haptika';
import { klicVyberu, nactiNaposled, zapamatujVyber, serazPodleNaposled } from '../lib/naposledyPouzite';
import { usePosledniNacteni, prvniChyba } from '../lib/nacitani';
import { FotkyZaznamu } from '../components/FotkyZaznamu';
import { smaz } from '../lib/uloziste';
import { platneDatum, radkyZKonceptu, useRozepsanyZapis } from '../lib/rozepsanyZapis';
import RozepsanyZapisPruh from '../components/RozepsanyZapisPruh';
import { businessDateISO } from '../lib/businessDate';
import { ChipyPiva } from '../components/FiltrPivaAObalu';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';
import RadkyZFotkyPoDnech from '../components/RadkyZFotkyPoDnech';
import { jizZapsane, mesiceDnu, otazkaJizZapsano, otazkaUzamcenychMesicu, platnyDen, rozdelPodleDnu } from '../lib/zapisPoDnech';

// Tři podoby jednoho výdeje ze skladu — formulář je pořád stejný, mění se
// jen tabulka, do které se zapisuje, a jedno pole navíc. Podle toho se pak
// zápis dostane do správného listu měsíčního exportu:
//   fasovani_private → „Fasování prodejna"
//   fasovani         → „Odběr personál"
//   writeoffs        → „Vzorky promo a PR"
//
// Pojmenované jsou podle toho, KAM výdej jde, ne podle názvu tabulky —
// fasovani_private je historicky prodejna, ne personál.
const DRUHY_VYDEJE = [
  {
    tabulka: 'fasovani_private', stranka: 'prodejna', popis: 'Prodejna', kde: 'v prodejně',
    poleNavic: null, popisek: '', napoveda: '',
  },
  {
    tabulka: 'fasovani', stranka: 'fasovani', popis: 'Personál', kde: 've fasování personálu',
    poleNavic: 'jmeno', popisek: 'Pro koho',
    napoveda: 'Jméno — komu se fasuje',
  },
  {
    tabulka: 'writeoffs', stranka: 'writeoffs', popis: 'Odpis', kde: 'v odpisu',
    poleNavic: 'duvod', popisek: 'Důvod odpisu',
    napoveda: 'Proč se odepisuje (zkažené, rozbitá láhev…)',
  },
] as const;

/** Nastavení právě zvoleného druhu výdeje. */
const druhVydeje = (tabulka: string) =>
  DRUHY_VYDEJE.find((d) => d.tabulka === tabulka) ?? DRUHY_VYDEJE[0];

const ROW_COUNT = 12;
const FASOVANI_ROW_COUNT = 6;
type RowInput = { beerId: string; pkgId: string; qty: string; vycep: boolean; who?: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '', vycep: false, who: '' });
const emptyRows = (count: number): RowInput[] => Array.from({ length: count }, emptyItem);
// Řádek z fotky z víc dnů — vždy s vlastním dnem (lib/zapisPoDnech.ts). Drží se zvlášť
// od formuláře (ten má jedno datum) a ukládá se společně s ním.
type RadekFoto = RowInput & { datum: string };
const emptyFoto = (): RadekFoto => ({ ...emptyItem(), datum: '' });
/** Řádky z fotky z uloženého konceptu: jen s existujícím dnem. */
const radkyFotaZKonceptu = (v: unknown): RadekFoto[] =>
  radkyZKonceptu(v, emptyFoto, 0).filter((r) => platnyDen(r.datum) !== null);

// 💾 Co se z rozepsaného výdeje ukládá do zařízení (klíč `rozdelany_vydej_<tabulka>`,
// tvar zůstal stejný jako dřív, ať se koncepty z předchozí verze vrátí).
type KonceptVydeje = { entryRows: RowInput[]; who: string; note: string; date: string; fotoDny?: RadekFoto[] };
const jeCoVydej = (d: KonceptVydeje) =>
  d.entryRows.some((r) => r.pkgId && Number(r.qty) > 0) || (d.fotoDny ?? []).some((r) => r.pkgId && Number(r.qty) > 0)
  || d.who.trim() !== '' || d.note.trim() !== '';
const jePlatnyKonceptVydeje = (d: unknown): d is KonceptVydeje => {
  const o = d as Partial<KonceptVydeje> | null;
  return !!o && Array.isArray(o.entryRows) && typeof (o.who ?? '') === 'string' && typeof (o.note ?? '') === 'string';
};

export default function ProdejnaScreen({ setPage, mode = 'all', table = 'fasovani_private', title = 'Fasování', Ikona = Store, showVycep = false }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all'; table?: string; title?: string; Ikona?: LucideIcon; showVycep?: boolean } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  /** Proč se nenačetlo — aby se selhání nepletlo s „nic tu není". */
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  /** Hlídá, že starší odpověď nepřepíše novější (viz load níž). */
  const zacniNacteni = usePosledniNacteni();
  // 🔁 Naposledy použitá piva jdou v dlaždicích dopředu (viz
  // lib/naposledyPouzite.ts). Zbytek zůstává v pořadí číselníku.
  //
  // Klíč je tady podle DRUHU VÝDEJE (fasování / odpis / prodejna), ne podle
  // uživatele: tuhle obrazovku obsluhuje pár lidí ze společného tabletu a
  // odpisují se jiná piva než se fasují — dělení podle druhu výdeje proto
  // pomůže víc než dělení podle toho, kdo je právě přihlášený.
  const klicPiv = klicVyberu('vydej', table);
  const [naposledPiva, setNaposledPiva] = useState<string[]>(() => nactiNaposled(klicPiv));

  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  // Jen pro varování „tenhle měsíc je už napočítaný" (lib/mesicUzamcen.ts) —
  // stejná pojistka jako ve Stáčení KEG a Lahvích, viz add() níž.
  const [inventoryRows, setInventoryRows] = useState<{ entry_date: string; note: string | null }[]>([]);

  const [date, setDate] = useState(businessDateISO());
  const [who, setWho] = useState('');
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(() => emptyRows(table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT));
  // Řádky z fotky z víc dnů (každý na svém dni) — viz RadekFoto výše.
  const [fotoDny, setFotoDny] = useState<RadekFoto[]>([]);

  // 💾 Rozepsaný zápis přežije zavření aplikace i odchod z obrazovky.
  // Na telefonu se z appky vypadne kdykoli — přijde hovor, přepne se okno,
  // systém ji uspí. Dřív se tím rozdělaný výdej ztratil a člověk počítal
  // znovu. Drží se zvlášť pro každý druh výdeje, ať si personál a odpis
  // nepřepisují rozdělanou práci navzájem. Vrací se i s upozorněním a jde ho
  // zahodit (lib/rozepsanyZapis.ts); mizí po uložení nebo „Vymazat vše".
  const klicRozdelane = `rozdelany_vydej_${table}`;
  const pocetRadku = table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT;
  const { obnoveno: obnovenyKoncept } = useRozepsanyZapis<KonceptVydeje>({
    klic: klicRozdelane,
    data: { entryRows, who, note, date, fotoDny },
    jeCo: jeCoVydej,
    jePlatny: jePlatnyKonceptVydeje,
    naObnovu: (d) => {
      setEntryRows(radkyZKonceptu(d.entryRows, emptyItem, pocetRadku));
      setFotoDny(radkyFotaZKonceptu(d.fotoDny));
      setWho(typeof d.who === 'string' ? d.who : '');
      setNote(typeof d.note === 'string' ? d.note : '');
      const den = platneDatum(d.date);
      if (den) setDate(den);
    },
  });
  /** „Vymazat vše" a „Zahodit": rozepsané pryč (uložené zápisy se nemění). */
  function vymazRozepsane() { setEntryRows(emptyRows(pocetRadku)); setFotoDny([]); setWho(''); setNote(''); setErr(null); }
  async function vymazVse() {
    if (jeCoVydej({ entryRows, who, note, date, fotoDny })
      && !(await potvrd('Smazat všechny rozepsané řádky? Nic uloženého v databázi se nemění.', { titulek: 'Vymazat rozepsané', potvrdit: 'Vymazat' }))) return;
    vymazRozepsane();
  }
  // Vrácení na sklad (odfasování) — zapisuje se záporným množstvím.
  const [vraceni, setVraceni] = useState(false);
  const [expandedProdejnaBeerId, setExpandedProdejnaBeerId] = useState<string | null>(null);
  const expandedProdejnaBeer = beers.find((b) => b.id === expandedProdejnaBeerId) ?? null;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);

  // Zápis / Přehled záložky
  const [tab, setTab] = useState<'zapis' | 'prehled'>('zapis');

  // Filtry v Přehledu — druh (pivo), jméno (kdo) a měsíc; výchozí je aktuální měsíc.
  const [overviewMonth, setOverviewMonth] = useState(businessDateISO().slice(0, 7));
  const [overviewBeerId, setOverviewBeerId] = useState('');
  const [overviewWho, setOverviewWho] = useState('');

  // 🚰 Rezervace výčepu — stav pro modální okno
  const [showTapModal, setShowTapModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [tapModalRowIndex, setTapModalRowIndex] = useState<number | undefined>(undefined);

  // Prodejna nemá pole navíc; personál má jméno, odpis důvod.
  const druh = druhVydeje(table);
  const showWhoColumn = druh.poleNavic !== null;

  const filteredRows = useMemo(() => {
    const whoNeedle = overviewWho.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (overviewMonth && !(r.entry_date ?? '').startsWith(overviewMonth)) return false;
        if (overviewBeerId && r.beer_id !== overviewBeerId) return false;
        if (whoNeedle && !getRowWho(r).toLowerCase().includes(whoNeedle)) return false;
        return true;
      })
      .sort((a, b) => {
        const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
        if (dateCmp !== 0) return dateCmp;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });
  }, [rows, overviewMonth, overviewBeerId, overviewWho]);

  // Souhrn zapisovaných řádků
  const rowsSummary = useMemo(() => {
    let totalQty = 0;
    let totalL = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) { totalQty += n; totalL += n * Number(pkg.volume_l); }
    });
    return { totalQty, totalL };
  }, [entryRows, packages]);

  // Prodejna = lahve + sudy (lahve na začátku)
  const ALLOWED_PKG_VOLUMES = [50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33];
  const shopPackages = useMemo(() => {
    const allowed = (p: Package) => ALLOWED_PKG_VOLUMES.includes(Number(p.volume_l));
    const bottles = packages.filter((p) => p.kind === 'bottle' && allowed(p)).sort((a, b) => b.volume_l - a.volume_l);
    const kegs = packages.filter((p) => p.kind === 'keg' && allowed(p)).sort((a, b) => b.volume_l - a.volume_l);
    return [...bottles, ...kegs];
  }, [packages]);

  // 🔢 Pět nejčastějších počtů pro pivo v panelu — pro každý obal zvlášť, z
  // historie téhle tabulky (fasování, prodejna a odpis mají každé svou).
  // Bez historie se nabídne 5 a 12 (přepravka po dvanácti, 12. 10. 2026);
  // u odpisu jen 5, dvanáctka by tam nedávala smysl.
  const rychleMapa = useMemo(() => {
    const out = new Map<string, number[]>();
    if (!expandedProdejnaBeerId) return out;
    for (const p of shopPackages) out.set(p.id, rychleHodnoty(rows, expandedProdejnaBeerId, p.id, table === 'writeoffs' ? [5] : [5, 12]));
    return out;
  }, [expandedProdejnaBeerId, shopPackages, rows, table]);

  // 🚶 Krokové zadávání (29. 10. 2026): nahoře obal (lahve, pod nimi sudy),
  // pak počet a pět nejčastějších čísel. Píše stejné řádky entryRows jako dřív.
  function krokVydej(beer: Beer): KrokDef {
    const zadano = (id: string) => tileQtyFor(beer.id, id);
    return {
      stitek: 'Kolik kusů',
      otazka: 'Kolik kusů?',
      obaly: shopPackages.map((p) => ({ id: p.id, label: objemObalu(p), skupina: p.kind === 'keg' ? 'Sudy' : 'Lahve' })),
      jednotka: (o) => `ks ${o.label}`,
      mnozstvi: zadano,
      nastav: (id, n) => setTileRow(beer.id, id, { qty: n > 0 ? String(n) : '' }),
      rychle: (id) => rychleMapa.get(id) ?? [],
      vychozi: shopPackages.find((p) => zadano(p.id) > 0)?.id ?? shopPackages[0]?.id,
      dalsiText: '+ další obal',
    };
  }

  /**
   * Poslední načtení vyhrává a selhání se pozná od prázdna.
   *
   * ⚠️ Tohle se ZTRATILO při slučování 8. 9. 2026 — import v hlavičce zůstal,
   * ale použití zmizelo, takže se dvě věci tiše vrátily: selhané načtení se
   * tvářilo jako „zatím žádné záznamy" a pomalejší odpověď mohla přepsat
   * novější. Odhaleno až auditem; ESLint to hlásil jen jako nepoužitý import
   * (varování), takže to prošlo přes všechny kontroly.
   */
  async function load(silent = false) {
    const smiZapsat = zacniNacteni();
    if (!silent && !rows.length) setLoading(true);
    const [fp, b, p, inv] = await Promise.all([
      supabase.from(table).select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      // Jen entry_date + note — na víc se `jeMesicUzamcen` neptá (viz add() níž).
      // fetchAllRows, ne supabase.from přímo: inventory roste přes 1000
      // řádků a Supabase by zbytek tiše ořízl (viz strankovaniDotazu.test.ts).
      nactiSdilenouTabulku('inventory'),
    ]);
    if (!smiZapsat()) return;
    setChybaNacteni(prvniChyba(fp, b, p));
    setRows((fp.data as EntryRow[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (inv.data) setInventoryRows(inv.data as { entry_date: string; note: string | null }[]);
    setLoading(false);
  }
  // Přepnutí druhu výdeje mění tabulku, ze které se čte. Komponenta se přitom
  // schválně NEodmountuje (viz App.tsx), aby se neztratily rozepsané řádky —
  // proto se musí načíst znovu podle table, jinak by v přehledu zůstal
  // seznam z předchozí tabulky.
  useEffect(() => { load(); }, [table]);
  useRealtime([table, 'beers', 'packages', 'inventory'], () => load(true));


  // Zadávání přes dlaždice piv: čte/zapisuje do stejného pole entryRows (fixní
  // řádky) jako tabulka níže — najde existující řádek pro dané pivo+obal, jinak
  // použije první prázdný slot. Tabulka pod dlaždicemi zůstává pro ruční úpravy
  // (např. rozdělení stejného piva/obalu mezi dvě různé osoby).
  function tileQtyFor(beerId: string, pkgId: string): number {
    const row = entryRows.find((r) => r.beerId === beerId && r.pkgId === pkgId);
    return row ? Number(row.qty || 0) : 0;
  }
  function setTileRow(beerId: string, pkgId: string, patch: Partial<RowInput>) {
    setEntryRows((rs) => {
      const idx = rs.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
      if (idx >= 0) return rs.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      const emptyIdx = rs.findIndex((r) => !r.beerId && !r.pkgId);
      const base: RowInput = { ...emptyItem(), beerId, pkgId };
      if (emptyIdx >= 0) return rs.map((r, i) => (i === emptyIdx ? { ...base, ...patch } : r));
      return [...rs, { ...base, ...patch }];
    });
  }

  function getRowWho(r: EntryRow) {
    if (r.who) return r.who;
    if (r.note) {
      const match = r.note.match(/^\[(.*?)\]/);
      if (match) return match[1];
    }
    return '—';
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    // Kontroluje se i PIVO, ne jen obal a množství. Bez piva se sice záznam
    // uložil a byl vidět v seznamu, ale VŠECHNY skladové výpočty ho přeskočí
    // (filtrují `if (!beer_id || !package_id) return`) — pivo se tedy nikdy
    // neodečetlo ze skladu a nikdo nezjistil proč.
    const rozepsane = entryRows.filter((r) => r.pkgId || Number(r.qty) > 0 || r.beerId);
    const bezPiva = rozepsane.filter((r) => !r.beerId && (r.pkgId || Number(r.qty) > 0));
    if (bezPiva.length > 0) {
      setErr('U každého vyplněného řádku vyberte pivo — bez něj by se záznam neodečetl ze skladu.');
      return;
    }
    // Zapisuje se formulář (na jeho datum) a řádky z fotky po dnech (každý na svůj den).
    const radekKZapisu = (r: RowInput) => !!r.beerId && !!r.pkgId && Number(r.qty) > 0;
    const zFotky = fotoDny.filter((r) => radekKZapisu(r) && platnyDen(r.datum) !== null);
    const filled: RadekFoto[] = [
      ...entryRows.filter(radekKZapisu).map((r) => ({ ...r, datum: date })),
      ...zFotky,
    ];
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (pivo, obal a množství).'); return; }

    // 🔒 Zápis do měsíce, který je už napočítaný (fyzická/schválená
    // inventura), nezakazujeme — legitimní dodatečná oprava se stát může —
    // ale nahlas na to upozorníme. Dřív měla tuhle pojistku jen Stáčení KEG
    // a Lahve; výdej a odpis hýbou skladem stejně, takže stejně tiše
    // rozjížděly už uzavřený měsíc (viz lib/mesicUzamcen.ts). Řádky z fotky
    // mohou padat do víc měsíců — ptá se jednou, s výčtem všech.
    const uzamcene = mesiceDnu(filled.map((r) => r.datum)).filter((m) => jeMesicUzamcen(inventoryRows, `${m}-01`));
    if (uzamcene.length > 0) {
      if (!(await potvrd(otazkaUzamcenychMesicu(uzamcene), { titulek: 'Měsíc je už napočítaný', potvrdit: 'Ano, zapsat' }))) return;
    }

    // 🧾 Řádky z fotky: den + pivo + obal, který už v tomhle výdeji je, se po druhém
    // načtení téže fotky zapíšou podruhé. Neblokuje, jen se na to nahlas upozorní.
    const dvakrat = jizZapsane(zFotky, rows);
    if (dvakrat.length > 0) {
      const popisek = (beerId: string, pkgId: string) =>
        `${beers.find((b) => b.id === beerId)?.name ?? 'Pivo'} · ${packages.find((p) => p.id === pkgId)?.label?.trim() ?? 'obal'}`;
      if (!(await potvrd(otazkaJizZapsano(dvakrat, druh.kde, popisek), { titulek: 'Možné zdvojení', potvrdit: 'Ano, zapsat i tak' }))) return;
    }

    // Přehmat o řád (12 → 120) — stejná pojistka jako ve Stáčení KEG
    // a v Lahvích. Výdej a odpis hýbou skladem úplně stejně, takže tady
    // chyběla bez důvodu. Neblokuje: velká akce je legitimní, jen se zeptá.
    for (const r of filled) {
      const historie = rows
        .filter((x) => x.beer_id === r.beerId && x.package_id === r.pkgId)
        .map((x) => Number(x.quantity || 0));
      const popis = `${beers.find((b) => b.id === r.beerId)?.name ?? 'Pivo'} · ${packages.find((p) => p.id === r.pkgId)?.label ?? 'obal'}`;
      const dotaz = podezreleMnozstvi(Number(r.qty), historie, popis);
      if (dotaz && !(await potvrd(dotaz, { titulek: 'Zkontrolujte množství', potvrdit: 'Ano, uložit' }))) return;
    }

    setSaving(true);

    // Tabulka `writeoffs` nemá sloupec `note` (jen `who` a `reason`) — na
    // rozdíl od bottling/kegging/fasovani. Nepodmíněné poslání `note` klíče
    // v payloadu shodilo KAŽDÝ zápis na Odpisu s PGRST204 ("Could not find
    // the 'note' column"), tiše (chyba se sice zobrazila v `err`, ale
    // vypadalo to jako obecná porucha) — tady ho proto vynecháváme.
    const isWriteoffs = table === 'writeoffs';
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      const person = r.who?.trim() || who.trim();
      return {
        entry_date: r.datum,
        who: person || null,
        beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        // Vrácení na sklad = ZÁPORNÝ řádek do téže tabulky. Původní výdej se
        // nemaže: co se vydalo, se doopravdy vydalo, a smazáním by se ztratila
        // stopa (a rozházel měsíc, který už může být napočítaný).
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: vraceni ? -n : n,
        ...(isWriteoffs ? {} : { note: (vraceni ? (note ? `Vráceno na sklad — ${note}` : 'Vráceno na sklad') : note) || null }),
      };
    });

    // `.select('id')` je tu kvůli „Vrátit zpět" níž: bez id se řádek ke
    // smazání dohledával podle data, piva, obalu a počtu — a smazal cizí
    // zápis, když ten den někdo zapsal totéž. Viz komentář u toastZpet.
    let { data: vlozene, error } = await supabase.from(table).insert(payloads).select('id');
    if (error && (error.message?.includes("'who'") || error.message?.includes("who"))) {
      const fallbackPayloads = filled.map((r) => {
        const beer = beers.find((b) => b.id === r.beerId);
        const pkg = packages.find((p) => p.id === r.pkgId);
        const n = Number(r.qty);
        const person = r.who?.trim() || who.trim();
        const combinedNote = person ? (note ? `[${person}] ${note}` : `[${person}]`) : note;
        return {
          entry_date: r.datum,
          beer_id: r.beerId || null, beer_name: beer?.name ?? null,
          package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: vraceni ? -n : n,
          ...(isWriteoffs ? {} : { note: (vraceni ? (combinedNote ? `Vráceno na sklad — ${combinedNote}` : 'Vráceno na sklad') : combinedNote) || null }),
        };
      });
      const res = await supabase.from(table).insert(fallbackPayloads).select('id');
      vlozene = res.data;
      error = res.error;
    }

    setSaving(false);
    if (error) { setErr(error.message); return; }

    setEntryRows(emptyRows(table === 'fasovani' ? FASOVANI_ROW_COUNT : ROW_COUNT)); setFotoDny([]); setWho(''); setNote(''); setErr(null);
    // Po uložení zpátky na výdej — vrácení je výjimka, ne režim, ve kterém
    // se pracuje. Jinak by další zápis nenápadně odečetl místo přičetl.
    setVraceni(false);
    try { smaz(klicRozdelane); } catch { /* uklizeno i tak */ }
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);

    // ↩️ Vrátit zpět i po ULOŽENÍ, ne jen po smazání. Nebezpečný překlep je
    // ten, který něco PŘIDÁ — omylem uložený výdej odečte pivo ze skladu
    // a najde se to až u inventury.
    //
    // ⚠️ Maže se podle ID vloženého řádku, NIKDY podle hodnot. Dohledávání
    // podle data, piva, obalu a počtu bralo vždy nejnovější odpovídající
    // řádek — takže když ten den vydali dva lidé stejné pivo ve stejném
    // obalu ve stejném počtu (u desítky v 50l KEGu běžné), „vrátit zpět"
    // smazalo zápis toho druhého. Hlídá to test v pravidlaObrazovek.ts.
    const idVlozenych = ((vlozene as { id: string }[]) ?? []).map((v) => v.id);
    const kusuCelkem = filled.reduce((a, r) => a + Number(r.qty), 0);
    if (idVlozenych.length > 0) {
      toastZpet(
        `Uloženo ${filled.length} ${filled.length === 1 ? 'řádek' : 'řádky'} — ${kusuCelkem} ks.`,
        async () => {
          const { error: chybaMazani } = await supabase.from(table).delete().in('id', idVlozenych);
          if (chybaMazani) throw chybaMazani;
          load(true);
        },
      );
    }
  }

  async function del(id: string) {
    const row = rows.find((r) => r.id === id);
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { chyba(error); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    load(true);
    if (!row) return;

    zavibruj('odskrtnuto');
    toastZpet(
      `Smazáno: ${row.beer_name ?? 'pivo'} ${row.package_label ?? ''} × ${row.quantity} ks`,
      async () => {
        // Zapisuje se zpátky do TÉŽE tabulky, ze které se mazalo — kdyby se
        // mezitím přepnul druh výdeje, řádek by jinak skončil jinde.
        const { error: chybaVraceni } = await supabase.from(table).insert(row);
        if (chybaVraceni) throw chybaVraceni;
        load(true);
      },
    );
  }

  /**
   * ↩️ Odfasovat jeden už uložený zápis — kusy se vrátí na sklad.
   *
   * Zadání 22. 9. 2026 („u obchodu přidej možnost odfasovat objednávku
   * u fasování, vrátí ji do skladu"): dosud to šlo jen přepsat ručně —
   * v Zápisu zaškrtnout „Odfasovat" a znovu vyplnit pivo, obal a počet.
   * Tady stačí jedno klepnutí u toho zápisu, který se vrací.
   *
   * Zapisuje se ZÁPORNÝ protizápis DNEŠNÍM dnem, ne oprava ani smazání
   * původního řádku — stejné pravidlo jako u zaškrtávátka v Zápisu:
   * co se vydalo, se doopravdy vydalo, a přepsání by ztratilo stopu
   * a rozhýbalo měsíc, který je možná už napočítaný. Tlačítka −/+ u řádku
   * jsou na něco jiného: ta opravují PŘEKLEP v počtu (mění původní zápis).
   */
  async function odfasuj(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const ks = Number(row.quantity || 0);
    if (ks <= 0) return;
    const nazevPiva = row.beer_name ?? beers.find((b) => b.id === row.beer_id)?.name ?? 'pivo';
    const popis = `${nazevPiva} ${row.package_label ?? ''} × ${ks} ks`.replace(/\s+/g, ' ').trim();
    const dnes = businessDateISO();

    if (!(await potvrd(
      `Vrátit na sklad: ${popis}?\n\nPůvodní zápis z ${formatDate(row.entry_date)} zůstane, ` +
      `přibude k němu záporný řádek dneškem.`,
      { titulek: druh.tabulka === 'writeoffs' ? 'Vrátit na sklad' : 'Odfasovat', potvrdit: 'Ano, vrátit na sklad' },
    ))) return;

    // 🔒 Stejná pojistka jako u zápisu: vrácení hýbe skladem úplně stejně,
    // takže by jinak tiše rozjelo už uzavřený měsíc (lib/mesicUzamcen.ts).
    if (jeMesicUzamcen(inventoryRows, dnes)) {
      const dotaz =
        `Měsíc ${dnes.slice(0, 7)} už má napočítanou inventuru. Vrácení do něj teď ` +
        'změní číslo, které je už uzavřené a dorovnané.\n\nOpravdu vrátit na sklad?';
      if (!(await potvrd(dotaz, { titulek: 'Měsíc je už napočítaný', potvrdit: 'Ano, vrátit' }))) return;
    }

    const isWriteoffs = table === 'writeoffs';
    const kdo = getRowWho(row);
    const poznamka = `Vráceno na sklad — odfasováno ze zápisu z ${formatDate(row.entry_date)}`;
    const zaklad = {
      entry_date: dnes,
      beer_id: row.beer_id, beer_name: row.beer_name ?? nazevPiva,
      package_id: row.package_id, package_label: row.package_label ?? null,
      quantity: -ks,
    };
    // Sloupec `who` chybí v některých starších podobách tabulek — stejný
    // záchranný pokus jako v add(): při chybě na `who` se jméno přesune
    // do poznámky, ať se vrácení neztratí kvůli názvu sloupce.
    const sJmenem = {
      ...zaklad,
      ...(kdo && kdo !== '—' ? { who: kdo } : {}),
      ...(isWriteoffs ? {} : { note: poznamka }),
    };
    let { data: vlozene, error } = await supabase.from(table).insert(sJmenem).select('id');
    if (error && error.message?.includes('who')) {
      const res = await supabase.from(table).insert({
        ...zaklad,
        ...(isWriteoffs ? {} : { note: kdo && kdo !== '—' ? `[${kdo}] ${poznamka}` : poznamka }),
      }).select('id');
      vlozene = res.data;
      error = res.error;
    }
    if (error) { chyba(error); return; }

    zavibruj('odskrtnuto');
    load(true);

    const idVracenych = ((vlozene as { id: string }[]) ?? []).map((v) => v.id);
    if (idVracenych.length > 0) {
      toastZpet(`Vráceno na sklad: ${popis}`, async () => {
        const { error: chybaMazani } = await supabase.from(table).delete().in('id', idVracenych);
        if (chybaMazani) throw chybaMazani;
        load(true);
      });
    }
  }

  // ✏️ Úprava data a počtu uloženého záznamu (21. 10. 2026: „stočení z 23. dej na 20. 10.").
  const [presunZ, setPresunZ] = useState<string | null>(null);
  const [presunNa, setPresunNa] = useState('');
  const [upravovany, setUpravovany] = useState<EntryRow | null>(null);
  const [upravDatum, setUpravDatum] = useState('');
  const [upravKs, setUpravKs] = useState('');
  const [upravVPocitani, setUpravVPocitani] = useState(false);

  async function presunCelyDen() {
    const stary = (presunZ ?? '').slice(0, 10);
    const novy = presunNa.slice(0, 10);
    if (!platnyDen(stary) || !platnyDen(novy)) { chyba('Zadej platné datum.'); return; }
    if (stary === novy) { setPresunZ(null); return; }
    const ids = rows.filter((r) => (r.entry_date ?? '').slice(0, 10) === stary).map((r) => r.id);
    if (ids.length === 0) { chyba('V tom dni nic není.'); return; }
    const uzamcene = [stary, novy].filter((d) => jeMesicUzamcen(inventoryRows, d));
    if (uzamcene.length > 0) {
      const ok = await potvrd(
        `Měsíc ${[...new Set(uzamcene.map((d) => d.slice(0, 7)))].join(', ')} už má napočítanou inventuru. Přesun změní číslo, které je už uzavřené.\n\nOpravdu přesunout?`,
        { titulek: 'Měsíc je už napočítaný', potvrdit: 'Ano, přesunout' },
      );
      if (!ok) return;
    }
    const ok = await potvrd(
      `Přesunout všech ${ids.length} položek z ${formatDate(stary)} na ${formatDate(novy)}? Množství se nemění, mění se jen datum.`,
      { titulek: 'Změnit datum celého dne', potvrdit: 'Ano, změnit datum' },
    );
    if (!ok) return;
    const { error } = await supabase.from(table).update({ entry_date: novy }).in('id', ids);
    if (error) { chyba(error.message); return; }
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, entry_date: novy } : r)));
    setOverviewMonth(novy.slice(0, 7));
    setPresunZ(null);
  }

  function otevriUpravu(r: EntryRow) {
    setUpravovany(r);
    setUpravDatum((r.entry_date ?? '').slice(0, 10));
    setUpravKs(String(r.quantity));
    setUpravVPocitani(jeVPocitani(r.note));
  }

  async function ulozUpravu() {
    if (!upravovany) return;
    const ks = Math.round(Number(String(upravKs).replace(',', '.')));
    if (!platnyDen(upravDatum)) { chyba('Zadej platné datum.'); return; }
    if (!Number.isFinite(ks) || ks < 0) { chyba('Zadej počet kusů (0 nebo víc).'); return; }
    const puvodniDatum = (upravovany.entry_date ?? '').slice(0, 10);
    const bezZnacky = (upravovany.note ?? '').split(ZNACKA_V_POCITANI).join('').replace(/\s*·\s*$/, '').trim();
    const novaPoznamka = upravVPocitani ? [bezZnacky, ZNACKA_V_POCITANI].filter(Boolean).join(' · ') : bezZnacky;
    const poznamkaSeMeni = table !== 'writeoffs' && jeVPocitani(upravovany.note) !== upravVPocitani;
    if (upravDatum === puvodniDatum && ks === Number(upravovany.quantity) && !poznamkaSeMeni) { setUpravovany(null); return; }
    // Úprava do (nebo z) už napočítaného měsíce mění uzavřené číslo — nejdřív se zeptá.
    const uzamcene = [...new Set([puvodniDatum, upravDatum])].filter((d) => jeMesicUzamcen(inventoryRows, d));
    if (uzamcene.length > 0) {
      const ok = await potvrd(
        `Měsíc ${[...new Set(uzamcene.map((d) => d.slice(0, 7)))].join(', ')} už má napočítanou inventuru. Úprava změní číslo, které je už uzavřené.\n\nOpravdu upravit?`,
        { titulek: 'Měsíc je už napočítaný', potvrdit: 'Ano, upravit' },
      );
      if (!ok) return;
    }
    const zmena: Record<string, unknown> = { entry_date: upravDatum, quantity: ks };
    if (poznamkaSeMeni) zmena.note = novaPoznamka || null;
    const { error } = await supabase.from(table).update(zmena).eq('id', upravovany.id);
    if (error) { chyba(error); return; }
    setRows((rs) => rs.map((r) => (r.id === upravovany.id ? { ...r, entry_date: upravDatum, quantity: ks, ...(poznamkaSeMeni ? { note: novaPoznamka || null } : {}) } : r)));
    setUpravovany(null);
    load(true);
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from(table).update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
    load(true);
  }

  // Hlasový zápis: přepis se rozparsuje a naplní se první volné prázdné řádky.
  function handleVoiceResult(text: string) {
    const parsed = parseFreeTextEntries(text, beers, packages, aliasMap);
    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar 0.5".'); return; }
    setEntryRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) break;
        next[cursor] = { beerId: p.beer_id ?? '', pkgId: p.package_id ?? '', qty: p.quantity != null ? String(p.quantity) : '', vycep: false };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }

  /**
   * 📷 Řádky přečtené z fotky (a zkontrolované nad ní) se doplní do formuláře.
   *
   * Do 22. 9. 2026 sem z fotky chodil TEXT, který se znovu rozebíral parserem
   * zkratek — tedy dvojí překlad a dvojí ztráta („četlo to špatně“). Teď
   * chodí rovnou pivo, obal a počet spárované s katalogem
   * (lib/fotkaPolozky.ts), takže se nic nepřekládá znovu.
   *
   * Plní se do prvních volných řádků; když jich je málo, formulář se
   * prodlouží, ať se nic nezahodí.
   */
  // 📊 Čtení tabulky z fotky začíná dnem po posledním ručním zápisu tohoto druhu výdeje.
  const posledniZapisVydeje = useMemo(() => posledniRucniZapis(rows), [rows]);

  function handlePhotoRows(vsechnyRadky: { beerId: string; pkgId: string; qty: string; datum?: string | null }[], datum?: string) {
    if (!vsechnyRadky.length) return;
    // Z víc dnů tabulky (16. 10. 2026) se řádky s dnem odloží do seznamu po dnech —
    // každý se zapíše na svůj den. Z jednoho dne (nebo ze seznamu / zprávy) jdou
    // do formuláře jako dosud (lib/zapisPoDnech.ts rozdelPodleDnu).
    const { formular: rows, poDnech } = rozdelPodleDnu(vsechnyRadky);
    if (poDnech.length > 0) {
      setFotoDny((prev) => [...prev, ...poDnech.map((r) => ({ beerId: r.beerId, pkgId: r.pkgId, qty: r.qty, vycep: false, who: '', datum: r.datum as string }))]);
    }
    // Čtení tabulky z Excelu ví, z jakého dne řádky jsou — zápis dostane stejné datum.
    // Samé řádky po dnech datum formuláře nemění (každý nese svůj den).
    if (datum && (rows.length > 0 || poDnech.length === 0)) setDate(datum);
    setEntryRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const r of rows) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        const novy: RowInput = { beerId: r.beerId, pkgId: r.pkgId, qty: r.qty, vycep: false, who: '' };
        if (cursor >= next.length) next.push(novy);
        else next[cursor] = novy;
        cursor++;
      }
      return next;
    });
    setErr(null);
  }

  function handleTapModalDone() {
    setShowTapModal(false);
    setTapModalRowIndex(undefined);
  }

  function formatDate(d: string | null | undefined) {
    if (!d) return '—';
    const parts = d.split('-');
    if (parts.length < 3) return d;
    return `${parts[2]}.${parts[1]}.`;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Nadpis obrazovky tu ZÁMĚRNĚ NENÍ. Byl v samostatném rámečku pod
          horní lištou, takže „Fasování" stálo na obrazovce dvakrát pod sebou
          a rámeček navíc sebral řádek. Jméno obrazovky nese horní lišta
          (s hledáním a zelenou tečkou připojení) — stejně jako u KEG a Lahví. */}

      {/* Záložky: Zápis / Přehled */}
      <div className="flex items-center gap-1 bg-white p-1 rounded border border-neutral-200 shadow-2xs w-fit">
        <button
          type="button"
          onClick={() => setTab('zapis')}
          className={`px-4 py-1.5 rounded text-xs font-black transition ${tab === 'zapis' ? 'bg-neutral-700 text-white shadow-xs' : 'bg-white text-neutral-900 hover:bg-neutral-100'}`}
        >
          <PenLine className="ikona-text" /> Zápis
        </button>
        <button
          type="button"
          onClick={() => setTab('prehled')}
          className={`px-4 py-1.5 rounded text-xs font-black transition ${tab === 'prehled' ? 'bg-neutral-700 text-white shadow-xs' : 'bg-white text-neutral-900 hover:bg-neutral-100'}`}
        >
          <BarChart3 className="ikona-text" /> Přehled
        </button>
      </div>

      {/* ===== ZÁPIS ===== */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card px-2 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20' : ''}`}>
          <RozepsanyZapisPruh obnoveno={obnovenyKoncept} onZahodit={vymazRozepsane} className="mb-3" />
          {/* Kam výdej jde. Je to pořád tentýž formulář — podle volby se mění
              jen tabulka, do které se zapisuje, a jedno pole navíc. Sedí to
              hned nad tím polem, aby bylo vidět, co volba způsobí. */}
          {setPage && mode === 'all' && (
            <div className="mb-4">
              <label className="label">Kam se vydává</label>
              <div className="grid grid-cols-3 gap-2">
                {DRUHY_VYDEJE.map((d) => {
                  const zvoleno = d.tabulka === table;
                  return (
                    <button
                      key={d.tabulka}
                      type="button"
                      onClick={() => { if (!zvoleno) { zavibruj('klik'); setPage(d.stranka); } }}
                      aria-pressed={zvoleno}
                      className={`min-h-[52px] px-3 rounded border-2 font-black text-sm transition inline-flex items-center justify-center gap-2 ${
                        zvoleno
                          ? 'bg-amber-500 border-amber-600 text-neutral-950 shadow-xs'
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 ${
                          zvoleno ? 'bg-neutral-950 border-neutral-950 text-amber-400' : 'border-neutral-300'
                        }`}
                      >
                        {zvoleno ? <Check size={12} strokeWidth={4} /> : null}
                      </span>
                      {d.popis}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 items-end mb-2">
            <div>
              <label className="label">Datum všech řádků</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              <p className="text-[11px] font-bold text-neutral-500 mt-1">Tímhle dnem se zapíšou všechny řádky formuláře. Už uložený den se mění v Přehledu.</p>
            </div>
            {showWhoColumn && (
              <div>
                <label className="label">{druh.popisek}</label>
                <input
                  type="text"
                  className="input"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder={druh.napoveda}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <span className="text-xs font-bold text-neutral-600 bg-neutral-100 rounded px-3 py-2">
              <PackageIcon className="ikona-text" /> {rowsSummary.totalQty} ks · {rowsSummary.totalL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L
            </span>
            {/* Rezervace výčepu patří sem, ne k jednotlivým obalům: rezervuje
                se výčep, ne konkrétní velikost sudu, a u každého obalu to jen
                zabíralo místo a otevíralo dialog omylem. */}
            {showVycep && (
              <button
                type="button"
                onClick={() => { setTapModalRowIndex(undefined); setShowTapModal(true); }}
                className="btn-ghost !text-xs"
              >
                Rezervovat výčep
              </button>
            )}
          </div>

          <TileTotalBar label="Zatím zapsáno" value={`${rowsSummary.totalQty} ks · ${rowsSummary.totalL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L`} />
          <div className="mb-2">
            <span className="text-[11px] text-neutral-400 font-medium">klepni na dlaždici a zadej obaly a množství</span>
          </div>
          <div className="mb-4">
            {loading ? (
              <div className="grid grid-cols-3 gap-2" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <button key={i} type="button" disabled className="min-h-[52px] rounded bg-neutral-200 text-neutral-600 text-sm font-black">
                    načítám
                  </button>
                ))}
              </div>
            ) : (
            <BeerTileGrid
              beers={serazPodleNaposled(beers.filter((b) => b.is_active), (b) => b.id, naposledPiva)}
              onSelect={(b) => { setNaposledPiva(zapamatujVyber(klicPiv, b.id)); setExpandedProdejnaBeerId(b.id); }}
              summaryFor={(b) => {
                const beerRows = entryRows.filter((r) => r.beerId === b.id && Number(r.qty) > 0);
                const label = beerRows
                  .map((r) => {
                    const pkg = packages.find((p) => p.id === r.pkgId);
                    return pkg ? `${r.qty}×${Math.round(Number(pkg.volume_l) * 100) / 100}` : null;
                  })
                  .filter(Boolean)
                  .join(', ');
                return { filled: beerRows.length > 0, label };
              }}
            />
            )}
          </div>

          {expandedProdejnaBeer && (
            <KrokoveZadavani
              key={expandedProdejnaBeer.id}
              beer={expandedProdejnaBeer}
              podtitul={`${title}${vraceni ? ' · vrácení na sklad' : ''}`}
              onZavrit={() => setExpandedProdejnaBeerId(null)}
              den={date === businessDateISO() ? 'dnes' : date}
              dnes={dnesPodleObalu(rows, date, packages).filter((p) => p.beerId === expandedProdejnaBeer.id)}
              kroky={[krokVydej(expandedProdejnaBeer)]}
              hlavickaVpravo={showWhoColumn ? (
                /* „Pro koho" patří do lišty, ne k jednotlivým obalům: fasuje se
                   jednomu člověku najednou. */
                <input
                  type="text"
                  className="min-w-0 flex-1 px-2 py-1.5 rounded bg-white/90 border border-black/10 text-sm font-bold text-neutral-900 placeholder:font-medium placeholder:text-neutral-500"
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder={druh.popisek}
                  aria-label={druh.popisek}
                />
              ) : undefined}
            />
          )}

          {/* Souhrn zapsaných položek — jen ke čtení, úprava se dělá kliknutím na dlaždici výše. */}
          {entryRows.some((r) => r.pkgId && Number(r.qty) > 0) && (
            <div className="rounded border border-neutral-200 bg-white p-3 space-y-1.5 mb-4">
              <div className="text-[11px] font-black uppercase tracking-wider text-neutral-500 mb-1">Zapsáno</div>
              {entryRows.filter((r) => r.pkgId && Number(r.qty) > 0).map((r, i) => {
                const beer = beers.find((b) => b.id === r.beerId);
                const pkg = packages.find((p) => p.id === r.pkgId);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs font-bold text-neutral-800 py-1.5 border-b border-neutral-100 last:border-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                      <span className="truncate">{beerName(beer)} {pkg ? `· ${formatPackageLabel(pkg.label)}` : ''}</span>
                      {showWhoColumn && r.who && <span className="text-neutral-400 font-medium shrink-0">· {r.who}</span>}
                    </span>
                    <span className="font-black text-emerald-700 shrink-0">{r.qty} ks</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 📅 Řádky z fotky z víc dnů — každý se zapíše na svůj den (lib/zapisPoDnech.ts) */}
          {fotoDny.length > 0 && (
            <div className="mb-4">
              <RadkyZFotkyPoDnech
                radky={fotoDny}
                popisek={(r) => `${beerName(beers.find((b) => b.id === r.beerId))} · ${formatPackageLabel(packages.find((p) => p.id === r.pkgId)?.label)}`}
                onKusy={(i, qty) => setFotoDny((rs) => rs.map((r, j) => (j === i ? { ...r, qty } : r)))}
                onOdeber={(i) => setFotoDny((rs) => rs.filter((_, j) => j !== i))}
                onZahodit={() => setFotoDny([])}
                napoveda={`Uloží se spolu se zápisem výše tlačítkem „${vraceni ? 'Vrátit na sklad' : 'Uložit fasování'}“ — každý řádek na svůj den.`}
              />
            </div>
          )}

          {/* Poznámka pod tabulkou */}
          <div className="mt-3">
            <label className="label">Poznámka</label>
            <input className="input text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="nepovinná poznámka" />
          </div>

          {/* ↩️ Odfasovat — vrácení už vydaného zboží na sklad.
              Vrácení se zapisuje jako ZÁPORNÝ řádek do stejné tabulky, ne
              mazáním původního zápisu: co se vydalo, se doopravdy vydalo,
              a smazat to znamená ztratit stopu (a rozbít měsíc, který je
              možná už napočítaný).
              Dřív tu byla dvě tlačítka ("Vydat ze skladu" / "Odfasovat") a
              vedle nich ještě samostatné "Uložit fasování" — vypadalo to
              jako dvě různá tlačítka pro totéž. Výdej je výchozí stav, na
              nic se tedy nekliká; jediný přepínač je tenhle checkbox a
              hlavní tlačítko dole samo změní text i barvu, ať se vrácení
              neuloží omylem místo výdeje. */}
          <label className={`mt-3 inline-flex items-center gap-2 px-3 py-2 rounded border-2 min-h-[44px] cursor-pointer transition select-none w-fit ${vraceni ? 'bg-sky-50 border-sky-300' : 'bg-white border-neutral-300'}`}>
            <input
              type="checkbox"
              checked={vraceni}
              onChange={(e) => setVraceni(e.target.checked)}
              className="w-4 h-4 accent-sky-700"
            />
            <span className={`font-black text-xs ${vraceni ? 'text-sky-900' : 'text-neutral-600'}`}>
              ↩ Odfasovat (vrátit na sklad)
            </span>
          </label>
          {vraceni && (
            <div className="mt-2">
              <span className="text-[11px] font-bold text-sky-900 bg-sky-50 border border-sky-300 rounded px-2 py-1">
                Zapíše se záporný řádek — kusy se vrátí na sklad.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className={`!rounded text-xs font-black shadow-md ${
                  vraceni
                    ? 'px-4 py-2.5 min-h-[44px] rounded bg-sky-700 hover:bg-sky-600 text-white'
                    : 'btn-primary !from-emerald-600 !to-emerald-700 hover:!from-emerald-500 hover:!to-emerald-600 !shadow-emerald-600/30'
                }`}
              >
                {saving ? 'Ukládám…' : vraceni ? '↩ Vrátit na sklad' : 'Uložit fasování'}
              </button>
              <button type="button" className="btn-ghost !rounded text-xs" onClick={() => void vymazVse()}><Trash2 className="ikona-text" /> Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

          <DnesUlozeno
            nadpis={`${date === businessDateISO() ? 'Dnes' : date} uloženo — ${title}`}
            polozky={dnesPodleObalu(rows, date, packages)}
            beers={beers}
          />
        </form>
      )}

      {/* Voice recorder mimo form */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <div className="flex justify-end -mt-4 mb-2 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="btn-secondary flex items-center gap-2 border-amber-300 text-amber-900 bg-white hover:bg-amber-50 shadow-xs py-2 px-3 text-xs font-black"
          >
            <Camera size={16} /> Číst z fotky
          </button>
          <VoiceRecorder onResult={handleVoiceResult} beerNames={beers.map((b) => b.name)} />
        </div>
      )}

      {/* ===== PŘEHLED ===== */}
      {tab === 'prehled' && mode !== 'entry_only' && (
        <>
          {/* Všechny záznamy */}
          <div className="mt-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
                <span><ClipboardList className="ikona-text" /></span>
                <span>Záznamy fasování</span>
              </div>
              <div className="flex items-center gap-2">
                {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={overviewMonth}
                onChange={(e) => setOverviewMonth(e.target.value)}
                className="input !py-1.5 !px-3 text-xs font-semibold"
              />
              {showWhoColumn && (
                <input
                  type="text"
                  value={overviewWho}
                  onChange={(e) => setOverviewWho(e.target.value)}
                  placeholder={table === 'writeoffs' ? 'Hledat důvod…' : 'Hledat jméno…'}
                  className="input !py-1.5 !px-3 text-xs font-semibold"
                />
              )}
              {(overviewMonth !== businessDateISO().slice(0, 7) || overviewBeerId || overviewWho) && (
                <button
                  type="button"
                  onClick={() => { setOverviewMonth(businessDateISO().slice(0, 7)); setOverviewBeerId(''); setOverviewWho(''); }}
                  className="btn-ghost !rounded text-xs font-bold !py-1.5 !px-3"
                >
                  Zrušit filtry
                </button>
              )}
            </div>

            <ChipyPiva piva={beers} vybrane={overviewBeerId} onVybrat={setOverviewBeerId} />

            {loading ? (
              <Spinner />
            ) : rows.length === 0 ? (
              chybaNacteni ? (
                <EmptyState
                  varianta="chyba"
                  text={`Záznamy se nepodařilo načíst: ${chybaNacteni}`}
                  akce={{ popis: 'Zkusit znovu', onClick: () => load() }}
                />
              ) : <EmptyState text="Zatím žádné záznamy. Přidej první v záložce Zápis." icon={PenLine} />
            ) : filteredRows.length === 0 ? (
              <EmptyState text="Žádné záznamy pro toto období / filtr." icon={CalendarDays} />
            ) : (() => {
              const sortedRows = [...filteredRows].sort((a, b) => {
                const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
                if (dateCmp !== 0) return dateCmp;
                return (b.created_at ?? '').localeCompare(a.created_at ?? '');
              });
              const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);
              const soucetDne = (d: string | null | undefined) => sortedRows.filter((r) => r.entry_date === d).reduce((a, r) => a + Number(r.quantity || 0), 0);
              const nazevDne = (d: string | null | undefined) => {
                if (!d) return '—';
                const den = new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay();
                return `${['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'][den]} ${formatDate(d)}`;
              };

              // 📊 Rychlý souhrn: kolik kusů dnes / tento týden (z VŠECH záznamů,
              // ne jen z filtru měsíce) a co se ve zvoleném období prodalo nejvíc.
              // Dřív šlo z přehledu vyčíst jen měsíční součet a jednotlivé řádky.
              const dnesISO = businessDateISO();
              const tydenNyni = isoWeekKey(dnesISO);
              const soucet = (pred: (r: EntryRow) => boolean) =>
                rows.filter(pred).reduce((s, r) => s + Number(r.quantity || 0), 0);
              const dnesKs = soucet((r) => r.entry_date === dnesISO);
              const tydenKs = soucet((r) => !!r.entry_date && isoWeekKey(r.entry_date) === tydenNyni);
              const podlerPiva = new Map<string, number>();
              sortedRows.forEach((r) => {
                const k = r.beer_name ?? beers.find((b) => b.id === r.beer_id)?.name ?? '—';
                podlerPiva.set(k, (podlerPiva.get(k) || 0) + Number(r.quantity || 0));
              });
              const nejvic = [...podlerPiva.entries()].sort((a, b) => b[1] - a[1])[0];

              return (
                <div className="card p-4 border-2 border-amber-300/80 bg-white">
                  <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                    <ClipboardList className="ikona-text" /> Přehled výdeje
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="flex-1 min-w-[70px] rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-center">
                      <div className="text-[11px] font-black uppercase tracking-wide text-amber-700">Dnes</div>
                      <div className="font-mono font-black text-lg text-amber-950 tabular-nums">{dnesKs}</div>
                    </div>
                    <div className="flex-1 min-w-[70px] rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-center">
                      <div className="text-[11px] font-black uppercase tracking-wide text-amber-700">Tento týden</div>
                      <div className="font-mono font-black text-lg text-amber-950 tabular-nums">{tydenKs}</div>
                    </div>
                    <div className="flex-1 min-w-[70px] rounded-lg bg-amber-100 border border-amber-300 px-2.5 py-2 text-center">
                      <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">Zvolený měsíc</div>
                      <div className="font-mono font-black text-lg text-amber-950 tabular-nums">{totalCount}</div>
                    </div>
                  </div>
                  {nejvic && (
                    <div className="text-[11px] font-bold text-amber-800 mb-3">
                      Nejvíc ve zvoleném období: <span className="font-black text-amber-950">{nejvic[0]} — {nejvic[1]} ks</span>
                    </div>
                  )}
                  <ul className="md:hidden space-y-2">
                    {sortedRows.map((r, i) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const pkg = packages.find((p) => p.id === r.package_id);
                      const vol = pkg ? Number(pkg.volume_l) : 0;
                      const novyDen = i === 0 || sortedRows[i - 1].entry_date !== r.entry_date;
                      return (
                        <Fragment key={`m-${r.id}`}>
                        {novyDen && (
                          <li data-testid="den-nadpis" className="px-1 pt-2 space-y-1">
                            <div className="flex items-baseline justify-between font-black text-amber-950">
                              <span className="text-sm">{nazevDne(r.entry_date)}</span>
                              <span className="font-mono text-sm">{soucetDne(r.entry_date)} ks</span>
                            </div>
                            <button type="button" className="text-xs font-black text-amber-800 underline" onClick={() => { setPresunZ((r.entry_date ?? '').slice(0, 10)); setPresunNa((r.entry_date ?? '').slice(0, 10)); }}>Změnit datum všech položek toho dne</button>
                          </li>
                        )}
                        <li className="rounded border border-amber-300/80 bg-amber-50/90 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-black text-sm text-amber-950 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                                <span className="truncate">{r.beer_name ?? beer?.name ?? '—'}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 font-black text-xs shrink-0">{pkg ? `${vol} l` : '—'}</span>
                              </div>
                              <div className="text-[11px] font-bold text-amber-800 mt-0.5">
                                {formatDate(r.entry_date)}
                                {showWhoColumn && getRowWho(r) ? ` · ${getRowWho(r)}` : ''}
                              </div>
                            </div>
                            <div className="font-mono font-black text-2xl text-amber-950 leading-none shrink-0">{r.quantity}</div>
                          </div>

                          {/* Křížek je schválně až za mezerou od plusu — na dotyk
                              jsou to sousedi a záměna maže zápis. */}
                          <div className="flex items-stretch gap-1.5 mt-2.5">
                            <button
                              type="button"
                              className="w-12 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black transition disabled:opacity-40"
                              onClick={() => increment(r.id, -1)}
                              disabled={Number(r.quantity) <= 0}
                              title="Odebrat 1 ks"
                            >−</button>
                            <button
                              type="button"
                              className="flex-1 min-h-[44px] grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black transition"
                              onClick={() => increment(r.id, 1)}
                              title="Přidat 1 ks"
                            >+ 1 ks</button>
                            {/* 📷 Fotka k odpisu — „zkažené, rozbitá láhev" je dnes
                                jediný doklad a po měsíci si nikdo nevzpomene, jak to
                                vypadalo. */}
                            {table === 'writeoffs' && <FotkyZaznamu typ="odpis" zaznamId={r.id} kompaktni />}
                            {/* ↩️ Odfasovat — vrátí kusy na sklad záporným
                                protizápisem. U už vráceného řádku (záporný)
                                nemá co vracet, tak se neukazuje. */}
                            {Number(r.quantity) > 0 && (
                              <button
                                type="button"
                                className="w-12 min-h-[44px] grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-black transition"
                                onClick={() => odfasuj(r.id)}
                                aria-label="Odfasovat — vrátit na sklad"
                                title="Odfasovat — vrátit na sklad"
                              ><RotateCcw size={18} /></button>
                            )}
                            <button
                              type="button"
                              className="btn-ghost !flex-none !w-12 !px-0 !min-h-[44px]"
                              onClick={() => otevriUpravu(r)}
                              aria-label="Upravit datum a počet"
                              title="Upravit datum a počet"
                            ><Pencil size={18} /></button>
                            <button
                              type="button"
                              className="w-12 min-h-[44px] ml-2 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black transition"
                              onClick={() => del(r.id)}
                              title="Smazat záznam"
><X size={18} /></button>
                          </div>
                        </li>
                        </Fragment>
                      );
                    })}
                    <li className="rounded border-2 border-amber-400 bg-amber-200/70 px-3 py-2.5 flex items-center justify-between font-black text-amber-950">
                      <span className="text-sm"><PackageIcon className="ikona-text" /> Celkem</span>
                      <span className="font-mono text-xl">{totalCount}</span>
                    </li>
                  </ul>

                  <div className="hidden md:block rounded border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-amber-300/80 bg-amber-100/80">
                          <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                          {showWhoColumn && (
                            <th className="text-left py-1.5 px-2 font-black text-amber-950">
                              {druh.popisek}
                            </th>
                          )}
                          <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Obal</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                          <th className="text-right py-1.5 px-2 font-black text-amber-950">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((r, i) => {
                          const beer = beers.find((b) => b.id === r.beer_id);
                          const pkg = packages.find((p) => p.id === r.package_id);
                          const vol = pkg ? Number(pkg.volume_l) : 0;
                          const novyDen = i === 0 || sortedRows[i - 1].entry_date !== r.entry_date;
                          return (
                            <Fragment key={r.id}>
                            {novyDen && (
                              <tr data-testid="den-nadpis" className="bg-amber-100">
                                <td colSpan={showWhoColumn ? 6 : 5} className="py-1.5 px-2 font-black text-amber-950">
                                  {nazevDne(r.entry_date)} <span className="font-mono ml-2">{soucetDne(r.entry_date)} ks</span>
                                  <button type="button" className="ml-3 text-xs font-black text-amber-800 underline" onClick={() => { setPresunZ((r.entry_date ?? '').slice(0, 10)); setPresunNa((r.entry_date ?? '').slice(0, 10)); }}>Změnit datum všech</button>
                                </td>
                              </tr>
                            )}
                            <tr className="border-b border-amber-200/60 hover:bg-amber-100/70 transition-colors">
                              <td className="py-1.5 px-2 font-mono font-bold text-amber-950 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                              {showWhoColumn && (
                                <td className="py-1.5 px-2 font-semibold text-amber-950 whitespace-nowrap">{getRowWho(r)}</td>
                              )}
                              <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                                <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{pkg ? `${vol}L` : '—'}</td>
                              <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                              <td className="py-1.5 px-2 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, -1)}
                                    disabled={Number(r.quantity) <= 0}
                                    title="Odebrat 1 ks"
                                  >−</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, 1)}
                                    title="Přidat 1 ks"
                                  >+</button>
                                  {table === 'writeoffs' && <FotkyZaznamu typ="odpis" zaznamId={r.id} kompaktni />}
                                  {Number(r.quantity) > 0 && (
                                    <button
                                      type="button"
                                      className="tap w-6 h-6 grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition"
                                      onClick={() => odfasuj(r.id)}
                                      aria-label="Odfasovat — vrátit na sklad"
                                      title="Odfasovat — vrátit na sklad"
                                    ><RotateCcw size={14} /></button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-ghost tap !flex-none !w-6 !h-6 !min-h-0 !p-0"
                                    onClick={() => otevriUpravu(r)}
                                    aria-label="Upravit datum a počet"
                                    title="Upravit datum a počet"
                                  ><Pencil size={12} /></button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition"
                                    onClick={() => del(r.id)}
                                    title="Smazat záznam"
><X size={18} /></button>
                                </div>
                              </td>
                            </tr>
                            </Fragment>
                          );
                        })}
                        {/* Souhrnný řádek */}
                        <tr className="bg-amber-200/60 font-black">
                          <td className="py-1.5 px-2 font-black text-amber-950"></td>
                          {showWhoColumn && <td className="py-1.5 px-2 font-black text-amber-950"></td>}
                          <td className="py-1.5 px-2 font-black text-amber-950"><PackageIcon className="ikona-text" /> Celkem</td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                          <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {presunZ && (
        <Modal open onClose={() => setPresunZ(null)} title={`Změnit datum všech položek z ${formatDate(presunZ)}`}>
          <form onSubmit={(e) => { e.preventDefault(); void presunCelyDen(); }} className="space-y-4">
            <p className="text-sm font-bold text-neutral-700">Počet kusů zůstane. Přesune se jen datum, u všech položek toho dne najednou.</p>
            <div>
              <label className="label" htmlFor="presun-datum">Nové datum</label>
              <input id="presun-datum" type="date" className="input" value={presunNa} onChange={(e) => setPresunNa(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary !rounded w-full font-black">Uložit nové datum</button>
          </form>
        </Modal>
      )}

      {upravovany && (
        <Modal open onClose={() => setUpravovany(null)} title={`Upravit záznam: ${upravovany.beer_name ?? 'pivo'} ${upravovany.package_label ?? ''}`.trim()}>
          <form onSubmit={(e) => { e.preventDefault(); void ulozUpravu(); }} className="space-y-4">
            <div>
              <label className="label" htmlFor="uprav-datum">Datum</label>
              <input id="uprav-datum" type="date" className="input" value={upravDatum} onChange={(e) => setUpravDatum(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="uprav-ks">Počet kusů</label>
              <input id="uprav-ks" type="number" inputMode="numeric" min={0} step={1} className="input" value={upravKs} onChange={(e) => setUpravKs(e.target.value)} onWheel={(e) => e.currentTarget.blur()} />
            </div>
            {table !== 'writeoffs' && (
              <label className="flex items-start gap-2 text-sm font-bold text-neutral-800 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 mt-0.5 accent-primary-600" checked={upravVPocitani} onChange={(e) => setUpravVPocitani(e.target.checked)} />
                <span>
                  Už je v napočítaném stavu skladu (Úprava skladu) — sklad znovu neodečítat
                  <span className="block text-xs font-semibold text-neutral-600">Záznam zůstane ve výdeji a statistice, jen nesníží sklad podruhé.</span>
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setUpravovany(null)}>Zrušit</button>
              <button type="submit" className="btn-primary">Uložit</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 🚰 Modální okno pro rezervaci výčepu */}
      {showTapModal && (
        <TapReservationModal
          orderDate={date}
          customerName={title}
          tapTypeHint={detectTapType(note)}
          onConfirm={handleTapModalDone}
          onSkip={handleTapModalDone}
        />
      )}

      {showPhotoModal && (
        <ProdejnaFromImage
          isOpen={showPhotoModal}
          onClose={() => setShowPhotoModal(false)}
          beers={beers}
          packages={packages}
          onImport={handlePhotoRows}
          popisVydeje={druh.popis}
          posledniZapis={posledniZapisVydeje}
        />
      )}

    </div>
  );
}
