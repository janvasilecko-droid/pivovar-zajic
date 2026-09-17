

import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from 'react';

import { AlertTriangle, ChevronLeft, ChevronRight, Calendar, CalendarDays, Camera, Check, CheckCircle2, CheckSquare, ClipboardList, Clock, Copy, FilePlus, Globe, Mail, MessageCircle, Package as PackageIcon, PackageCheck, Plus, Receipt, Search, ShieldAlert, Trash2, Truck, User, X, Zap } from 'lucide-react';
import { Beer, EntryRow, Package, Place, beerName, fetchAllRows, formatPackageLabel, supabase, useRealtime } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { zbytekKeKonciTydne, zbytekPodleObjednavek, type ObjednavkaKPrioritě } from '../lib/tydenniZbytek';
import type { StockSources } from '../lib/stockLedger';
import { consumeOrdersItemFilter, consumeOrdersAutoImportRequest, consumeOrdersOverdueFilter, consumeOrdersPendingFilter, consumeOrdersHledani, ORDERS_AUTO_IMPORT_EVENT, ORDERS_HLEDANI_EVENT } from '../lib/ordersFilter';
import { businessDateISO, posunMesic, posunDen } from '../lib/businessDate';
import { computeVariantTotals } from '../lib/variantTotals';
import { vyhovujeDruhu, NAZEV_DRUHU, type DruhObaluFiltr } from '../lib/druhObalu';

import { PlaceCombobox } from '../components/PlaceCombobox'; // Assuming this is needed
import { DAYS } from '../lib/shared';
import { vseHotovo } from '../lib/polozkyObjednavky';
import { zapisStaceniZPolozky, zrusStaceniZPolozky } from '../lib/staceniZPolozky';
import type { TankKOdectu } from '../lib/tankUZapisu';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { orderQuickQtys } from '../components/QuickQtySelect';
import { BeerTileGrid, BeerTilePanel } from '../components/BeerTileGrid';
import { topQuantitiesLastMonth } from '../lib/quickQty';
import { parseVoiceOrder, parseOrderText, detectOrderNotes, loadAliasMap, loadPlaceAliasMap, emptyAliasMap, getOrCreatePlace, matchBeerFromHints, matchPackage, normalize, type ParserAliasMap } from '../lib/orderParser';

import { slozNavrh } from '../lib/whatsappAmendment';

import { shareOrderToWhatsApp } from '../lib/whatsapp';
import { oznacVlastniObjednavku } from '../lib/mojeObjednavky';
import { subscribeToWhatsAppMessages, fetchPendingWhatsAppMessages, fetchWhatsAppMessage, ignoreWhatsAppMessage, WhatsAppIncoming, fetchWhatsAppSenders, isSenderAllowed, triggerAutoParse, type WhatsAppSender } from '../lib/whatsappApi';
import { autoReserveTapIfNeeded, isTapMentioned, detectTapType } from '../lib/tapReservations';
import { findDuplicateOrders, formatDuplicateMessage } from '../lib/orderDuplicates';
import { datumProDenVTydnu, dayKeyFromISO } from '../lib/keggingPlan';
import { TapReservationModal } from '../components/TapReservationModal';
import { createReminder, getLocalReminders } from '../lib/reminders';
import { type AkceRow } from '../lib/inventoryHelper';
import { chyba, oznam, potvrd, toastZpet, volba } from '../lib/toast';

import { IkonaVycep } from '../components/ikony';
import { poctyPolozek } from '../lib/objednavkyStatistika';
import { kartaOdberatele } from '../lib/kartaOdberatele';
import { kusy } from '../lib/cisla';

import { uloz } from '../lib/uloziste';
import { najdiZdvojene, popisZdvojeni } from '../lib/zdvojenePolozky';

import { type CenaPolozky } from '../lib/hodnotaObjednavky';

import { STAVY_OBJEDNAVKY } from '../lib/stavyObjednavek';
import { zalogujANahlas } from '../lib/chybyHlaseni';

/**
 * 🐢 Těžké modály se stahují AŽ při otevření.
 *
 * Kus Objednávek měl 273 kB (75 kB gzip) a bylo v něm zapečené i to, co
 * většina lidí za den neotevře: čtení objednávky z fotky (1 324 řádků),
 * kontrola objednávky z WhatsAppu (1 328), audit objednávek (1 274),
 * automatické zpracování zpráv (645) a deník příjmu (237). Všechny se
 * vykreslují podmíněně (`{showImport && …}`), takže z nich `lazy()` udělá
 * samostatné kusy, které se stáhnou, až když na tlačítko někdo klikne.
 *
 * Fallback je `null`: modál se otevírá na klik, takže se ukáže o zlomek
 * vteřiny později — kolečko uprostřed obrazovky by na tu chvíli jen
 * bliklo. Vlastní obsah modálu si načítání řeší sám.
 */
const ImportFromImage = lazy(() => import('../components/ImportFromImage').then((m) => ({ default: m.ImportFromImage })));
const WhatsAppOrderReviewModal = lazy(() => import('../components/WhatsAppOrderReviewModal').then((m) => ({ default: m.WhatsAppOrderReviewModal })));
const WhatsAppAutoProcessorModal = lazy(() => import('../components/WhatsAppAutoProcessorModal').then((m) => ({ default: m.WhatsAppAutoProcessorModal })));
const WhatsAppAuditModal = lazy(() => import('../components/WhatsAppAuditModal').then((m) => ({ default: m.WhatsAppAuditModal })));
const OrderAuditModal = lazy(() => import('../components/OrderAuditModal').then((m) => ({ default: m.OrderAuditModal })));
const EditOrderModal = lazy(() => import('../components/EditOrderModal').then((m) => ({ default: m.EditOrderModal })));
const SplitOrderModal = lazy(() => import('../components/SplitOrderModal').then((m) => ({ default: m.SplitOrderModal })));

import { type Order, type OrderItem, dayColor } from '../components/objednavky/spolecne';
import { VariantTotalsPanel } from '../components/objednavky/VariantTotalsPanel';
import { OrderCard } from '../components/objednavky/OrderCard';
import { OrderDetail } from '../components/objednavky/OrderDetail';

// Pořadí obalů v plnoobrazovkovém panelu zadávání (dle požadavku):
// 50l keg → 30l → 1,5l keg → 1l keg → 20l → 15l → 10l → 0,5l → 0,33l
const PKG_PANEL_ORDER = [50, 30, 1.5, 1, 20, 15, 10, 0.5, 0.33];
function pkgPanelIndex(p: Package): number {
  const i = PKG_PANEL_ORDER.indexOf(p.volume_l);
  return i === -1 ? 999 : i;
}

