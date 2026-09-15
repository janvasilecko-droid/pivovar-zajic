// ✂️ Rozdělení jedné objednávky na dva odběratele.
// ---------------------------------------------------------------------------
// Z provozu 15. 9. 2026: WhatsApp zpráva „Chmeloun a Sluhy" dorazila jako
// jedna objednávka, ale patří dvěma různým odběratelům. Dosud šlo jen
// přepsat odběratele u CELÉ objednávky (EditOrderModal) nebo ji celou
// duplikovat (Orders.tsx, duplicateOrder) — žádná cesta, jak část položek
// odeslat k jinému odběrateli a zbytek nechat, kde je.
//
// Založí se NOVÁ objednávka pro druhého odběratele (stejné datum/den/datum
// dovozu jako původní) a vybrané položky se k ní přesunou — jen se jim
// přepíše `order_id`, ID položky zůstává stejné (na něm visí případný
// odpočet závozu). Pokud už položka má odpočet (zavoz_deductions), přesune
// se s ní i ten — jinak by odpočet zůstal ukazovat na starou objednávku a
// přehledy/audit by se rozešly s tím, kde položka doopravdy je.
import { useRef, useState } from 'react';
import { Modal } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { supabase, formatPackageLabel } from '../lib/supabase';
import { getOrCreatePlace } from '../lib/orderParser';
import { oznacVlastniObjednavku } from '../lib/mojeObjednavky';
import { uhodniDruhehoOdberatele } from '../lib/druhyOdberatel';
import { WhatsAppOriginalBlock } from './objednavky/WhatsAppOriginalBlock';
import type { WhatsAppIncoming } from '../lib/whatsappApi';
import type { Order, OrderItem } from './objednavky/spolecne';

const bezDiakritiky = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function SplitOrderModal({ order, items, beers, packages, places, onClose, onSaved, onPlacesChanged }: {
  order: Order; items: OrderItem[];
  beers: import('../lib/supabase').Beer[]; packages: import('../lib/supabase').Package[]; places: import('../lib/supabase').Place[];
  onClose: () => void; onSaved: () => void; onPlacesChanged?: () => void;
}) {
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const [placeId, setPlaceId] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 🔍 Jakmile se načte originální zpráva, zkusit z ní rovnou uhodnout
  // druhého odběratele (z provozu 15. 9. 2026: „rovnou tam přidej toho
  // odběratele, pokud ve zprávě byl — tady bylo Sluhy"). Jen návrh, obsluha
  // ho může přepsat; `zkusenoRef` mu nedovolí přebít, co si už sama napsala.
  const zkusenoRef = useRef(false);
  const [autoNavrzeno, setAutoNavrzeno] = useState(false);
  function zpravaNactena(msg: WhatsAppIncoming) {
    if (zkusenoRef.current) return;
    zkusenoRef.current = true;
    const navrh = uhodniDruhehoOdberatele(msg.message_text, order.place_name);
    if (!navrh) return;
    setPlaceName((soucasne) => soucasne || navrh);
    const shoda = places.find((p) => bezDiakritiky(p.name) === bezDiakritiky(navrh));
    if (shoda) setPlaceId((soucasne) => soucasne || shoda.id);
    setAutoNavrzeno(true);
  }

  function prepni(id: string) {
    setVybrane((s) => {
      const dalsi = new Set(s);
      if (dalsi.has(id)) dalsi.delete(id); else dalsi.add(id);
      return dalsi;
    });
  }

  const pocetVybranych = vybrane.size;
  // Rozdělit má smysl jen mezi 1 a (počet položek − 1) — méně není rozdělení,
  // všechny by znamenalo přesunout celou objednávku (na to stačí EditOrderModal).
  const platnyVyber = pocetVybranych > 0 && pocetVybranych < items.length;

  async function save() {
    setErr(null);
    if (!platnyVyber) { setErr('Zaškrtni aspoň jednu položku, ale ne všechny.'); return; }
    const resolvedName = placeName.trim();
    if (!placeId && !resolvedName) { setErr('Vyber nebo napiš druhého odběratele.'); return; }

    setSaving(true);
    try {
      let resolvedPlaceId = placeId || null;
      let finalName = resolvedName;
      if (!resolvedPlaceId && resolvedName) {
        const place = await getOrCreatePlace(resolvedName, places);
        if (place) { resolvedPlaceId = place.id; finalName = place.name; onPlacesChanged?.(); }
      }

      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        order_date: order.order_date, place_id: resolvedPlaceId, place_name: finalName || null,
        source: order.source, status: 'nova', delivery_day: order.delivery_day,
        delivery_date: order.delivery_date, is_prepared: false, is_packaged: false, is_delivered: false,
      }).select().single();
      if (orderErr || !newOrder) throw new Error(orderErr?.message ?? 'Založení nové objednávky se nepovedlo.');
      oznacVlastniObjednavku(newOrder.id);

      const idsKPresunu = [...vybrane];
      const { error: itemsErr } = await supabase.from('order_items').update({ order_id: newOrder.id }).in('id', idsKPresunu);
      if (itemsErr) throw new Error(itemsErr.message);

      // Odpočet závozu (pokud položka už byla zavezená) drží vlastní order_id
      // vedle order_item_id — bez přesunu by ukazoval na starou objednávku.
      await supabase.from('zavoz_deductions').update({ order_id: newOrder.id }).in('order_item_id', idsKPresunu);

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Rozdělit objednávku na dva odběratele" wide>
      <div className="space-y-4">
        <p className="text-udaj text-neutral-500">
          Zaškrtni položky, které patří <strong>druhému</strong> odběrateli — vznikne pro ně nová objednávka,
          zbytek zůstane u <strong>{order.place_name || 'původního odběratele'}</strong>.
        </p>

        {/* Původní WhatsApp zpráva — ať jde rozdělit přesně podle ní, ne
            jen podle položek, jak je appka rozpoznala (z provozu 15. 9. 2026). */}
        {order.whatsapp_message_id && (
          <WhatsAppOriginalBlock messageId={order.whatsapp_message_id} orderId={null} beers={beers} packages={packages} places={places} onMessageLoaded={zpravaNactena} />
        )}

        <div className="space-y-1.5">
          {items.map((it) => (
            <label key={it.id} className="flex items-center gap-2.5 rounded border border-neutral-200 p-2.5 cursor-pointer hover:bg-neutral-50">
              <input
                type="checkbox"
                className="w-5 h-5 shrink-0"
                checked={vybrane.has(it.id)}
                onChange={() => prepni(it.id)}
              />
              <span className="text-sm font-bold text-neutral-800">
                {it.quantity}× {it.beer_name || '?'} — {formatPackageLabel(it.package_label || '')}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="label">Druhý odběratel</label>
          <PlaceCombobox
            value={placeId || placeName}
            onChange={(id, name) => { setPlaceId(id); setPlaceName(name); setAutoNavrzeno(false); }}
            places={places}
            onPlacesChanged={onPlacesChanged}
          />
          {autoNavrzeno && (
            <p className="text-udaj font-bold text-emerald-700 mt-1">
              Doplněno z originální zprávy — zkontroluj, jestli sedí.
            </p>
          )}
        </div>

        {err && <p className="text-udaj font-bold text-rose-700">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Zrušit</button>
          <button type="button" className="btn-primary" disabled={saving || !platnyVyber} onClick={save}>
            {saving ? 'Dělím…' : `Rozdělit (${pocetVybranych} ks položek k druhému)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
