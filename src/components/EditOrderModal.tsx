import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { supabase, Beer, Package, Place } from '../lib/supabase';
import { saveAlias, savePlaceAlias, getOrCreatePlace } from '../lib/orderParser';
import { autoReserveTapIfNeeded, isTapMentioned, detectTapType } from '../lib/tapReservations';
import { TapReservationModal } from './TapReservationModal';
import { QuickQtySelect } from './QuickQtySelect';

type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  source: string; status: string; note: string | null; created_at: string;
  delivery_day: string | null; delivery_date: string | null;
  is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; delivered_at: string | null;
};
type OrderItem = {
  id: string; order_id: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
  is_prepared: boolean;
};

const DAYS = [
  { v: 'po', label: 'Po' }, { v: 'ut', label: 'Út' }, { v: 'st', label: 'St' },
  { v: 'ct', label: 'Ct' }, { v: 'pa', label: 'Pá' }, { v: 'so', label: 'So' }, { v: 'ne', label: 'Ne' },
];

type Row = { id: string | null; beerId: string; pkgId: string; qty: string; removed: boolean };

export function EditOrderModal({ order, items, beers, packages, places, onClose, onSaved, onPlacesChanged }: {
  order: Order; items: OrderItem[]; beers: Beer[]; packages: Package[]; places: Place[];
  onClose: () => void; onSaved: () => void; onPlacesChanged?: () => void;
}) {
  const [date, setDate] = useState(order.order_date);
  const [placeId, setPlaceId] = useState(order.place_id ?? '');
  const [placeName, setPlaceName] = useState(order.place_name ?? '');
  const [deliveryDay, setDeliveryDay] = useState(order.delivery_day ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date ?? '');
  const [note, setNote] = useState(order.note ?? '');
  const [rows, setRows] = useState<Row[]>(
    items.map((i) => ({ id: i.id, beerId: i.beer_id ?? '', pkgId: i.package_id ?? '', qty: String(i.quantity), removed: false }))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 🚰 Rezervace výčepu — modal
  const [showTapModal, setShowTapModal] = useState(false);
  const [pendingSave, setPendingSave] = useState(false); // true when save() was triggered but waiting for tap modal
  const [tapWasConfirmed, setTapWasConfirmed] = useState(false); // true if user confirmed reservation in modal

  const oldPlaceId = order.place_id;
  const oldPlaceName = order.place_name;

  function setRow(idx: number, field: 'beerId' | 'pkgId' | 'qty', value: string) {
    setRows((rs) => rs.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: null, beerId: '', pkgId: '', qty: '', removed: false }]);
  }
  function removeRow(idx: number) {
    setRows((rs) => rs.map((r, i) => i === idx ? (r.id ? { ...r, removed: true } : null as any) : r).filter(Boolean) as Row[]);
  }
  function restoreRow(idx: number) {
    setRows((rs) => rs.map((r, i) => i === idx ? { ...r, removed: false } : r));
  }

  const visibleRows = rows.filter((r) => !r.removed);
  const filledCount = visibleRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0).length;

  async function save() {
    setErr(null);
    const validRows = visibleRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
    if (!validRows.length) { setErr('Vyplň alespoň jednu položku (pivo, obal, množství).'); return; }

    setSaving(true);
    try {
      let resolvedPlaceId = placeId || null;
      let resolvedName = placeName.trim();
      if (!resolvedPlaceId && resolvedName) {
        const place = await getOrCreatePlace(resolvedName, places);
        if (place) {
          resolvedPlaceId = place.id;
          resolvedName = place.name;
          onPlacesChanged?.();
        }
      }

      const toUpdate = rows.filter((r) => !r.removed && r.id && r.beerId && r.pkgId && Number(r.qty) > 0);
      const replacementItems = validRows.map((r) => {
        const beer = beers.find((b) => b.id === r.beerId);
        const pkg = packages.find((p) => p.id === r.pkgId);
        return {
          id: r.id,
          beer_id: r.beerId,
          beer_name: beer?.name ?? null,
          package_id: r.pkgId,
          package_label: pkg?.label ?? null,
          quantity: Number(r.qty),
          is_prepared: r.id
            ? (items.find((item) => item.id === r.id)?.is_prepared ?? false)
            : false,
        };
      });

      const { error: replaceError } = await supabase.rpc('replace_order_with_items', {
        p_order_id: order.id,
        p_order: {
          order_date: date,
          place_id: resolvedPlaceId,
          place_name: resolvedName || null,
          delivery_day: deliveryDay || null,
          delivery_date: deliveryDate || null,
          note: note.trim() || null,
        },
        p_items: replacementItems,
      });
      if (replaceError) throw new Error(replaceError.message);

      // Items removed with no id (shouldn't happen since removeRow drops non-persisted rows immediately) — nothing to do

      // 🧠 Nauč se aliasy z upravených položek — pokud někdo změnil pivo/obal,
      // uložíme si to, aby příště parser (z fotky/emailu/hlasu) rovnou použil správnou hodnotu.
      for (const r of toUpdate) {
        const orig = items.find((i) => i.id === r.id);
        if (!orig) continue;
        const beerChanged = orig.beer_id !== r.beerId;
        const pkgChanged = orig.package_id !== r.pkgId;
        if (beerChanged || pkgChanged) {
          // Zkusíme najít text, který by mohl být alias — použijeme beer_name z originálu
          const origBeerName = orig.beer_name;
          if (origBeerName && origBeerName.trim()) {
            await saveAlias(origBeerName, r.beerId, null).catch(() => {});
          }
          const origPkgLabel = orig.package_label;
          if (origPkgLabel && origPkgLabel.trim()) {
            await saveAlias(origPkgLabel, null, r.pkgId).catch(() => {});
          }
        }
      }



      // 🚰 Automatická rezervace výčepu, pokud je v poznámce zmínka (včetně synonym)
      const trimmedNote = note.trim();
      if (isTapMentioned(trimmedNote)) {
        // Show modal for tap selection instead of silent auto-reserve
        setPendingSave(true);
        setShowTapModal(true);
        setSaving(false);
        return; // Stop here — modal will call finalizeSave on confirm/skip
      }

      // No tap mentioned — finish normally
      await finalizeSave(resolvedName || placeName.trim(), date, trimmedNote, order.id, false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      if (!pendingSave) setSaving(false);
    }
  }

  /** Called after tap modal is confirmed or skipped */
  async function finalizeSave(customerName: string, dateStr: string, noteText: string, orderId: string, wasConfirmed: boolean) {
    try {
      // If user confirmed in modal, reservation was already saved by the modal itself
      // If user skipped, fall back to silent auto-reserve (original behavior)
      if (!wasConfirmed) {
        autoReserveTapIfNeeded(customerName, dateStr, noteText, orderId);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
      setPendingSave(false);
    }
  }

  function handleTapConfirm() {
    setShowTapModal(false);
    setTapWasConfirmed(true);
    // Reservation was saved by the modal itself
    finalizeSave(placeName.trim() || order.place_name || '', date, note.trim(), order.id, true);
  }

  function handleTapSkip() {
    setShowTapModal(false);
    setTapWasConfirmed(false);
    // Fall back to silent auto-reserve (original behavior)
    finalizeSave(placeName.trim() || order.place_name || '', date, note.trim(), order.id, false);
  }

  return (
    <Modal open onClose={onClose} title="✎ Upravit objednávku" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-2">
            <label className="label">Odběratel</label>
            <PlaceCombobox value={placeId} onChange={(id, name) => { setPlaceId(id); setPlaceName(name); }} places={places} onPlacesChanged={onPlacesChanged} />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <label className="label">Den dodání</label>
            <select className="input" value={deliveryDay} onChange={(e) => setDeliveryDay(e.target.value)}>
              <option value="">—</option>
              {DAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
          </div>
          <div className="col-span-1 sm:col-span-1">
            <label className="label">Datum dodání</label>
            <input type="date" className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
        </div>

        <div className="border-t border-primary-100 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary-400 mb-2">Položky piva ({filledCount} vyplněno)</div>
          <div className="space-y-2">
            {rows.map((r, i) => r.removed ? (
              <div key={r.id ?? `new-${i}`} className="flex items-center justify-between rounded-lg border-2 border-dashed border-primary-200 bg-primary-50/40 px-3 py-2 text-xs text-primary-500">
                <span>Položka bude odstraněna</span>
                <button type="button" className="btn-ghost text-xs !py-1 !px-2" onClick={() => restoreRow(i)}>Vrátit</button>
              </div>
            ) : (
              <div key={r.id ?? `new-${i}`} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 sm:col-span-5">
                  <select className="input !py-2 text-sm" value={r.beerId} onChange={(e) => setRow(i, 'beerId', e.target.value)}>
                    <option value="">— pivo —</option>
                    {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <select className="input !py-2 text-sm" value={r.pkgId} onChange={(e) => setRow(i, 'pkgId', e.target.value)}>
                    <option value="">— obal —</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-3">
                                    <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setRow(i, 'qty', String(Math.max(0, (Number(r.qty) || 0) - 1)))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-neutral-100 hover:bg-amber-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition" title="Odečíst 1">−</button>
                    <span className="flex-1 min-w-0 text-center text-sm font-bold bg-white border border-neutral-200 rounded-lg py-2">
                      {r.qty || '0'}
                    </span>
                    <button type="button" onClick={() => setRow(i, 'qty', String((Number(r.qty) || 0) + 1))} className="w-7 h-7 shrink-0 grid place-items-center rounded-lg bg-amber-950 hover:bg-amber-900 text-white font-bold text-sm select-none active:scale-95 transition" title="Přidat 1">+</button>
                    <QuickQtySelect
                      pkg={packages.find((p) => p.id === r.pkgId)}
                      qty={r.qty}
                      onSelect={(q) => setRow(i, 'qty', String(q))}
                    />
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <button type="button" className="text-danger-400 hover:text-danger-600 px-2" onClick={() => removeRow(i)} title="Odstranit položku">×</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="btn-primary mt-2 !py-2 !px-3 text-sm">
            + Přidat další řádek
          </button>

          <div className="mt-3 space-y-1.5">
            <label className="label">Poznámka k objednávce & Rezervace výčepu</label>
            <input type="text" className="input font-medium" placeholder="např. vratný sud, + výčep jednokohout, podtacky" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-neutral-500">Rychlé přidání výčepu do poznámky:</span>
              <button
                type="button"
                onClick={() => setNote((n) => n ? `${n}, + výčep jednokohout` : '+ výčep jednokohout')}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] border border-amber-300 transition"
              >
                🚰 + Výčep jednokohout
              </button>
              <button
                type="button"
                onClick={() => setNote((n) => n ? `${n}, + výčep dvojkohout` : '+ výčep dvojkohout')}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] border border-amber-300 transition"
              >
                🚰🚰 + Výčep dvojkohout
              </button>
              <button
                type="button"
                onClick={() => setNote((n) => n ? `${n}, + výčep trojkohout` : '+ výčep trojkohout')}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] border border-amber-300 transition"
              >
                🚰🚰🚰 + Výčep trojkohout
              </button>
              <button
                type="button"
                onClick={() => setNote((n) => n ? `${n}, + výčep šestikohout` : '+ výčep šestikohout')}
                className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] border border-amber-300 transition"
              >
                🚰🚰🚰🚰🚰🚰 + Výčep šestikohout (akce)
              </button>
            </div>
          </div>
        </div>

        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Zrušit</button>
          <button className="btn-primary" onClick={save} disabled={saving || filledCount === 0}>
            {saving ? 'Ukládám…' : 'Uložit změny'}
          </button>
        </div>
      </div>

      {/* 🚰 Modální okno pro výběr výčepu k rezervaci */}
      {showTapModal && (
        <TapReservationModal
          orderDate={date}
          customerName={placeName.trim() || order.place_name || ''}
          orderId={order.id}
          tapTypeHint={detectTapType(note)}
          onConfirm={handleTapConfirm}
          onSkip={handleTapSkip}
        />
      )}
    </Modal>
  );
}
