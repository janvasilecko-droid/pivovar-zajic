

import { useEffect, useMemo, useState } from 'react';

import { Camera, ListOrdered, Package as PackageIcon, Phone, Building2, Truck, Plus, FileText, MessageCircle, Printer, FileSpreadsheet, CheckSquare, PackageCheck, FilePlus, Calendar, Trash2, Pencil, Copy, Ban, RotateCcw, AlertTriangle, Check, CheckCircle2 } from 'lucide-react';
import { supabase, supabaseAdmin, Beer, Package, Place, EntryRow, useRealtime, beerBg, beerText, beerName, formatPackageLabel } from '../lib/supabase';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { ImportFromImage } from '../components/ImportFromImage';
import { WhatsAppImportModal } from '../components/WhatsAppImportModal';
import { EditOrderModal } from '../components/EditOrderModal';
import { PlaceCombobox } from '../components/PlaceCombobox'; // Assuming this is needed
import { DAYS } from '../lib/shared';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { parseVoiceOrder, parseOrderText, detectOrderNotes, loadAliasMap, loadPlaceAliasMap, emptyAliasMap, getOrCreatePlace, type ParserAliasMap } from '../lib/orderParser';

import { shareOrderToWhatsApp } from '../lib/whatsapp';
import { autoReserveTapIfNeeded, isTapMentioned, detectTapType } from '../lib/tapReservations';
import { TapReservationModal } from '../components/TapReservationModal';
import { createReminder } from '../lib/reminders';
import Zavoz from './Zavoz';

import * as XLSX from 'xlsx';

type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  source: string; status: string; note: string | null; created_at: string;
  delivery_day: string | null; delivery_date: string | null;
  is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; delivered_at: string | null; 
  place_phone?: string | null; // Add place_phone to Order type
};
type OrderItem = {
  id: string; order_id: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
  is_prepared: boolean;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  nova: { label: 'Nová', cls: 'bg-accent-50 text-accent-700' },
  pripravena: { label: 'Připravená', cls: 'bg-warning-50 text-warning-700' },
  expedovana: { label: 'Expedovaná', cls: 'bg-success-50 text-success-700' },
  storno: { label: 'Storno', cls: 'bg-danger-50 text-danger-700' },
};

// Per-day color coding for deliveries. Each day has a distinct hue so you can see
// at a glance which orders go out together and that none was forgotten.
const DAY_COLORS: Record<string, { bg: string; bar: string; chip: string; text: string; dot: string }> = {
  po: { bg: 'bg-sky-50/70', bar: 'bg-sky-600', chip: 'bg-sky-700 text-white font-black shadow-2xs', text: 'text-sky-950 font-bold', dot: 'bg-sky-600' },
  ut: { bg: 'bg-emerald-50/70', bar: 'bg-emerald-600', chip: 'bg-emerald-700 text-white font-black shadow-2xs', text: 'text-emerald-950 font-bold', dot: 'bg-emerald-600' },
  st: { bg: 'bg-amber-100/60', bar: 'bg-amber-600', chip: 'bg-amber-600 text-white font-black shadow-2xs', text: 'text-amber-950 font-bold', dot: 'bg-amber-600' },
  ct: { bg: 'bg-rose-50/70', bar: 'bg-rose-600', chip: 'bg-rose-700 text-white font-black shadow-2xs', text: 'text-rose-950 font-bold', dot: 'bg-rose-600' },
  pa: { bg: 'bg-teal-50/70', bar: 'bg-teal-600', chip: 'bg-teal-700 text-white font-black shadow-2xs', text: 'text-teal-950 font-bold', dot: 'bg-teal-600' },
  so: { bg: 'bg-cyan-50/70', bar: 'bg-cyan-600', chip: 'bg-cyan-700 text-white font-black shadow-2xs', text: 'text-cyan-950 font-bold', dot: 'bg-cyan-600' },
  ne: { bg: 'bg-neutral-100', bar: 'bg-neutral-600', chip: 'bg-neutral-700 text-white font-black shadow-2xs', text: 'text-neutral-950 font-bold', dot: 'bg-neutral-600' },
};
function dayColor(d: string | null | undefined) { return d ? DAY_COLORS[d] : null; }

