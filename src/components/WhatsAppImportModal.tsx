import { useState, useEffect, useMemo } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import {
  ParserAliasMap, loadPlaceAliasMap, savePlaceAlias, loadAliasMap, emptyAliasMap,
  parseGeminiItems, saveAlias, matchPlaceFromText, detectOrderNotes, type GeminiItem,
} from '../lib/orderParser';

import { parseWhatsAppExport, type WhatsAppMessage } from '../lib/whatsappParser';


import { Modal, Field, Spinner } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { DAYS } from '../lib/shared';
import { MessageSquare, Clipboard, Check, Plus, Trash2, Calendar, AlertCircle, AlertTriangle, Layers, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';


interface WhatsAppImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  aliasMap?: ParserAliasMap;
  onSave: (orders: {
    placeId: string | null;
    placeNameFree: string;
    orderDate: string;
    deliveryDay: string;
    deliveryDate: string;
    note: string;
    items: { beerId: string; pkgId: string; qty: number }[];
  }[]) => Promise<void>;

}

interface ItemRow {
  id: string;
  beerId: string;
  pkgId: string;
  qty: string;
  rawText?: string;
}

interface OrderDraft {
  id: string;
  placeId: string | null;
  placeNameFree: string;
  orderDate: string;
  deliveryDay: string;
  deliveryDate: string;
  note: string;
  items: ItemRow[];
  rawMessage: string;
  collapsed: boolean;
}