export default function Orders({
  autoOpenShareImport,
  onShareImportHandled,
  mode = 'all',
  setPage,
  initialViewMode = 'summary',
  openOrderId,
}: {
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  mode?: 'entry_only' | 'overviews_only' | 'all';
  setPage?: (p: any) => void;
  initialViewMode?: 'summary' | 'detail' | 'celkem' | 'text';
  /** Proklik odjinud (např. z Týdenní inventury) na konkrétní objednávku. */
  openOrderId?: string;
} = {}) {

  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [places, setPlaces] = useState<Place[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [priceList, setPriceList] = useState<CenaPolozky[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [bottling, setBottling] = useState<EntryRow[]>([]);
  const [kegging, setKegging] = useState<EntryRow[]>([]);
  const [inventory, setInventory] = useState<EntryRow[]>([]);
  const [writeoffs, setWriteoffs] = useState<EntryRow[]>([]);
  // "Chybí skladem" odznak (stockRemainingForOrder) dřív počítal jen stočeno −
  // objednáno − odpisy, bez fasování/prodejny/akcí — sklad tak vypadal
  // vyšší, než ve skutečnosti byl, a odznak se objevil pozdě nebo vůbec.
  const [fasovaniRows, setFasovaniRows] = useState<EntryRow[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<EntryRow[]>([]);
  const [akceRows, setAkceRows] = useState<AkceRow[]>([]);
  // Přefuk a dorovnání inventury: odznak „Chybí skladem" bez nich ukazoval
  // vyšší sklad, než jaký byl. Přefuk 20× 50l na 33× 30l se v něm neprojevil
  // vůbec, dorovnané manko taky ne.
  const [prefukRows, setPrefukRows] = useState<any[]>([]);
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([]);
  // Nese i beer_id/package_id/quantity/deduct_date — skladová kniha z toho
  // počítá výdej na objednávku, `order_item_id` slouží k poznání, že položka
  // už fyzicky odjela.
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Order | null>(null);

  // Phone back button: when detail is open, close it; otherwise go home.
  useEffect(() => {
    if (!detail) return;
    history.pushState({ ordersDetail: true }, '');
    const onPop = () => setDetail(null);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (history.state?.ordersDetail) history.back();
    };
  }, [detail]);

  // businessDateISO(), NE new Date().toISOString() (vždycky UTC) — jinak
  // kolem půlnoci pražského času vyjde jiný týden než na ploše Domů
  // (CoStocitOkno) nebo ve Stáčení (z provozu 15. 9. 2026, viz Kegging.tsx).
  const [weekKey, setWeekKey] = useState(isoWeekKey(businessDateISO()));

  // inline quick-add
  const [date, setDate] = useState(businessDateISO());
  const [placeId, setPlaceId] = useState('');
  const [placeNameFree, setPlaceNameFree] = useState('');
  const [deliveryDay, setDeliveryDay] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  // Potvrzení, že závoz spadá do jiného (příštího) měsíce — viz banner u
  // výběru data níž. Musí se zaškrtnout znovu pokaždé, když se datum závozu
  // změní, ať nezůstane omylem zaškrtnuté z předchozí objednávky.
  const [confirmNextMonth, setConfirmNextMonth] = useState(false);
  const deliveryInFutureMonth = !!deliveryDate && deliveryDate.slice(0, 7) > businessDateISO().slice(0, 7);
  useEffect(() => { setConfirmNextMonth(false); }, [deliveryDate]);
  type BeerRowItem = { beerId: string; pkgId: string; qty: string; placeId?: string; placeNameFree?: string };
  const [beerRows, setBeerRows] = useState<BeerRowItem[]>([
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
  ]);
  // 🍺 Změna množství u dlaždice piva (obal + počet ks) — jeden řádek na (pivo, obal)
  function setPkgQty(beerId: string, pkgId: string, delta: number) {
    setBeerRows((prev) => {
      const i = prev.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
      if (i >= 0) {
        const next = Math.max(0, Number(prev[i].qty || 0) + delta);
        if (next <= 0) return prev.filter((_, idx) => idx !== i);
        return prev.map((r, idx) => (idx === i ? { ...r, qty: String(next) } : r));
      }
      if (delta <= 0) return prev;
      return [...prev, { beerId, pkgId, qty: String(delta), placeId, placeNameFree }];
    });
  }
  // 🍺 Nastavení přesného počtu (z předdefinovaných rychlých voleb) — jednoznačný počet ks
  function setPkgAbsolute(beerId: string, pkgId: string, qty: number) {
    setBeerRows((prev) => {
      const i = prev.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
      if (i >= 0) {
        if (qty <= 0) return prev.filter((_, idx) => idx !== i);
        return prev.map((r, idx) => (idx === i ? { ...r, qty: String(qty) } : r));
      }
      if (qty <= 0) return prev;
      return [...prev, { beerId, pkgId, qty: String(qty), placeId, placeNameFree }];
    });
  }

  // 📅 Výběr dne závozu — nastaví den i konkrétní datum v aktuálně zvoleném týdnu
  function pickDeliveryDay(dayV: string) {
    setDeliveryDay(dayV);
    const idx = DAYS.findIndex((d) => d.v === dayV);
    if (idx >= 0) {
      const start = weekRange(weekKey).start;
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + idx);
      setDeliveryDate(d.toISOString().slice(0, 10));
    }
  }

  // ◀▶ Přeřadit týden a zachovat zvolený den závozu
  function shiftWeekAndKeepDay(delta: number) {
    const wk = shiftWeek(weekKey, delta);
    setWeekKey(wk);
    const idx = DAYS.findIndex((d) => d.v === deliveryDay);
    if (idx >= 0) {
      const start = weekRange(wk).start;
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + idx);
      setDeliveryDate(d.toISOString().slice(0, 10));
    }
  }

  // 📅 Návrat na aktuální týden (klik na popisek týdne)
  function resetToCurrentWeek() {
    const wk = isoWeekKey(businessDateISO());
    setWeekKey(wk);
    const idx = DAYS.findIndex((d) => d.v === deliveryDay);
    if (idx >= 0) {
      const start = weekRange(wk).start;
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + idx);
      setDeliveryDate(d.toISOString().slice(0, 10));
    }
  }

  const filledBeerRows = beerRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);

  // Dvakrát totéž pivo ve stejném obalu pro TÉHOŽ odběratele (lib/zdvojenePolozky.ts).
  // Do jedné mřížky se píše i pro víc hospod naráz, proto se seskupuje i podle
  // odběratele — stejné pivo pro Louku a pro Maneo duplicita samozřejmě není.
  const zdvojeneRadky = najdiZdvojene(
    beerRows.map((r) => ({ beerId: r.beerId, pkgId: r.pkgId, qty: r.qty, skupina: r.placeId || r.placeNameFree || '' })),
  );
  // Pozn.: nativní window.confirm() je v nainstalované PWA (standalone mód na
  // telefonu) nespolehlivý — občas se vůbec nezobrazí a webview ho tiše sám
  // za uživatele "odklikne". U mazání objednávky to vypadalo jako "klikni
  // Smazat a nic se nestane", u kontroly duplicit naopak tiše proklouzlo bez
  // varování a vytvořilo druhou objednávku. Proto se všude potvrzuje přes
  // potvrd() z lib/toast.ts (vlastní dialog), ne přes prohlížeč.
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  // 📝 Ruční zadání objednávky textem — uživatel napíše objednávku a ta se
  // automaticky rozparsuje do tabulky položek (pivo, obal, množství).
  const [manualText, setManualText] = useState('');

  // 🍺 Dlaždice piv — rozbalené pivo v zadávacím formuláři
  const [expandedBeerId, setExpandedBeerId] = useState<string | null>(null);
  // Pivo aktuálně otevřené v plnoobrazovkovém editačním panelu
  const expandedBeer = expandedBeerId ? beers.find((b) => b.id === expandedBeerId) ?? null : null;

  // Historie objednaného množství (pivo+obal) ze VŠECH nestornovaných objednávek —
  // slouží k dopočtu "4 nejčastější hodnoty z minulého měsíce" u dlaždic (viz níže).
  const orderQtyHistory = useMemo(() => {
    const out: { beer_id: string | null; package_id: string | null; quantity: number | null; entry_date: string | null }[] = [];
    orders.forEach((o) => {
      if (o.status === 'storno') return;
      const entry_date = o.delivery_date || o.order_date;
      (items[o.id] ?? []).forEach((it) => {
        out.push({ beer_id: it.beer_id, package_id: it.package_id, quantity: it.quantity, entry_date });
      });
    });
    return out;
  }, [orders, items]);
  // 📅 Datum rozpoznané z poznámky (kdy má být zavezeno)
  const [noteDateHint, setNoteDateHint] = useState<string | null>(null);

  // 🚰 Půjčení výčepu — zaškrtávací pole v zadávacím formuláři
  const [wantTap, setWantTap] = useState(false);
  const [tapReservedEarly, setTapReservedEarly] = useState(false);
  const [tapModalAfterSave, setTapModalAfterSave] = useState(false);

  // 🚰 Rezervace výčepu — stav pro modální okno
  const [showTapModal, setShowTapModal] = useState(false);
  const [tapModalOrderId, setTapModalOrderId] = useState<string | undefined>(undefined);
  const [tapModalCustomer, setTapModalCustomer] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showWhatsAppAutoProcessor, setShowWhatsAppAutoProcessor] = useState(false);
  const [showWhatsAppAudit, setShowWhatsAppAudit] = useState(false);
  const [showOrderAudit, setShowOrderAudit] = useState(false);

  // Automatické zobrazování nových WhatsApp objednávek
  const [autoWhatsAppModal, setAutoWhatsAppModal] = useState(false);
  const [autoWhatsAppMessage, setAutoWhatsAppMessage] = useState<WhatsAppIncoming | null>(null);
  const [whatsappListRefresh, setWhatsappListRefresh] = useState(0); // Obnovení seznamu Auto-Import po potvrzení/zamítnutí
  const [newWhatsAppCount, setNewWhatsAppCount] = useState(0);
  
  const [importTarget, setImportTarget] = useState<Order | null>(null);
  const [shareInitialFiles, setShareInitialFiles] = useState<File[] | undefined>(undefined);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [splitOrder, setSplitOrder] = useState<Order | null>(null);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  const [placeAliasMap, setPlaceAliasMap] = useState<Map<string, string>>(new Map());
  const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'celkem' | 'text'>(initialViewMode); // New state for view mode
  const [itemFilterBeerId, setItemFilterBeerId] = useState<string | null>(null); // New state for item filter
  const [itemFilterPackageId, setItemFilterPackageId] = useState<string | null>(null); // New state for item filter
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);
  useEffect(() => { loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {}); }, []);

  // Povolení odesílatelé WhatsApp (whitelist) — prázdný seznam = povoleno vše.
  // Realtime subscription čte z ref, aby nemusela měnit dependency.
  const allowedSendersRef = useRef<WhatsAppSender[]>([]);
  useEffect(() => {
    fetchWhatsAppSenders().then((s) => { allowedSendersRef.current = s; }).catch(() => {});
  }, []);

  // Otevřít Auto-Import přímo z horní hlavičky nebo z dlaždice "Objednávky
  // k parsování" na Domů — obojí přepne stránku na Objednávky a POŽÁDÁ o
  // otevření (requestOrdersAutoImport), spotřebováno tady při mountu. Dřív se
  // to řešilo CustomEvent dispatchnutým hned po přepnutí stránky, ale Orders
  // se montuje až PO přepnutí, takže posluchač event nestihl zachytit a
  // appka skončila na obyčejném seznamu objednávek (viz lib/ordersFilter.ts).
  useEffect(() => {
    if (consumeOrdersAutoImportRequest()) setShowWhatsAppAutoProcessor(true);
  }, []);

  // A pro případ, že je tahle obrazovka už otevřená (kliknutí na WhatsApp
  // v hlavičce přímo na Objednávkách) — mount efekt výše se znovu nespustí.
  useEffect(() => {
    const otevri = () => {
      consumeOrdersAutoImportRequest();
      setShowWhatsAppAutoProcessor(true);
    };
    window.addEventListener(ORDERS_AUTO_IMPORT_EVENT, otevri);
    return () => window.removeEventListener(ORDERS_AUTO_IMPORT_EVENT, otevri);
  }, []);
  
  // Automatické sledování nových WhatsApp zpráv
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    try {
      unsubscribe = subscribeToWhatsAppMessages((message) => {
        // Zobraz pouze zprávy ve stavu 'parsed' (již rozparsované AI)
        // nebo 'pending' (nové, ještě nezpracované)
        if (message.status === 'parsed' || message.status === 'pending') {
          // Whitelist odesílatelů — zprávy od nepovolených se automaticky nenačítají
          // (zůstanou v seznamu pro ruční zpracování).
          if (!isSenderAllowed(allowedSendersRef.current, message.sender_name)) {
            return;
          }
          
          // Aktualizovat počítadlo
          setNewWhatsAppCount(prev => prev + 1);
          
          // Automaticky spustíme parsování, pokud je zpráva v pending stavu
          if (message.status === 'pending') {
            void triggerAutoParse().catch((err) => {
              zalogujANahlas('Chyba při automatickém parsování', err);
            });
          }

          // Modál s kontrolou/potvrzením se NEotevírá automaticky — uživatel
          // ho otevře sám (tlačítko WhatsApp / hromadné zpracování), jen
          // přibude do počítadla. Zvuk + systémovou notifikaci řeší globální
          // listener v Layout.tsx (funguje na všech obrazovkách).
        }
      });
    } catch (error) {
      zalogujANahlas('Chyba při připojení k WhatsApp zprávám', error);
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Dočtení zpráv, které přišly, když byla aplikace zavřená nebo na jiné
  // obrazovce (realtime v tu chvíli neběžel) — jen dopočítá a spustí
  // serverové parsování na pozadí. Modál s kontrolou/potvrzením se
  // NEotevírá automaticky, uživatel ho otevře sám.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Nejprve načteme whitelist, aby se zprávy filtrovaly správně (nezávisle
        // na tom, kdy se načte ve vedlejším useEffectu).
        const senders = await fetchWhatsAppSenders().catch(() => [] as WhatsAppSender[]);
        if (cancelled) return;
        allowedSendersRef.current = senders;

        const pending = await fetchPendingWhatsAppMessages();
        if (cancelled) return;

        // Whitelist — zprávy od nepovolených odesílatelů zůstanou v seznamu
        // pro ruční zpracování (stejně jako u realtime).
        const allowed = pending.filter((m) => isSenderAllowed(allowedSendersRef.current, m.sender_name));
        if (allowed.length === 0) return;

        setNewWhatsAppCount((prev) => prev + allowed.length);

        // Pokud je mezi nimi nějaká 'pending', spustíme serverové parsování.
        const hasPending = allowed.some((m) => m.status === 'pending');
        if (hasPending) {
          try {
            await triggerAutoParse();
          } catch (err) {
            zalogujANahlas('Chyba při automatickém parsování (dočtení)', err);
          }
        }
      } catch (error) {
        zalogujANahlas('Chyba při dočítání čekajících WhatsApp zpráv', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSaveWhatsAppOrder(ordersData: {
    placeId: string | null;
    placeNameFree: string;
    orderDate: string;
    deliveryDay: string;
    deliveryDate: string;
    note: string;
    whatsappMessageId?: string;
    items: { beerId: string; pkgId: string; qty: number }[];
  }[]) {
    const today = businessDateISO();
    const createdIds: string[] = [];

    // ⚠️ Kontrola duplicit PŘED vytvořením jakékoli objednávky — aby dva lidé
    // nezadali ve stejnou chvíli stejnou objednávku.
    for (const data of ordersData) {
      const dup = await findDuplicateOrders({
        placeId: data.placeId,
        placeName: data.placeNameFree,
        deliveryDate: data.deliveryDate || null,
        deliveryDay: data.deliveryDay || null,
        items: (data.items || []).map((i) => ({ beerId: i.beerId, pkgId: i.pkgId, qty: i.qty })),
      });
      if (dup && !(await potvrd(formatDuplicateMessage(dup) + '\n\nPokračovat? (Ano = přesto vytvořit objednávku)'))) {
        throw new Error('Import zrušen — objednávka je duplicitní (' + (dup.placeName ?? 'odběratel') + ').');
      }
    }

    for (const data of ordersData) {
      // Datum objednávky: z časového razítka zprávy (kdy byla objednávka zadána),
      // jinak dnešní datum.
      const orderDate = data.orderDate || today;

      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert({
          order_date: orderDate,
          place_id: data.placeId || null,
          place_name: data.placeNameFree || null,
          source: 'whatsapp',
          status: 'nova',
          delivery_day: data.deliveryDay || null,
          delivery_date: data.deliveryDate || null,
          is_prepared: false,
          is_packaged: false,
          note: data.note || null,
          whatsapp_message_id: data.whatsappMessageId || null,
        })
        .select()
        .single();

      if (error || !newOrder) throw new Error(error?.message || 'Chyba při vytváření objednávky');
      createdIds.push(newOrder.id);
      oznacVlastniObjednavku(newOrder.id);

      const rows = data.items.map((i) => {
        const beer = beers.find((b) => b.id === i.beerId);
        const pkg = packages.find((p) => p.id === i.pkgId);
        return {
          order_id: newOrder.id,
          beer_id: i.beerId,
          beer_name: beer?.name || null,
          package_id: i.pkgId,
          package_label: pkg?.label || null,
          quantity: i.qty,
        };
      });

      const { error: itemsErr } = await supabase.from('order_items').insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);

      // 🚰 Pokud poznámka zmiňuje výčep, zobraz modální okno pro rezervaci
      const trimmedNote = (data.note || '').trim();
      const isVycepMentioned = isTapMentioned(trimmedNote);
      if (isVycepMentioned) {
        setTapModalOrderId(newOrder.id);
        setTapModalCustomer(data.placeNameFree || '');
        setShowTapModal(true);
        continue; // Modal will handle the rest
      }

      // Fallback: silent auto-reserve (original behavior)
      void autoReserveTapIfNeeded(data.placeNameFree, today, data.note, newOrder.id);
    }

    setWeekKey(isoWeekKey(today));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
    load();
  }

  // Schválení WhatsApp objednávky - vytvoří objednávku z rozparsované zprávy
  const handleApproveWhatsAppOrder = useCallback(async (message: WhatsAppIncoming) => {
    try {
      if (!message.parsed_items || message.parsed_items.length === 0) {
        throw new Error('Objednávka nemá žádné rozparsované položky');
      }

      const today = businessDateISO();
      const placeId = message.parsed_place_id || null;
      const placeNameFree = message.parsed_place_name || 'Neznámý odběratel';

      // ↩️ Odpověď, která UPRAVUJE dřívější objednávku („Bez summera",
      // „nakonec 9x30", „malé sudy budou…, petky sedí"). Odpověď ale často
      // mluví jen o ČÁSTI objednávky, ne o celé — proto se nesmí brát jako
      // celý nový obsah. Slož finální podobu přes slozNavrh: jmenované skupiny
      // se nahradí, o kterých odpověď říká „sedí"/nejmenuje je, zůstávají.
      // Dřív se objednávka přepsala JEN položkami z odpovědi, takže „petky
      // sedí" tiše smazalo petky (i třicítky), které měly zůstat.
      if (message.amends_order_id) {
        const nazvyOdpovedi = new Map<string, { beer_name: string | null; package_label: string | null }>();
        const zOdpovedi = (message.parsed_items || []).map((item) => {
          const beer =
            beers.find((b) => b.id === item.beer_id) ??
            matchBeerFromHints(normalize([item.raw_line, item.degree].filter(Boolean).join(' ')), beers, aliasMap).beer ??
            matchBeerFromHints(normalize(item.beer_name || ''), beers, aliasMap).beer;
          const pkg =
            packages.find((p) => p.id === item.pkg_id) ??
            matchPackage(normalize([item.package_label, item.raw_line].filter(Boolean).join(' ')), packages, aliasMap);
          const beer_id = beer?.id ?? null;
          const package_id = pkg?.id ?? null;
          // Jméno/obal si drž stranou i pro nespárované položky (id = null),
          // ať se raw text z odpovědi neztratí při skládání zpět.
          nazvyOdpovedi.set(`${beer_id}|${package_id}`, {
            beer_name: beer?.name || item.beer_name || null,
            package_label: pkg?.label || item.package_label || null,
          });
          return { beer_id, package_id, quantity: item.qty || 0 };
        });

        // ⚠️ replace_order_with_items přepisuje i HLAVIČKU objednávky hodnotami
        // z p_order — prázdný objekt by objednávce vymazal datum, odběratele
        // i den závozu. Odpověď mění jen položky, takže se hlavička (a současné
        // položky kvůli sloučení) načtou a hlavička pošle beze změny.
        const { data: puvodni, error: ordErr } = await supabase
          .from('orders')
          .select('order_date, place_id, place_name, delivery_day, delivery_date, note, items:order_items(beer_id, package_id, quantity)')
          .eq('id', message.amends_order_id)
          .single();
        if (ordErr || !puvodni) throw new Error(ordErr?.message || 'Upravovaná objednávka už neexistuje.');

        const soucasne = ((((puvodni as any).items ?? []) as any[])).map((i) => ({
          beer_id: i.beer_id ?? null, package_id: i.package_id ?? null, quantity: Number(i.quantity || 0),
        }));

        // 🔀 Slož finální obsah: co odpověď jmenuje, se nahradí; co potvrzuje
        // („petky sedí") nebo nejmenuje, zůstává z původní objednávky.
        const navrh = slozNavrh({
          soucasne,
          zOdpovedi,
          text: message.message_text,
          obaly: packages.map((p) => ({ id: p.id, label: p.label, kind: (p as any).kind, volume_l: (p as any).volume_l })),
        });

        const upraveneRadky = navrh.map((it) => {
          const beer = beers.find((b) => b.id === it.beer_id);
          const pkg = packages.find((p) => p.id === it.package_id);
          const fallback = nazvyOdpovedi.get(`${it.beer_id ?? null}|${it.package_id ?? null}`);
          return {
            beer_id: it.beer_id ?? null,
            beer_name: beer?.name ?? fallback?.beer_name ?? null,
            package_id: it.package_id ?? null,
            package_label: pkg?.label ?? fallback?.package_label ?? null,
            quantity: it.quantity || 0,
            is_prepared: false,
          };
        });

        if (upraveneRadky.length === 0) {
          throw new Error(
            'Po zapracování odpovědi by objednávka neměla žádnou položku. ' +
            'Pokud se má celá zrušit, stornujte ji přímo v objednávkách.'
          );
        }

        const hlavicka = {
          order_date: (puvodni as any).order_date,
          place_id: (puvodni as any).place_id,
          place_name: (puvodni as any).place_name,
          delivery_day: (puvodni as any).delivery_day,
          delivery_date: (puvodni as any).delivery_date,
          note: (puvodni as any).note,
        };

        // Stejné RPC jako ruční úprava objednávky — nahradí položky atomicky,
        // takže objednávka nikdy nezůstane rozepsaná napůl.
        const { error: replaceErr } = await supabase.rpc('replace_order_with_items', {
          p_order_id: message.amends_order_id,
          p_order: hlavicka,
          p_items: upraveneRadky,
        });
        if (replaceErr) throw new Error(replaceErr.message);

        const { data: authUpr } = await supabase.auth.getUser();
        await supabase
          .from('whatsapp_incoming')
          .update({
            status: 'imported',
            imported_order_id: message.amends_order_id,
            imported_at: new Date().toISOString(),
            readback_checked_at: new Date().toISOString(),
            readback_checked_by: authUpr?.user?.id || null,
          })
          .eq('id', message.id);

        setFlash(true);
        setTimeout(() => setFlash(false), 2000);
        load();
        return;
      }

      // ⚠️ Kontrola duplicity — aby dva lidé nezadali ve stejnou chvíli stejnou
      // objednávku (např. oba kliknou na „Schválit“ u téže zprávy).
      const dup = await findDuplicateOrders({
        placeId,
        placeName: placeNameFree,
        deliveryDate: message.parsed_delivery_date || null,
        deliveryDay: message.parsed_delivery_day || null,
        items: (message.parsed_items || []).map((it) => ({
          beerId: it.beer_id || null,
          pkgId: it.pkg_id || null,
          qty: it.qty ?? null,
          beerName: it.beer_name || null,
          packageLabel: it.package_label || null,
        })),
      });
      // Na „tohle už objednané je" byly dosud jen dvě odpovědi: přesto
      // vytvořit, nebo zrušit. Zrušení ale zprávu nechalo viset mezi
      // nevyřízenými a ignorovat se musela zvlášť — takže nejčastější
      // odpověď byla ta nejpracnější. Teď je ignorování rovnou v hlášce.
      if (dup) {
        const co = await volba(
          formatDuplicateMessage(dup),
          [
            { klic: 'ignorovat', label: 'Ignorovat zprávu', ton: 'nebezpecne' },
            { klic: 'presto', label: 'Přesto vytvořit', ton: 'hlavni' },
          ],
          { titulek: 'Tahle objednávka už nejspíš existuje', zrusit: 'Zpět' }
        );
        if (co === 'ignorovat') {
          await ignoreWhatsAppMessage(message.id);
          oznam('Zpráva označená jako vyřízená — duplicitní objednávka se nezaložila.');
          load();
          return;
        }
        if (co !== 'presto') {
          throw new Error('Objednávka je duplicitní — nebyla vytvořena.');
        }
      }

      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert({
          order_date: today,
          place_id: placeId,
          place_name: placeNameFree,
          source: 'whatsapp',
          status: 'nova',
          delivery_day: message.parsed_delivery_day || null,
          delivery_date: message.parsed_delivery_date || null,
          is_prepared: false,
          is_packaged: false,
          note: message.parsed_note || null,
          whatsapp_message_id: message.id,
        })
        .select()
        .single();

      if (error || !newOrder) throw new Error(error?.message || 'Chyba při vytváření objednávky');
      oznacVlastniObjednavku(newOrder.id);

      // Převést rozparsované položky na formát pro order_items. Pokud položka
      // nemá ID piva/obalu, dohledáme je v katalogu podle názvu/stupně/balení.
      const rows = message.parsed_items.map((item) => {
        const beer =
          beers.find((b) => b.id === item.beer_id) ??
          // Přednost má původní text objednávky (raw_line) — název od AI může být špatný
          matchBeerFromHints(
            normalize([item.raw_line, item.degree].filter(Boolean).join(' ')),
            beers,
            aliasMap
          ).beer ??
          matchBeerFromHints(
            normalize(item.beer_name || ''),
            beers,
            aliasMap
          ).beer;
        const pkg =
          packages.find((p) => p.id === item.pkg_id) ??
          matchPackage(
            normalize([item.package_label, item.raw_line].filter(Boolean).join(' ')),
            packages,
            aliasMap
          );
        return {
          order_id: newOrder.id,
          beer_id: beer?.id ?? null,
          beer_name: beer?.name || item.beer_name || null,
          package_id: pkg?.id ?? null,
          package_label: pkg?.label || item.package_label || null,
          quantity: item.qty || 0,
        };
      });

      const { error: itemsErr } = await supabase.from('order_items').insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);

      // Označit zprávu jako importovanou + audit kontroly čtení (#10)
      const { data: authData } = await supabase.auth.getUser();
      await supabase
        .from('whatsapp_incoming')
        .update({
          status: 'imported',
          imported_order_id: newOrder.id,
          imported_at: new Date().toISOString(),
          readback_checked_at: new Date().toISOString(),
          readback_checked_by: authData?.user?.id || null,
        })
        .eq('id', message.id);

      // 🚰 Výčep v poznámce → otevřít rezervaci výčepu s ověřením dostupnosti
      const trimmedNote = (message.parsed_note || '').trim();
      if (isTapMentioned(trimmedNote)) {
        setTapModalOrderId(newOrder.id);
        setTapModalCustomer(placeNameFree);
        setShowTapModal(true);
      }

      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
      load();

    } catch (error) {
      zalogujANahlas('Chyba při schvalování WhatsApp objednávky', error);
      throw error;
    }
  }, [beers, packages, aliasMap, load]);

  // Zamítnutí WhatsApp objednávky - označí jako ignorovanou
  const handleRejectWhatsAppOrder = useCallback(async (message: WhatsAppIncoming) => {
    try {
      await supabase
        .from('whatsapp_incoming')
        .update({
          status: 'ignored',
          error_message: 'Zamítnuto uživatelem',
        })
        .eq('id', message.id);
    } catch (error) {
      zalogujANahlas('Chyba při zamítnutí WhatsApp objednávky', error);
      throw error;
    }
  }, []);

  // Otevře originální WhatsApp zprávu k objednávce (kontrola čtení, #18).
  const handleOpenWhatsAppMessage = useCallback(async (messageId: string) => {
    try {
      const msg = await fetchWhatsAppMessage(messageId);
      if (msg) {
        setAutoWhatsAppMessage(msg);
        setAutoWhatsAppModal(true);
      } else {
        oznam('WhatsApp zpráva k této objednávce nebyla nalezena (byla smazána?).');
      }
    } catch (error) {
      zalogujANahlas('Chyba při otevírání WhatsApp zprávy', error);
      chyba('Nepodařilo se načíst WhatsApp zprávu: ' + (error as Error).message);
    }
  }, []);

  // Po potvrzení/zamítnutí/ignorování objednávky přeskočíme na další čekající
  // zprávu — aby šlo kontrolovat zprávy jednu po druhé, bez ručního otvírání.
  const advanceWhatsAppReview = useCallback(async () => {
    try {
      const pending = await fetchPendingWhatsAppMessages();
      // Whitelist — prázdný seznam = povoleno vše.
      const allowed = pending.filter((m) => isSenderAllowed(allowedSendersRef.current, m.sender_name));
      // Přednost má rozparsovaná zpráva; jinak nejstarší čekající (parsování
      // běží na pozadí). Seznam chodí od nejstarších, takže `allowed[0]` i
      // první nalezená 'parsed' je ta, co čeká nejdéle.
      const next = allowed.find((m) => m.status === 'parsed') ?? allowed[0];
      setNewWhatsAppCount(0);
      if (next) {
        setAutoWhatsAppMessage(next);
        setAutoWhatsAppModal(true);
      } else {
        setAutoWhatsAppModal(false);
        setAutoWhatsAppMessage(null);
      }
      // Obnovit seznam v pozadí (WhatsAppAutoProcessorModal), aby potvrzená/
      // zamítnutá zpráva zmizela ze seznamu.
      setWhatsappListRefresh((k) => k + 1);
    } catch (error) {
      zalogujANahlas('Chyba při přesunu na další WhatsApp zprávu', error);
      setAutoWhatsAppModal(false);
      setAutoWhatsAppMessage(null);
      setNewWhatsAppCount(0);
    }
  }, []);

  // Web Share Target hand-off: someone shared photo(s) from WhatsApp/e-mail
  // straight into the installed app. Grab them from IndexedDB and open the
  // import dialog automatically, pre-loaded with the shared photos.
  useEffect(() => {
    if (!autoOpenShareImport) return;
    let cancelled = false;
    (async () => {
      const { getPendingSharedFiles } = await import('../lib/sharedFiles');
      const files = await getPendingSharedFiles();
      if (cancelled) return;
      if (files.length) {
        setImportTarget(null);
        setShareInitialFiles(files);
        setShowImport(true);
      }
      onShareImportHandled?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenShareImport]);

  async function load(silent = false) {
    if (!silent && !orders.length) setLoading(true);
    const [{ data: o }, { data: pl }, { data: b }, { data: pk }, { data: bt }, { data: kg }, { data: inv }, { data: wo }, { data: zd }, { data: fa }, { data: fp }, { data: ak }, { data: pc }] = await Promise.all([
      fetchAllRows('orders', '*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('places').select('*').order('name'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      // Sloupce musí stačit SKLADOVÉ KNIZE (lib/stockLedger.ts) — ta bez
      // `package_id` řádek zahodí. Dřív se tu načítalo jen `beer_id`, protože
      // starý odznak sčítal všechny obaly jednoho piva dohromady; po přechodu
      // na skladovou knihu by tím odznak tiše přestal vidět cokoli.
      // Inventura potřebuje i `note` (rozlišuje počáteční stav od napočítaného),
      // stáčení lahví `kegs_used*` (sudy spotřebované na lahve).
      fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('inventory', 'entry_date,beer_id,package_id,quantity,note'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('zavoz_deductions', 'order_item_id,deduct_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      // Jen pro "Hodnota objednávky" v detailu (lib/hodnotaObjednavky.ts) —
      // appka měla ceník hotový, ale nikde ho k objednávkám nepřipojila.
      fetchAllRows('price_list', 'beer_id,package_id,price_per_unit,currency,valid_from,valid_to'),
    ]);
    const rawPk = (pk as Package[]) ?? [];
    const sortedPk = [...rawPk].sort((a, b) => {
      const isAKeg = a.kind === 'keg' || (a.label ?? '').toLowerCase().includes('keg') || (a.label ?? '').toLowerCase().includes('sud');
      const isBKeg = b.kind === 'keg' || (b.label ?? '').toLowerCase().includes('keg') || (b.label ?? '').toLowerCase().includes('sud');
      if (!isAKeg && isBKeg) return -1;
      if (isAKeg && !isBKeg) return 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    setOrders((o as Order[]) ?? []); setPlaces((pl as Place[]) ?? []); setBeers((b as Beer[]) ?? []); setPackages(sortedPk);
    setPriceList((pc as CenaPolozky[]) ?? []);
    setBottling((bt as EntryRow[]) ?? []); setKegging((kg as EntryRow[]) ?? []);
    setInventory((inv as EntryRow[]) ?? []); setWriteoffs((wo as EntryRow[]) ?? []);
    setZavozDeductionRows((zd as { order_item_id: string | null }[]) ?? []);
    setFasovaniRows((fa as EntryRow[]) ?? []); setProdejnaRows((fp as EntryRow[]) ?? []);
    setAkceRows((ak as AkceRow[]) ?? []);
    // Přefuk a dorovnání se dotahují zvlášť — odznak „Chybí skladem" je
    // potřebuje, ale zbytek obrazovky ne, tak ať nezdržují první vykreslení.
    void Promise.all([
      fetchAllRows('keg_prefuk', 'beer_id,from_package_id,to_package_id,from_count,to_count,entry_date'),
      fetchAllRows('inventory_adjustments', 'beer_id,package_id,entry_date,quantity'),
    ]).then(([pf, adj]) => {
      setPrefukRows((pf.data as any[]) ?? []);
      setAdjustmentRows((adj.data as any[]) ?? []);
    }).catch(() => { /* odznak se dopočítá bez nich, appka kvůli tomu nepadá */ });
    const ids = (o as Order[])?.map((x) => x.id) ?? [];
    if (ids.length) {
      const { data: it } = await fetchAllRows('order_items', '*').in('order_id', ids);
      const map: Record<string, OrderItem[]> = {};
      (it as OrderItem[])?.forEach((i) => { (map[i.order_id] ??= []).push(i); });
      setItems(map);
    }
    if (!silent) setLoading(false);
  }
  useEffect(() => { load(); }, []);
  // Chybělo bottling/kegging/inventory/writeoffs — load() si je natahuje pro
  // výpočet skladových odznaků ("chybí skladem" atd.), ale bez nich v seznamu
  // se appka o nový zápis stáčení/inventury/odpisu nikdy nedozvěděla a čísla
  // zůstala stará, dokud uživatel ručně neobnovil stránku.
  useRealtime(['orders','order_items','beers','packages','places','zavoz_deductions','bottling','kegging','inventory','writeoffs','fasovani','fasovani_private','akce','akce_items','price_list'], () => load(true));

  // 🔀 Požadavek z „Potřeba stočit KEGy / lahve“ (Kegging / Bottling): uživatel
  // klikl na řádek „Chybí X ks“ → otevřeme přehled objednávek rovnou filtrovaný
  // na dané pivo + obal, v rozsahu AKTUÁLNÍHO TÝDNE (stejné objednávky, které
  // potřeba stočení počítá) — ať je vidět, kam objednávky jdou.
  useEffect(() => {
    const req = consumeOrdersItemFilter();
    if (!req) return;
    setItemFilterBeerId(req.beerId);
    setItemFilterPackageId(req.packageId);
    setViewMode('detail');
    setTimeScope('week');
    setSearchText('');
    setStatusFilter('');
    setDeliveryDayFilter('all');
    window.scrollTo({ top: 0 });
     
  }, []);

  // 🔀 Řádek „Dnešek" → „X nevyřízených objednávek po termínu" dřív jen
  // přepnul na Objednávky s výchozím pohledem (aktuální týden, bez filtru
  // stavu), takže se ty konkrétní objednávky ztratily v celém seznamu.
  // Otevřeme rovnou filtrováno na přesně to, co ten řádek počítal (stejná
  // podmínka jako v Dnesek.tsx: status Nová, závoz dnes nebo dřív).
  useEffect(() => {
    if (!consumeOrdersOverdueFilter()) return;
    setOverdueOnly(true);
    setTimeScope('all');
    setStatusFilter('nova');
    setDeliveryDayFilter('all');
    setSearchText('');
    setItemFilterBeerId(null);
    setItemFilterPackageId(null);
    window.scrollTo({ top: 0 });
     
  }, []);

  // 🔀 Odznak s počtem na dlaždici „Objednávky" na Domů (nevyřízené tento
  // týden) — kliknutí na dlaždici dřív jen otevřelo obyčejný seznam bez
  // filtru stavu. Rozsah (aktuální týden) je stejný jako výchozí pohled,
  // stačí tedy navíc dofiltrovat na status Nová.
  useEffect(() => {
    if (!consumeOrdersPendingFilter()) return;
    setStatusFilter('nova');
    setTimeScope('week');
    setDeliveryDayFilter('all');
    setSearchText('');
    setItemFilterBeerId(null);
    setItemFilterPackageId(null);
    window.scrollTo({ top: 0 });
     
  }, []);

  const [timeScope, setTimeScope] = useState<'week' | 'month' | 'all'>('week');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => businessDateISO().slice(0, 7));
  const [packageKindFilter, setPackageKindFilter] = useState<DruhObaluFiltr>('all');

  function orderWeekKey(o: Order): string {
    return isoWeekKey(o.delivery_date || o.order_date);
  }

  const filtered = useMemo(() => {
    if (timeScope === 'all') return orders;
    if (timeScope === 'month') {
      return orders.filter((o) => (o.delivery_date || o.order_date).slice(0, 7) === selectedMonth);
    }
    return orders.filter((o) => orderWeekKey(o) === weekKey);
  }, [orders, timeScope, selectedMonth, weekKey]);
  const wr = weekRange(weekKey);

  // 📦 „Chybí skladem" — stav ke konci týdne závozu, ze SKLADOVÉ KNIHY.
  //
  // Dřív tu byl vlastní výpočet (poslední inventura z měsíce před aktuálním +
  // stočené tenhle týden − objednané − výdeje). Byl to sedmý nezávislý způsob,
  // jak spočítat sklad, a jediný mimo skladovou knihu: chyběl mu přefuk, sudy
  // spotřebované na lahve i dorovnání inventury, míchal měsíc starý základ s
  // týdenní výrobou a sčítal všechny obaly jednoho piva do jednoho čísla —
  // takže sto lahví „přebilo" schodek tří sudů a odznak nesvítil.
  // Podrobnosti a testy: lib/tydenniZbytek.ts.
  const pohybySkladu = useMemo<StockSources>(() => ({
    inventoryRows: inventory,
    bottlingRows: bottling,
    keggingRows: kegging,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows: writeoffs,
    zavozDeductionRows,
    akceRows,
    prefukRows,
    adjustmentRows,
    packages,
  }), [inventory, bottling, kegging, fasovaniRows, prodejnaRows, writeoffs, zavozDeductionRows, akceRows, prefukRows, adjustmentRows, packages]);

  // Počítá se jednou za týden, ne pro každou kartu zvlášť — karet bývá v
  // seznamu desítky a starý výpočet se pro každou z nich spouštěl celý znovu.
  //
  // Nález z auditu 15. 9. 2026: dřív se každá objednávka kontrolovala zvlášť
  // proti STEJNÉMU `zbytekKeKonciTydne` — dvě objednávky na stejné pivo+obal
  // tak mohly OBĚ vyjít „v pořádku", i když dohromady sklad nestačil.
  // Rozhodnutí uživatele: priorita podle dne dovozu, viz zbytekPodleObjednavek
  // v lib/tydenniZbytek.ts.
  const zbytkyPodleTydne = useRef(new Map<string, Map<string, Map<string, number>>>());
  useEffect(() => { zbytkyPodleTydne.current = new Map(); }, [pohybySkladu, orders, items]);
  function stockRemainingForOrder(o: Order): Map<string, number> {
    const wk = orderWeekKey(o);
    let hotove = zbytkyPodleTydne.current.get(wk);
    if (!hotove) {
      const konec = weekRange(wk).end.toISOString().slice(0, 10);
      const zbytek = zbytekKeKonciTydne(pohybySkladu, konec);
      const objednavkyTydne: ObjednavkaKPrioritě[] = orders
        .filter((ord) => ord.status !== 'storno' && orderWeekKey(ord) === wk)
        .map((ord) => ({
          order_id: ord.id,
          poradiDatum: ord.delivery_date || ord.order_date,
          polozky: (items[ord.id] ?? []).map((it) => ({
            order_item_id: it.id,
            beer_id: it.beer_id,
            package_id: it.package_id,
            beer_name: it.beer_name,
            quantity: Number(it.quantity),
          })),
        }));
      const jizOdecteno = new Set(
        zavozDeductionRows.filter((r) => r.order_item_id).map((r) => r.order_item_id as string)
      );
      hotove = zbytekPodleObjednavek(objednavkyTydne, zbytek, jizOdecteno);
      zbytkyPodleTydne.current.set(wk, hotove);
    }
    return hotove.get(o.id) ?? new Map();
  }

  async function addOrder(e?: React.FormEvent, sendWhatsApp = false) {
    e?.preventDefault();
    setErr(null);
    // 📝 Pokud uživatel napsal objednávku textem, ale tabulka je prázdná,
    // rozparsuj text automaticky při vytvoření objednávky.
    let rows = beerRows;
    if (manualText.trim()) {
      const parsed = parseOrderText(manualText, beers, packages, aliasMap);
      if (parsed.length) {
        rows = [...beerRows];
        let cursor = 0;
        for (const p of parsed) {
          while (cursor < rows.length && (rows[cursor].beerId || rows[cursor].pkgId || rows[cursor].qty)) cursor++;
          if (cursor >= rows.length) rows.push({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' });
          rows[cursor] = {
            beerId: p.beer_id ?? '',
            pkgId: p.package_id ?? '',
            qty: p.quantity != null ? String(p.quantity) : '',
            placeId: '',
            placeNameFree: '',
          };
          cursor++;
        }
      }
    }
    const filled = rows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
    if (!filled.length) { setErr('Vyplň alespoň jednu položku (pivo, obal, množství) nebo napiš objednávku textem výše.'); return; }
    if (deliveryInFutureMonth && !confirmNextMonth) { setErr('Potvrď zaškrtnutím výše, že závoz spadá do jiného měsíce, nebo uprav datum závozu.'); return; }
    setSaving(true);

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Group items by target place (if item specifies custom place, use it; otherwise use global form place)
    const groups = new Map<string, { resolvedPlaceId: string | null; resolvedName: string | null; rows: typeof filled }>();

    for (const r of filled) {
      const itemPlaceId = r.placeId !== undefined && r.placeId !== '' ? r.placeId : placeId;
      const itemPlaceName = r.placeNameFree !== undefined && r.placeNameFree !== '' ? r.placeNameFree : placeNameFree;

      let resolvedPlaceId = itemPlaceId || null;
      let resolvedName = itemPlaceId ? (places.find((p) => p.id === itemPlaceId)?.name ?? itemPlaceName.trim()) : itemPlaceName.trim();

      if (!itemPlaceId && resolvedName) {
        const existing = places.find((p) => norm(p.name) === norm(resolvedName));
        if (existing) {
          resolvedPlaceId = existing.id;
          resolvedName = existing.name;
        }
      }

      const key = resolvedPlaceId ? `id:${resolvedPlaceId}` : `name:${resolvedName.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { resolvedPlaceId, resolvedName: resolvedName || null, rows: [] });
      }
      groups.get(key)!.rows.push(r);
    }

    // Keep track of the first created order ID for tap reservation
    let firstOrderId: string | undefined;
    let firstPlaceName: string | undefined;
    let firstOrderItems: { beer_name: string | null; package_label: string | null; quantity: number }[] | undefined;

    try {
      for (const group of groups.values()) {
        let pId = group.resolvedPlaceId;
        if (!pId && group.resolvedName) {
          const place = await getOrCreatePlace(group.resolvedName, places);
          if (place) pId = place.id;
        }

        const { data: order, error } = await supabase.from('orders').insert({
          order_date: date, place_id: pId, place_name: group.resolvedName || null,
          source: 'rucne', status: 'nova', delivery_day: deliveryDay || null,
          delivery_date: deliveryDate || null,
          is_prepared: false, is_packaged: false, note: note.trim() || null,
        }).select().single();
        if (error) throw new Error(error.message);
        oznacVlastniObjednavku(order.id);

        if (!firstOrderId) {
          firstOrderId = order.id;
          firstPlaceName = group.resolvedName || undefined;
        }

        const itemRows = group.rows.map((r) => {
          const beer = beers.find((b) => b.id === r.beerId);
          const pkg = packages.find((p) => p.id === r.pkgId);
          return { order_id: order.id, beer_id: r.beerId, beer_name: beer?.name ?? null, package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: Number(r.qty) };
        });

        const { error: itemErr } = await supabase.from('order_items').insert(itemRows);
        if (itemErr) throw new Error(itemErr.message);

        if (!firstOrderItems) firstOrderItems = itemRows;
      }

      // 📤 Volitelné odeslání shrnutí (jen první vytvořené objednávky, pokud
      // se odesílá víc odběratelů najednou) přes WhatsApp — otevře appku
      // WhatsApp s předvyplněnou zprávou, uživatel jen vybere kam poslat.
      if (sendWhatsApp && firstOrderItems) {
        shareOrderToWhatsApp(
          { place_name: firstPlaceName || null, order_date: date, delivery_day: deliveryDay || null, delivery_date: deliveryDate || null, note: note.trim() || null },
          firstOrderItems
        );
      }

      // Upomínka 48 hodin předem — ale JEN na závoz v příštím týdnu a dál.
      // Na závoz v probíhajícím týdnu upomínka nedává smysl: ten je vidět
      // v Objednávkách, v Závozu i v přehledu Dnešek a další hlášení z toho
      // dělá jen šum, který se odklikává bez čtení.
      const zavozTentoTyden = !!deliveryDate && isoWeekKey(deliveryDate) === isoWeekKey(businessDateISO());
      if (deliveryDate && !zavozTentoTyden) {
        try {
          const reminderDate = new Date(deliveryDate + 'T09:00:00');
          reminderDate.setDate(reminderDate.getDate() - 2); // 48 hodin předem
          const reminderDateTime = reminderDate.toISOString().slice(0, 16);
          const placeName = placeNameFree || places.find(p => p.id === placeId)?.name || 'Neznámý odběratel';
          const itemsSummary = filledBeerRows.map(r => {
            const beer = beers.find(b => b.id === r.beerId);
            const pkg = packages.find(p => p.id === r.pkgId);
            return `${beer?.name ?? '?'} ${pkg?.volume_l ?? '?'}L × ${r.qty}ks`;
          }).join(', ');
          await createReminder({
            title: `Závoz: ${placeName}`,
            note: `Objednávka na ${deliveryDate}\n${itemsSummary}${note ? `\nPoznámka: ${note}` : ''}`,
            date_time: reminderDateTime,
            target_role: 'all',
            display_mode: 'both',
            created_by: 'Systém (Objednávky)',
          });
        } catch (reminderErr) {
          // Tichá chyba — upomínka není kritická
          console.warn('Nepodařilo se vytvořit upomínku:', reminderErr);
        }
      }

      // 📅 UPOZORNĚNÍ NA ZAČÁTKU TÝDNE — když je objednávka na termín v BUDOUCÍM
      // týdnu (např. 25.8.), upozorníme na začátku toho týdne (pondělí 9:00),
      // že v něm proběhne závoz. Objednávka se jinak řadí už podle delivery_date
      // do správného týdne (25.8. = týden 25.8.), ne do aktuálního.
      if (deliveryDate) {
        try {
          const dT = new Date(deliveryDate + 'T00:00:00Z');
          if (!isNaN(dT.getTime())) {
            // Pondělí = začátek ISO týdne
            const dow = (dT.getUTCDay() + 6) % 7; // 0=pondělí
            const mondayMs = dT.getTime() - dow * 86400000;
            const startOfWeek = new Date(mondayMs);
            const startOfWeekIso = startOfWeek.toISOString().slice(0, 10);
            // Začátek týdne procesní nový (budoucí) vs dnes (místní den)
            const todayLocal = new Date();
            const todayStart = new Date(Date.UTC(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate()));
            if (startOfWeekIso > todayStart.toISOString().slice(0, 10)) {
              const existing = getLocalReminders();
              const already = existing.some((r) =>
                (r.title || '').includes('Závoz tento týden') && (r.note || '').includes(`týden ${startOfWeekIso}`)
              );
              if (!already) {
                const placeNameWk = placeNameFree || places.find((p) => p.id === placeId)?.name || 'Neznámý odběratel';
                const itemsSummaryWk = filledBeerRows.map((r) => {
                  const beer = beers.find((b) => b.id === r.beerId);
                  const pkg = packages.find((p) => p.id === r.pkgId);
                  return `${beer?.name ?? '?'} ${pkg?.volume_l ?? '?'}L × ${r.qty}ks`;
                }).join(', ');
                await createReminder({
                  title: `Závoz tento týden: ${placeNameWk}`,
                  note: `Závoz proběhne v týdnu od ${startOfWeekIso} (datum: ${deliveryDate}).\n${itemsSummaryWk}${note ? `\nPoznámka: ${note}` : ''}`,
                  date_time: `${startOfWeekIso}T09:00`,
                  target_role: 'all',
                  display_mode: 'both',
                  created_by: 'Systém (Objednávky)',
                });
              }
            }
          }
        } catch (weekReminderErr) {
          // Tichá chyba — upomínka není kritická
          console.warn('Nepodařilo se vytvořit týdenní upomínku:', weekReminderErr);
        }
      }

      // 🚰 Výčep — zaškrtnuto „Půjčení výčepu" nebo zmínka v poznámce
      const trimmedNote = note.trim();
      const isVycepMentioned = isTapMentioned(trimmedNote);
      if ((wantTap || isVycepMentioned) && firstOrderId) {
        if (tapReservedEarly) {
          // Rezervace byla potvrzena už před uložením — jen ji propojíme s objednávkou
          linkLatestReservationToOrder(firstOrderId);
          finishOrderForm();
          return;
        }
        setTapModalOrderId(firstOrderId);
        setTapModalCustomer(firstPlaceName || placeNameFree || places.find(p => p.id === placeId)?.name || '');
        setTapModalAfterSave(true);
        setShowTapModal(true);
        setSaving(false);
        return; // Stop — modal will handle the rest
      }

      // Bez výčepu — dokončíme normálně
      finishOrderForm();
    } catch (err: any) {
      setErr(err.message ?? 'Chyba při vytváření objednávky');
    } finally {
      if (!showTapModal) setSaving(false);
    }
  }

  /** Dokončí formulář po vytvoření objednávky (vyčistí položky a znovu načte data) */
  function finishOrderForm() {
    setBeerRows(Array.from({ length: 4 }, () => ({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' })));
    setNote(''); setDeliveryDate(''); setDeliveryDay(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    setWeekKey(isoWeekKey(deliveryDate || date));
    setWantTap(false); setTapReservedEarly(false);
    setSaving(false);
    load();
  }

  /** Called after tap reservation modal is confirmed or skipped */
  function handleTapModalDone() {
    setShowTapModal(false);
    setTapModalOrderId(undefined);
    // Okno otevřené ze zaškrtávacího pole „Půjčení výčepu" před uložením —
    // jen ho zavřeme a necháme formulář nedotčený.
    if (!tapModalAfterSave) return;
    setTapModalAfterSave(false);
    // Okno otevřené po uložení objednávky — dokončíme tok vytvoření.
    finishOrderForm();
  }

  async function updateDeliveryDay(o: Order, day: string) {
    // ⚠️ S dnem se musí posunout i DATUM. `delivery_day` a `delivery_date`
    // popisují tutéž věc a dřív se tady měnil jen den — takže si obě pole
    // mohla odporovat. Plán stáčení se řídí dnem, ale filtr týdne, Závoz
    // a přehledy datem: objednávka přehozená ze středy na úterý pak byla
    // v plánu na úterý a v datu pořád na středě.
    const patch: Record<string, unknown> = { delivery_day: day || null };
    const noveDatum = day ? datumProDenVTydnu(day, o.delivery_date || o.order_date) : null;
    if (noveDatum) patch.delivery_date = noveDatum;
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, ...patch } as Order : x));
  }
  async function setStatus(o: Order, status: string) {
    // Přes RPC, aby se při stornu zároveň uklidil odpočet závozu. Ten se
    // dělá automaticky v 1:00 ráno v den závozu — když odběratel objednávku
    // dopoledne zruší, odpočet dřív zůstal navždy a sklad byl trvale nižší
    // o zrušené sudy (v inventuře pak nevysvětlitelný přebytek).
    // Obojí v jedné transakci, takže nemůže nastat půl na půl.
    const { error } = await supabase.rpc('set_order_status', {
      p_order_id: o.id,
      p_status: status,
    });
    if (error) {
      setErr(`Změna stavu se nepovedla: ${error.message}`);
      return;
    }
    load();
  }
  async function toggleFlag(o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') {
    const patch: Record<string, unknown> = { [key]: !o[key] };
    if (key === 'is_delivered') patch.delivered_at = !o[key] ? new Date().toISOString() : null;
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, ...patch } as Order : x));
  }
  /**
   * Odškrtnutí položky — „stočeno" a „připraveno" přímo v přehledu.
   *
   * Zapisuje do TÝCHŽ sloupců, které odškrtává Závoz
   * (`order_items.is_bottled` / `is_prepared`), takže se to propíše na obě
   * strany: co se odškrtne u sklepa, vidí řidič, a co odškrtne řidič, zmizí
   * z práce ve sklepě. Vlastní příznak jen pro tuhle obrazovku by znamenal
   * dvě pravdy o jedné bedně piva.
   *
   * U „připraveno" se navíc dopočítá příznak celé objednávky — stejně jako
   * to dělá Závoz, protože podle něj se objednávka tváří jako nachystaná.
   */
  // Aktivní tanky pro automatické stočení ze zaškrtnutí — stejná data,
  // jaká by nabídl ruční zápis v Začátek stáčení (viz lib/tankUZapisu.ts).
  async function nactiAktivniTanky(): Promise<TankKOdectu[]> {
    const { data, error } = await fetchAllRows<TankKOdectu>(
      'cellar_tanks',
      'id,current_beer_id,kegging_active,status,current_volume_l',
    );
    if (error || !data) return [];
    return data;
  }

  async function toggleItemFlag(o: Order, it: OrderItem, key: 'is_bottled' | 'is_prepared') {
    const nova = !it[key];
    const { error } = await supabase.from('order_items').update({ [key]: nova }).eq('id', it.id);
    if (error) { chyba('Nepovedlo se uložit: ' + error.message); return; }

    const dalsi = (items[o.id] ?? []).map((x) => (x.id === it.id ? { ...x, [key]: nova } : x));
    setItems((m) => ({ ...m, [o.id]: dalsi }));

    if (key === 'is_prepared') {
      const hotovo = vseHotovo(dalsi, 'is_prepared');
      if (hotovo !== o.is_prepared) {
        await supabase.from('orders').update({ is_prepared: hotovo }).eq('id', o.id);
        setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, is_prepared: hotovo } : x)));
      }
    }

    // Stočeno u sudu rovnou založí (nebo při odškrtnutí zruší) skutečný
    // záznam stáčení — viz lib/staceniZPolozky.ts. Lahve appka nepozná,
    // kolik sudů surového piva se na ně spotřebovalo, takže tam se dál
    // jen odškrtává, beze změny.
    if (key === 'is_bottled') {
      const chybaZapisu = nova
        ? await zapisStaceniZPolozky(it, packages, await nactiAktivniTanky(), businessDateISO())
        : await zrusStaceniZPolozky(it.id);
      if (chybaZapisu) chyba(chybaZapisu);
    }
  }

  async function del(id: string) {
    if (!(await potvrd('Smazat objednávku?'))) return;
    // Objednávka už mohla mít proběhlý automatický odpočet závozu
    // (zavoz_deductions) — bez smazání těchto řádků FK constraint smazání
    // objednávky odmítne (409) a bez kontroly chyby to vypadá, že se
    // "nic nestalo".
    await supabase.from('zavoz_deductions').delete().eq('order_id', id);
    await supabase.from('order_items').delete().eq('order_id', id);
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) { chyba('Smazání se nepodařilo: ' + error.message); return; }
    load();
  }

  const [zavozOnly, setZavozOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deliveryDayFilter, setDeliveryDayFilter] = useState<string>('all');

  // 🔎 Přišli jsme z rychlého hledání („Maneo" → jeho objednávky).
  // Kromě textu se musí uvolnit i ostatní filtry a rozsah času na „vše" —
  // jinak by hledaný odběratel vypadal, že žádné objednávky nemá, protože
  // výchozí pohled je jen tenhle týden a to je nejčastější případ, kdy se
  // hledá objednávka starší.
  function nastavHledani(text: string) {
    setSearchText(text);
    setStatusFilter('');
    setDeliveryDayFilter('all');
    setItemFilterBeerId(null);
    setItemFilterPackageId(null);
    setPackageKindFilter('all');
    setZavozOnly(false);
    setOverdueOnly(false);
    setTimeScope('all');
  }
  useEffect(() => {
    const text = consumeOrdersHledani();
    if (text) nastavHledani(text);
     
  }, []);
  // Pro případ, že obrazovka UŽ je otevřená (hledání spuštěné z Objednávek) —
  // mount efekt výše se znovu nespustí.
  useEffect(() => {
    const naHledani = (e: Event) => {
      consumeOrdersHledani();
      const text = (e as CustomEvent).detail;
      if (typeof text === 'string' && text) nastavHledani(text);
    };
    window.addEventListener(ORDERS_HLEDANI_EVENT, naHledani);
    return () => window.removeEventListener(ORDERS_HLEDANI_EVENT, naHledani);
     
  }, []);
  const [groupByDay, setGroupByDay] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function norm(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  // Jedna položka objednávky vyhovuje AKTUÁLNÍ KOMBINACI filtrů obalu a druhu
  // piva zároveň (ne každý filtr zvlášť přes celou objednávku) — takže při
  // zadání obalu I piva se vyfiltrují jen objednávky, které mají DANÝ druh
  // piva v DANÉM obalu na stejném řádku, ne kteroukoli kombinaci napříč
  // různými řádky objednávky.
  function matchesItemFilters(item: OrderItem): boolean {
    if (itemFilterBeerId && item.beer_id !== itemFilterBeerId) return false;
    if (itemFilterPackageId && item.package_id !== itemFilterPackageId) return false;
    // Sudy / petky / lahve rozhoduje lib/druhObalu.ts nad `skupinaObalu()`.
    // Dřív se tu porovnával jen label na „keg"/„sud" a všechno ostatní byla
    // jedna hromada, takže petky nešly oddělit od skla (převzato z PR #32).
    if (packageKindFilter !== 'all') {
      const pkg = packages.find((p) => p.id === item.package_id);
      if (!vyhovujeDruhu(pkg, packageKindFilter)) return false;
    }
    return true;
  }
  // Jestli je aktivní filtr piva/obalu/druhu (stejná podmínka jako
  // u searchedFiltered níž). Objednávka se do seznamu pustí celá, jakmile
  // jí vyhoví jeden řádek — karta pak dostane matchesItemFilters a schová
  // řádky, které nevyhoví. Z provozu 9. 9. 2026: „dal jsem filtr na sudy KEG
  // a stejně tam vidím objednávky na PET 1l" (převzato z PR #37).
  const polozkovyFiltrAktivni = !!(itemFilterBeerId || itemFilterPackageId || packageKindFilter !== 'all');

  const searchedFiltered = useMemo(() => {
    const q = norm(searchText);
    const dnes = businessDateISO();
    // Hledání textem prohledá VŠECHNY objednávky, ne jen ty ve zvoleném
    // období (týden/měsíc) — z provozu 15. 9. 2026: „ať to hledá všechny
    // objednávky toho odběratele". Bez textu se chová jako dřív (jen `filtered`).
    const zaklad = q ? orders : filtered;
    return zaklad.filter((o) => {
      if (zavozOnly && o.is_delivered) return false;
      // Stejná podmínka jako řádek „nevyřízené objednávky po termínu" v Dnesek.tsx.
      if (overdueOnly && (o.status !== 'nova' || !o.delivery_date || o.delivery_date > dnes)) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (deliveryDayFilter !== 'all') {
        if (deliveryDayFilter === '_none' && o.delivery_day) return false;
        if (deliveryDayFilter !== '_none' && o.delivery_day !== deliveryDayFilter) return false;
      }
      const its = items[o.id] ?? [];
      // Obal + druh piva se vyhodnocují SPOLEČNĚ na jedné položce (viz matchesItemFilters výše)
      if ((itemFilterBeerId || itemFilterPackageId || (packageKindFilter && packageKindFilter !== 'all')) && !its.some(matchesItemFilters)) return false;

      if (q) {
        const placeMatch = norm(o.place_name ?? '').includes(q);
        const beerMatch = its.some((i) => norm(i.beer_name ?? '').includes(q));
        const noteMatch = norm(o.note ?? '').includes(q);
        if (!placeMatch && !beerMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [filtered, orders, zavozOnly, overdueOnly, statusFilter, deliveryDayFilter, searchText, items, itemFilterBeerId, itemFilterPackageId, packageKindFilter, packages]);

  // 🧮 Záložka „Celkem“ — souhrn objednaného množství podle varianty (pivo + obal)
  // v aktuálně zvoleném rozsahu (týden / měsíc / vše). Storno se nepočítá.
  const variantTotals = useMemo(() => computeVariantTotals(filtered, items), [filtered, items]);

  // Počítání vytažené do lib/objednavkyStatistika.ts (má vlastní testy).
  // Tady zůstalo jen to, co bez obrazovky nemá smysl: KTERÉ položky filtru
  // vyhovují. Součty samotné se daly zkazit tiše — „NaN ks" nebo započtené
  // storno — a přitom je to číslo, podle kterého se chystá pivo.
  const itemAuditStats = useMemo(() => {
    if (!itemFilterBeerId && !itemFilterPackageId && packageKindFilter === 'all' && !searchText.trim()) {
      return null;
    }

    const matchItem = (item: OrderItem) => {
      if (!matchesItemFilters(item)) return false;
      if (searchText.trim()) {
        const q = norm(searchText);
        const bName = norm(item.beer_name ?? '');
        if (!bName.includes(q)) return false;
      }
      return true;
    };

    const p = poctyPolozek({
      videne: searchedFiltered,
      vsechny: orders,
      polozky: items,
      vyhovuje: matchItem,
    });

    // Jména polí zůstávají, jak byla — obrazovka je má na šesti místech
    // a přejmenovat je není součástí téhle úpravy.
    return {
      currentViewQty: p.kusyVeVyberu,
      currentViewOrdersCount: p.objednavekVeVyberu,
      currentViewItemsCount: p.polozekVeVyberu,
      allOrdersQty: p.kusyCelkem,
      allOrdersCount: p.objednavekCelkem,
      hasHiddenOrders: p.jsouSkryteObjednavky,
    };
  }, [itemFilterBeerId, itemFilterPackageId, packageKindFilter, searchText, searchedFiltered, orders, items, packages]);

  const groupedByDay = useMemo(() => {
    if (!groupByDay) return null;
    const map = new Map<string, Order[]>();
    searchedFiltered.forEach((o) => {
      const key = o.delivery_day || '_none';
      (map.get(key) ?? map.set(key, []).get(key)!).push(o);
    });
    const order = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne', '_none'];
    return order.filter((k) => map.has(k)).map((k) => ({ key: k, orders: map.get(k)! }));
  }, [groupByDay, searchedFiltered]);

  // ---- Hromadné akce ----
  function toggleSelect(id: string) {
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAll() {
    setSelectedIds(new Set(searchedFiltered.map((o) => o.id)));
  }
  function clearSelection() { setSelectedIds(new Set()); }
  async function bulkSetStatus(status: string) {
    if (!selectedIds.size) return;
    // Přes RPC po jedné, stejně jako setStatus(). Hromadný UPDATE měnil jen
    // stav a při stornu nechával odpočet zavozu ležet — sklad pak zůstal
    // trvale nižší o zrušené zboží a v inventuře z toho byl nevysvětlitelný
    // přebytek. Hromadné RPC neexistuje a objednávek je málo, takže smyčka.
    const nepovedlo: string[] = [];
    for (const id of [...selectedIds]) {
      const { error } = await supabase.rpc('set_order_status', { p_order_id: id, p_status: status });
      if (error) nepovedlo.push(error.message);
    }
    if (nepovedlo.length) setErr(`Změna stavu se nepovedla u ${nepovedlo.length} objednávek: ${nepovedlo[0]}`);
    clearSelection(); load();
  }
  async function bulkToggleFlag(key: 'is_prepared' | 'is_packaged' | 'is_delivered') {
    if (!selectedIds.size) return;
    const patch: Record<string, unknown> = { [key]: true };
    if (key === 'is_delivered') patch.delivered_at = new Date().toISOString();
    await supabase.from('orders').update(patch).in('id', [...selectedIds]);
    clearSelection(); load();
  }
  async function bulkDelete() {
    if (!selectedIds.size) return;
    if (!(await potvrd(`Smazat ${selectedIds.size} vybraných objednávek?`))) return;
    const ids = [...selectedIds];
    await supabase.from('zavoz_deductions').delete().in('order_id', ids);
    await supabase.from('order_items').delete().in('order_id', ids);
    const { error } = await supabase.from('orders').delete().in('id', ids);
    if (error) { chyba('Smazání se nepodařilo: ' + error.message); return; }
    clearSelection(); load();
  }

  // ---- Duplikace objednávky ----
  async function duplicateOrder(o: Order) {
    const its = items[o.id] ?? [];
    if (!its.length) return;
    const today = businessDateISO();
    const { data: newOrder, error } = await supabase.from('orders').insert({
      order_date: today, place_id: o.place_id, place_name: o.place_name,
      source: 'duplikat', status: 'nova', delivery_day: o.delivery_day,
      delivery_date: null, is_prepared: false, is_packaged: false, note: o.note,
    }).select().single();
    if (error || !newOrder) return;
    oznacVlastniObjednavku(newOrder.id);
    const rows = its.map((i) => ({
      order_id: newOrder.id, beer_id: i.beer_id, beer_name: i.beer_name,
      package_id: i.package_id, package_label: i.package_label, quantity: i.quantity,
    }));
    await supabase.from('order_items').insert(rows);
    setWeekKey(isoWeekKey(today));
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load();
  }

  /**
   * ↻ Zopakovat celý závozový den. Objednávky se týden po týdnu opakují
   * skoro totožně, ale duplikovat se dala jen JEDNA — u dvaceti objednávek
   * je to dvacet klepnutí a snadno se na některou zapomene.
   *
   * Kopírují se VŠECHNY objednávky, které jsou právě vidět (tedy i s
   * filtrem, kdyby si někdo chtěl zopakovat jen část) a mají aspoň jednu
   * položku. Storno se vynechává — zrušená objednávka se opakovat nemá.
   * Nová objednávka vzniká vždy jako „nová" a nezavezená, ať projde
   * normální kontrolou; datum závozu se nechává prázdné a den v týdnu
   * zůstane, takže se objednávka objeví ve stejný den nového týdne.
   */
  const [kopirujiDen, setKopirujiDen] = useState(false);
  async function zopakujDen() {
    const kZopakovani = searchedFiltered
      .filter((o) => o.status !== 'storno')
      .filter((o) => (items[o.id] ?? []).length > 0);
    if (kZopakovani.length === 0) {
      oznam('Není co zopakovat — žádná z viditelných objednávek nemá položky.');
      return;
    }
    const kusu = kZopakovani.reduce(
      (a, o) => a + (items[o.id] ?? []).reduce((b, i) => b + Number(i.quantity || 0), 0), 0,
    );
    const ok = await potvrd(
      `Zopakovat ${kZopakovani.length} objednávek (${kusu} ks) k dnešnímu dni?`
      + ' Vzniknou nové objednávky ve stavu „nová"; ty původní zůstanou, jak jsou.',
      { titulek: 'Zopakovat celý závoz', potvrdit: `Zopakovat ${kZopakovani.length}` },
    );
    if (!ok) return;

    setKopirujiDen(true);
    const dnes = businessDateISO();
    const vznikle: string[] = [];
    let selhalo = 0;
    for (const o of kZopakovani) {
      const { data: nova, error } = await supabase.from('orders').insert({
        order_date: dnes, place_id: o.place_id, place_name: o.place_name,
        source: 'duplikat', status: 'nova', delivery_day: o.delivery_day,
        delivery_date: null, is_prepared: false, is_packaged: false, is_delivered: false,
        note: o.note,
      }).select().single();
      if (error || !nova) { selhalo += 1; continue; }
      oznacVlastniObjednavku(nova.id);
      const radky = (items[o.id] ?? []).map((i) => ({
        order_id: nova.id, beer_id: i.beer_id, beer_name: i.beer_name,
        package_id: i.package_id, package_label: i.package_label, quantity: i.quantity,
      }));
      const { error: chybaRadku } = await supabase.from('order_items').insert(radky);
      // Objednávka bez položek je horší než žádná — kdyby se položky
      // nevložily, hlavička se hned uklidí, ať nezůstane prázdná.
      if (chybaRadku) {
        await supabase.from('orders').delete().eq('id', nova.id);
        selhalo += 1;
        continue;
      }
      vznikle.push(nova.id);
    }
    setKopirujiDen(false);
    setWeekKey(isoWeekKey(dnes));
    load();

    if (selhalo > 0) {
      chyba(`Zopakováno ${vznikle.length} z ${kZopakovani.length} objednávek, ${selhalo} se nepovedlo.`);
      return;
    }
    // Vrátit zpět: smažou se PRÁVĚ VZNIKLÉ objednávky podle id, ne podle
    // data — jinak by se smazalo i to, co dnes někdo zapsal ručně.
    toastZpet(`Zopakováno ${vznikle.length} objednávek.`, async () => {
      await supabase.from('order_items').delete().in('order_id', vznikle);
      const { error } = await supabase.from('orders').delete().in('id', vznikle);
      if (error) throw error;
      load();
    });
  }

  /**
   * 🏠 Karta odběratele. Ukáže se jen tehdy, když je ve výběru JEDEN
   * odběratel — tedy typicky po hledání („Maneo") nebo po klepnutí na
   * odběratele v rychlém hledání. Jinak by to byl panel bez obsahu nad
   * seznamem dvaceti hospod.
   *
   * Bere se ze VŠECH objednávek toho odběratele (ne z právě zobrazených),
   * protože rytmus a „co bere" se z jednoho týdne poznat nedá.
   */
  const karta = useMemo(() => {
    const jmena = new Set(
      searchedFiltered.map((o) => (o.place_name ?? '').trim()).filter((x) => x.length > 0),
    );
    if (jmena.size !== 1) return null;
    const jmeno = [...jmena][0];
    const jehoObjednavky = orders.filter((o) => (o.place_name ?? '').trim() === jmeno);
    if (jehoObjednavky.length === 0) return null;
    const jehoPolozky = jehoObjednavky.flatMap((o) => (items[o.id] ?? []).map((i) => ({
      order_id: o.id,
      beer_id: i.beer_id,
      beer_name: i.beer_name,
      package_id: i.package_id,
      package_label: i.package_label,
      quantity: i.quantity,
    })));
    const data = kartaOdberatele(
      jehoObjednavky.map((o) => ({
        id: o.id,
        datum: o.delivery_date || o.order_date,
        status: o.status,
      })),
      jehoPolozky,
      businessDateISO(),
    );
    // Poslední objednávka jako celý řádek — z ní se dělá „to co posledně"
    // a duplikuje se úplně stejně jako klepnutím na kopírování v kartě.
    const posledniRadek = data.posledni
      ? jehoObjednavky.find(
        (o) => o.status !== 'storno' && (o.delivery_date || o.order_date) === data.posledni,
      ) ?? null
      : null;
    return { jmeno, data, posledniRadek };
  }, [searchedFiltered, orders, items]);

  const openDetail = (o: Order) => {
    setDetail(o);
    setTimeout(() => {
      document.getElementById('order-detail-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // 🔗 Proklik odjinud na konkrétní objednávku (openOrderId). Detail card se
  // renderuje jen mezi objednávkami, co projdou filtrem — objednávka z jiného
  // týdne by tak proklikem otevřená být "měla", ale nic by se nezobrazilo.
  // Proto se zároveň zruší týdenní/měsíční omezení (timeScope 'all'), ať je
  // vidět jistě.
  const openedForIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openOrderId || loading || openedForIdRef.current === openOrderId) return;
    const o = orders.find((x) => x.id === openOrderId);
    if (!o) return;
    openedForIdRef.current = openOrderId;
    setTimeScope('all');
    openDetail(o);
  }, [openOrderId, orders, loading]);

  function handleVoiceResult(text: string) {
    const parsedOrder = parseVoiceOrder(text, beers, packages, places, undefined, placeAliasMap);
    const parsed = parsedOrder.items;
    if (!parsed.length && !parsedOrder.placeName) {
      setErr('Nerozpoznal jsem zadnou polozku z hlasu. Zkus to znovu, napr. "hospoda U Zajice 6x jantar 0.5".');
      return;
    }

    let resolvedPlaceId = parsedOrder.placeId;
    let resolvedPlaceName = parsedOrder.placeName;

    // If placeName is present but no placeId, try to find an existing place
    if (!resolvedPlaceId && resolvedPlaceName) {
      const normalizedParsedName = norm(resolvedPlaceName);
      const existingPlace = places.find(p => norm(p.name) === normalizedParsedName);
      if (existingPlace) {
        resolvedPlaceId = existingPlace.id;
        resolvedPlaceName = existingPlace.name;
      }
    }

    setPlaceId(resolvedPlaceId ?? '');
    setPlaceNameFree(resolvedPlaceName ?? '');

    if (parsed.length) {
      setBeerRows((rs) => {
        const next = [...rs];
        let cursor = 0;
        for (const p of parsed) {
          while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
          if (cursor >= next.length) { next.push({ beerId: '', pkgId: '', qty: '' }); }
          next[cursor] = {
            beerId: p.beer_id ?? '',
            pkgId: p.package_id ?? '',
            qty: p.quantity != null ? String(p.quantity) : '',
          };
          cursor++;
        }
        return next;
      });
    }
    const autoNote = detectOrderNotes(text);
    if (autoNote) {
      setNote((prev) => (prev ? `${prev}, ${autoNote}` : autoNote));
    }
    setErr(null);
  }

  // 📝 Ruční zadání objednávky textem — uživatel napíše objednávku (např.
  // "2x KEG30 12svetly, 1x KEG50 10desitka") a ta se automaticky rozparsuje
  // do tabulky položek (pivo, obal, množství). Tím se aktivuje tlačítko
  // "Vytvořit objednávku", i když uživatel nechce vyplňovat tabulku ručně.
  function handleManualTextParse() {
    const text = manualText.trim();
    if (!text) { setErr('Napiš objednávku, např. "2x KEG30 12svetly, 1x KEG50 10desitka".'); return; }
    const parsed = parseOrderText(text, beers, packages, aliasMap);
    if (!parsed.length) {
      setErr('Nerozpoznal jsem žádnou položku. Zkus to napsat jinak, např. "2x KEG30 12svetly".');
      return;
    }
    setBeerRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) next.push({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' });
        next[cursor] = {
          beerId: p.beer_id ?? '',
          pkgId: p.package_id ?? '',
          qty: p.quantity != null ? String(p.quantity) : '',
          placeId: '',
          placeNameFree: '',
        };
        cursor++;
      }
      return next;
    });
    const autoNote = detectOrderNotes(text);
    if (autoNote) setNote((prev) => (prev ? `${prev}, ${autoNote}` : autoNote));
    setErr(null);
  }

  function handleItemClick(beerId: string, packageId: string) {
    setItemFilterBeerId(beerId);
    setItemFilterPackageId(packageId);
    setViewMode('detail');
    setSearchText(''); // Clear general search when applying item filter
    setStatusFilter(''); // Clear status filter
    setDeliveryDayFilter('all'); // Clear day filter
    setPackageKindFilter('all'); // Filtrujeme přesně pivo+obal, ne jen druh obalu
  }

  // Panel akcí (Nové / Hlasové / Text / WhatsApp / Kontrola / Audit / Fotka)
  // patří jen do zadávání nové objednávky, ne do Přehledu a Celkem — tam
  // je to jen clutter nad seznamem. „Nové" a „Text" jsou dva vstupní
  // režimy, oba panel ukazují; detail (Přehled) a celkem ne.
  const zadaniViditelne = viewMode === 'summary' || viewMode === 'text';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar — bez nadpisu "Objednávky": to už říká záložka nahoře, duplicitní popisek by byl zbytečný. */}
      {(zadaniViditelne || (mode === 'overviews_only' && setPage)) && (
      <div className="flex flex-wrap items-center justify-end gap-2 bg-white p-2.5 rounded-2xl border border-neutral-200 shadow-2xs">
        <div className="flex flex-col gap-2 items-stretch sm:items-end w-full sm:w-auto">
          {mode === 'overviews_only' && setPage && (
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:flex-nowrap sm:justify-end w-full sm:w-auto">
              <button className="btn-primary !rounded text-xs font-black shadow-md" onClick={() => setPage('orders_entry')}>
                <FilePlus size={14} /> + Zadávání objednávek
              </button>
              <button className="btn-ghost !rounded !bg-emerald-50 border border-emerald-300 text-emerald-950 font-black text-xs shadow-xs" onClick={() => setPage('fasovani')}>
                <PackageCheck size={14} /> Fasování →
              </button>
            </div>
          )}

          {/* Nové / Hlasové zadání / Text / WhatsApp / Kontrola / Audit / Fotka —
              jeden řádek, jednotná velikost a styl (černé pozadí, bílý text),
              jedinou výjimkou zůstává zelený WhatsApp.

              Na telefonu mřížka 2×N, ne zalamovaný `flex justify-end`: ten
              každý zalomený řádek zarovnával doprava, takže sedm různě
              širokých tlačítek vytvořilo schody a nešlo v nich najet očima.
              V mřížce mají všechna stejnou šířku a hrany sedí pod sebou. */}
          {zadaniViditelne && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:items-center sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {mode !== 'entry_only' && (
              <button
                className={`btn-ghost !rounded !min-h-[44px] !py-1.5 font-black text-xs shadow-xs flex items-center gap-1.5 ${viewMode === 'summary' ? '!bg-amber-500 !border-amber-500 !text-[#0f172a]' : '!bg-amber-50 !border-amber-200 !text-amber-900 hover:!bg-amber-100'}`}
                onClick={() => setViewMode('summary')}
              >
                <Plus size={14} /> Nové
              </button>
            )}
            <VoiceRecorder
              compact
              dark
              beerNames={beers.map((b) => b.name)}
              placeNames={places.map((p) => p.name)}
              onResult={handleVoiceResult}
            />
            {mode !== 'entry_only' && (
              <button
                className={`btn-ghost !rounded !min-h-[44px] !py-1.5 font-black text-xs shadow-xs flex items-center gap-1.5 ${viewMode === 'text' ? '!bg-amber-500 !border-amber-500 !text-[#0f172a]' : '!bg-amber-50 !border-amber-200 !text-amber-900 hover:!bg-amber-100'}`}
                onClick={() => setViewMode('text')}
              >
                <Mail size={14} /> Text
              </button>
            )}
            {/* Klik rovnou otevře čtení/zpracování příchozích zpráv — ne
                mezikrok navíc (kontrola je samostatné tlačítko vedle). */}
            <button
              className="btn-ghost !rounded !min-h-[44px] !py-1.5 !bg-[#25D366] !border-[#25D366] !text-[#0f172a] font-black text-xs shadow-xs flex items-center gap-1.5 hover:!bg-[#1da851] relative"
              title="WhatsApp — čtení a zpracování příchozích zpráv"
              onClick={() => setShowWhatsAppAutoProcessor(true)}
            >
              <MessageCircle size={14} /> WhatsApp
              {newWhatsAppCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-udaj font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {newWhatsAppCount}
                </span>
              )}
            </button>
            <button className="btn-ghost !rounded !min-h-[44px] !py-1.5 !bg-amber-50 !border-amber-200 !text-amber-900 font-extrabold text-xs shadow-xs flex items-center gap-1.5 hover:!bg-amber-100" title="Kontrola — zobrazí VŠECHNY WhatsApp zprávy za období, i chybové a ignorované" onClick={() => setShowWhatsAppAudit(true)}><ShieldAlert size={14} /> Kontrola zpráv</button>
            <button className="btn-ghost !rounded !min-h-[44px] !py-1.5 !bg-amber-50 !border-amber-200 !text-amber-900 font-extrabold text-xs shadow-xs flex items-center gap-1.5 hover:!bg-amber-100" title="Audit objednávek — najde duplicitní položky, nesrovnalosti proti WhatsAppu a nezpracované zprávy" onClick={() => setShowOrderAudit(true)}><ShieldAlert size={14} /> Audit objednávek</button>
            <button className="btn-ghost !rounded !min-h-[44px] !py-1.5 !bg-amber-50 !border-amber-200 !text-amber-900 font-extrabold text-xs shadow-xs flex items-center gap-1.5 hover:!bg-amber-100" title="Načíst z fotky/e-mailu" onClick={() => { setImportTarget(null); setShowImport(true); }}><Camera size={14} /> Fotka/AI</button>
          </div>
          )}
        </div>
      </div>
      )}

      {/* 1. ZADÁVÁNÍ OBJEDNÁVEK (jen v záložce Zadání objednávek) — bez bílé
          "karty" kolem, ať dlaždice piv i zbytek formuláře sedí přímo na
          pozadí stránky, ne uvnitř dalšího ohraničeného panelu navíc. */}
      {mode !== 'overviews_only' && viewMode === 'summary' && (
        <form onSubmit={addOrder} className={`mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20 rounded' : ''}`}>
          {/* Odběratel */}
          <div className="mb-4">
            <label className="label dark:text-white">Odběratel</label>
            <PlaceCombobox value={placeId} onChange={(id, name) => { setPlaceId(id); setPlaceNameFree(name); }} places={places} onPlacesChanged={load} />

            {/* Chytrá doporučení: Duplicita v týdnu & Zopakovat objednávku */}
            {(placeId || placeNameFree.trim()) && (() => {
              const targetPId = placeId || null;
              const targetPName = (placeNameFree || '').toLowerCase().trim();
              const placeOrders = orders.filter((o) => {
                if (o.status === 'storno') return false;
                if (targetPId && o.place_id === targetPId) return true;
                if (targetPName && (o.place_name || '').toLowerCase().trim() === targetPName) return true;
                return false;
              });

              const targetWeek = isoWeekKey(deliveryDate);
              const dupOrder = placeOrders.find((o) => isoWeekKey(o.delivery_date || o.order_date) === targetWeek);
              const lastOrder = [...placeOrders].sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''))[0];
              const lastItems = lastOrder ? (items[lastOrder.id] || []) : [];

              return (
                <div className="mt-2 space-y-1.5">
                  {dupOrder && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="ikona-text" /> <strong>Upozornění:</strong> Tento odběratel již má objednávku na tento týden ({new Date(dupOrder.delivery_date || dupOrder.order_date).toLocaleDateString('cs-CZ')}).
                      </span>
                    </div>
                  )}

                  {lastItems.length > 0 && (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs">
                      <span className="text-neutral-600 dark:text-neutral-300 font-bold truncate">
                        Poslední závoz: {lastItems.map((i) => `${i.quantity}x ${i.beer_name || ''} ${i.package_label || ''}`).join(', ')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newRows: BeerRowItem[] = lastItems.map((it) => ({
                            beerId: it.beer_id || '',
                            pkgId: it.package_id || '',
                            qty: String(it.quantity || ''),
                            placeId: placeId,
                            placeNameFree: placeNameFree,
                          }));
                          while (newRows.length < 5) {
                            newRows.push({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' });
                          }
                          setBeerRows(newRows);
                        }}
                        className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-udaj shadow-2xs shrink-0 transition tap"
                      >
                        <Zap className="ikona-text" /> Zopakovat položky
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 📅 Datum závozu — primárně aktuální týden + den závozu */}
          <div className="mb-4">
            <label className="label dark:text-white">Datum závozu</label>

            {/* Navigace týdnem — šipky, popisek týdne a dny závozu mají teď
                stejnou výšku (h-10), ať řádek nepůsobí rozeskákaně. */}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => shiftWeekAndKeepDay(-1)} className="w-10 h-10 shrink-0 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-700 font-black transition tap" title="Předchozí týden" aria-label="Předchozí týden">‹</button>
              <button
                type="button"
                onClick={resetToCurrentWeek}
                className="flex-1 h-10 text-center text-xs font-black bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded transition tap"
                title="Klikni pro návrat na aktuální týden"
              >
                <Calendar className="ikona-text" /> Týden {weekRange(weekKey).label}
              </button>
              <button type="button" onClick={() => shiftWeekAndKeepDay(1)} className="w-10 h-10 shrink-0 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-700 font-black transition tap" title="Další týden" aria-label="Další týden">›</button>
            </div>

            {/* Den závozu — barevné (amber, stejně jako tlačítko týdne výš)
                místo černé, označený den je sytě amber s TMAVÝM textem — bílý
                text má na téhle (ztlumené) amber barvě appky slabý kontrast. */}
            <div className="flex gap-1.5 mt-2">
              {DAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => pickDeliveryDay(d.v)}
                  className={`tap flex-1 min-w-0 h-10 px-1 rounded font-black text-xs transition ${
                    deliveryDay === d.v
                      ? 'bg-amber-500 text-neutral-950 shadow-md'
                      : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Upřesnění data dodání (volitelné) */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                className="input w-auto !py-1.5 !px-2 !min-h-0 text-sm"
                value={deliveryDate}
                onChange={(e) => {
                  setDeliveryDate(e.target.value);
                  if (e.target.value) {
                    setWeekKey(isoWeekKey(e.target.value));
                    const wd = (new Date(e.target.value + 'T00:00:00Z').getUTCDay() + 6) % 7;
                    setDeliveryDay(DAYS[wd].v);
                  }
                }}
              />
              {/* Bylo `text-black dark:text-black` — černá vynucená i v tmavém
                  režimu, z doby, kdy pozadí karet zůstávalo světlé. Teď je
                  karta tmavá a popisek na ní byl černý na černém. */}
              <span className="text-udaj text-neutral-600 font-bold">upřesnění data dodání</span>
            </div>

            {/* 🚨 Výjimka „Stočit dnes" — sud/lahev potřebuje den na dozrání,
                takže normálně se stáčí na den PŘED závozem (viz Domů, „Co
                stočit"). Tahle objednávka ale musí být hotová hned dneska
                (den závozu prošel, nebo se přidala pozdě) — zaškrtnutí ji
                zařadí do dnešního plánu stáčení (delivery_day = dnešek),
                ale ze skladu se odečte až zítra (delivery_date = zítřek),
                ať automatický noční odpočet neubere sklad dřív, než se
                doopravdy stočí a vyveze. Platí pro celou objednávku —
                lahve i sudy na ní. Odškrtnutí vrátí den i datum na dnešek. */}
            {(() => {
              const dnesKlic = dayKeyFromISO(businessDateISO());
              const zitrejsiDatum = posunDen(businessDateISO(), 1);
              const jeVyjimkaDnes = deliveryDay === dnesKlic && deliveryDate === zitrejsiDatum;
              return (
                <label className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-sky-50 border-2 border-sky-200 text-sky-900 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={jeVyjimkaDnes}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setWeekKey(isoWeekKey(businessDateISO()));
                        setDeliveryDay(dnesKlic);
                        setDeliveryDate(zitrejsiDatum);
                      } else {
                        pickDeliveryDay(dnesKlic);
                      }
                    }}
                    className="w-4 h-4 mt-0.5 rounded text-sky-600 focus:ring-sky-500 accent-sky-600 shrink-0"
                  />
                  <span>
                    Stočit dnes (výjimka) — ze skladu se odečte až zítra, ať se to nesplete s dnešním ranním odpočtem.
                  </span>
                </label>
              );
            })()}

            {/* Výchozí den závozu je st/čt/pá, ale ke konci měsíce (např.
                objednávka zadaná v pondělí poslední týden měsíce) může
                nejbližší středa/čtvrtek už spadat do PŘÍŠTÍHO měsíce —
                a to na první pohled není vidět. Objednávky se do měsíční
                uzávěrky počítají podle data závozu (viz zavoz_deductions),
                takže je potřeba to vidět a POTVRDIT hned při zadávání, ne
                až u uzávěrky. Zaškrtnutí se vynucuje v addOrder() níž a
                resetuje se při každé změně data (viz useEffect výš). */}
            {deliveryInFutureMonth && (
              <label className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmNextMonth}
                  onChange={(e) => setConfirmNextMonth(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 accent-rose-600 shrink-0"
                />
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="ikona-text" />
                  Potvrzuji, že závoz {new Date(deliveryDate + 'T00:00:00Z').toLocaleDateString('cs-CZ')} spadá do {new Date(deliveryDate + 'T00:00:00Z').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })} — objednávka se bude počítat do skladu/uzávěrky od 1. dne toho měsíce, ne do aktuálního.
                </span>
              </label>
            )}
          </div>

          {/* 🍺 Piva — dlaždice (klikni na pivo → obaly a množství) */}
          <BeerTileGrid
            beers={beers}
            onSelect={(b) => setExpandedBeerId(b.id)}
            summaryFor={(b) => {
              const rows = beerRows.filter((r) => r.beerId === b.id && Number(r.qty) > 0);
              // Detailní rozpis podle obalů (např. "6×1,5 3×30 1×50"), ne jen
              // celkový počet — ať je na dlaždici hned vidět, co přesně je v
              // objednávce, bez nutnosti klikat dovnitř.
              const detail = [...rows]
                .sort((a, c) => (packages.find((p) => p.id === a.pkgId)?.volume_l ?? 0) - (packages.find((p) => p.id === c.pkgId)?.volume_l ?? 0))
                .map((r) => {
                  const vol = packages.find((p) => p.id === r.pkgId)?.volume_l;
                  return `${r.qty}×${vol != null ? vol.toLocaleString('cs-CZ') : '?'}`;
                })
                .join(' ');
              return { filled: rows.length > 0, label: detail };
            }}
          />

          {expandedBeer && (
            <BeerTilePanel beer={expandedBeer} onClose={() => setExpandedBeerId(null)}>
              {[...packages].sort((a, b) => pkgPanelIndex(a) - pkgPanelIndex(b)).map((p) => {
                const row = beerRows.find((r) => r.beerId === expandedBeer.id && r.pkgId === p.id);
                const qty = row ? Number(row.qty || 0) : 0;
                const qtyStr = row ? row.qty : '';
                const qtys = orderQuickQtys(p);
                const commonQtys = topQuantitiesLastMonth(orderQtyHistory, expandedBeer.id, p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 py-1.5 px-2 flex-wrap">
                    <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200 truncate">{formatPackageLabel(p.label)}</span>
                    <div className="flex items-center gap-1">
                      {commonQtys.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setPkgAbsolute(expandedBeer.id, p.id, q)}
                          title="Rychlá volba množství"
                          className={`tap h-9 min-w-[1.75rem] px-1.5 rounded text-udaj font-black transition ${qty === q ? 'bg-emerald-700 text-white' : 'bg-neutral-100 hover:bg-emerald-200 text-neutral-600 hover:text-emerald-950'}`}
                        >
                          {q}
                        </button>
                      ))}
                      {qtys && (
                        <select
                          value={qtys.includes(qty) ? qty : ''}
                          onChange={(e) => { const v = e.target.value; if (v !== '') setPkgAbsolute(expandedBeer.id, p.id, Number(v)); }}
                          className="h-9 rounded-lg bg-white border border-amber-300 text-emerald-950 font-black text-sm px-1.5 cursor-pointer transition"
                          title={`Rychlé nastavení počtu (${qtys.join('/')})`}
                        >
                          <option value="" disabled>+ ks</option>
                          {qtys.map((q) => (
                            <option key={q} value={q}>{q} ks</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setPkgQty(expandedBeer.id, p.id, -1)}
                        className="btn-pocet disabled:opacity-30"
                        disabled={qty <= 0}
                      >−</button>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        min={0}
                        inputMode="numeric"
                        value={qtyStr ?? 0}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, '');
                          if (v === '') { setPkgAbsolute(expandedBeer.id, p.id, 0); return; }
                          setPkgAbsolute(expandedBeer.id, p.id, Number(v));
                        }}
                        className="w-14 h-10 text-center text-lg font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded-lg"
                        title="Napiš počet ručně"
                      />
                      <button
                        type="button"
                        onClick={() => setPkgQty(expandedBeer.id, p.id, 1)}
                        className="btn-pocet"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </BeerTilePanel>
          )}

          {/* 📋 Souhrn objednávky — pod dlaždicemi, editovatelný jako dlaždice */}
          {filledBeerRows.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-white dark:bg-neutral-800 p-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-2">
                <ClipboardList className="ikona-text" /> Objednávka ({filledBeerRows.reduce((s, r) => s + Number(r.qty || 0), 0)} ks)
              </div>
              <ul className="space-y-1.5">
                {filledBeerRows.map((r, i) => {
                  const beer = beers.find((b) => b.id === r.beerId);
                  const pkg = packages.find((p) => p.id === r.pkgId);
                  return (
                    <li key={`${r.beerId}-${r.pkgId}-${i}`} className="flex items-center justify-between gap-2 rounded bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/70 dark:border-neutral-700 px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => setExpandedBeerId(expandedBeerId === r.beerId ? null : r.beerId)}
                        className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-100 text-left truncate"
                        title="Klikni pro úpravu v dlaždici"
                      >
                        <span className="shrink-0">{r.qty}×</span>
                        <span className="truncate">{formatPackageLabel(pkg?.label)} · {beerName(beer)}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => setPkgQty(r.beerId, r.pkgId, -1)} className="btn-pocet disabled:opacity-30" disabled={Number(r.qty) <= 1}>−</button>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          min={0}
                          inputMode="numeric"
                          value={r.qty}
                          placeholder="0"
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            if (v === '') { setPkgAbsolute(r.beerId, r.pkgId, 0); return; }
                            setPkgAbsolute(r.beerId, r.pkgId, Number(v));
                          }}
                          className="w-14 h-10 text-center text-base font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded-xl"
                          title="Napiš počet ručně"
                        />
                        <button type="button" onClick={() => setPkgQty(r.beerId, r.pkgId, 1)} className="btn-pocet">+</button>
                        <button type="button" onClick={() => setPkgQty(r.beerId, r.pkgId, -Number(r.qty))} className="w-10 h-10 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-xl transition select-none tap" title="Odebrat položku" aria-label="Odebrat položku"><X size={18} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 📝 Poznámka — kdy má být zavezeno */}
          <div className="mt-4">
            <label className="label">Poznámka <span className="text-neutral-400 font-normal">(kdy má být zavezeno, odfasování, sklo…) — datum se doplní automaticky</span></label>
            <input
              type="text"
              className="input"
              placeholder="např. zavezt v pátek 16.8., vratný sud, podtacky"
              value={note}
              onChange={(e) => {
                const v = e.target.value;
                setNote(v);
                const detected = detectDeliveryDateFromNote(v, weekKey);
                if (detected) {
                  setDeliveryDate(detected);
                  setWeekKey(isoWeekKey(detected));
                  const wd = (new Date(detected + 'T00:00:00Z').getUTCDay() + 6) % 7;
                  setDeliveryDay(DAYS[wd].v);
                  setNoteDateHint(detected);
                } else if (noteDateHint) {
                  setNoteDateHint(null);
                }
              }}
            />
            {noteDateHint && (
              <div className="mt-1.5 text-udaj font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                <Calendar className="ikona-text" /> Z poznámky nastaveno datum závozu: {new Date(noteDateHint + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* 🚰 Půjčení výčepu */}
          <label className="mt-3 flex items-center gap-2 cursor-pointer select-none rounded-2xl border border-neutral-200 bg-white dark:bg-neutral-800 p-3">
            <input
              type="checkbox"
              checked={wantTap}
              onChange={() => {
                if (wantTap) { setWantTap(false); return; }
                setWantTap(true);
                setTapReservedEarly(false);
                setTapModalCustomer(placeNameFree || places.find((p) => p.id === placeId)?.name || '');
                setShowTapModal(true);
              }}
              className="accent-amber-500 w-4 h-4"
            />
            <span className="text-xs font-extrabold text-neutral-800 dark:text-neutral-100"><IkonaVycep className="ikona-text" /> Půjčení výčepu</span>
            <span className="text-udaj text-neutral-400 font-medium">(otevře rezervační systém výčepu)</span>
          </label>

          {/* Akční tlačítka */}
          <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary !rounded text-xs font-black shadow-md" disabled={saving || (!filledBeerRows.length && !manualText.trim())}>
                {saving ? 'Ukládám…' : `Vytvořit objednávku${filledBeerRows.length ? ` (${filledBeerRows.length} pol. / ${filledBeerRows.reduce((s, r) => s + Number(r.qty || 0), 0)} ks)` : manualText.trim() ? ' (z textu)' : ''}`}
              </button>

              <button
                type="button"
                className="!bg-[#25D366] hover:!bg-[#1da851] !border-[#25D366] !text-[#0f172a] text-xs font-black shadow-md flex items-center gap-1.5 px-3.5 py-2 rounded transition disabled:opacity-40"
                disabled={saving || (!filledBeerRows.length && !manualText.trim())}
                onClick={() => addOrder(undefined, true)}
                title="Vytvoří objednávku a otevře WhatsApp s předvyplněnou zprávou"
              >
                <MessageCircle size={14} /> {saving ? 'Ukládám…' : 'Vytvořit a odeslat na WhatsApp'}
              </button>

              <button type="button" className="btn-ghost !rounded text-xs" onClick={() => { setBeerRows(Array.from({ length: 4 }, () => ({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' }))); setExpandedBeerId(null); }}>
                <Trash2 className="ikona-text" /> Vymazat vše
              </button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

          {zdvojeneRadky.length > 0 && (
            <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5">
              <div className="text-xs font-black text-amber-950 mb-1">Pozor, tohle máte v mřížce vícekrát:</div>
              <ul className="text-xs font-semibold text-amber-900 space-y-0.5">
                {zdvojeneRadky.map((z) => (
                  <li key={`${z.beerId}__${z.pkgId}__${z.indexy[0]}`}>
                    • {popisZdvojeni(
                      z,
                      beers.find((b) => b.id === z.beerId)?.name ?? 'Pivo',
                      packages.find((p) => p.id === z.pkgId)?.label ?? 'obal',
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {err && <div className="text-sm text-rose-700 mt-3 bg-rose-500/10 rounded-lg px-3 py-2 font-bold">{err}</div>}
          
          {flash && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2 text-sm">
                <span><CheckCircle2 className="ikona-text" /></span>
                <span>Objednávka byla úspěšně vytvořena!</span>
              </span>
              {setPage && (
                <button type="button" className="btn-ghost !rounded text-xs font-black text-emerald-900 underline" onClick={() => setPage('orders')}>
                  Zobrazit v Přehledu →
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {/* 📝 Ruční zápis objednávky textem (záložka Text) */}
      {viewMode === 'text' && (
        <div className="card p-4 mb-5">
          <div className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-3 flex items-center gap-2">
            <Mail size={16} className="text-amber-700 dark:text-amber-400" />
            <span>Ruční zápis objednávky textem</span>
          </div>
          <textarea
            className="input w-full font-mono text-sm min-h-[120px]"
            placeholder='Např. "2x KEG30 12svetly, 1x KEG50 10desitka, 3x 0,33 tmava"'
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" className="btn-primary !rounded text-xs font-black shadow-md" onClick={() => { handleManualTextParse(); setViewMode('summary'); }} disabled={!manualText.trim()}>
              <Zap className="ikona-text" /> Rozparsovat a přidat do formuláře
            </button>
            <button type="button" className="btn-ghost !rounded text-xs font-black" onClick={() => setViewMode('summary')}>← Zpět na dlaždice</button>
          </div>
          <div className="text-udaj text-neutral-500 mt-2">
            Položky se vyplní do dlaždic piv ve formuláři. Pak už jen klikni na „Vytvořit objednávku“.
          </div>
        </div>
      )}

      {/* 2. PŘEHLEDY & SOUHRNY (Když není entry_only) */}
      {/* V záložce „Nové“ se zobrazuje pouze formulář zadávání objednávek (výše).
          Seznam a detaily objednávek jsou vidět jen v záložce „Objednávky“. */}

      {/* ⬅️➡️ Navigace Týden / Celý měsíc / Všechny objednávky — Detaily
          Přilepeno nahoře, ať jde přepínat období i uprostřed scrollování
          dlouhého seznamu objednávek (viz i den/vyhledávání níže). */}
      {mode !== 'entry_only' && (viewMode === 'detail' || viewMode === 'celkem') && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5 p-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setTimeScope('week')}
              className={`tap px-3 py-1.5 rounded font-black text-xs transition ${
                timeScope === 'week' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Týden</span>
            </button>
            <button
              type="button"
              onClick={() => setTimeScope('month')}
              className={`tap px-3 py-1.5 rounded font-black text-xs transition ${
                timeScope === 'month' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Celý měsíc</span>
            </button>
            <button
              type="button"
              onClick={() => setTimeScope('all')}
              className={`tap px-3 py-1.5 rounded font-black text-xs transition ${
                timeScope === 'all' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><PackageIcon size={14} /> Všechny</span>
            </button>

            {/* ↻ Zopakovat celý závoz — objednávky se týden po týdnu
                opakují skoro totožně a duplikovat se dala jen jedna.
                Ptá se předem, protože to zakládá dvacet nových
                objednávek naráz; vrátit zpět jde stejně. */}
            <button
              type="button"
              onClick={() => { void zopakujDen(); }}
              disabled={kopirujiDen || searchedFiltered.length === 0}
              className="px-3 py-1.5 rounded font-black text-xs transition bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-100 disabled:opacity-40 tap"
              title="Založí kopie všech právě zobrazených objednávek k dnešnímu dni"
            >
              <span className="inline-flex items-center gap-1.5">
                <Copy size={14} /> {kopirujiDen ? 'Kopíruji…' : 'Zopakovat závoz'}
              </span>
            </button>
          </div>

          {timeScope === 'week' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
                className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black hover:bg-amber-100 transition"
                title="Předchozí týden" aria-label="Předchozí týden"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center flex items-center gap-1.5">
                <span className="text-xs font-bold text-amber-700">Týden</span>
                <span className="font-display font-black text-base text-amber-800">{weekKey.split('-')[1]}</span>
                <span className="text-xs text-neutral-500">({wr.label})</span>
              </div>
              <button
                onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
                className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black hover:bg-amber-100 transition"
                title="Další týden" aria-label="Další týden"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {timeScope === 'month' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedMonth(posunMesic(selectedMonth, -1))}
                className="btn-ghost !rounded !py-1 !px-2 text-xs font-black hover:bg-amber-100 transition"
                title="Předchozí měsíc" aria-label="Předchozí měsíc"
              ><ChevronLeft size={16} /></button>
              <Calendar size={16} className="text-amber-800" />
              <span className="text-xs font-black text-amber-900">Měsíc:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-amber-800 font-mono font-black border-none focus:outline-none text-sm"
              />
              <button
                type="button"
                onClick={() => setSelectedMonth(posunMesic(selectedMonth, 1))}
                className="btn-ghost !rounded !py-1 !px-2 text-xs font-black hover:bg-amber-100 transition"
                title="Další měsíc" aria-label="Další měsíc"
              ><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      )}

      {/* Vyhledávání a filtry — NENÍ sticky prvek obalený v malém wrapperu:
          position:sticky drží prvek jen v rámci výšky SVÉHO rodiče, takže
          záložky dnů a vyhledávání níže musí být přímými sourozenci ve
          velkém kontejneru (celý seznam objednávek), ne v úzkém obalu jen
          kolem sebe navzájem — jinak by "sticky" přestalo fungovat hned po
          pár řádcích scrollování. */}
      {mode !== 'entry_only' && viewMode === 'detail' && ( // Render only in detail view
        <>
          {(itemFilterBeerId || itemFilterPackageId || packageKindFilter !== 'all' || timeScope !== 'week' || searchText.trim()) && (
            <div className="mb-3 p-3.5 rounded-2xl bg-amber-100/90 border-2 border-amber-400 text-amber-800 text-xs font-bold shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Search className="ikona-text" />
                <span>
                  Aktivní filtry:{' '}
                  {timeScope === 'month' ? `[Měsíc: ${selectedMonth}] ` : timeScope === 'all' ? '[Všechny objednávky] ' : ''}
                  {packageKindFilter !== 'all' ? `[${NAZEV_DRUHU[packageKindFilter]}] ` : ''}
                  {itemFilterBeerId ? `[Pivo: ${beers.find(b => b.id === itemFilterBeerId)?.name}] ` : ''}
                  {itemFilterPackageId ? `[Obal: ${packages.find(p => p.id === itemFilterPackageId)?.label}] ` : ''}
                  {searchText.trim() ? `[Hledání: "${searchText}"${timeScope !== 'all' ? ' — všechna období' : ''}] ` : ''}
                </span>

                {itemAuditStats && (
                  <span className="ml-1 px-2.5 py-1 rounded-xl bg-amber-500 text-neutral-950 font-black text-xs shadow-xs">
                    Vyfiltrováno: {itemAuditStats.currentViewItemsCount} položek — {itemAuditStats.currentViewQty} ks ({itemAuditStats.currentViewOrdersCount} obj.)
                  </span>
                )}

                {itemAuditStats?.hasHiddenOrders && (
                  <span className="text-amber-800 font-black bg-amber-200 border border-amber-400 px-2.5 py-1 rounded-xl">
                    <AlertTriangle className="ikona-text" /> V jiných filtrech/týdnech je dalších {itemAuditStats.allOrdersQty - itemAuditStats.currentViewQty} ks (Celkem {itemAuditStats.allOrdersQty} ks ve {itemAuditStats.allOrdersCount} obj.)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {itemAuditStats?.hasHiddenOrders && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeScope('all');
                      setStatusFilter('');
                      setDeliveryDayFilter('all');
                      setZavozOnly(false);
                    }}
                    className="btn-primary !rounded !py-1 !px-3 text-xs font-black shadow-md shrink-0 bg-amber-700 hover:bg-amber-800 text-white"
                  >
                    <Globe className="ikona-text" /> Zobrazit všech {itemAuditStats.allOrdersQty} ks
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setTimeScope('week'); setPackageKindFilter('all');
                    setItemFilterBeerId(null); setItemFilterPackageId(null);
                    setSearchText(''); setStatusFilter(''); setDeliveryDayFilter('all');
                  }}
                  className="btn-ghost !rounded !py-1 !px-2.5 text-xs font-black text-rose-900 bg-rose-100 hover:bg-rose-200 border border-rose-300"
                >
                  <X className="ikona-text" /> Zrušit filtry
                </button>
              </div>
            </div>
          )}

        {/* Delivery Day quick selector tabs — jediná přilepená lišta v Objednávkách (přepínač období a vyhledávací filtry pod ní se scrollují normálně).
            Stejný jazyk jako zbytek tlačítek appky: černá/bílý text, označený
            (aktivní) filtr se pro odlišení obrátí na bílou s tmavým textem. */}
        <div className="sticky top-0 z-20 mb-2.5 bg-neutral-100 pt-1 flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          <button
            onClick={() => setDeliveryDayFilter('all')}
            className={`tap px-3.5 py-1.5 rounded font-extrabold text-xs shrink-0 transition-all ${
              deliveryDayFilter === 'all' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span className="inline-flex items-center gap-1.5"><Truck size={14} /> Všechny dny</span>
          </button>
          {DAYS.map((d) => {
            const count = filtered.filter((o) => o.delivery_day === d.v && o.status !== 'storno').length;
            const hasOrders = count > 0;
            return (
              <button
                key={d.v}
                onClick={() => setDeliveryDayFilter(d.v)}
                className={`tap px-3 py-1.5 rounded font-black text-xs shrink-0 transition-all flex items-center gap-1.5 ${
                  deliveryDayFilter === d.v
                    ? 'bg-amber-500 text-neutral-950 shadow-xs'
                    : hasOrders
                      ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                      : 'bg-neutral-100 text-neutral-600 border border-neutral-200 hover:bg-neutral-200'
                }`}
              >
                <span>{d.label}</span>
                {hasOrders && (
                  <span className={`px-1.5 py-0.5 rounded-full text-udaj ${deliveryDayFilter === d.v ? 'bg-neutral-900/10 text-neutral-900' : 'bg-white/25'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => setDeliveryDayFilter('_none')}
            className={`tap px-3 py-1.5 rounded font-bold text-xs shrink-0 transition-all ${
              deliveryDayFilter === '_none' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Bez dne
          </button>
        </div>

        {overdueOnly && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold">
            <span><AlertTriangle className="ikona-text" /> Zobrazeny jen nevyřízené objednávky po termínu (závoz dnes nebo dřív)</span>
            <button className="btn-ghost !rounded !py-1 text-xs font-bold text-amber-900" onClick={() => setOverdueOnly(false)}>Zobrazit vše</button>
          </div>
        )}

        <div className="card p-2.5 flex flex-wrap items-center gap-2.5 shadow-sm">
          <input
            type="text" placeholder="Hledat odběratele, pivo nebo poznámku"
            className="input flex-1 min-w-[200px]" value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <select className="input w-auto font-bold text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Všechny statusy</option>
            {Object.entries(STAVY_OBJEDNAVKY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-auto font-bold text-xs" value={packageKindFilter} onChange={(e) => setPackageKindFilter(e.target.value as DruhObaluFiltr)}>
            <option value="all">Všechny druhy obalů</option>
            <option value="keg">Pouze sudy (KEG)</option>
            <option value="pet">Pouze petky (PET)</option>
            <option value="lahev">Pouze lahve (sklo)</option>
          </select>
          <select className={`input w-auto font-bold text-xs ${itemFilterBeerId ? 'border-sky-500 ring-2 ring-sky-500/30 dark:border-sky-500' : 'border-sky-300 dark:border-sky-300'} focus:border-sky-500 focus:ring-sky-500/25 dark:focus:border-sky-500 dark:focus:ring-sky-500/25`} value={itemFilterBeerId ?? ''} onChange={(e) => setItemFilterBeerId(e.target.value || null)}>
            <option value="">Všechna piva</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className={`input w-auto font-bold text-xs ${itemFilterPackageId ? 'border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-500' : 'border-emerald-300 dark:border-emerald-300'} focus:border-emerald-500 focus:ring-emerald-500/25 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/25`} value={itemFilterPackageId ?? ''} onChange={(e) => setItemFilterPackageId(e.target.value || null)}>
            <option value="">Konkrétní obal</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-2.5 py-1 rounded hover:bg-primary-50">
            <input type="checkbox" checked={groupByDay} onChange={(e) => setGroupByDay(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
            <Calendar className="ikona-text" /> Seskupit dle dne
          </label>
          {(searchText || statusFilter || deliveryDayFilter !== 'all' || itemFilterBeerId || itemFilterPackageId || packageKindFilter !== 'all' || overdueOnly) && (
            <button className="btn-ghost !rounded !py-1.5 text-xs font-bold text-amber-900" onClick={() => { setSearchText(''); setStatusFilter(''); setDeliveryDayFilter('all'); setItemFilterBeerId(null); setItemFilterPackageId(null); setPackageKindFilter('all'); setOverdueOnly(false); }}>Zrušit filtr</button>
          )}
        </div>

      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-2.5 py-1 rounded hover:bg-primary-50">
          <input type="checkbox" checked={zavozOnly} onChange={(e) => setZavozOnly(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
          <Truck className="ikona-text" /> Jen nezavezenné (pro závozníka)
        </label>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 bg-primary-50 rounded-xl px-3 py-2">
            <span className="text-sm font-semibold text-primary-800">{selectedIds.size} vybráno</span>
            <button className="chip bg-emerald-100 text-emerald-700 hover:bg-emerald-200" onClick={() => bulkToggleFlag('is_prepared')}><Check className="ikona-text" /> Připraveno</button>
            <button className="chip bg-primary-200 text-primary-800 hover:bg-primary-300 flex items-center gap-1" onClick={() => bulkToggleFlag('is_packaged')}><PackageCheck size={12} /> Fasování</button>
            <button className="chip bg-emerald-200 text-emerald-800 hover:bg-emerald-300 flex items-center gap-1" onClick={() => bulkToggleFlag('is_delivered')}><Truck size={12} /> Zavezenné</button>
            <button className="chip bg-amber-100 text-amber-700 hover:bg-amber-200" onClick={() => bulkSetStatus('expedovana')}>Expedovat</button>
            <button className="chip bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-1" onClick={bulkDelete}><Trash2 size={12} /> Smazat</button>
            <button className="chip bg-white border border-primary-200 text-primary-600 hover:bg-primary-50" onClick={clearSelection}><X className="ikona-text" /> Zrušit výběr</button>
          </div>
        ) : (
          searchedFiltered.length > 0 && <button className="btn-ghost !rounded !py-1.5 text-xs flex items-center gap-1" onClick={selectAll}><CheckSquare size={14} /> Vybrat vše ({searchedFiltered.length})</button>
        )}
      </div>
        </>
      )}

      {/* 🏠 Karta odběratele — ukáže se jen tehdy, když je ve výběru jeden
          odběratel. Odpovídá na to, na co se u telefonu ptá nejčastěji:
          kdy bral naposledy, jak často bere a co bere. */}
      {karta && mode !== 'entry_only' && (
        <div className="card p-3 mb-2.5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="chip bg-amber-100 text-amber-900"><User className="ikona-text" /> {karta.jmeno}</span>
            <span className="text-xs font-bold text-neutral-700">
              {karta.data.objednavek} {karta.data.objednavek === 1 ? 'objednávka' : karta.data.objednavek < 5 ? 'objednávky' : 'objednávek'}
            </span>
            {karta.data.posledni && (
              <span className="text-xs font-bold text-neutral-700">
                <Calendar className="ikona-text" /> naposledy {new Date(`${karta.data.posledni}T00:00:00Z`).toLocaleDateString('cs-CZ')}
                {karta.data.dnuOdPosledni !== null && (
                  karta.data.dnuOdPosledni === 0 ? ' (dnes)' : ` (před ${karta.data.dnuOdPosledni} dny)`
                )}
              </span>
            )}
            <span className="text-xs font-bold text-neutral-700">
              <Clock className="ikona-text" />
              {karta.data.prumerneKazdychDni === null
                // Z jedné objednávky se rytmus vymyslet nedá a podle „bere
                // každých 7 dní" se plánuje závoz.
                ? ' rytmus zatím neznámý'
                : ` bere průměrně každých ${karta.data.prumerneKazdychDni} dní`}
            </span>
          </div>

          {karta.data.oblibene.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-black text-neutral-600">Co bere:</span>
              {karta.data.oblibene.map((o) => (
                <span key={`${o.beer_id ?? '-'}__${o.package_id ?? '-'}`} className="chip bg-neutral-100 text-neutral-800">
                  {o.popis} · {kusy(o.kusu)} / {o.objednavek}×
                </span>
              ))}
            </div>
          )}

          {karta.posledniRadek && karta.data.posledniObjednavka.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void duplicateOrder(karta.posledniRadek!); }}
                className="px-3 py-1.5 rounded font-black text-xs transition bg-amber-500 text-neutral-950 hover:bg-amber-400 tap"
                title="Založí k dnešnímu dni novou objednávku se stejnými položkami jako posledně"
              >
                <span className="inline-flex items-center gap-1.5"><Copy size={14} /> To co posledně</span>
              </button>
              <span className="text-xs text-neutral-600">
                {karta.data.posledniObjednavka.map((p) => `${p.popis} ${kusy(p.kusu)}`).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {viewMode === 'celkem' && mode !== 'entry_only' && (
        <VariantTotalsPanel totals={variantTotals} beers={beers} packages={packages} timeScope={timeScope} onPick={handleItemClick} />
      )}

      {/* Při načítání se dřív nezobrazovalo nic — na pomalém připojení bylo pod
          filtry prázdno a objednávky se pak „samy objevily". Nešlo poznat,
          jestli se načítá, nebo je opravdu prázdno. */}
      {viewMode !== 'celkem' && viewMode !== 'text' && (loading ? <Spinner /> : searchedFiltered.length === 0 ? <EmptyState text="Žádné objednávky pro zvolené filtry." icon={Receipt} akce={{ popis: 'Zrušit filtry a hledání', onClick: () => { setSearchText(''); setStatusFilter(''); setDeliveryDayFilter('all'); setItemFilterBeerId(null); setItemFilterPackageId(null); setPackageKindFilter('all'); setZavozOnly(false); setOverdueOnly(false); } }} /> : (viewMode === 'detail' && groupedByDay) ? (
        <div className="space-y-6">
          {groupedByDay.map((grp) => (
            <div key={grp.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`chip ${grp.key === '_none' ? 'bg-primary-100 text-primary-600' : dayColor(grp.key)!.chip}`}>
                  {grp.key === '_none' ? 'Bez dne' : DAYS.find((d) => d.v === grp.key)?.label}
                </span>
                <span className="text-xs text-primary-400">{grp.orders.length} objednávek</span>
              </div>
              <div className="space-y-3">
                {grp.orders.map((o) => (
                  <div key={o.id} className="space-y-3">
                    <OrderCard o={o} items={items[o.id] ?? []} stockRemainingForOrder={stockRemainingForOrder}
                      selected={selectedIds.has(o.id)} onToggleSelect={() => toggleSelect(o.id)}
                      onClick={() => openDetail(o)} onToggleFlag={toggleFlag} onToggleItemFlag={toggleItemFlag} onUpdateDeliveryDay={updateDeliveryDay}
                      onSetStatus={setStatus} onDelete={del} onDuplicate={duplicateOrder} onEdit={setEditOrder} onSplit={setSplitOrder} onOpenWhatsApp={handleOpenWhatsAppMessage} beers={beers} packages={packages} places={places}
                      activeBeerId={itemFilterBeerId} activePackageId={itemFilterPackageId}
                itemMatchesFilter={polozkovyFiltrAktivni ? matchesItemFilters : undefined} />
                    {detail?.id === o.id && (
                      <div id="order-detail-card" className="scroll-mt-6 animate-scale-in pl-2 sm:pl-4 border-l-4 border-amber-500">
                        <OrderDetail
                  order={detail}
                          items={items[detail.id] ?? []}
                          beers={beers}
                          packages={packages}
                          places={places}
                          priceList={priceList}
                          remaining={stockRemainingForOrder(detail)}
                          onClose={() => setDetail(null)}
                          onChanged={load}
                          onSplit={setSplitOrder}
                          onToggleFlag={toggleFlag}
                          onImportImage={(o) => { setDetail(null); setImportTarget(o); setShowImport(true); }}
                          setItems={setItems}
                    setPage={setPage}
                          setOrders={setOrders}
                          allOrders={orders}
                          allItems={items}
                          weekKey={weekKey}
                          setWeekKey={setWeekKey}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (viewMode === 'detail' && !groupedByDay) && (
        <div className="space-y-3">
          {searchedFiltered.map((o) => (
            <div key={o.id} className="space-y-3">
              <OrderCard o={o} items={items[o.id] ?? []} stockRemainingForOrder={stockRemainingForOrder}
                selected={selectedIds.has(o.id)} onToggleSelect={() => toggleSelect(o.id)}
                onClick={() => openDetail(o)} onToggleFlag={toggleFlag} onToggleItemFlag={toggleItemFlag} onUpdateDeliveryDay={updateDeliveryDay}
                onSetStatus={setStatus} onDelete={del} onDuplicate={duplicateOrder} onEdit={setEditOrder} onSplit={setSplitOrder} onOpenWhatsApp={handleOpenWhatsAppMessage} beers={beers} packages={packages} places={places}
                activeBeerId={itemFilterBeerId} activePackageId={itemFilterPackageId}
                itemMatchesFilter={polozkovyFiltrAktivni ? matchesItemFilters : undefined} />
              {detail?.id === o.id && (
                <div id="order-detail-card" className="scroll-mt-6 animate-scale-in pl-2 sm:pl-4 border-l-4 border-amber-500">
                  <OrderDetail
                    order={detail}
                    items={items[detail.id] ?? []}
                    beers={beers}
                    packages={packages}
                    places={places}
                    priceList={priceList}
                    remaining={stockRemainingForOrder(detail)}
                    onClose={() => setDetail(null)}
                    onChanged={load}
                    onSplit={setSplitOrder}
                    onToggleFlag={toggleFlag}
                    onImportImage={(o) => { setDetail(null); setImportTarget(o); setShowImport(true); }}
                    setItems={setItems}
                    setPage={setPage}
                    setOrders={setOrders}
                    allOrders={orders}
                    allItems={items}
                    weekKey={weekKey}
                    setWeekKey={setWeekKey}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {editOrder && (
        <Suspense fallback={null}>
        <EditOrderModal
          order={editOrder}
          items={items[editOrder.id] ?? []}
          beers={beers}
          packages={packages}
          places={places}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); setWeekKey(isoWeekKey(editOrder.order_date)); load(); }}
          onPlacesChanged={load}
        />
        </Suspense>
      )}

      {splitOrder && (
        <Suspense fallback={null}>
        <SplitOrderModal
          order={splitOrder}
          items={items[splitOrder.id] ?? []}
          beers={beers}
          packages={packages}
          places={places}
          onClose={() => setSplitOrder(null)}
          onSaved={() => { setSplitOrder(null); setWeekKey(isoWeekKey(splitOrder.order_date)); load(); }}
          onPlacesChanged={load}
        />
        </Suspense>
      )}

      {showWhatsAppAutoProcessor && (
        <Suspense fallback={null}>
        <WhatsAppAutoProcessorModal
          isOpen={showWhatsAppAutoProcessor}
          onClose={() => setShowWhatsAppAutoProcessor(false)}
          beers={beers}
          packages={packages}
          places={places}
          onImport={handleSaveWhatsAppOrder}
          refreshKey={whatsappListRefresh}
          onOpenMessage={(message) => {
            setAutoWhatsAppMessage(message);
            setAutoWhatsAppModal(true);
          }}
        />
        </Suspense>
      )}

      {showWhatsAppAudit && (
        <Suspense fallback={null}>
        <WhatsAppAuditModal
          isOpen={showWhatsAppAudit}
          onClose={() => setShowWhatsAppAudit(false)}
          onOpenMessage={(message) => {
            setShowWhatsAppAudit(false);
            setAutoWhatsAppMessage(message);
            setAutoWhatsAppModal(true);
          }}
        />
        </Suspense>
      )}

      {showOrderAudit && (
        <Suspense fallback={null}>
        <OrderAuditModal
          isOpen={showOrderAudit}
          onClose={() => setShowOrderAudit(false)}
          beers={beers}
          packages={packages}
          selectedWeekKey={weekRange(weekKey).start.toISOString().slice(0, 10)}
          onRefreshOrders={() => load(true)}
        />
        </Suspense>
      )}

      {autoWhatsAppModal && autoWhatsAppMessage && (
        <Suspense fallback={null}>
        <WhatsAppOrderReviewModal
          isOpen={autoWhatsAppModal}
          onClose={() => {
            setAutoWhatsAppModal(false);
            setAutoWhatsAppMessage(null);
            setNewWhatsAppCount(0); // Reset counter when modal closes
          }}
          message={autoWhatsAppMessage}
          beers={beers}
          packages={packages}
          places={places}
          onApprove={handleApproveWhatsAppOrder}
          onReject={handleRejectWhatsAppOrder}
          onDecision={advanceWhatsAppReview}
        />
        </Suspense>
      )}

      {showImport && (
        <Suspense fallback={null}>
        <ImportFromImage
          beers={beers} packages={packages} places={places}
          existing={(importTarget ? items[importTarget.id] ?? [] : []).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity }))}
          targetLabel={importTarget ? (importTarget.place_name ?? importTarget.order_date) : null}
          initialFiles={shareInitialFiles}
          onPlacesChanged={load}
          onClose={() => { setShowImport(false); setShareInitialFiles(undefined); }}

          onImport={async (items, meta) => {
            const orderId = importTarget?.id;
            const targetDate = importTarget?.order_date ?? meta.date;
            if (!orderId) {
              const groups = new Map<string, typeof items>();
              for (const it of items) {
                const key = (it.place_name && it.place_name.trim()) || meta.placeName || '';
                (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
              }
              const created: string[] = [];
              for (const [recipient, rows] of groups) {
                const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const place = recipient ? places.find((p) => norm(p.name) === norm(recipient)) : undefined;
                let placeId = place?.id ?? null;
                const placeName = recipient || meta.placeName || null;
                if (!placeId && placeName) {
                  const place = await getOrCreatePlace(placeName, places);
                  if (place) placeId = place.id;
                }
                // 🧠 DATUM OBJEDNÁVKY: Pokud AI rozpoznala datum u položek TÉTO
                // objednávky (např. "na 7.8"), použij ho. Jinak spadni na globální
                // datum (meta.date). Díky tomu se při více objednávkách na jedné
                // fotce přiřadí datum jen té objednávce, u které je napsané.
                const itemDate = rows.find((i) => i.date)?.date ?? null;
                const orderDate = itemDate || meta.date;
                const { data: order, error } = await supabase.from('orders').insert({
                  order_date: orderDate, place_id: placeId, place_name: placeName,
                  source: 'fotka', status: 'nova', delivery_day: deliveryDay || null,
                  delivery_date: deliveryDate || null,
                  is_prepared: false, is_packaged: false,
                  note: meta.note || null,
                }).select().single();
                if (error) throw new Error(error.message);
                oznacVlastniObjednavku(order.id);
                const itemRows = rows.map((i) => {
                  const b = beers.find((x) => x.id === i.beer_id);
                  const p = packages.find((x) => x.id === i.package_id);
                  return { order_id: order.id, beer_id: i.beer_id, beer_name: b?.name ?? null, package_id: i.package_id, package_label: p?.label ?? null, quantity: i.quantity };
                });
                const { error: itemErr } = await supabase.from('order_items').insert(itemRows);
                if (itemErr) throw new Error(itemErr.message);
                created.push(order.id);
                // 🚰 Rezervace výčepu — spáruj s vytvořenou objednávkou (order_id)
                void autoReserveTapIfNeeded(placeName || meta.placeName, orderDate, meta.note, order.id);
                if (meta.note && isTapMentioned(meta.note)) {
                  setTapModalOrderId(order.id);
                  setTapModalCustomer(placeName || meta.placeName || '');
                  setDate(orderDate);
                  setNote(meta.note);
                  setShowTapModal(true);
                }
              }

              if (!created.length) throw new Error('Nepodařilo se vytvořit objednávku.');

            } else {
              if (meta.note) {
                await supabase.from('orders').update({ note: meta.note }).eq('id', orderId);
              }
              const rows = items.map((i) => {
                const b = beers.find((x) => x.id === i.beer_id);
                const p = packages.find((x) => x.id === i.package_id);
                return { order_id: orderId!, beer_id: i.beer_id, beer_name: b?.name ?? null, package_id: i.package_id, package_label: p?.label ?? null, quantity: i.quantity };
              });
              const { error: itemErr } = await supabase.from('order_items').insert(rows);
              if (itemErr) throw new Error(itemErr.message);
              // 🚰 Rezervace výčepu — spáruj s existující objednávkou (orderId)
              void autoReserveTapIfNeeded(meta.placeName, targetDate, meta.note, orderId);
              if (meta.note && isTapMentioned(meta.note)) {
                setTapModalOrderId(orderId);
                setTapModalCustomer(meta.placeName || '');
                setDate(targetDate);
                setNote(meta.note);
                setShowTapModal(true);
              }
            }
            setImportTarget(null);
            setFlash(true); setTimeout(() => setFlash(false), 800);
            setWeekKey(isoWeekKey(targetDate));
            load();
          }}

        />
        </Suspense>
      )}

      {/* 🚰 Modální okno pro výběr výčepu k rezervaci */}
      {showTapModal && (
        <TapReservationModal
          orderDate={deliveryDate || date}
          customerName={tapModalCustomer}
          orderId={tapModalOrderId}
          tapTypeHint={detectTapType(note)}
          onConfirm={() => {
            if (!tapModalOrderId) setTapReservedEarly(true);
            handleTapModalDone();
          }}
          onSkip={handleTapModalDone}
        />
      )}
    </div>
  );
}


// 📅 Z poznámky rozpozná datum závozu (17.8. / 17.8.2026 / název dne v aktuálním týdnu)
function detectDeliveryDateFromNote(text: string, wk: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // České datum dd.mm. nebo dd.mm.yyyy (musí mít obě tečky, aby se nespletlo s desetinným číslem)
  const m = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})?/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const year = m[3] ? (parseInt(m[3], 10) < 100 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : now.getFullYear();
      const check = new Date(year, month - 1, day);
      if (check.getMonth() !== month - 1 || check.getDate() !== day) return null; // neplatné datum (např. 31.2.)
      if (!m[3] && check < now) check.setFullYear(check.getFullYear() + 1); // bez roku a už uplynulo → příští rok
      return isoOf(check);
    }
  }

  // Název dne → datum v aktuálně zvoleném týdnu
  const names: Array<[string, number]> = [
    ['pondeli', 0], ['po', 0], ['utery', 1], ['ut', 1], ['streda', 2], ['st', 2],
    ['ctvrtek', 3], ['ct', 3], ['patek', 4], ['pa', 4], ['sobota', 5], ['so', 5], ['nedele', 6], ['ne', 6],
  ];
  const lower = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [name, idx] of names) {
    if (new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`).test(lower)) {
      const start = weekRange(wk).start;
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + idx);
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

// 🔗 Po uložení objednávky propojí nejnovější nezapojenou rezervaci výčepu s objednávkou
function linkLatestReservationToOrder(orderId: string): void {
  try {
    const saved = localStorage.getItem('vycepy_reservations_v1');
    if (!saved) return;
    const list = JSON.parse(saved) as any[];
    const idx = [...list].reverse().findIndex((r) => !r.order_id);
    if (idx === -1) return;
    const realIdx = list.length - 1 - idx;
    list[realIdx] = { ...list[realIdx], order_id: orderId };
    uloz('vycepy_reservations_v1', JSON.stringify(list));
  } catch { /* tichá chyba */ }
}