export default function Orders({
  autoOpenShareImport,
  onShareImportHandled,
  mode = 'all',
  setPage,
}: {
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  mode?: 'entry_only' | 'overviews_only' | 'all';
  setPage?: (p: any) => void;
} = {}) {

  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [places, setPlaces] = useState<Place[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [bottling, setBottling] = useState<EntryRow[]>([]);
  const [kegging, setKegging] = useState<EntryRow[]>([]);
  const [inventory, setInventory] = useState<EntryRow[]>([]);
  const [writeoffs, setWriteoffs] = useState<EntryRow[]>([]);
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

  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));

  // inline quick-add
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [placeId, setPlaceId] = useState('');
  const [placeNameFree, setPlaceNameFree] = useState('');
  const [deliveryDay, setDeliveryDay] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  type BeerRowItem = { beerId: string; pkgId: string; qty: string; placeId?: string; placeNameFree?: string };
  const [beerRows, setBeerRows] = useState<BeerRowItem[]>([
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
    { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' },
  ]);
  function setBeerRow(i: number, field: keyof BeerRowItem, value: string) {
    setBeerRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }
  const filledBeerRows = beerRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  // 📝 Ruční zadání objednávky textem — uživatel napíše objednávku a ta se
  // automaticky rozparsuje do tabulky položek (pivo, obal, množství).
  const [manualText, setManualText] = useState('');

  // 🚰 Rezervace výčepu — stav pro modální okno
  const [showTapModal, setShowTapModal] = useState(false);
  const [tapModalOrderId, setTapModalOrderId] = useState<string | undefined>(undefined);
  const [tapModalCustomer, setTapModalCustomer] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showWhatsAppImport, setShowWhatsAppImport] = useState(false);
  const [importTarget, setImportTarget] = useState<Order | null>(null);
  const [shareInitialFiles, setShareInitialFiles] = useState<File[] | undefined>(undefined);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  const [placeAliasMap, setPlaceAliasMap] = useState<Map<string, string>>(new Map());
  const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'zavoz'>('summary'); // New state for view mode
  const [itemFilterBeerId, setItemFilterBeerId] = useState<string | null>(null); // New state for item filter
  const [itemFilterPackageId, setItemFilterPackageId] = useState<string | null>(null); // New state for item filter
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);
  useEffect(() => { loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {}); }, []);

  async function handleSaveWhatsAppOrder(ordersData: {
    placeId: string | null;
    placeNameFree: string;
    orderDate: string;
    deliveryDay: string;
    deliveryDate: string;
    note: string;
    items: { beerId: string; pkgId: string; qty: number }[];
  }[]) {
    const today = new Date().toISOString().slice(0, 10);
    const createdIds: string[] = [];

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
        })
        .select()
        .single();

      if (error || !newOrder) throw new Error(error?.message || 'Chyba při vytváření objednávky');
      createdIds.push(newOrder.id);

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
      autoReserveTapIfNeeded(data.placeNameFree, today, data.note, newOrder.id);
    }

    setWeekKey(isoWeekKey(today));
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
    load();
  }





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
    const [{ data: o }, { data: pl }, { data: b }, { data: pk }, { data: bt }, { data: kg }, { data: inv }, { data: wo }] = await Promise.all([
      supabase.from('orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('places').select('*').order('name'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('entry_date,beer_id,quantity'),
      supabase.from('kegging').select('entry_date,beer_id,quantity'),
      supabase.from('inventory').select('entry_date,beer_id,quantity'),
      supabase.from('writeoffs').select('entry_date,beer_id,quantity'),
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
    setBottling((bt as EntryRow[]) ?? []); setKegging((kg as EntryRow[]) ?? []);
    setInventory((inv as EntryRow[]) ?? []); setWriteoffs((wo as EntryRow[]) ?? []);
    const ids = (o as Order[])?.map((x) => x.id) ?? [];
    if (ids.length) {
      const { data: it } = await supabase.from('order_items').select('*').in('order_id', ids);
      const map: Record<string, OrderItem[]> = {};
      (it as OrderItem[])?.forEach((i) => { (map[i.order_id] ??= []).push(i); });
      setItems(map);
    }
    if (!silent) setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['orders','order_items','beers','packages','places'], () => load(true));

  const [timeScope, setTimeScope] = useState<'week' | 'month' | 'all'>('week');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [packageKindFilter, setPackageKindFilter] = useState<'all' | 'keg' | 'bottle'>('all');

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

  function monthKey(dateStr: string): string { return dateStr.slice(0, 7); }

  // Per-beer remaining stock for a given ISO week:
  //   brewed this week + last month's inventory − all orders this week (non-storno) − writeoffs this week
  // Negative = deficit (chybí ve skladu).
  function stockRemainingForWeek(wk: string): Map<string, number> {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invMonths = [...new Set(inventory.map((r) => monthKey(r.entry_date)))].filter((m) => m < curMonth).sort().reverse();
    const lastInvMonth = invMonths[0];
    const invByBeer = new Map<string, number>();
    if (lastInvMonth) {
      inventory.filter((r) => monthKey(r.entry_date) === lastInvMonth && r.beer_id).forEach((r) => {
        invByBeer.set(r.beer_id!, (invByBeer.get(r.beer_id!) ?? 0) + Number(r.quantity));
      });
    }

    const brewedByBeer = new Map<string, number>();
    [...bottling, ...kegging].filter((r) => r.beer_id && isoWeekKey(r.entry_date) === wk).forEach((r) => {
      brewedByBeer.set(r.beer_id!, (brewedByBeer.get(r.beer_id!) ?? 0) + Number(r.quantity));
    });

    const woByBeer = new Map<string, number>();
    writeoffs.filter((r) => r.beer_id && isoWeekKey(r.entry_date) === wk).forEach((r) => {
      woByBeer.set(r.beer_id!, (woByBeer.get(r.beer_id!) ?? 0) + Number(r.quantity));
    });

    // Odečet sudů/lahví ze skladu se provede pouze u HOTOVÉ / VYŘÍZENÉ objednávky!
    // Používáme týden DORUČENÍ (datum akce), ne týden zadání — objednávka se odečte ve skladu v týdnu, kdy se závozí.
    const ordIdsThisWeek = new Set(
      orders
        .filter((o) => isoWeekKey(o.delivery_date || o.order_date) === wk && (o.status === 'vyrizena' || o.status === 'hotova' || o.status === 'vyrizeno' || o.is_delivered))
        .map((o) => o.id)
    );
    const ordByBeer = new Map<string, number>();
    Object.entries(items).forEach(([oid, arr]) => {
      if (!ordIdsThisWeek.has(oid)) return;
      arr.forEach((i) => { if (i.beer_id) ordByBeer.set(i.beer_id, (ordByBeer.get(i.beer_id) ?? 0) + Number(i.quantity)); });
    });

    const beerIds = new Set<string>([...invByBeer.keys(), ...brewedByBeer.keys(), ...ordByBeer.keys(), ...woByBeer.keys()]);
    const remaining = new Map<string, number>();
    beerIds.forEach((id) => {
      const total = (brewedByBeer.get(id) ?? 0) + (invByBeer.get(id) ?? 0);
      remaining.set(id, total - (ordByBeer.get(id) ?? 0) - (woByBeer.get(id) ?? 0));
    });
    return remaining;
  }

  async function addOrder(e?: React.FormEvent) {
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
      }

      // Pokud je vyplněno konkrétní datum dodání, vytvoř upomínku 48 hodin předem v 9:00
      if (deliveryDate) {
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
            title: `🚚 Závoz: ${placeName}`,
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

      // 🚰 Pokud poznámka zmiňuje výčep, zobraz modální okno pro rezervaci
      const trimmedNote = note.trim();
      const isVycepMentioned = isTapMentioned(trimmedNote);
      if (isVycepMentioned && firstOrderId) {
        setTapModalOrderId(firstOrderId);
        setTapModalCustomer(firstPlaceName || placeNameFree || places.find(p => p.id === placeId)?.name || '');
        setShowTapModal(true);
        setSaving(false);
        return; // Stop — modal will handle the rest
      }

      // No tap mentioned — finish normally
      setBeerRows(Array.from({ length: 4 }, () => ({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' })));
      setNote(''); setDeliveryDate(''); setErr(null);
      setFlash(true); setTimeout(() => setFlash(false), 800);
      setWeekKey(isoWeekKey(deliveryDate || date));
      load();
    } catch (err: any) {
      setErr(err.message ?? 'Chyba při vytváření objednávky');
    } finally {
      if (!showTapModal) setSaving(false);
    }
  }

  /** Called after tap reservation modal is confirmed or skipped */
  function handleTapModalDone() {
    setShowTapModal(false);
    setTapModalOrderId(undefined);
    // Finish the order creation flow
    setBeerRows(Array.from({ length: 4 }, () => ({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' })));
    setNote(''); setDeliveryDate(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    setWeekKey(isoWeekKey(deliveryDate || date));
    setSaving(false);
    load();
  }

  async function updateDeliveryDay(o: Order, day: string) {
    const patch: Record<string, unknown> = { delivery_day: day || null };
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, ...patch } as Order : x));
  }
  async function setStatus(o: Order, status: string) {
    await supabase.from('orders').update({ status }).eq('id', o.id);
    load();
  }
  async function toggleFlag(o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') {
    const patch: Record<string, unknown> = { [key]: !o[key] };
    if (key === 'is_delivered') patch.delivered_at = !o[key] ? new Date().toISOString() : null;
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, ...patch } as Order : x));
  }
  async function del(id: string) {
    if (!confirm('Smazat objednávku?')) return;
    await supabase.from('order_items').delete().eq('order_id', id);
    await supabase.from('orders').delete().eq('id', id);
    load();
  }

  const [zavozOnly, setZavozOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deliveryDayFilter, setDeliveryDayFilter] = useState<string>('all');
  const [groupByDay, setGroupByDay] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function norm(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  const searchedFiltered = useMemo(() => {
    const q = norm(searchText);
    return filtered.filter((o) => {
      if (zavozOnly && o.is_delivered) return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (deliveryDayFilter !== 'all') {
        if (deliveryDayFilter === '_none' && o.delivery_day) return false;
        if (deliveryDayFilter !== '_none' && o.delivery_day !== deliveryDayFilter) return false;
      }
      const its = items[o.id] ?? [];
      // Item filters (AND) — order must contain items matching ALL selected filters
      if (itemFilterBeerId && !its.some(item => item.beer_id === itemFilterBeerId)) return false;
      if (itemFilterPackageId && !its.some(item => item.package_id === itemFilterPackageId)) return false;

      // Filtr podle druhu obalu (Sudy KEG vs Lahve / Sklo / PET)
      if (packageKindFilter && packageKindFilter !== 'all') {
        const hasMatchingKind = its.some((item) => {
          const pkg = packages.find((p) => p.id === item.package_id);
          if (!pkg) return false;
          const isKeg = pkg.kind === 'keg' || (pkg.label ?? '').toLowerCase().includes('keg') || (pkg.label ?? '').toLowerCase().includes('sud');
          return packageKindFilter === 'keg' ? isKeg : !isKeg;
        });
        if (!hasMatchingKind) return false;
      }

      if (q) {
        const placeMatch = norm(o.place_name ?? '').includes(q);
        const beerMatch = its.some((i) => norm(i.beer_name ?? '').includes(q));
        const noteMatch = norm(o.note ?? '').includes(q);
        if (!placeMatch && !beerMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [filtered, zavozOnly, statusFilter, deliveryDayFilter, searchText, items, itemFilterBeerId, itemFilterPackageId, packageKindFilter, packages]);

  const itemAuditStats = useMemo(() => {
    if (!itemFilterBeerId && !itemFilterPackageId && packageKindFilter === 'all' && !searchText.trim()) {
      return null;
    }

    const matchItem = (item: OrderItem) => {
      if (itemFilterBeerId && item.beer_id !== itemFilterBeerId) return false;
      if (itemFilterPackageId && item.package_id !== itemFilterPackageId) return false;
      if (packageKindFilter !== 'all') {
        const pkg = packages.find((p) => p.id === item.package_id);
        if (!pkg) return false;
        const isKeg = pkg.kind === 'keg' || (pkg.label ?? '').toLowerCase().includes('keg') || (pkg.label ?? '').toLowerCase().includes('sud');
        if (packageKindFilter === 'keg' && !isKeg) return false;
        if (packageKindFilter === 'bottle' && isKeg) return false;
      }
      if (searchText.trim()) {
        const q = norm(searchText);
        const bName = norm(item.beer_name ?? '');
        if (!bName.includes(q)) return false;
      }
      return true;
    };

    let currentViewQty = 0;
    let currentViewOrdersCount = 0;
    searchedFiltered.forEach((o) => {
      const its = items[o.id] ?? [];
      const matchingIts = its.filter(matchItem);
      if (matchingIts.length > 0) {
        currentViewOrdersCount++;
        matchingIts.forEach((i) => { currentViewQty += Number(i.quantity); });
      }
    });

    let allOrdersQty = 0;
    let allOrdersCount = 0;
    orders.filter(o => o.status !== 'storno').forEach((o) => {
      const its = items[o.id] ?? [];
      const matchingIts = its.filter(matchItem);
      if (matchingIts.length > 0) {
        allOrdersCount++;
        matchingIts.forEach((i) => { allOrdersQty += Number(i.quantity); });
      }
    });

    return {
      currentViewQty,
      currentViewOrdersCount,
      allOrdersQty,
      allOrdersCount,
      hasHiddenOrders: allOrdersQty > currentViewQty
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
    await supabase.from('orders').update({ status }).in('id', [...selectedIds]);
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
    if (!confirm(`Smazat ${selectedIds.size} vybraných objednávek?`)) return;
    await supabase.from('order_items').delete().in('order_id', [...selectedIds]);
    await supabase.from('orders').delete().in('id', [...selectedIds]);
    clearSelection(); load();
  }

  // ---- Duplikace objednávky ----
  async function duplicateOrder(o: Order) {
    const its = items[o.id] ?? [];
    if (!its.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: newOrder, error } = await supabase.from('orders').insert({
      order_date: today, place_id: o.place_id, place_name: o.place_name,
      source: 'duplikat', status: 'nova', delivery_day: o.delivery_day,
      delivery_date: null, is_prepared: false, is_packaged: false, note: o.note,
    }).select().single();
    if (error || !newOrder) return;
    const rows = its.map((i) => ({
      order_id: newOrder.id, beer_id: i.beer_id, beer_name: i.beer_name,
      package_id: i.package_id, package_label: i.package_label, quantity: i.quantity,
    }));
    await supabase.from('order_items').insert(rows);
    setWeekKey(isoWeekKey(today));
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load();
  }

  // ---- Tisk zavážecího listu ----
  function printDeliveryList() {
    const toPrint = searchedFiltered;
    const rows = toPrint.map((o) => {
      const its = items[o.id] ?? [];
      const place = places.find((p) => p.id === o.place_id);
      const itemsHtml = its.map((i) => `<li>${i.beer_name ?? '—'} — ${i.quantity} ks (${i.package_label ?? '—'})</li>`).join('');
      return `
        <div style="page-break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:12px;">
          <div style="font-weight:bold;font-size:16px;">${o.place_name ?? '—'} ${o.delivery_day ? `(${DAYS.find(d=>d.v===o.delivery_day)?.label ?? ''})` : ''}</div>
          ${place?.address ? `<div style="font-size:12px;color:#555;">${place.address}</div>` : ''}
          ${place?.phone ? `<div style="font-size:12px;color:#555;">Tel: ${place.phone}</div>` : ''}
          <ul style="margin:8px 0 0 16px;padding:0;">${itemsHtml}</ul>
          ${o.note ? `<div style="font-size:12px;margin-top:6px;"><em>Poznámka: ${o.note}</em></div>` : ''}
        </div>`;
    }).join('');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Zavážecí list — ${weekKey}</title>
      <style>body{font-family:sans-serif;padding:20px;} h1{font-size:20px;}</style>
      </head><body>
      <h1>Zavážecí list — týden ${weekKey}</h1>
      ${rows || '<p>Žádné objednávky.</p>'}
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  }


  function exportXlsx() {
    const data = filtered.map((o) => {
      const its = items[o.id] ?? [];
      return {
        Datum: o.order_date, Odběratel: o.place_name ?? '', Den: o.delivery_day ?? '', 'Datum dodání': o.delivery_date ?? '',
        Připraveno: o.is_prepared ? 'Ano' : 'Ne', Fasování: o.is_packaged ? 'Ano' : 'Ne',
        Závoz: o.is_delivered ? 'Ano' : 'Ne',
        Status: STATUS[o.status]?.label ?? o.source, Položek: its.length, Poznámka: o.note ?? '',
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Objednávky');
    XLSX.writeFile(wb, `objednavky-${weekKey}.xlsx`);
  }

  const openDetail = (o: Order) => {
    setDetail(o);
    setTimeout(() => {
      document.getElementById('order-detail-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

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
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <span>🛒</span>
            <span>Objednávky</span>
          </span>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Řádek 1: Zadání objednávek / Detaily objednávek / Závoz — na jednom řádku, kompaktní */}
          <div className="flex gap-1.5 items-center flex-nowrap justify-end w-full sm:w-auto">
            {/* New Toggle for Summary vs Detail View */}
            {mode !== 'entry_only' && (
              <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex-1 sm:flex-none px-2 py-1.5 rounded-lg font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 whitespace-nowrap ${
                    viewMode === 'summary'
                      ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
                      : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Plus size={14} /> Nové
                </button>
                <button
                  onClick={() => setViewMode('detail')}
                  className={`flex-1 sm:flex-none px-2 py-1.5 rounded-lg font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 whitespace-nowrap ${
                    viewMode === 'detail'
                      ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
                      : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <FileText size={14} /> Přehled
                </button>
                <button
                  onClick={() => setViewMode('zavoz')}
                  className={`flex-1 sm:flex-none px-2 py-1.5 rounded-lg font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 whitespace-nowrap ${
                    viewMode === 'zavoz'
                      ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
                      : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <Truck size={14} /> Závoz
                </button>
              </div>
            )}
            {mode === 'overviews_only' && setPage && (
              <>
                <button className="btn-primary text-xs font-black shadow-md" onClick={() => setPage('orders_entry')}>
                  <FilePlus size={14} /> + Zadávání objednávek
                </button>
                <button className="btn-ghost !bg-emerald-50 border border-emerald-300 text-emerald-950 font-black text-xs shadow-xs" onClick={() => setPage('fasovani')}>
                  <PackageCheck size={14} /> Fasování →
                </button>
              </>
            )}
          </div>

          {/* Řádek 2: Hlasové zadání / WhatsApp / Fotka / Tisk / Export */}
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <VoiceRecorder
              compact
              beerNames={beers.map((b) => b.name)}
              placeNames={places.map((p) => p.name)}
              onResult={handleVoiceResult}
            />
            <button className="btn-ghost !bg-emerald-50 border border-emerald-300 text-emerald-950 font-black text-xs shadow-xs flex items-center gap-1.5" title="Vložit objednávku z textové zprávy WhatsApp" onClick={() => setShowWhatsAppImport(true)}><MessageCircle size={14} /> WhatsApp</button>
            <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs flex items-center gap-1.5" title="Načíst z fotky/e-mailu" onClick={() => { setImportTarget(null); setShowImport(true); }}><Camera size={14} /> Fotka/AI</button>
            {mode !== 'entry_only' && (
              <>
                <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs flex items-center gap-1.5" title="Tisk zavážecího listu" onClick={printDeliveryList} disabled={!searchedFiltered.length}><Printer size={14} /> Tisk</button>
                <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs flex items-center gap-1.5" title="Export týdne do Excelu" onClick={exportXlsx} disabled={!filtered.length}><FileSpreadsheet size={14} /> Export Excel</button>
              </>
            )}
          </div>
        </div>
      </div>



      {/* 1. ZADÁVÁNÍ OBJEDNÁVEK (jen v záložce Zadání objednávek) */}
      {mode !== 'overviews_only' && viewMode === 'summary' && (
        <form onSubmit={addOrder} className={`card p-4 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
          <div className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-display font-extrabold text-amber-950 dark:text-amber-200">
              <FilePlus size={16} className="text-amber-700 dark:text-amber-400" />
              <span>Formulář nové objednávky</span>
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-400 font-normal">Zadej novou zákaznickou objednávku</span>
          </div>

          {/* Odběratel */}
          <div className="mb-4">
            <label className="label dark:text-white">Odběratel <span className="text-neutral-400 dark:text-neutral-400 font-normal">(nepovinné)</span></label>
            <PlaceCombobox value={placeId} onChange={(id, name) => { setPlaceId(id); setPlaceNameFree(name); }} places={places} onPlacesChanged={load} />
          </div>

          {/* Datum dodání + Závoz na jednom řádku */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end mb-4">
            <div>
              <label className="label dark:text-white">Datum dodání <span className="text-neutral-400 dark:text-neutral-400 font-normal">(jiný týden)</span></label>
              <input type="date" className="input w-full !py-1.5 !px-2 !min-h-0 text-sm" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); setWeekKey(isoWeekKey(e.target.value)); }} />
            </div>
            <div>
              <label className="label dark:text-white">Závoz</label>
              <select className="input w-full !py-1.5 !px-2 !min-h-0 text-sm" value={deliveryDay} onChange={(e) => setDeliveryDay(e.target.value)}>
                <option value="">—</option>
                {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </div>
          </div>

          {/* 📝 Rychlé zadání objednávky textem — napíšeš objednávku a ta se
              automaticky rozparsuje do tabulky níže (pivo, obal, množství).
              Tím se aktivuje tlačítko "Vytvořit objednávku". */}
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
            <label className="label dark:text-white">📝 Napsat objednávku textem <span className="text-neutral-400 dark:text-neutral-400 font-normal">(rychlé zadání)</span></label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                className="input flex-1 font-mono text-sm"
                placeholder='např. "2x KEG30 12svetly, 1x KEG50 10desitka, 3x 0,33 tmava"'
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleManualTextParse(); } }}
              />
              <button type="button" className="btn-primary text-xs font-black shadow-md shrink-0" onClick={handleManualTextParse} disabled={!manualText.trim()}>
                ⚡ Rozparsovat do tabulky
              </button>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1.5">
              Napiš objednávku a klikni na „Rozparsovat“ — položky se vyplní do tabulky níže. Pak už jen klikni na „Vytvořit objednávku“.
            </div>
          </div>

          {/* Položky objednávky */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">Položky objednávky ({filledBeerRows.length} vyplněno)</div>
          </div>

          {/* Tabulka položek (styl KEG/Lahve stáčení) */}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800">
                  <th className="text-left py-1.5 px-2 font-black text-neutral-700 dark:text-neutral-200 w-2/5">Pivo</th>
                  <th className="text-left py-1.5 px-2 font-black text-neutral-700 dark:text-neutral-200 w-1/4">Obal</th>
                  <th className="text-center py-1.5 px-2 font-black text-neutral-700 dark:text-neutral-200">Ks</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {beerRows.map((r, i) => {
                  const filled = r.beerId && r.pkgId && Number(r.qty) > 0;
                  return (
                    <tr key={i} className={`border-b border-neutral-200/60 ${filled ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-1 pr-1">
                        <select className="input text-xs w-full" value={r.beerId} onChange={(e) => setBeerRow(i, 'beerId', e.target.value)}>
                          <option value="">—</option>
                          {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <select className="input text-xs w-full" value={r.pkgId} onChange={(e) => setBeerRow(i, 'pkgId', e.target.value)}>
                          <option value="">—</option>
                          {packages.map((p) => <option key={p.id} value={p.id}>{p.volume_l} L</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-1">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="w-7 h-7 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition disabled:opacity-30"
                            disabled={!r.qty || Number(r.qty) <= 0}
                            onClick={() => setBeerRow(i, 'qty', String(Math.max(0, Number(r.qty) - 1)))}
                          >−</button>
                                                    <span className="w-16 min-w-[3.5rem] text-xs text-center font-bold bg-white border border-neutral-200 rounded-lg py-2">
                            {Number(r.qty) > 0 ? r.qty : '0'}
                          </span>
                          <button
                            type="button"
                            className="w-7 h-7 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-sm transition"
                            onClick={() => setBeerRow(i, 'qty', String(Number(r.qty || 0) + 1))}
                          >+</button>
                        </div>
                      </td>
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <button type="button" className="w-7 h-7 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm transition"
                            onClick={() => { setBeerRow(i, 'beerId', ''); setBeerRow(i, 'pkgId', ''); setBeerRow(i, 'qty', ''); }}
                            title="Zrušit řádek">✕</button>
                          <button type="submit" className="w-7 h-7 grid place-items-center rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-xs"
                            title="Potvrdit / vytvořit objednávku">✓</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Poznámka */}
          <div className="mt-4">
            <label className="label">Poznámka <span className="text-neutral-400 font-normal">(odfasování sudu, podtacky, sklo…)</span></label>
            <input type="text" className="input" placeholder="např. vratný sud, podtacky, sklo" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {/* Akční tlačítka pod tabulkou */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary text-xs font-black shadow-md" disabled={saving || (!filledBeerRows.length && !manualText.trim())}>
                {saving ? '⏳ Ukládám…' : `💾 Vytvořit objednávku${filledBeerRows.length ? ` (${filledBeerRows.length})` : manualText.trim() ? ' (z textu)' : ''}`}
              </button>

              <button type="button" className="btn-ghost text-xs" onClick={() => setBeerRows((rs) => [...rs, { beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' }])}>
                ➕ Přidat řádek
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setBeerRows(Array.from({ length: 4 }, () => ({ beerId: '', pkgId: '', qty: '', placeId: '', placeNameFree: '' })))}>
                🗑️ Vymazat vše
              </button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

          {err && <div className="text-sm text-danger-600 mt-3 bg-danger-500/10 rounded-lg px-3 py-2 font-bold">{err}</div>}
          
          {flash && (
            <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2 text-sm">
                <span>✅</span>
                <span>Objednávka byla úspěšně vytvořena!</span>
              </span>
              {setPage && (
                <button type="button" className="btn-ghost text-xs font-black text-emerald-900 underline" onClick={() => setPage('orders')}>
                  Zobrazit v Přehledu →
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {/* 2. PŘEHLEDY & SOUHRNY (Když není entry_only) */}
      {/* V záložce „Nové“ se zobrazuje pouze formulář zadávání objednávek (výše).
          Seznam a detaily objednávek jsou vidět jen v záložce „Objednávky“. */}

      {/* ⬅️➡️ Navigace Týden / Celý měsíc / Všechny objednávky — Detaily */}
      {mode !== 'entry_only' && viewMode === 'detail' && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white rounded-2xl border border-neutral-200 p-2.5 shadow-2xs">
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl flex-wrap">
            <button
              type="button"
              onClick={() => setTimeScope('week')}
              className={`px-3 py-1.5 rounded-lg font-black text-xs transition ${
                timeScope === 'week' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              📅 Týden
            </button>
            <button
              type="button"
              onClick={() => setTimeScope('month')}
              className={`px-3 py-1.5 rounded-lg font-black text-xs transition ${
                timeScope === 'month' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              🗓️ Celý měsíc
            </button>
            <button
              type="button"
              onClick={() => setTimeScope('all')}
              className={`px-3 py-1.5 rounded-lg font-black text-xs transition ${
                timeScope === 'all' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              🌐 Všechny
            </button>
          </div>

          {timeScope === 'week' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
                className="btn-ghost !py-1.5 !px-2.5 text-xs font-black hover:bg-amber-100 transition"
              >
                ←
              </button>
              <div className="text-center flex items-center gap-1.5">
                <span className="text-xs font-bold text-amber-700">Týden</span>
                <span className="font-display font-black text-base text-amber-950">{weekKey.split('-')[1]}</span>
                <span className="text-xs text-neutral-500">({wr.label})</span>
              </div>
              <button
                onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
                className="btn-ghost !py-1.5 !px-2.5 text-xs font-black hover:bg-amber-100 transition"
              >
                →
              </button>
            </div>
          )}

          {timeScope === 'month' && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl">
              <Calendar size={15} className="text-amber-800" />
              <span className="text-xs font-black text-amber-900">Měsíc:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-amber-950 font-mono font-black border-none focus:outline-none text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Vyhledávání a filtry */}
      {mode !== 'entry_only' && viewMode === 'detail' && ( // Render only in detail view
        <>
        <div className="space-y-3 mb-4">
          {/* Active Item Filter Display */}
          {(itemFilterBeerId || itemFilterPackageId || packageKindFilter !== 'all' || timeScope !== 'week' || searchText.trim()) && (
            <div className="p-3.5 rounded-2xl bg-amber-100/90 border-2 border-amber-400 text-amber-950 text-xs font-bold shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base">🔎</span>
                <span>
                  Aktivní filtry:{' '}
                  {timeScope === 'month' ? `[Měsíc: ${selectedMonth}] ` : timeScope === 'all' ? '[Všechny objednávky] ' : ''}
                  {packageKindFilter === 'keg' ? '[Pouze KEG sudy] ' : packageKindFilter === 'bottle' ? '[Pouze lahve] ' : ''}
                  {itemFilterBeerId ? `[Pivo: ${beers.find(b => b.id === itemFilterBeerId)?.name}] ` : ''}
                  {itemFilterPackageId ? `[Obal: ${packages.find(p => p.id === itemFilterPackageId)?.label}] ` : ''}
                  {searchText.trim() ? `[Hledání: "${searchText}"] ` : ''}
                </span>

                {itemAuditStats && (
                  <span className="ml-1 px-2.5 py-1 rounded-xl bg-amber-500 text-white font-black text-xs shadow-xs">
                    Součet v tomto zobrazení: {itemAuditStats.currentViewQty} ks ({itemAuditStats.currentViewOrdersCount} obj.)
                  </span>
                )}

                {itemAuditStats?.hasHiddenOrders && (
                  <span className="text-amber-950 font-black bg-amber-200 border border-amber-400 px-2.5 py-1 rounded-xl">
                    ⚠️ V jiných filtrech/týdnech je dalších {itemAuditStats.allOrdersQty - itemAuditStats.currentViewQty} ks (Celkem {itemAuditStats.allOrdersQty} ks ve {itemAuditStats.allOrdersCount} obj.)
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
                    className="btn-primary !py-1 !px-3 text-xs font-black shadow-md shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    🌐 Zobrazit všech {itemAuditStats.allOrdersQty} ks
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setTimeScope('week'); setPackageKindFilter('all');
                    setItemFilterBeerId(null); setItemFilterPackageId(null);
                    setSearchText(''); setStatusFilter(''); setDeliveryDayFilter('all');
                  }}
                  className="btn-ghost !py-1 !px-2.5 text-xs font-black text-rose-900 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-xl"
                >
                  ✕ Zrušit filtry
                </button>
              </div>
            </div>
          )}

        {/* Delivery Day quick selector tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          <button
            onClick={() => setDeliveryDayFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs shrink-0 transition-all shadow-2xs ${
              deliveryDayFilter === 'all'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-neutral-800 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            🚚 Všechny dny
          </button>
          {DAYS.map((d) => {
            const count = filtered.filter((o) => o.delivery_day === d.v && o.status !== 'storno').length;
            const hasOrders = count > 0;
            return (
              <button
                key={d.v}
                onClick={() => setDeliveryDayFilter(d.v)}
                className={`px-3 py-1.5 rounded-xl font-black text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-2xs ${
                  deliveryDayFilter === d.v
                    ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                    : hasOrders
                    ? 'bg-amber-100/90 text-amber-950 border-2 border-amber-400/80 hover:bg-amber-200'
                    : 'bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                <span>{d.label}</span>
                {hasOrders && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${deliveryDayFilter === d.v ? 'bg-white/20 text-white' : 'bg-black/10 text-black'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => setDeliveryDayFilter('_none')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition-all ${
              deliveryDayFilter === '_none'
                ? 'bg-neutral-800 text-white'
                : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            Bez dne
          </button>
        </div>

        <div className="card p-3 flex flex-wrap items-center gap-3">
          <input
            type="text" placeholder="🔍 Hledat odběratele, pivo nebo poznámku…"
            className="input flex-1 min-w-[200px]" value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <select className="input w-auto font-bold text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Všechny statusy</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input w-auto font-bold text-xs" value={packageKindFilter} onChange={(e) => setPackageKindFilter(e.target.value as any)}>
            <option value="all">📦 Všechny druhy obalů</option>
            <option value="keg">🛢️ Pouze sudy (KEG)</option>
            <option value="bottle">🍾 Pouze lahve / Sklo / PET</option>
          </select>
          <select className="input w-auto font-bold text-xs" value={itemFilterBeerId ?? ''} onChange={(e) => setItemFilterBeerId(e.target.value || null)}>
            <option value="">🍺 Všechna piva</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input w-auto font-bold text-xs" value={itemFilterPackageId ?? ''} onChange={(e) => setItemFilterPackageId(e.target.value || null)}>
            <option value="">🏷️ Konkrétní obal</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-1.5 rounded-lg hover:bg-primary-50">
            <input type="checkbox" checked={groupByDay} onChange={(e) => setGroupByDay(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
            📅 Seskupit dle dne
          </label>
          {(searchText || statusFilter || deliveryDayFilter !== 'all' || itemFilterBeerId || itemFilterPackageId) && (
            <button className="btn-ghost !py-1.5 text-xs font-bold text-amber-900" onClick={() => { setSearchText(''); setStatusFilter(''); setDeliveryDayFilter('all'); setItemFilterBeerId(null); setItemFilterPackageId(null); }}>Zrušit filtr</button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-1.5 rounded-lg hover:bg-primary-50">
          <input type="checkbox" checked={zavozOnly} onChange={(e) => setZavozOnly(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
          🚚 Jen nezavezenné (pro závozníka)
        </label>
        {selectedIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 bg-primary-50 rounded-xl px-3 py-2">
            <span className="text-sm font-semibold text-primary-800">{selectedIds.size} vybráno</span>
            <button className="chip bg-success-100 text-success-700 hover:bg-success-200" onClick={() => bulkToggleFlag('is_prepared')}>✓ Připraveno</button>
            <button className="chip bg-primary-200 text-primary-800 hover:bg-primary-300 flex items-center gap-1" onClick={() => bulkToggleFlag('is_packaged')}><PackageCheck size={12} /> Fasování</button>
            <button className="chip bg-success-200 text-success-800 hover:bg-success-300 flex items-center gap-1" onClick={() => bulkToggleFlag('is_delivered')}><Truck size={12} /> Zavezenné</button>
            <button className="chip bg-warning-100 text-warning-700 hover:bg-warning-200" onClick={() => bulkSetStatus('expedovana')}>Expedovat</button>
            <button className="chip bg-danger-50 text-danger-700 hover:bg-danger-100 flex items-center gap-1" onClick={bulkDelete}><Trash2 size={12} /> Smazat</button>
            <button className="chip bg-white border border-primary-200 text-primary-500 hover:bg-primary-50" onClick={clearSelection}>✕ Zrušit výběr</button>
          </div>
        ) : (
          searchedFiltered.length > 0 && <button className="btn-ghost !py-1.5 text-xs flex items-center gap-1" onClick={selectAll}><CheckSquare size={13} /> Vybrat vše ({searchedFiltered.length})</button>
        )}
      </div>
        </>
      )}

      {viewMode === 'zavoz' && <Zavoz setPage={setPage} embedded />}

      {viewMode !== 'zavoz' && (loading ? null : searchedFiltered.length === 0 ? <EmptyState text="Žádné objednávky pro zvolené filtry." icon="🧾" /> : (viewMode === 'detail' && groupedByDay) ? (
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
                    <OrderCard o={o} items={items[o.id] ?? []} stockRemainingForWeek={stockRemainingForWeek}
                      selected={selectedIds.has(o.id)} onToggleSelect={() => toggleSelect(o.id)}
                      onClick={() => openDetail(o)} onToggleFlag={toggleFlag} onUpdateDeliveryDay={updateDeliveryDay}
                      onSetStatus={setStatus} onDelete={del} onDuplicate={duplicateOrder} onEdit={setEditOrder} beers={beers} packages={packages} places={places}
                      activeBeerId={itemFilterBeerId} activePackageId={itemFilterPackageId} />
                    {detail?.id === o.id && (
                      <div id="order-detail-card" className="scroll-mt-6 animate-scale-in pl-2 sm:pl-4 border-l-4 border-amber-500">
                        <OrderDetail
                  order={detail}
                          items={items[detail.id] ?? []}
                          beers={beers}
                          packages={packages}
                          places={places}
                          remaining={stockRemainingForWeek(isoWeekKey(detail.order_date))}
                          onClose={() => setDetail(null)}
                          onChanged={load}
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
              <OrderCard o={o} items={items[o.id] ?? []} stockRemainingForWeek={stockRemainingForWeek}
                selected={selectedIds.has(o.id)} onToggleSelect={() => toggleSelect(o.id)}
                onClick={() => openDetail(o)} onToggleFlag={toggleFlag} onUpdateDeliveryDay={updateDeliveryDay}
                onSetStatus={setStatus} onDelete={del} onDuplicate={duplicateOrder} onEdit={setEditOrder} beers={beers} packages={packages} places={places}
                activeBeerId={itemFilterBeerId} activePackageId={itemFilterPackageId} />
              {detail?.id === o.id && (
                <div id="order-detail-card" className="scroll-mt-6 animate-scale-in pl-2 sm:pl-4 border-l-4 border-amber-500">
                  <OrderDetail
                    order={detail}
                    items={items[detail.id] ?? []}
                    beers={beers}
                    packages={packages}
                    places={places}
                    remaining={stockRemainingForWeek(isoWeekKey(detail.order_date))}
                    onClose={() => setDetail(null)}
                    onChanged={load}
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
      )}



      {showWhatsAppImport && (
        <WhatsAppImportModal
          isOpen={showWhatsAppImport}
          onClose={() => setShowWhatsAppImport(false)}
          beers={beers}
          packages={packages}
          places={places}
          aliasMap={aliasMap}
          onSave={handleSaveWhatsAppOrder}
        />
      )}

      {showImport && (
        <ImportFromImage
          beers={beers} packages={packages} places={places}
          existing={(importTarget ? items[importTarget.id] ?? [] : []).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity }))}
          targetLabel={importTarget ? (importTarget.place_name ?? importTarget.order_date) : null}
          initialFiles={shareInitialFiles}
          onPlacesChanged={load}
          onClose={() => { setShowImport(false); setShareInitialFiles(undefined); }}


          onImport={async (items, meta) => {
            let orderId = importTarget?.id;
            let targetDate = importTarget?.order_date ?? meta.date;
            if (!orderId) {
              const groups = new Map<string, typeof items>();
              for (const it of items) {
                const key = (it.place_name && it.place_name.trim()) || meta.placeName || '';
                (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
              }
              const created: string[] = [];
              for (const [recipient, rows] of groups) {
                const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                let place = recipient ? places.find((p) => norm(p.name) === norm(recipient)) : undefined;
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
                const itemRows = rows.map((i) => {
                  const b = beers.find((x) => x.id === i.beer_id);
                  const p = packages.find((x) => x.id === i.package_id);
                  return { order_id: order.id, beer_id: i.beer_id, beer_name: b?.name ?? null, package_id: i.package_id, package_label: p?.label ?? null, quantity: i.quantity };
                });
                const { error: itemErr } = await supabase.from('order_items').insert(itemRows);
                if (itemErr) throw new Error(itemErr.message);
                created.push(order.id);
                // 🚰 Rezervace výčepu — spáruj s vytvořenou objednávkou (order_id)
                autoReserveTapIfNeeded(placeName || meta.placeName, orderDate, meta.note, order.id);
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
              autoReserveTapIfNeeded(meta.placeName, targetDate, meta.note, orderId);
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
      )}

      {/* 🚰 Modální okno pro výběr výčepu k rezervaci */}
      {showTapModal && (
        <TapReservationModal
          orderDate={date}
          customerName={tapModalCustomer}
          orderId={tapModalOrderId}
          tapTypeHint={detectTapType(note)}
          onConfirm={handleTapModalDone}
          onSkip={handleTapModalDone}
        />
      )}
    </div>
  );
}

function OrderCard({ o, items, stockRemainingForWeek, selected, onToggleSelect, onClick, onToggleFlag, onUpdateDeliveryDay, onSetStatus, onDelete, onDuplicate, onEdit, beers, packages, places, activeBeerId, activePackageId }: {
  o: Order; items: OrderItem[];
  stockRemainingForWeek: (wk: string) => Map<string, number>;
  selected: boolean; onToggleSelect: () => void; onClick: () => void;
  onToggleFlag: (o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') => void;
  onUpdateDeliveryDay: (o: Order, day: string) => void;
  onSetStatus: (o: Order, status: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (o: Order) => void;
  onEdit: (o: Order) => void;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  activeBeerId?: string | null;
  activePackageId?: string | null;
}) {

  const total = items.reduce((s, i) => s + Number(i.quantity), 0);
  const remaining = stockRemainingForWeek(isoWeekKey(o.delivery_date || o.order_date));
  const deficits = items
    .filter((i) => i.beer_id && (remaining.get(i.beer_id) ?? 0) < 0)
    .map((i) => ({ name: i.beer_name ?? '?', missing: -(remaining.get(i.beer_id!) ?? 0) }));
  const seenDef = new Set<string>();
  const uniqueDeficits = deficits.filter((d) => !seenDef.has(d.name) && !seenDef.add(d.name));
  
  // Seřadit položky: nejdříve kegy, pak lahve podle názvu
  const sortedItems = [...items].sort((a, b) => {
    const pkgA = packages.find((p) => p.id === a.package_id);
    const pkgB = packages.find((p) => p.id === b.package_id);
    const kindA = pkgA?.kind ?? 'bottle';
    const kindB = pkgB?.kind ?? 'bottle';
    
    // Nejdříve seřadit podle druhu: keg před bottle
    if (kindA === 'keg' && kindB !== 'keg') return -1;
    if (kindA !== 'keg' && kindB === 'keg') return 1;
    
    // Uvnitř stejného druhu seřadit podle názvu obalu
    const labelA = a.package_label ?? '';
    const labelB = b.package_label ?? '';
    return labelA.localeCompare(labelB, 'cs');
  });
  
  return (
    <div
      className={`card-hover p-2.5 cursor-pointer relative overflow-hidden transition-all border-2 bg-white border-neutral-200 ${selected ? 'ring-2 ring-primary-500' : ''}`}
      onClick={onClick}
    >
      {dayColor(o.delivery_day) && (
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${dayColor(o.delivery_day)!.bar}`} />
      )}
      <div className="flex flex-col gap-1.5 pl-1.5">
        {/* Řádek 1: checkbox + název + status + datum akce (závoz) + akce */}
        <div className="flex items-center gap-1.5 min-w-0">
          <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onToggleSelect}
            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500 shrink-0" />
          <span className="font-display font-black text-sm sm:text-base text-neutral-950 break-words truncate">{o.place_name ?? '—'}</span>
          <span className={`chip font-black ${STATUS[o.status]?.cls ?? ''}`}>{STATUS[o.status]?.label ?? o.status}</span>
          {o.delivery_date && (
            <span className="chip bg-amber-600 text-white font-black shadow-2xs shrink-0 flex items-center gap-1" title="Datum akce / závozu">
              <Calendar size={11} /> {new Date(o.delivery_date).toLocaleDateString('cs-CZ')}
            </span>
          )}
          {o.delivery_day && (
            <span className={`chip ${dayColor(o.delivery_day)!.chip} shrink-0 flex items-center gap-1`}>
              <Truck size={11} /> {DAYS.find((d) => d.v === o.delivery_day)?.label ?? o.delivery_day}
            </span>
          )}
          <span className="text-[10px] font-bold text-neutral-500 bg-white/80 border border-neutral-200 rounded-md px-1.5 py-0.5 shadow-2xs shrink-0 flex items-center gap-1" title="Datum zadání">
            <Calendar size={11} /> {new Date(o.order_date).toLocaleDateString('cs-CZ')}
          </span>
          <div className="ml-auto flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onToggleFlag(o, 'is_prepared')}
              className={`px-2 py-1 rounded-lg text-[11px] font-black transition flex items-center gap-1 shadow-2xs ${
                o.is_prepared
                  ? 'bg-emerald-600 text-white border border-emerald-700 shadow-xs'
                  : 'bg-white text-neutral-800 border border-neutral-300 hover:bg-emerald-50'
              }`}
              title="Označit jako připraveno"
            >
              {o.is_prepared ? <Check size={12} /> : <span className="text-[11px]">⏳</span>}
              <span>{o.is_prepared ? 'Připr.' : 'Příprava'}</span>
            </button>
          </div>
        </div>

        {/* Řádek 2: položky + souhrn + stav skladu */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {items.length > 0 && (
            <>
              {sortedItems.map((i) => {
                const beer = i.beer_id ? beers.find((b) => b.id === i.beer_id) : null;
                const isFilteredMatch = (activeBeerId && i.beer_id === activeBeerId) || (activePackageId && i.package_id === activePackageId);
                return (
                  <span
                    key={i.id}
                    className={`chip !py-0.5 !px-2 text-[11px] font-black border transition-all ${
                      isFilteredMatch
                        ? 'bg-amber-400 text-neutral-950 border-amber-600 ring-2 ring-amber-500 shadow-md scale-105'
                        : 'bg-white text-neutral-950 border-neutral-200 shadow-xs'
                    }`}
                  >
                    {beer && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20"
                        style={{ backgroundColor: beerBg(beer) }}
                      />
                    )}
                    <span className="font-black tracking-tight">{i.beer_name ?? '?'}</span>
                    {i.package_label && (
                      <span className="ml-1 font-extrabold text-neutral-700">
                        ({formatPackageLabel(i.package_label)})
                      </span>
                    )}
                    <strong className={`ml-1.5 px-1.5 py-0 rounded font-black text-[11px] ${isFilteredMatch ? 'bg-neutral-950 text-amber-300' : 'bg-amber-100 text-amber-950'}`}>
                      {i.quantity} ks
                    </strong>
                  </span>
                );
              })}
            </>
          )}
          <span className="text-[11px] font-black text-neutral-700 shrink-0">
            {items.length} položek · {total} ks
          </span>
          {o.note && <span className="text-[11px] font-extrabold shrink-0 text-neutral-900 bg-amber-100 border border-amber-300 rounded-md px-1.5 py-0.5">📝 {o.note}</span>}
          {(() => { const _ph = places.find(p => p.id === o.place_id)?.phone; return _ph ? (
            <a href={`tel:${_ph}`} className="text-[11px] text-blue-700 font-bold flex items-center gap-0.5 hover:underline shrink-0">
              <Phone size={11} /> <span>{_ph}</span>
            </a>
          ) : null; })()}
          {o.is_delivered && <span className="chip bg-purple-700 text-white font-black shadow-2xs flex items-center gap-1"><Check size={11} /> Zavez.</span>}
        </div>

        {/* Řádek 3: sklad + připraveno + den + akce */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {uniqueDeficits.length > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-black text-rose-950 bg-rose-100 border border-rose-300 rounded-lg px-2 py-0.5 shadow-2xs">
              <AlertTriangle size={12} />
              <span>Chybí: {uniqueDeficits.map((d) => `${d.name} ${d.missing} ks`).join(', ')}</span>
            </span>
          ) : items.length > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-black text-emerald-950 bg-emerald-100 border border-emerald-300 rounded-lg px-2 py-0.5 shadow-2xs">
              <CheckCircle2 size={12} />
              <span>Vše skladem</span>
            </span>
          ) : null}
          {o.is_prepared && <span className="chip bg-emerald-700 text-white font-black shadow-2xs flex items-center gap-1"><Check size={11} /> Připr.</span>}

          <div className="flex items-center gap-1 ml-auto flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
            <span className="text-[11px] font-extrabold text-neutral-900 shrink-0">Závoz:</span>
            <select
              className="input !py-0.5 !px-1.5 text-[11px] font-bold w-20 bg-white border-amber-300 shadow-2xs"
              value={o.delivery_day ?? ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdateDeliveryDay(o, e.target.value)}
            >
              <option value="">—</option>
              {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
            <button className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] shadow-md transition flex items-center gap-1" onClick={() => onEdit(o)} title="Upravit objednávku">
              <Pencil size={12} /> Upravit
            </button>
            <button className="btn-ghost text-[11px] font-bold !py-1 !px-2 !bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs hover:bg-emerald-100 flex items-center gap-1" onClick={() => shareOrderToWhatsApp(o, items)} title="Sdílet tuto objednávku na WhatsApp">
              <MessageCircle size={12} /> WhatsApp
            </button>
            <button className="btn-ghost text-[11px] font-bold !py-1 !px-2 !bg-white border border-neutral-300 shadow-2xs flex items-center gap-1" onClick={() => onDuplicate(o)} title="Vytvořit stejnou objednávku znovu"><Copy size={12} /> Duplik.</button>
            {o.status !== 'storno' && (
              <button className="btn-ghost text-[11px] font-extrabold !py-1 !px-2 !bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs hover:bg-rose-100 flex items-center gap-1" onClick={() => onSetStatus(o, 'storno')} title="Zrušit / Stornovat objednávku"><Ban size={12} /> Zrušit</button>
            )}
            {o.status === 'storno' && (
              <button className="btn-ghost text-[11px] font-extrabold !py-1 !px-2 !bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs flex items-center gap-1" onClick={() => onSetStatus(o, 'nova')} title="Obnovit objednávku"><RotateCcw size={12} /> Obnovit</button>
            )}
            <button className="btn-danger text-[11px] font-bold !py-1 !px-2 shadow-2xs" onClick={() => onDelete(o.id)}>Smazat</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ order, items, beers, packages, places, remaining, onClose, onChanged, onToggleFlag, onImportImage, setItems, setOrders, allOrders, allItems, setPage, weekKey, setWeekKey }: {
  order: Order; items: OrderItem[]; beers: Beer[]; packages: Package[]; places: Place[]; remaining: Map<string, number>; onClose: () => void; onChanged: () => void; onToggleFlag: (o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') => void; onImportImage: (o: Order) => void;
  setItems: React.Dispatch<React.SetStateAction<Record<string, OrderItem[]>>>;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setPage?: (p: any, sec?: string) => void;
  allOrders: Order[];
  allItems: Record<string, OrderItem[]>;
  weekKey: string;
  setWeekKey: (wk: string) => void;
}) {
  // ---- Historie odběratele: poslední objednávky téhož místa (kromě aktuální) ----
  const placeHistory = useMemo(() => {
    if (!order.place_id && !order.place_name) return [];
    return allOrders
      .filter((o) => o.id !== order.id && (
        (order.place_id && o.place_id === order.place_id) ||
        (!order.place_id && o.place_name === order.place_name)
      ))
      .sort((a, b) => b.order_date.localeCompare(a.order_date))
      .slice(0, 5);
  }, [allOrders, order]);

  const [adding, setAdding] = useState(false);
  const [beerId, setBeerId] = useState('');
  const [pkgId, setPkgId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState(order.note ?? '');
  const [day, setDay] = useState(order.delivery_day ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editBeerId, setEditBeerId] = useState('');
  const [editPkgId, setEditPkgId] = useState('');
  const [editQty, setEditQty] = useState('');

  async function addItem() {

    if (!beerId || !pkgId || !Number(qty)) return;
    const b = beers.find((x) => x.id === beerId);
    const p = packages.find((x) => x.id === pkgId);
    await supabase.from('order_items').insert({
      order_id: order.id, beer_id: beerId, beer_name: b?.name ?? null,
      package_id: pkgId, package_label: p?.label ?? null, quantity: Number(qty),
    });
    setBeerId(''); setPkgId(''); setQty(''); setAdding(false); onChanged();
  }
  async function rmItem(id: string) {
    await supabase.from('order_items').delete().eq('id', id); onChanged();
  }
  async function updateItemQty(it: OrderItem, newQty: number) {
    if (!Number.isFinite(newQty) || newQty <= 0) return;
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, quantity: newQty } : x),
    }));
    await supabase.from('order_items').update({ quantity: newQty }).eq('id', it.id);
  }
  async function updateItemBeer(it: OrderItem, newBeerId: string) {
    const b = beers.find((x) => x.id === newBeerId);
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, beer_id: newBeerId, beer_name: b?.name ?? null } : x),
    }));
    await supabase.from('order_items').update({ beer_id: newBeerId, beer_name: b?.name ?? null }).eq('id', it.id);
  }
  async function updateItemPkg(it: OrderItem, newPkgId: string) {
    const p = packages.find((x) => x.id === newPkgId);
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, package_id: newPkgId, package_label: p?.label ?? null } : x),
    }));
    await supabase.from('order_items').update({ package_id: newPkgId, package_label: p?.label ?? null }).eq('id', it.id);
  }

  async function saveMeta() {
    setSavingMeta(true);
    await supabase.from('orders').update({ note: note || null, delivery_day: day || null, delivery_date: deliveryDate || null }).eq('id', order.id);
    setSavingMeta(false); onChanged();
  }
  async function toggleItemPrepared(it: OrderItem) {
    const newPrepared = !it.is_prepared;
    await supabase.from('order_items').update({ is_prepared: newPrepared }).eq('id', it.id);
    // Optimistic update in place — avoid calling load() which would collapse
    // the list and scroll back to the top while the user is checking items off.
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, is_prepared: newPrepared } : x),
    }));
    const updatedItems = items.map((x) => x.id === it.id ? { ...x, is_prepared: newPrepared } : x);
    const allPrepared = updatedItems.length > 0 && updatedItems.every((x) => x.is_prepared);
    if (allPrepared && !order.is_prepared) {
      await supabase.from('orders').update({ is_prepared: true }).eq('id', order.id);
      setOrders((arr) => arr.map((x) => x.id === order.id ? { ...x, is_prepared: true } as Order : x));
    } else if (!allPrepared && order.is_prepared) {
      await supabase.from('orders').update({ is_prepared: false }).eq('id', order.id);
      setOrders((arr) => arr.map((x) => x.id === order.id ? { ...x, is_prepared: false } as Order : x));
    }
  }

  const dc = dayColor(order.delivery_day);
  return (
    <div className={`-m-4 sm:-m-8 min-h-[calc(100vh-0px)] ${dc?.bg ?? ''}`}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-900 mb-4 group -ml-2"
        >
          <span className="w-9 h-9 grid place-items-center rounded-full bg-white shadow-sm border border-primary-100 group-hover:bg-primary-50 group-active:scale-95 transition">←</span>
          Zpět na objednávky
        </button>

        {/* ⬅️➡️ Navigace týdny — Detail objednávky */}
        <div className="flex items-center justify-between gap-3 mb-4 bg-white rounded-2xl border border-neutral-200 p-2 shadow-2xs">
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            className="btn-ghost !py-1.5 !px-3 text-xs font-black flex items-center gap-1 hover:bg-amber-100 transition"
          >
            ←
          </button>
          <div className="text-center flex items-center gap-2">
            <span className="text-xs font-bold text-amber-700">Týden</span>
            <span className="font-display font-black text-base text-amber-950">{weekKey.split('-')[1]}</span>
            <span className="text-xs text-neutral-500">({weekRange(weekKey).label})</span>
          </div>
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            className="btn-ghost !py-1.5 !px-3 text-xs font-black flex items-center gap-1 hover:bg-amber-100 transition"
          >
            →
          </button>
        </div>

        <div className={`card p-5 mb-4 border-2 ${dc ? 'border-' + dc.bar.replace('bg-', '') + '/40' : 'border-primary-100'}`}>
          <div className="flex items-center gap-2 text-sm text-primary-500 flex-wrap mb-2">
            <span>{order.order_date}</span>
            <span>·</span>
            <span className={`chip ${STATUS[order.status]?.cls ?? ''}`}>{STATUS[order.status]?.label}</span>
            {order.is_prepared && <span className="chip bg-success-100 text-success-700">✓ Připraveno</span>}
            {order.is_packaged && <span className="chip bg-primary-200 text-primary-800">📦 Fasování</span>}
            {order.is_delivered && <span className="chip bg-success-200 text-success-800">✓ Zavezenné</span>}
          </div>
          <a
            onClick={() => order.place_id && setPage && setPage('places', order.place_id)}
            className={`font-display font-extrabold text-2xl text-primary-900 mb-3 text-left hover:underline flex items-center gap-2 cursor-pointer ${!order.place_id ? 'pointer-events-none opacity-70' : ''}`}
          >
            <Building2 size={22} className="text-amber-700" />
            <span>{order.place_name ?? '—'}</span>
          </a>
          {(() => { const _ph = places.find(p => p.id === order.place_id)?.phone; return _ph ? (
            <a href={`tel:${_ph}`} className="text-sm text-blue-700 font-bold mt-1.5 flex items-center gap-1 hover:underline">
              <Phone size={14} /> <span>{_ph}</span>
            </a>
          ) : null; })()}

          {placeHistory.length > 0 && (
            <div className="mb-3 rounded-xl bg-primary-50/60 border border-primary-100 p-3">
              <div className="text-[10px] uppercase tracking-wider text-primary-500 mb-1.5">📜 Historie odběratele — poslední objednávky</div>
              <div className="space-y-1">
                {placeHistory.map((h) => {
                  const hItems = allItems[h.id] ?? [];
                  const total = hItems.reduce((s, i) => s + Number(i.quantity), 0);
                  const summary = hItems.slice(0, 3).map((i: OrderItem) => `${i.beer_name ?? '?'} ${i.quantity}ks`).join(', ');

                  return (
                    <div key={h.id} className="text-xs text-primary-600 flex items-center gap-2">
                      <span className="font-semibold text-primary-800">{h.order_date}</span>
                      <span className={`chip !py-0.5 ${STATUS[h.status]?.cls ?? ''}`}>{STATUS[h.status]?.label}</span>
                      <span className="truncate">{summary}{hItems.length > 3 ? '…' : ''} ({total} ks celkem)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">

            <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-2 rounded-lg hover:bg-primary-50">
              <input type="checkbox" checked={order.is_prepared} onChange={() => onToggleFlag(order, 'is_prepared')} className="w-4 h-4 rounded text-primary-600" /> Připraveno
            </label>
            <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-2 rounded-lg hover:bg-primary-50">
              <input type="checkbox" checked={order.is_delivered} onChange={() => onToggleFlag(order, 'is_delivered')} className="w-4 h-4 rounded text-primary-600" /> Závoz
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field label="Závoz">
              <select className={`input ${dc ? dc.chip : ''}`} value={day} onChange={(e) => setDay(e.target.value)}>
                <option value="">—</option>
                {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Datum dodání (konkrétní den)">
              <input type="date" className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
          </div>
          {deliveryDate && (
            <div className="mt-2 text-xs text-accent-700">
              🔔 Upomínka se automaticky vytvoří v kalendáři na <strong>{new Date(new Date(deliveryDate).getTime() - 3 * 86400000).toLocaleDateString('cs-CZ')}</strong> v 8:45.
            </div>
          )}
          <div className="flex justify-end mt-2">
            <button className="btn-ghost text-xs !py-1.5" disabled={savingMeta} onClick={saveMeta}>{savingMeta ? 'Ukládám…' : 'Uložit datum dodání'}</button>
          </div>
        </div>

        {items.length === 0 ? <p className="text-sm text-primary-400">Žádné položky.</p> : (
          <div className="card overflow-hidden">
            <table className="table text-xs">
              <thead><tr><th className="w-8"></th><th>Pivo</th><th>Obal</th><th className="text-right">Množství</th><th></th><th></th><th></th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const rem = i.beer_id ? (remaining.get(i.beer_id) ?? 0) : 0;
                  const missing = rem < 0 ? -rem : 0;
                  const inStock = i.beer_id ? rem >= Number(i.quantity) : false;
                  const isEditing = editingItemId === i.id;
                  return (
                    <>
                    <tr key={i.id} className={i.is_prepared ? 'bg-success-50/50' : (missing > 0 ? 'bg-danger-50/40' : '')}>
                      <td className="align-middle">
                        <input
                          type="checkbox"
                          checked={i.is_prepared}
                          onChange={() => toggleItemPrepared(i)}
                          className="w-5 h-5 rounded text-success-600 cursor-pointer"
                          title={i.is_prepared ? 'Připraveno' : 'Označit jako připravené'}
                        />
                      </td>
                      <td className="font-medium">
                        <span className="inline-block rounded-md px-2 py-0.5" style={{ backgroundColor: beerBg(beers.find((b) => b.id === i.beer_id)), color: beerText(beers.find((b) => b.id === i.beer_id)) === 'text-white' ? '#fff' : undefined }}>{i.beer_name ?? '—'}</span>
                        {missing > 0 && <span className="block text-xs text-danger-600 mt-0.5">⚠️ Chybí {missing} ks ve skladu</span>}
                        {inStock && <span className="block text-xs text-success-600 mt-0.5">✓ Skladem ({rem} ks)</span>}
                      </td>
                      <td className="text-primary-600">{i.package_label ?? '—'}</td>
                      <td className="text-right font-semibold">{i.quantity}</td>
                      <td>{missing > 0 ? <span className="chip bg-danger-50 text-danger-700">!</span> : (inStock && <span className="chip bg-success-100 text-success-700">✓</span>)}</td>
                      <td className="text-right">
                        <button
                          className="text-primary-400 hover:text-primary-700 px-1"
                          title="Upravit položku"
                          onClick={() => {
                            if (isEditing) { setEditingItemId(null); return; }
                            setEditingItemId(i.id);
                            setEditBeerId(i.beer_id ?? '');
                            setEditPkgId(i.package_id ?? '');
                            setEditQty(String(i.quantity));
                          }}
                        >✎</button>
                      </td>
                      <td className="text-right"><button className="text-danger-400 hover:text-danger-600" onClick={() => rmItem(i.id)}>×</button></td>
                    </tr>
                    {isEditing && (
                      <tr className="bg-primary-50/60">
                        <td colSpan={6} className="!py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 items-end">
                            <div className="col-span-2 sm:col-span-2 lg:col-span-5">
                              <label className="label">Pivo</label>
                              <select className="input !py-2 text-sm" value={editBeerId} onChange={(e) => setEditBeerId(e.target.value)}>
                                <option value="">— vyber pivo —</option>
                                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                              </select>
                            </div>
                            <div className="col-span-1 sm:col-span-1 lg:col-span-3">
                              <label className="label">Obal</label>
                              <select className="input !py-2 text-sm" value={editPkgId} onChange={(e) => setEditPkgId(e.target.value)}>
                                <option value="">—</option>
                                {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                              </select>
                            </div>
                            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                              <label className="label">Množství</label>
                              <input type="number" min={0} className="input !py-2 text-sm" value={editQty} onChange={(e) => setEditQty(e.target.value)} inputMode="numeric" />
                            </div>
                            <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex gap-2">
                              <button
                                className="btn-primary flex-1 !py-2 text-sm"
                                onClick={async () => {
                                  if (editBeerId && editBeerId !== i.beer_id) await updateItemBeer(i, editBeerId);
                                  if (editPkgId && editPkgId !== i.package_id) await updateItemPkg(i, editPkgId);
                                  const qtyNum = Number(editQty);
                                  if (qtyNum && qtyNum !== i.quantity) await updateItemQty(i, qtyNum);
                                  setEditingItemId(null);
                                }}
                              >✓ Uložit</button>
                              <button className="btn-ghost !py-2 !px-3" onClick={() => setEditingItemId(null)}>✕</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}


        {adding ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 items-end">
            <div className="col-span-2 sm:col-span-2 lg:col-span-5">
              <label className="label">Pivo</label>
              <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
                <option value="">— vyber pivo —</option>
                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <label className="label">Množství</label>
              <input type="number" min={0} className="input" placeholder="ks" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </div>
            <div className="col-span-1 sm:col-span-1 lg:col-span-3">
              <label className="label">Obal</label>
              <select className="input" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                <option value="">—</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex gap-2">
              <button className="btn-primary flex-1 !py-2 text-sm" onClick={addItem}>✓ Přidat</button>
              <button className="btn-ghost !py-2 !px-3" onClick={() => setAdding(false)}>✕</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn-ghost text-sm" onClick={() => setAdding(true)}>+ Přidat položku</button>
            <button className="btn-ghost text-sm" onClick={() => onImportImage(order)}>📸 Načíst z fotky</button>
          </div>
        )}

        <div className="mt-4">
          <label className="label">Poznámka <span className="text-primary-400 font-normal">(odfasování sudu, podtacky, sklo…)</span></label>
          <input type="text" className="input" placeholder="např. vratný sud, podtacky, sklo" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end mt-2">
            <button className="btn-ghost text-xs !py-1.5" disabled={savingMeta} onClick={saveMeta}>{savingMeta ? 'Ukládám…' : 'Uložit poznámku'}</button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn-ghost" onClick={onClose}>Zavřít</button>
        </div>
      </div>
    </div>
  );
}
