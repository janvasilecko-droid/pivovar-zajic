// 🔎 Detail objednávky — část obrazovky Objednávky.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Bell, Building2, Camera, Check, ClipboardList, Copy, Package as PackageIcon, Pencil, Phone, RotateCcw, Scroll, Split, X } from 'lucide-react';
import { Beer, Package, Place, beerBg, beerInk, supabase } from '../../lib/supabase';
import { Field } from '../ui';
import { weekRange, shiftWeek } from '../WeeklyOrderSummaryCard';

import { stockKey } from '../../lib/stockLedger';

import { DAYS } from '../../lib/shared';

import type {  } from '../../lib/tankUZapisu';

import { chyba, oznam, uspech } from '../../lib/toast';
import { srovnaniPoUprave, type UpravaPolozky } from '../../lib/zavozSync';
import { parseDeliveryTimeHint } from '../../lib/orderParser';
import { createReminder, getLocalReminders } from '../../lib/reminders';
import { businessDateISO } from '../../lib/businessDate';
import { platneVraceni, poznamkaVraceni, pripojPoznamku, zaznamyDorovnaniVraceni } from '../../lib/vraceniZObjednavky';

import { PodpisModal } from '../PodpisModal';
import { FotkyZaznamu } from '../FotkyZaznamu';

import { objednavkaJakoText } from '../../lib/objednavkaJakoText';
import { hodnotaObjednavky, type CenaPolozky } from '../../lib/hodnotaObjednavky';
import { zapisZmenuPolozky, nactiHistoriiObjednavky, popisZmenyPolozky, type ZmenaPolozky } from '../../lib/objednavkaAudit';
import { StitekStavu } from '../StitekStavu';