function makeOrderId(): string {
  return `wa-order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function WhatsAppImportModal({
  isOpen,
  onClose,
  beers,
  packages,
  places,
  aliasMap,
  onSave,
}: WhatsAppImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [orders, setOrders] = useState<OrderDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeAliasMap, setPlaceAliasMap] = useState<Map<string, string>>(new Map());
  const [aliasMapState, setAliasMapState] = useState<ParserAliasMap>(emptyAliasMap());

  // Load learned place aliases + beer/package aliases on mount
  useEffect(() => {
    loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {});
    loadAliasMap().then(setAliasMapState).catch(() => {});
  }, []);

  // Re-parse automatically whenever text changes (debounced)
  useEffect(() => {
    if (!rawText.trim()) {
      setOrders([]);
      return;
    }
    const t = setTimeout(() => {
      runAiParse(rawText);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText]);

  // 🧠 AI parsing — stejný princip jako čtení z fotky: pošleme text + celý
  // katalog piv/obalů/odběratelů + naučené zkratky do edge funkce, která
  // pomocí Claude AI rozpozná odběratele, piva a obaly. Výsledky pak
  // namapujeme přes parseGeminiItems (shoda s katalogem aplikace).
  async function runAiParse(text: string) {
    setParsing(true);
    setError(null);
    try {
      // Rozparsuj celý export (může být celý měsíc konverzace) na jednotlivé
      // zprávy s rozpoznaným odesílatelem a datem.
      const parsedMessages = parseWhatsAppExport(text);

      // Sestav seznam naučených aliasů (piva + obaly) jako hinty pro AI.
      const aliasList = [...aliasMapState.beer.entries()]
        .map(([alias_text, beer_id]) => ({ alias_text, beer_name: beers.find((b) => b.id === beer_id)?.name ?? null, package_label: null as string | null }))
        .concat(
          [...aliasMapState.package.entries()].map(([alias_text, package_id]) => ({ alias_text, beer_name: null as string | null, package_label: packages.find((p) => p.id === package_id)?.label ?? null }))
        )
        .slice(0, 80);

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-text`;
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          rawText: text,
          beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree ?? '' })),
          packages: packages.map((p) => ({ id: p.id, label: p.label })),
          places: places.map((pl) => pl.name),
          aliases: aliasList,
          // Naučené aliasy odběratelů (špatný název → správný název) — AI je
          // použije k opravě place_name, pokud text odpovídá špatnému názvu.
          placeAliases: [...placeAliasMap.entries()].map(([wrong_name, place_id]) => ({
            wrong_name,
            correct_name: places.find((p) => p.id === place_id)?.name ?? wrong_name,
          })).slice(0, 80),
          // Rozpoznané zprávy (odesílatel + datum) — AI je použije jako hlavní
          // vodítko pro správné přiřazení odběratele (place_name) a data.
          messages: parsedMessages.map((m) => ({ sender: m.sender, date: m.date, text: m.text })),
        }),

      });

      const respText = await resp.text();
      if (!resp.ok) {
        let msg = `HTTP ${resp.status}`;
        try { msg += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { msg += ': ' + respText; }
        throw new Error(msg);
      }
      let data: any;
      try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
      if (data?.error) throw new Error(data.error);

      const geminiItems: GeminiItem[] = data?.items ?? [];

      // Namapuj AI položky na ParsedLine (shoda s katalogem aplikace).
      const parsedLines = parseGeminiItems(geminiItems, beers, packages, aliasMapState);

      // 🛠️ FALLBACK: Pokud AI nepřiřadila place_name/date k položkám (všechny
      // spadly pod "_none"), zkus je přiřadit podle rozparsovaných zpráv.
      // Každá zpráva z WhatsApp exportu má svého odesílatele a datum — to je
      // nejspolehlivější zdroj pro určení odběratele a data každé položky.
      const linesWithNoPlace = parsedLines.filter((l) => !l.place_name);
      if (linesWithNoPlace.length > 0 && parsedMessages.length > 0) {
        // Přiřaď každou položku k nejpravděpodobnější zprávě podle obsahu.
        for (const line of linesWithNoPlace) {
          const rawNorm = normName(line.raw || '');
          if (!rawNorm) continue;
          // Najdi zprávu, jejíž obsah nejlépe odpovídá raw textu položky.
          let bestMsg: WhatsAppMessage | null = null;
          let bestScore = 0;
          for (const msg of parsedMessages) {
            const msgNorm = normName(msg.text || '');
            if (!msgNorm) continue;
            // Skóre = kolik slov z raw položky se nachází v obsahu zprávy
            const rawWords = rawNorm.split(/\s+/).filter((w) => w.length > 2);
            if (rawWords.length === 0) continue;
            let matched = 0;
            for (const w of rawWords) {
              if (msgNorm.includes(w)) matched++;
            }
            const score = matched / rawWords.length;
            if (score > bestScore) { bestScore = score; bestMsg = msg; }
          }
          if (bestMsg && bestScore >= 0.3) {
            line.place_name = bestMsg.sender || null;
            line.date = bestMsg.date || null;
          }
        }
      }

      // 🛠️ FALLBACK 2: Pokud AI přiřadila place_name ale NE datum (nebo naopak),
      // zkus doplnit chybějící údaj z rozparsovaných zpráv.
      if (parsedMessages.length > 0) {
        for (const line of parsedLines) {
          // Dopln datum, pokud chybí
          if (line.place_name && !line.date) {
            const msg = parsedMessages.find((m) => m.sender && normName(m.sender) === normName(line.place_name!));
            if (msg?.date) line.date = msg.date;
          }
          // Dopln place_name, pokud chybí (ale máme datum)
          if (!line.place_name && line.date) {
            const msg = parsedMessages.find((m) => m.date === line.date);
            if (msg?.sender) line.place_name = msg.sender;
          }
        }
      }

      // Seskup položky podle odběratele (place_name) A DATUM (date) do objednávek.
      // Díky tomu se celý měsíc konverzace správně rozdělí na samostatné objednávky
      // pro každého odběratele v každém dni (stejný odběratel v jiný den = nová objednávka).
      const byPlace = new Map<string, { lines: typeof parsedLines; sender: string | null; date: string | null }>();
      for (const line of parsedLines) {
        const placeName = line.place_name || '';
        const date = line.date || '';
        const key = `${placeName || '_none'}|${date}`;
        if (!byPlace.has(key)) byPlace.set(key, { lines: [], sender: null, date: date || null });
        byPlace.get(key)!.lines.push(line);
      }

      // Přiřaď odesílatele/datum z rozparsovaných zpráv k objednávkám.
      // Pokud AI nerozpoznala odběratele, zkus ho najít podle odesílatele zprávy.
      const drafts: OrderDraft[] = [];
      for (const [placeDateKey, group] of byPlace) {
        const [placeKey, groupDate] = placeDateKey.split('|');
        // Najdi odesílatele zprávy, který odpovídá tomuto místu
        let sender: string | null = null;
        let date: string | null = groupDate || null;
        for (const msg of parsedMessages) {
          if (msg.sender && placeKey !== '_none' && normName(msg.sender) === normName(placeKey)) {
            sender = msg.sender;
            if (!date) date = msg.date;
            break;
          }
        }
        if (!sender && placeKey === '_none' && parsedMessages.length === 1) {
          sender = parsedMessages[0].sender;
          if (!date) date = parsedMessages[0].date;
        }


        // Odběratel: nejdřív z AI (place_name), jinak z odesílatele zprávy
        let placeId: string | null = null;
        let placeName = placeKey === '_none' ? '' : placeKey;
        if (placeKey !== '_none') {
          const m = matchPlaceFromText(placeKey, places, placeAliasMap);
          if (m.placeId) { placeId = m.placeId; placeName = m.placeName ?? placeKey; }
        }
        if (!placeId && !placeName && sender) {
          const m = matchPlaceFromText(sender, places, placeAliasMap);
          if (m.placeId) { placeId = m.placeId; placeName = m.placeName ?? sender; }
          else placeName = sender;
        }

        const items: ItemRow[] = group.lines.map((it, idx) => ({
          id: `wa-${idx}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          beerId: it.beer_id || '',
          pkgId: it.package_id || '',
          qty: it.quantity ? String(it.quantity) : '1',
          rawText: it.raw,
        }));

        // 🚰 AUTO-DETEKCE POZNÁMKY: z raw textu objednávky rozpoznáme poznámky
        // jako "pipa", "výčep", "jednokohout", "dvojkohout", "trojkohout",
        // "sklo", "podtácky" apod. a uložíme je k objednávce. Díky tomu se
        // při uložení správně otevře rezervace výčepu (isTapMentioned).
        const groupRaw = group.lines.map((l) => l.raw || '').join(' ');
        const autoNote = detectOrderNotes(groupRaw || text);
        const noteText = autoNote || '';

        drafts.push({
          id: makeOrderId(),
          placeId,
          placeNameFree: placeName,
          orderDate: date || new Date().toISOString().slice(0, 10),
          deliveryDay: '',
          deliveryDate: date || '',
          note: noteText,
          items,
          rawMessage: placeKey === '_none' ? text : placeKey,
          collapsed: false,
        });

      }

      // Pokud AI nic nerozpoznala, vytvoř alespoň jednu prázdnou objednávku
      // s odesílatelem z první zprávy, aby uživatel mohl doplnit ručně.
      if (drafts.length === 0) {
        const first = parsedMessages[0];
        let placeId: string | null = null;
        let placeName = '';
        if (first?.sender) {
          const m = matchPlaceFromText(first.sender, places, placeAliasMap);
          if (m.placeId) { placeId = m.placeId; placeName = m.placeName ?? first.sender; }
          else placeName = first.sender;
        }
        drafts.push({
          id: makeOrderId(),
          placeId,
          placeNameFree: placeName,
          orderDate: first?.date || new Date().toISOString().slice(0, 10),
          deliveryDay: '',
          deliveryDate: first?.date || '',
          note: '',
          items: [],
          rawMessage: text,
          collapsed: false,
        });
      }

      setOrders(drafts);
    } catch (e: any) {
      setError('AI rozpoznávání selhalo: ' + (e?.message ?? String(e)));
      // Fallback: vytvoř jednu prázdnou objednávku pro ruční zadání
      const first = parseWhatsAppExport(text)[0];
      setOrders([{
        id: makeOrderId(),
        placeId: null,
        placeNameFree: first?.sender || '',
        orderDate: first?.date || new Date().toISOString().slice(0, 10),
        deliveryDay: '',
        deliveryDate: first?.date || '',
        note: '',
        items: [],
        rawMessage: text,
        collapsed: false,
      }]);
    } finally {
      setParsing(false);
    }
  }

  function normName(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }



  async function handlePasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRawText(text);
    } catch {
      setError('Nepodařilo se přistoupit ke schránce. Vlož text manuálně (Ctrl+V).');
    }
  }

  function updateOrder(id: string, patch: Partial<OrderDraft>) {
    setOrders((arr) => arr.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function updateOrderItem(orderId: string, itemId: string, field: keyof ItemRow, value: string) {
    setOrders((arr) =>
      arr.map((o) =>
        o.id === orderId
          ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)) }
          : o
      )
    );
  }

  // 🧠 Učení: když uživatel ručně opraví pivo/obal u položky, která má
  // rozpoznaný raw text, uložíme alias (raw text → správné pivo/obal),
  // aby příští AI rozpoznávání bylo přesnější.
  async function learnFromItem(item: ItemRow) {
    const raw = (item.rawText || '').trim();
    if (!raw) return;
    try {
      if (item.beerId) {
        await saveAlias(raw, item.beerId, null);
      }
      if (item.pkgId) {
        await saveAlias(raw, null, item.pkgId);
      }
      // Obnov naučené aliasy pro další parses
      loadAliasMap().then(setAliasMapState).catch(() => {});
    } catch {
      // tiché selhání učení — neblokuje uživatele
    }
  }


  function addOrderItem(orderId: string) {
    setOrders((arr) =>
      arr.map((o) =>
        o.id === orderId
          ? { ...o, items: [...o.items, { id: `wa-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, beerId: beers[0]?.id || '', pkgId: packages[0]?.id || '', qty: '1' }] }
          : o
      )
    );
  }

  function removeOrderItem(orderId: string, itemId: string) {
    setOrders((arr) =>
      arr.map((o) => (o.id === orderId ? { ...o, items: o.items.filter((i) => i.id !== itemId) } : o))
    );
  }

  function removeOrder(orderId: string) {
    setOrders((arr) => arr.filter((o) => o.id !== orderId));
  }

  function toggleCollapse(orderId: string) {
    setOrders((arr) => arr.map((o) => (o.id === orderId ? { ...o, collapsed: !o.collapsed } : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validOrders = orders
      .map((o) => ({
        placeId: o.placeId,
        placeNameFree: o.placeNameFree,
        orderDate: o.orderDate,
        deliveryDay: o.deliveryDay,
        deliveryDate: o.deliveryDate,
        note: o.note,
        items: o.items
          .filter((i) => i.beerId && i.pkgId && Number(i.qty) > 0)
          .map((i) => ({ beerId: i.beerId, pkgId: i.pkgId, qty: Number(i.qty) })),
      }))
      .filter((o) => o.items.length > 0);


    if (validOrders.length === 0) {
      setError('Zadej alespoň jednu objednávku s položkou (pivo, obal, množství).');
      return;
    }

    setSaving(true);
    try {
      await onSave(validOrders);
      // reset & close
      setRawText('');
      setOrders([]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při ukládání objednávek');
    } finally {
      setSaving(false);
    }
  }

  // Detekce, zda bylo nalezeno místo/odberatel
  const placeDetected = useMemo(() => {
    if (!rawText.trim()) return null; // no text yet
    if (orders.length === 0) return false;
    return orders.some((o) => o.placeId || o.placeNameFree);
  }, [rawText, orders]);

  const totalItems = useMemo(() => orders.reduce((sum, o) => sum + o.items.length, 0), [orders]);

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="💬 Vložit objednávky z WhatsApp">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* ⚠️ Warning when place/orderer not detected */}
        {rawText.trim() && placeDetected === false && (
          <div className="p-4 bg-amber-50 border-2 border-amber-400 text-amber-950 text-sm rounded-2xl flex items-start gap-3 shadow-md animate-scale-in">
            <div className="w-10 h-10 rounded-full bg-amber-200 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={20} className="text-amber-700" />
            </div>
            <div>
              <div className="font-black text-base mb-1">⚠️ Objednavatel nenalezen</div>
              <div className="font-semibold text-amber-900">
                Zkontroluj WhatsApp zpravu a zadej rucne — zadej odběratele do pole níže.
              </div>
              <div className="text-xs text-amber-800 mt-1.5 font-medium">
                Tip: Zpráva by měla obsahovat název hospody/místa, např. "pro Hospodu U Zajíce" nebo "Hospoda U Zajíce: 2x 12° 50l".
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={14} className="text-emerald-600" />
              <span>Vlož text zpráv z WhatsApp</span>
            </label>
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-950 text-xs font-bold border border-emerald-300 transition flex items-center gap-1"
            >
              <Clipboard size={13} />
              <span>Vložit ze schránky</span>
            </button>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={5}
            placeholder={`Vlož sem jednu nebo VÍCE zpráv z WhatsApp (každá od jiného odběratele).\n\nPříklad:\n[12:00, 1.1.2026] Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l keg\n[12:05, 1.1.2026] Seeberg: Dobrý den, 3x 10° 30l keg\n\nNebo zprávy odděl prázdným řádkem.`}
            className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-2xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
          />
          {orders.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
              <Layers size={14} />
              <span>Rozpoznáno {orders.length} objednávek — každá se uloží zvlášť pro svého odběratele.</span>
            </div>
          )}
        </div>

        {/* List of detected orders */}
        {orders.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Layers size={14} className="text-emerald-600" />
                Rozpoznané objednávky ({orders.length}) · položek ({totalItems})
              </h4>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {orders.map((order, oi) => (
                <div key={order.id} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
                  {/* Order header */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(order.id)}
                      className="flex items-center gap-2 text-xs font-black text-neutral-800 hover:text-emerald-700 transition"
                    >
                      {order.collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                        #{oi + 1}
                      </span>
                      <span className="truncate max-w-[180px]">
                        {order.placeNameFree || (order.placeId ? places.find((p) => p.id === order.placeId)?.name : '') || 'Bez odběratele'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-bold">({order.items.length} pol.)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOrder(order.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition shrink-0"
                      title="Odstranit tuto objednávku"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {!order.collapsed && (
                    <div className="p-3 space-y-3">
                      {/* Place + delivery */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Field label="Odběratel / Hospoda">
                          <PlaceCombobox
                            value={order.placeId || order.placeNameFree}
                            onChange={(pid, pname) => {
                              updateOrder(order.id, { placeId: pid, placeNameFree: pname });
                              if (pid && pname) {
                                savePlaceAlias(pname, pid).catch(() => {});
                                loadPlaceAliasMap().then(setPlaceAliasMap).catch(() => {});
                              }
                            }}
                            places={places}
                          />
                        </Field>

                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Den rozvozu">
                            <select
                              value={order.deliveryDay}
                              onChange={(e) => updateOrder(order.id, { deliveryDay: e.target.value })}
                              className="select text-xs font-bold"
                            >
                              <option value="">(Vyber den)</option>
                              {DAYS.map((d) => (
                                <option key={d.v} value={d.v}>
                                  {d.label}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Datum (volitelně)">
                            <input
                              type="date"
                              value={order.deliveryDate}
                              onChange={(e) => updateOrder(order.id, { deliveryDate: e.target.value })}
                              className="input text-xs font-mono font-bold"
                            />
                          </Field>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[11px] font-black uppercase tracking-wider text-neutral-500">
                            Položky ({order.items.length})
                          </h5>
                          <button
                            type="button"
                            onClick={() => addOrderItem(order.id)}
                            className="px-2 py-0.5 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white text-[10px] font-extrabold transition flex items-center gap-1"
                          >
                            <Plus size={11} />
                            <span>Přidat</span>
                          </button>
                        </div>

                        {order.items.length === 0 ? (
                          <div className="p-3 bg-neutral-50 rounded-xl border border-dashed border-neutral-300 text-center text-[11px] text-neutral-500">
                            Žádné položky — přidej ručně.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {order.items.map((item) => (
                              <div
                                key={item.id}
                                className="p-2 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-wrap items-center gap-2"
                              >
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => updateOrderItem(order.id, item.id, 'qty', e.target.value)}
                                  placeholder="Ks"
                                  className="w-12 input !py-1 text-center font-mono font-black text-xs"
                                />

                                <select
                                  value={item.beerId}
                                  onChange={(e) => {
                                    updateOrderItem(order.id, item.id, 'beerId', e.target.value);
                                    if (e.target.value) learnFromItem({ ...item, beerId: e.target.value });
                                  }}
                                  className="select !py-1 text-xs font-bold flex-1 min-w-[120px]"
                                >
                                  <option value="">(Vyber pivo)</option>
                                  {beers.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  value={item.pkgId}
                                  onChange={(e) => {
                                    updateOrderItem(order.id, item.id, 'pkgId', e.target.value);
                                    if (e.target.value) learnFromItem({ ...item, pkgId: e.target.value });
                                  }}
                                  className="select !py-1 text-xs font-medium flex-1 min-w-[110px]"
                                >
                                  <option value="">(Vyber obal)</option>
                                  {packages.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.label}
                                    </option>
                                  ))}
                                </select>


                                <button
                                  type="button"
                                  onClick={() => removeOrderItem(order.id, item.id)}
                                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition shrink-0"
                                  title="Odstranit položku"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Note */}
                      <Field label="Poznámka ke zprávě">
                        <input
                          type="text"
                          value={order.note}
                          onChange={(e) => updateOrder(order.id, { note: e.target.value })}
                          placeholder="např. Příjezd do 14:00, složit do sklepa"
                          className="input text-xs"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={saving || orders.length === 0}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Spinner />
            ) : (
              <>
                <Check size={16} />
                <span>✓ Vytvořit {orders.length > 1 ? `${orders.length} objednávky` : 'objednávku'} z WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