import { type Order, type OrderItem, dayColor } from './spolecne';
import { WhatsAppOriginalBlock } from './WhatsAppOriginalBlock';
export function OrderDetail({ order, items, beers, packages, places, priceList, remaining, onClose, onChanged, onSplit, onToggleFlag, onImportImage, setItems, setOrders, allOrders, allItems, setPage, weekKey, setWeekKey }: {
  order: Order; items: OrderItem[]; beers: Beer[]; packages: Package[]; places: Place[]; priceList: CenaPolozky[]; remaining: Map<string, number>; onClose: () => void; onChanged: () => void;
  /** Rozdělit na dva odběratele (viz SplitOrderModal) — jen když má 2+ položky. */
  onSplit: (o: Order) => void;
  onToggleFlag: (o: Order, key: 'is_prepared' | 'is_packaged' | 'is_delivered') => void; onImportImage: (o: Order) => void;
  setItems: React.Dispatch<React.SetStateAction<Record<string, OrderItem[]>>>;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  setPage?: (p: any, sec?: string) => void;
  allOrders: Order[];
  allItems: Record<string, OrderItem[]>;
  weekKey: string;
  setWeekKey: (wk: string) => void;
}) {
  // 💰 Hodnota objednávky podle ceníku — appka měla ceník hotový (Depozitář
  // → Ceník), ale nikde ho k objednávkám nepřipojila. Cena se bere platná
  // K DATU objednávky, ne dnešní (lib/hodnotaObjednavky.ts).
  const hodnota = useMemo(
    () => hodnotaObjednavky(items, priceList, order.order_date),
    [items, priceList, order.order_date]
  );

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

  // ✍️ Podpis převzetí. Ukládá se tam, kam ho ukládá i Závoz — do
  // `orders.signature_url` a `signature_name`. Dvě různá místa na jeden
  // podpis by znamenala, že se v Závozu podepíše a v Objednávkách žádný
  // podpis není (a naopak).
  const [podpisOtevren, setPodpisOtevren] = useState(false);

  // 📜 Historie změn — kdo a kdy přidal/upravil/smazal řádek. Načítá se, až
  // se rozbalí (ne při každém otevření objednávky — v naprosté většině
  // případů se na to nikdo nedívá).
  const [historieOtevrena, setHistorieOtevrena] = useState(false);
  const [historie, setHistorie] = useState<ZmenaPolozky[] | null>(null);
  useEffect(() => {
    if (!historieOtevrena || historie !== null) return;
    let zruseno = false;
    void nactiHistoriiObjednavky(order.id).then((h) => { if (!zruseno) setHistorie(h); });
    return () => { zruseno = true; };
  }, [historieOtevrena, historie, order.id]);

  async function ulozPodpis(p: { png: string; prevzal: string; sirka: number; vyska: number }) {
    const { error } = await supabase.from('orders').update({
      signature_url: p.png,
      signature_name: p.prevzal || null,
      // Podepsané převzetí znamená zavezeno — jinak by se to muselo
      // odklepnout ještě jednou a na to se zapomene.
      is_delivered: true,
      delivered_at: new Date().toISOString(),
    }).eq('id', order.id);
    if (error) { chyba(`Podpis se nepodařilo uložit: ${error.message}`); return; }
    oznam('Podpis převzetí uložen.');
    onChanged();
  }

  const [adding, setAdding] = useState(false);
  const [beerId, setBeerId] = useState('');
  const [pkgId, setPkgId] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState(order.note ?? '');
  const [day, setDay] = useState(order.delivery_day ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  // Znění originální WhatsApp zprávy (viz WhatsAppOriginalBlock níž) — kvůli
  // odhadu času dovozu ("přijedou kolem poledne") i tehdy, když ho stáčeč
  // ještě neuložil do poznámky ručně.
  const [waText, setWaText] = useState('');
  const [vytvarimUpozorneni, setVytvarimUpozorneni] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editBeerId, setEditBeerId] = useState('');
  const [editPkgId, setEditPkgId] = useState('');
  // 🔄 Vrácení — sudy/lahve z TÉTO objednávky, co se přivezly zpátky
  // (nedopité, nepoužité). Přičte se do skladu DNEŠNÍM datem (ne datem
  // původního závozu — ten může ležet v už uzavřeném týdnu) a na objednávku
  // se jen připíše poznámka, viz lib/vraceniZObjednavky.ts.
  const [otevrenoVraceni, setOtevrenoVraceni] = useState(false);
  const [vraceniPocty, setVraceniPocty] = useState<Record<string, string>>({});
  const [ukladamVraceni, setUkladamVraceni] = useState(false);
  const [editQty, setEditQty] = useState('');

  async function addItem() {

    if (!beerId || !pkgId || !Number(qty)) return;
    const b = beers.find((x) => x.id === beerId);
    const p = packages.find((x) => x.id === pkgId);
    const novy = {
      order_id: order.id, beer_id: beerId, beer_name: b?.name ?? null,
      package_id: pkgId, package_label: p?.label ?? null, quantity: Number(qty),
    };
    await supabase.from('order_items').insert(novy);
    void zapisZmenuPolozky(order.id, 'insert', null, novy);
    setBeerId(''); setPkgId(''); setQty(''); setAdding(false); onChanged();
  }
  async function rmItem(id: string) {
    // Už zavezenou položku databáze smazat nedá (cizí klíč na zavoz_deductions
    // je RESTRICT) — bez téhle hlášky chyba propadla, seznam se přenačetl a
    // řádek se beze slova vrátil.
    const mazany = items.find((x) => x.id === id);
    const { error } = await supabase.from('order_items').delete().eq('id', id);
    if (error) {
      chyba('Položku nejde smazat — je už zavezená a odepsaná ze skladu. Oprav množství, nebo zruš celou objednávku.');
      return;
    }
    void zapisZmenuPolozky(order.id, 'delete', mazany ?? null, null);
    onChanged();
  }

  /**
   * Objednávka je pravda — skladový odpočet se musí srovnat podle ní.
   *
   * Rychlé úpravy tady jdou obyčejným UPDATE na order_items a míjejí RPC
   * replace_order_with_items, které odpočet srovnává. Bez tohohle volání
   * zůstal sklad odepsaný podle původního zadání a rozdíl vyplaval až
   * v inventuře jako manko bez původu ve výrobě (viz lib/zavozSync.ts).
   */
  async function srovnejOdpocet(it: OrderItem, zmena: UpravaPolozky) {
    const parametry = srovnaniPoUprave(
      { id: it.id, beer_id: it.beer_id ?? null, package_id: it.package_id ?? null, quantity: Number(it.quantity) },
      zmena,
    );
    if (!parametry) return;
    const { error } = await supabase.rpc('reconcile_zavoz_deduction_for_item', parametry);
    if (error) chyba('Změna se uložila, ale skladový odpočet se nepodařilo srovnat: ' + error.message);
  }

  async function updateItemQty(it: OrderItem, newQty: number) {
    if (!Number.isFinite(newQty) || newQty <= 0) return;
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, quantity: newQty } : x),
    }));
    await supabase.from('order_items').update({ quantity: newQty }).eq('id', it.id);
    void zapisZmenuPolozky(order.id, 'update', { ...it }, { ...it, quantity: newQty });
    await srovnejOdpocet(it, { quantity: newQty });
  }
  async function updateItemBeer(it: OrderItem, newBeerId: string) {
    const b = beers.find((x) => x.id === newBeerId);
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, beer_id: newBeerId, beer_name: b?.name ?? null } : x),
    }));
    await supabase.from('order_items').update({ beer_id: newBeerId, beer_name: b?.name ?? null }).eq('id', it.id);
    void zapisZmenuPolozky(order.id, 'update', { ...it }, { ...it, beer_id: newBeerId, beer_name: b?.name ?? null });
    await srovnejOdpocet(it, { beer_id: newBeerId });
  }
  async function updateItemPkg(it: OrderItem, newPkgId: string) {
    const p = packages.find((x) => x.id === newPkgId);
    setItems((map) => ({
      ...map,
      [order.id]: (map[order.id] ?? []).map((x) => x.id === it.id ? { ...x, package_id: newPkgId, package_label: p?.label ?? null } : x),
    }));
    await supabase.from('order_items').update({ package_id: newPkgId, package_label: p?.label ?? null }).eq('id', it.id);
    void zapisZmenuPolozky(order.id, 'update', { ...it }, { ...it, package_id: newPkgId, package_label: p?.label ?? null });
    await srovnejOdpocet(it, { package_id: newPkgId });
  }

  async function saveMeta() {
    setSavingMeta(true);
    await supabase.from('orders').update({ note: note || null, delivery_day: day || null, delivery_date: deliveryDate || null }).eq('id', order.id);
    setSavingMeta(false); onChanged();
  }

  async function ulozVraceni() {
    const polozky = platneVraceni(items.map((it) => ({
      beer_id: it.beer_id ?? '',
      beer_name: it.beer_name,
      package_id: it.package_id ?? '',
      package_label: it.package_label,
      pocet: Number(vraceniPocty[it.id] || 0),
    })));
    if (polozky.length === 0) { oznam('Zadejte, kolik se čeho vrátilo.'); return; }
    setUkladamVraceni(true);
    try {
      const datum = businessDateISO();
      const { error } = await supabase.from('inventory_adjustments').insert(zaznamyDorovnaniVraceni(polozky, datum));
      if (error) throw new Error(error.message);
      const novaPoznamka = pripojPoznamku(note, poznamkaVraceni(polozky, datum));
      const { error: e2 } = await supabase.from('orders').update({ note: novaPoznamka }).eq('id', order.id);
      if (e2) throw new Error(e2.message);
      setNote(novaPoznamka);
      setVraceniPocty({});
      setOtevrenoVraceni(false);
      uspech('Vrácení zapsáno a přičteno do skladu.');
      onChanged();
    } catch (e: any) {
      chyba('Vrácení se nepovedlo: ' + (e?.message || e));
    } finally {
      setUkladamVraceni(false);
    }
  }

  // 🕐 Čas dovozu zmíněný v poznámce nebo v originální WhatsApp zprávě
  // ("přijedou kolem poledne", "v 15" apod., viz orderParser.ts) — jen
  // podklad pro tlačítko "Upozornit hodinu předem" níž, nic víc s ním appka
  // sama neudělá.
  const [vytvorenoTick, setVytvorenoTick] = useState(0);
  const casDovozu = useMemo(() => parseDeliveryTimeHint(`${note} ${waText}`), [note, waText]);
  const denDovozu = deliveryDate || order.order_date;
  const dvoumistne = (n: number) => String(n).padStart(2, '0');
  const znackaUpozorneni = casDovozu && denDovozu
    ? `[dovoz-upozorneni:${order.id}:${denDovozu}:${dvoumistne(casDovozu.hodina)}${dvoumistne(casDovozu.minuta)}]`
    : null;
  const upozorneniJizVytvoreno = useMemo(() => {
    if (!znackaUpozorneni) return false;
    return getLocalReminders().some((r) => (r.note || '').includes(znackaUpozorneni));
    // vytvorenoTick nic nečte — jen si vynutí přepočet po createReminder(),
    // protože getLocalReminders() čte localStorage mimo Reactí stav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [znackaUpozorneni, vytvorenoTick]);

  async function vytvoritUpozorneniHodinuPredem() {
    if (!casDovozu || !denDovozu || !znackaUpozorneni) return;
    setVytvarimUpozorneni(true);
    try {
      const cilovyCas = new Date(`${denDovozu}T${dvoumistne(casDovozu.hodina)}:${dvoumistne(casDovozu.minuta)}:00`);
      cilovyCas.setHours(cilovyCas.getHours() - 1);
      const placeName = (order.place_name && order.place_name.trim())
        || (order.place_id && places.find((p) => p.id === order.place_id)?.name)
        || 'odběratel';
      await createReminder({
        title: `Za hodinu dovoz: ${placeName} (~${dvoumistne(casDovozu.hodina)}:${dvoumistne(casDovozu.minuta)})`,
        note: `${znackaUpozorneni} Objednávka zmiňuje čas dovozu — appka spočítala hodinu předem.`,
        date_time: cilovyCas.toISOString().slice(0, 16),
        target_role: 'all',
        display_mode: 'both',
        created_by: 'Ruční upozornění (Objednávky)',
      });
      oznam('Upozornění hodinu předem je nastavené.');
      setVytvorenoTick((t) => t + 1);
    } catch (e) {
      chyba(`Upozornění se nepodařilo nastavit: ${(e as Error).message ?? 'neznámá chyba'}`);
    } finally {
      setVytvarimUpozorneni(false);
    }
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
    <div className={`-m-4 sm:-m-8 min-h-[calc(100vh-0px)] ${dc?.bg ?? 'bg-neutral-100'}`}>
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-4 group -ml-2"
        >
          <span className="w-9 h-9 grid place-items-center rounded-full bg-white shadow-sm border border-primary-100 group-hover:bg-primary-50 group-active:scale-95 transition">←</span>
          Zpět na objednávky
        </button>

        {/* ⬅️➡️ Navigace týdny — Detail objednávky */}
        <div className="flex items-center justify-between gap-3 mb-4 bg-white rounded-2xl border border-neutral-200 p-2 shadow-2xs">
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            className="btn-ghost !rounded !py-1.5 !px-3 text-xs font-black flex items-center gap-1 hover:bg-amber-100 transition"
            title="Předchozí týden" aria-label="Předchozí týden"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center flex items-center gap-2">
            <span className="text-xs font-bold text-amber-700">Týden</span>
            <span className="font-display font-black text-base text-amber-800">{weekKey.split('-')[1]}</span>
            <span className="text-xs text-neutral-500">({weekRange(weekKey).label})</span>
          </div>
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            className="btn-ghost !rounded !py-1.5 !px-3 text-xs font-black flex items-center gap-1 hover:bg-amber-100 transition"
            title="Další týden" aria-label="Další týden"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={`card p-5 mb-4 border-2 ${dc ? dc.border : 'border-primary-100'}`}>
          <div className="flex items-center gap-2 text-sm text-primary-500 flex-wrap mb-2">
            <span>{order.order_date}</span>
            <span>·</span>
            <StitekStavu status={order.status} />
            {order.is_prepared && <span className="chip bg-emerald-100 text-emerald-700"><Check className="ikona-text" /> Připraveno</span>}
            {order.is_packaged && <span className="chip bg-primary-200 text-primary-800"><PackageIcon className="ikona-text" /> Fasování</span>}
            {order.is_delivered && <span className="chip bg-emerald-200 text-emerald-800"><Check className="ikona-text" /> Zavezenné</span>}
            {hodnota.celkem > 0 && (
              <span className="ml-auto font-display font-black text-primary-900">
                {hodnota.celkem.toLocaleString('cs-CZ')} {hodnota.mena ?? 'Kč'}
                {hodnota.chybiCenaUPolozek > 0 && (
                  <span className="ml-1 text-udaj font-bold text-amber-700" title={`${hodnota.chybiCenaUPolozek} položek nemá v ceníku platnou cenu — do součtu se nepočítají`}>
                    (neúplné)
                  </span>
                )}
              </span>
            )}
          </div>
          <a
            onClick={() => order.place_id && setPage && setPage('places', order.place_id)}
            className={`font-display font-extrabold text-2xl text-primary-800 mb-3 text-left hover:underline flex items-center gap-2 cursor-pointer ${!order.place_id ? 'pointer-events-none opacity-70' : ''}`}
          >
            <Building2 size={22} className="text-amber-700" />
            <span>
              {(order.place_name && order.place_name.trim())
                || (order.place_id && places.find((p) => p.id === order.place_id)?.name)
                || '—'}
            </span>
          </a>
          {(() => { const _ph = places.find(p => p.id === order.place_id)?.phone; return _ph ? (
            <a href={`tel:${_ph}`} className="text-sm text-sky-700 font-bold mt-1.5 flex items-center gap-1 hover:underline">
              <Phone size={14} /> <span>{_ph}</span>
            </a>
          ) : null; })()}

          {placeHistory.length > 0 && (
            <div className="mb-3 rounded-xl bg-primary-50/60 border border-primary-100 p-3">
              <div className="text-udaj uppercase tracking-wider text-primary-500 mb-1.5"><Scroll className="ikona-text" /> Historie odběratele — poslední objednávky</div>
              <div className="space-y-1">
                {placeHistory.map((h) => {
                  const hItems = allItems[h.id] ?? [];
                  const total = hItems.reduce((s, i) => s + Number(i.quantity), 0);
                  const summary = hItems.slice(0, 3).map((i: OrderItem) => `${i.beer_name ?? '?'} ${i.quantity}ks`).join(', ');

                  return (
                    <div key={h.id} className="text-xs text-primary-600 flex items-center gap-2">
                      <span className="font-semibold text-primary-800">{h.order_date}</span>
                      <StitekStavu status={h.status} tridy="!py-0.5" />
                      <span className="truncate">{summary}{hItems.length > 3 ? '…' : ''} ({total} ks celkem)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">

            <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-2 rounded hover:bg-primary-50">
              <input type="checkbox" checked={order.is_prepared} onChange={() => onToggleFlag(order, 'is_prepared')} className="w-4 h-4 rounded text-primary-600" /> Připraveno
            </label>
            <label className="flex items-center gap-2 text-sm text-primary-700 cursor-pointer px-3 py-2 rounded hover:bg-primary-50">
              <input type="checkbox" checked={order.is_delivered} onChange={() => onToggleFlag(order, 'is_delivered')} className="w-4 h-4 rounded text-primary-600" /> Závoz
            </label>

            {/* Kopírovat jako text — pro poslání zákazníkovi přes SMS/e-mail,
                kam appka (na rozdíl od WhatsAppu při zadávání) nemá přímý
                odkaz. Bez toho se text opisoval ručně z obrazovky. */}
            <button
              type="button"
              onClick={async () => {
                const text = objednavkaJakoText(order, items);
                try {
                  await navigator.clipboard.writeText(text);
                  oznam('Objednávka zkopírována do schránky.');
                } catch {
                  chyba('Kopírování se nepodařilo — prohlížeč ho asi zakázal.');
                }
              }}
              className="flex items-center gap-2 text-sm text-primary-700 px-3 py-2 rounded hover:bg-primary-50 tap"
            >
              <Copy size={16} /> Kopírovat jako text
            </button>

            {/* ✂️ Rozdělit na dva odběratele — z provozu 15. 9. 2026: „i ve
                správě, jedna objednávka může mít víc drobných odběratelů
                (řada, Eigl, restaurace)". Původní WhatsApp zpráva je vidět
                hned nahoře (WhatsAppOriginalBlock), takže se dá rozdělit
                přesně podle ní. */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onSplit(order)}
                className="flex items-center gap-2 text-sm text-primary-700 px-3 py-2 rounded hover:bg-primary-50 tap"
              >
                <Split size={16} /> Rozdělit na dva odběratele
              </button>
            )}

            {/* ✍️ Podpis převzetí. V Závozu se podepisovalo už dřív, tady
                ne — a přitom právě tady se objednávka řeší, když se pak
                někdo ptá, co bylo dovezeno. */}
            <button
              type="button"
              onClick={() => setPodpisOtevren(true)}
              className="px-3 py-2 rounded font-black text-xs transition bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-100"
            >
              <span className="inline-flex items-center gap-1.5">
                <Pencil size={14} /> {order.signature_url ? 'Podepsat znovu' : 'Podpis převzetí'}
              </span>
            </button>
          </div>

          {order.signature_url && (
            <div className="mt-3 rounded-xl border border-neutral-300 bg-white p-3 inline-block">
              <div className="text-udaj uppercase tracking-wider text-neutral-500 mb-1">
                Převzato{order.delivered_at ? ` ${new Date(order.delivered_at).toLocaleString('cs-CZ')}` : ''}
                {order.signature_name ? ` · ${order.signature_name}` : ''}
              </div>
              <img src={order.signature_url} alt="Podpis převzetí" loading="lazy" decoding="async" className="max-h-24" />
            </div>
          )}

          {/* 📷 Fotky k objednávce — poškozené zboží, stav při předání.
              Bez fotky je jediným dokladem věta v poznámce. */}
          <div className="mt-3">
            <FotkyZaznamu typ="objednavka" zaznamId={order.id} />
          </div>

          <PodpisModal
            open={podpisOtevren}
            onClose={() => setPodpisOtevren(false)}
            nazev={(order.place_name ?? '').trim() || 'Objednávka'}
            predvolenyPodpis={(order.place_name ?? '').trim()}
            onUlozit={ulozPodpis}
          />

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
            <div className="mt-2 text-xs text-primary-700">
              <Bell className="ikona-text" /> Upomínka se automaticky vytvoří v kalendáři na <strong>{new Date(new Date(deliveryDate).getTime() - 3 * 86400000).toLocaleDateString('cs-CZ')}</strong> v 8:45.
            </div>
          )}
          {/* 🕐 Čas dovozu z poznámky/zprávy ("přijedou kolem poledne" apod.)
              — nabídni tlačítko na upozornění hodinu předem, ať to stáčeč
              nemusí hlídat sám. Zmizí, jakmile je upozornění nastavené. */}
          {casDovozu && denDovozu && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-neutral-600">
                Čas dovozu v textu: <strong>{dvoumistne(casDovozu.hodina)}:{dvoumistne(casDovozu.minuta)}</strong>
              </span>
              {upozorneniJizVytvoreno ? (
                <span className="chip bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                  <Check size={12} /> Upozornění hodinu předem nastaveno
                </span>
              ) : (
                <button
                  type="button"
                  disabled={vytvarimUpozorneni}
                  onClick={vytvoritUpozorneniHodinuPredem}
                  className="btn-ghost !rounded text-xs !py-1.5 border border-amber-300 text-amber-800 disabled:opacity-50 flex items-center gap-1"
                >
                  <Bell size={12} /> {vytvarimUpozorneni ? 'Nastavuji…' : `Upozornit hodinu předem (v ${dvoumistne(casDovozu.hodina === 0 ? 23 : casDovozu.hodina - 1)}:${dvoumistne(casDovozu.minuta)})`}
                </button>
              )}
            </div>
          )}
          <div className="flex justify-end mt-2">
            <button className="btn-ghost !rounded text-xs !py-1.5" disabled={savingMeta} onClick={saveMeta}>{savingMeta ? 'Ukládám…' : 'Uložit datum dodání'}</button>
          </div>
        </div>

        {order.whatsapp_message_id && (
          <WhatsAppOriginalBlock
            messageId={order.whatsapp_message_id}
            orderId={order.place_id ? null : order.id}
            beers={beers}
            packages={packages}
            places={places}
            onPlaceFound={onChanged}
            onMessageLoaded={(m) => setWaText(m.message_text || m.parsed_raw_text || '')}
          />
        )}

        {items.length === 0 ? <p className="text-sm text-primary-400">Žádné položky.</p> : (
          <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2 md:hidden">
            {items.map((i) => {
              // ⚠️ Klíč je PIVO+OBAL (stockKey), ne jen pivo — bez toho se tu
              // hledal `beer_id` v mapě klíčované `beer_id__package_id` a
              // nikdy se netrefil: "Chybí"/"Skladem" tu nesvítilo nikdy.
              const rem = (i.beer_id && i.package_id) ? (remaining.get(stockKey(i.beer_id, i.package_id)) ?? 0) : 0;
              const missing = rem < 0 ? -rem : 0;
              const inStock = i.beer_id ? rem >= Number(i.quantity) : false;
              const isEditing = editingItemId === i.id;
              const beer = beers.find((b) => b.id === i.beer_id);
              return (
                <div key={i.id} className={`rounded-2xl border p-3 space-y-2 ${i.is_prepared ? 'bg-emerald-50/50 border-emerald-200' : missing > 0 ? 'bg-rose-50/40 border-rose-200' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={i.is_prepared}
                        onChange={() => toggleItemPrepared(i)}
                        className="w-5 h-5 rounded text-emerald-600 cursor-pointer shrink-0"
                        title={i.is_prepared ? 'Připraveno' : 'Označit jako připravené'}
                      />
                      {/* ⚠️ Barva písma se MUSÍ nastavit v OBOU případech.
                          Dřív tu u světlého piva stálo `undefined`, tedy
                          „poděď barvu odjinud" — a v tmavém režimu se dědí
                          světlá, takže na světle žluté „11° Světlé" svítilo
                          bílé písmo na bílo. `beerInk` vrací tmavou i světlou
                          podle JASU barvy piva, takže není co dědit. */}
                      <span className="inline-block rounded-md px-2 py-0.5 font-bold text-sm truncate" style={{ backgroundColor: beerBg(beer), color: beerInk(beer) }}>{i.beer_name ?? '—'}</span>
                    </label>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="text-primary-400 hover:text-primary-700 min-w-[44px] min-h-[44px] flex items-center justify-center text-lg rounded hover:bg-primary-50"
                        title="Upravit položku"
                        onClick={() => {
                          if (isEditing) { setEditingItemId(null); return; }
                          setEditingItemId(i.id);
                          setEditBeerId(i.beer_id ?? '');
                          setEditPkgId(i.package_id ?? '');
                          setEditQty(String(i.quantity));
                        }}
                      ><Pencil size={14} /></button>
                      <button className="text-rose-400 hover:text-rose-600 min-w-[44px] min-h-[44px] flex items-center justify-center text-xl rounded hover:bg-rose-50" onClick={() => rmItem(i.id)}>×</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-primary-600 font-bold">{i.package_label ?? '—'}</span>
                    <span className="font-black text-base text-neutral-900">{i.quantity} ks</span>
                  </div>
                  {missing > 0 && <span className="block text-xs text-rose-600 font-bold"><AlertTriangle className="ikona-text" /> Chybí {missing} ks ve skladu</span>}
                  {inStock && <span className="block text-xs text-emerald-600 font-bold"><Check className="ikona-text" /> Skladem ({rem} ks)</span>}
                  {isEditing && (
                    <div className="pt-2 border-t border-neutral-200 grid grid-cols-2 gap-2 items-end">
                      <div className="col-span-2">
                        <label className="label">Pivo</label>
                        <select className="input !py-2 text-sm" value={editBeerId} onChange={(e) => setEditBeerId(e.target.value)}>
                          <option value="">— vyber pivo —</option>
                          {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Obal</label>
                        <select className="input !py-2 text-sm" value={editPkgId} onChange={(e) => setEditPkgId(e.target.value)}>
                          <option value="">—</option>
                          {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Množství</label>
                        <input type="number" onWheel={(e) => e.currentTarget.blur()} min={0} className="input !py-2 text-sm" value={editQty} onChange={(e) => setEditQty(e.target.value)} inputMode="numeric" />
                      </div>
                      <div className="col-span-2 flex gap-2">
                        <button
                          className="btn-primary !rounded flex-1 !py-2 text-sm"
                          onClick={async () => {
                            if (editBeerId && editBeerId !== i.beer_id) await updateItemBeer(i, editBeerId);
                            if (editPkgId && editPkgId !== i.package_id) await updateItemPkg(i, editPkgId);
                            const qtyNum = Number(editQty);
                            if (qtyNum && qtyNum !== i.quantity) await updateItemQty(i, qtyNum);
                            setEditingItemId(null);
                          }}
                        ><Check size={14} /> Uložit</button>
                        <button className="btn-ghost !rounded !py-2 !px-3" onClick={() => setEditingItemId(null)} title="Zrušit" aria-label="Zrušit"><X size={14} /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop tabulka */}
          <div className="hidden md:block card overflow-hidden">
            <table className="table text-xs">
              <thead><tr><th scope="col" className="w-8"></th><th scope="col">Pivo</th><th scope="col">Obal</th><th scope="col" className="text-right">Množství</th><th scope="col"></th><th scope="col"></th><th scope="col"></th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const rem = (i.beer_id && i.package_id) ? (remaining.get(stockKey(i.beer_id, i.package_id)) ?? 0) : 0;
                  const missing = rem < 0 ? -rem : 0;
                  const inStock = i.beer_id ? rem >= Number(i.quantity) : false;
                  const isEditing = editingItemId === i.id;
                  const beer = beers.find((b) => b.id === i.beer_id);
                  return (
                    <>
                    <tr key={i.id} className={i.is_prepared ? 'bg-emerald-50/50' : (missing > 0 ? 'bg-rose-50/40' : '')}>
                      <td className="align-middle">
                        <input
                          type="checkbox"
                          checked={i.is_prepared}
                          onChange={() => toggleItemPrepared(i)}
                          className="w-5 h-5 rounded text-emerald-600 cursor-pointer"
                          title={i.is_prepared ? 'Připraveno' : 'Označit jako připravené'}
                        />
                      </td>
                      <td className="font-medium">
                        <span className="inline-block rounded-md px-2 py-0.5" style={{ backgroundColor: beerBg(beer), color: beerInk(beer) }}>{i.beer_name ?? '—'}</span>
                        {missing > 0 && <span className="block text-xs text-rose-600 mt-0.5"><AlertTriangle className="ikona-text" /> Chybí {missing} ks ve skladu</span>}
                        {inStock && <span className="block text-xs text-emerald-600 mt-0.5"><Check className="ikona-text" /> Skladem ({rem} ks)</span>}
                      </td>
                      <td className="text-primary-600">{i.package_label ?? '—'}</td>
                      <td className="text-right font-semibold">{i.quantity}</td>
                      <td>{missing > 0 ? <span className="chip bg-rose-50 text-rose-700">!</span> : (inStock && <span className="chip bg-emerald-100 text-emerald-700"><Check size={12} /></span>)}</td>
                      <td className="text-right">
                        <button
                          className="text-primary-400 hover:text-primary-700 px-1"
                          title="Upravit položku" aria-label="Upravit položku"
                          onClick={() => {
                            if (isEditing) { setEditingItemId(null); return; }
                            setEditingItemId(i.id);
                            setEditBeerId(i.beer_id ?? '');
                            setEditPkgId(i.package_id ?? '');
                            setEditQty(String(i.quantity));
                          }}
                        ><Pencil size={14} /></button>
                      </td>
                      <td className="text-right"><button className="text-rose-400 hover:text-rose-600" onClick={() => rmItem(i.id)}>×</button></td>
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
                              <input type="number" onWheel={(e) => e.currentTarget.blur()} min={0} className="input !py-2 text-sm" value={editQty} onChange={(e) => setEditQty(e.target.value)} inputMode="numeric" />
                            </div>
                            <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex gap-2">
                              <button
                                className="btn-primary !rounded flex-1 !py-2 text-sm"
                                onClick={async () => {
                                  if (editBeerId && editBeerId !== i.beer_id) await updateItemBeer(i, editBeerId);
                                  if (editPkgId && editPkgId !== i.package_id) await updateItemPkg(i, editPkgId);
                                  const qtyNum = Number(editQty);
                                  if (qtyNum && qtyNum !== i.quantity) await updateItemQty(i, qtyNum);
                                  setEditingItemId(null);
                                }}
                              ><Check size={14} /> Uložit</button>
                              <button className="btn-ghost !rounded !py-2 !px-3" onClick={() => setEditingItemId(null)} title="Zrušit" aria-label="Zrušit"><X size={14} /></button>
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
          </>
        )}

        {/* 📜 Historie změn — kdo a kdy přidal/upravil/smazal řádek. Bez ní
            se hledání duplicity nebo omylu v objednávce protahovalo, protože
            appka vůbec nezaznamenávala, KDO řádek přidal (audit_log tabulka
            existovala, ale nikdo do ní nezapisoval). */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setHistorieOtevrena((v) => !v)}
            aria-expanded={historieOtevrena}
            className="text-xs font-bold text-primary-600 flex items-center gap-1.5 min-h-[44px] tap"
          >
            <ClipboardList size={14} /> Historie změn {historieOtevrena ? '▲' : '▼'}
          </button>
          {historieOtevrena && (
            historie === null ? (
              <p className="text-xs text-neutral-400 mt-1">Načítám…</p>
            ) : historie.length === 0 ? (
              <p className="text-xs text-neutral-400 mt-1">Zatím žádná zaznamenaná změna položek.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {historie.map((h) => (
                  <li key={h.id} className="text-xs text-neutral-600 border-l-2 border-neutral-200 pl-2">
                    <span className="font-bold text-neutral-800">{popisZmenyPolozky(h)}</span>
                    <span className="text-neutral-400"> — {h.changed_by ?? 'neznámý uživatel'}, {new Date(h.changed_at).toLocaleString('cs-CZ')}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

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
              <input type="number" onWheel={(e) => e.currentTarget.blur()} min={0} className="input" placeholder="ks" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </div>
            <div className="col-span-1 sm:col-span-1 lg:col-span-3">
              <label className="label">Obal</label>
              <select className="input" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                <option value="">—</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex gap-2">
              <button className="btn-primary !rounded flex-1 !py-2 text-sm" onClick={addItem}><Check size={14} /> Přidat</button>
              <button className="btn-ghost !rounded !py-2 !px-3" onClick={() => setAdding(false)} title="Zrušit" aria-label="Zrušit"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="btn-ghost !rounded text-sm" onClick={() => setAdding(true)}>+ Přidat položku</button>
            <button className="btn-ghost !rounded text-sm" onClick={() => onImportImage(order)}><Camera className="ikona-text" /> Načíst z fotky</button>
          </div>
        )}

        {/* 🔄 Vrácení — jen u zavezené objednávky, jinak se nemá co vracet.
            Nemění řádky téhle objednávky (ty zůstávají svědectvím o tom, co
            se doopravdy odvezlo) — jen přičte kusy do skladu DNEŠNÍM dnem a
            připíše poznámku, viz lib/vraceniZObjednavky.ts. */}
        {order.is_delivered && items.length > 0 && (
          <div className="mt-4 pt-3 border-t border-primary-200/60">
            {!otevrenoVraceni ? (
              <button className="btn-ghost !rounded text-sm" onClick={() => setOtevrenoVraceni(true)}>
                <RotateCcw className="ikona-text" /> Vrácení sudů/lahví
              </button>
            ) : (
              <div className="space-y-2">
                <label className="label">Vrácení sudů/lahví <span className="text-primary-400 font-normal">(co se přivezlo zpátky nepoužité)</span></label>
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-primary-700 truncate">{it.beer_name} — {it.package_label} <span className="text-primary-400">(zavezeno {it.quantity} ks)</span></span>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()} min={0} inputMode="numeric"
                        className="input !w-20 !py-1 text-center shrink-0" placeholder="0"
                        value={vraceniPocty[it.id] ?? ''}
                        onChange={(e) => setVraceniPocty((m) => ({ ...m, [it.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button className="btn-ghost !rounded text-xs !py-1.5" onClick={() => { setOtevrenoVraceni(false); setVraceniPocty({}); }}>Zrušit</button>
                  <button className="btn-primary !rounded text-xs !py-1.5" disabled={ukladamVraceni} onClick={ulozVraceni}>
                    {ukladamVraceni ? 'Ukládám…' : 'Uložit vrácení'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="label">Poznámka <span className="text-primary-400 font-normal">(odfasování sudu, podtacky, sklo…)</span></label>
          <input type="text" className="input" placeholder="např. vratný sud, podtacky, sklo" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end mt-2">
            <button className="btn-ghost !rounded text-xs !py-1.5" disabled={savingMeta} onClick={saveMeta}>{savingMeta ? 'Ukládám…' : 'Uložit poznámku'}</button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zavřít</button>
        </div>
      </div>
    </div>
  );
}

/** 📄 Sbalitelný blok se zněním původní WhatsApp zprávy objednávky. */
