// ↩️ „Vrátit pivo" přímo z karty objednávky — bez samostatné záložky.
// ---------------------------------------------------------------------------
// Zadání 21. 9. 2026: „v prehledu obednavet dej tlacitko vratit pivo, kdyz se
// da vratit pivo, obednavka zustane stejna ale pribude radek kde bude vraceny
// pivo, naprikal 5x30 a 1x 30vracen, ale bude tam i napsano ze se pocita 4x30
// a 1x30 vraceno do skladu." Uživatel výslovně odmítl samostatnou
// „kartu"/záložku (ta pro tohle použití existuje, VraceniPiva.tsx) — chtěl
// tlačítko přímo u objednávky.
//
// Položky objednávky (order_items) se NEMĚNÍ — zůstávají svědectvím o tom,
// co se doopravdy zavezlo (stejná zásada jako VraceniPiva.tsx). Vrácení jde
// jako dorovnání do skladu (inventory_adjustments, DNEŠNÍM dnem) se
// `order_id` téhle objednávky, ať appka umí dopočítat efektivní množství
// zpátky (viz vracenoPodleObjednavky v lib/vraceniZObjednavky.ts) — to
// počítá a zobrazuje karta objednávky (OrderCard.tsx), tenhle modál jen píše.
import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Modal } from '../ui';
import { supabase, beerBg, beerInk, formatPackageLabel, type Beer } from '../../lib/supabase';
import { businessDateISO } from '../../lib/businessDate';
import { chyba, uspech } from '../../lib/toast';
import {
  platneVraceni, poznamkaVraceni, pripojPoznamku, vracenoPodleObjednavky,
  zaznamyDorovnaniVraceni, type PolozkaVraceni,
} from '../../lib/vraceniZObjednavky';
import type { Order, OrderItem } from './spolecne';

export function VratitPivoModal({ isOpen, onClose, order, items, beers, vracenoZaznamy, onSaved }: {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  items: OrderItem[];
  beers: Beer[];
  /** Řádky inventory_adjustments s order_id téhle objednávky — pro „už vráceno". */
  vracenoZaznamy: { beer_id: string | null; package_id: string | null; quantity: number }[];
  onSaved: () => void;
}) {
  const [pocty, setPocty] = useState<Record<string, string>>({});
  const [ukladam, setUkladam] = useState(false);
  const jizVraceno = vracenoPodleObjednavky(vracenoZaznamy);
  const dnes = businessDateISO();

  const kUlozeni: PolozkaVraceni[] = platneVraceni(items.map((it) => ({
    beer_id: it.beer_id ?? '',
    beer_name: it.beer_name,
    package_id: it.package_id ?? '',
    package_label: it.package_label,
    pocet: Number(pocty[it.id] || 0),
  })));
  const celkem = kUlozeni.reduce((s, p) => s + p.pocet, 0);

  async function uloz() {
    if (celkem === 0) return;
    setUkladam(true);
    try {
      const odberatel = order.place_name || '';
      const { error } = await supabase
        .from('inventory_adjustments')
        .insert(zaznamyDorovnaniVraceni(kUlozeni, dnes, odberatel, order.id));
      if (error) throw new Error(error.message);
      const novaPoznamka = pripojPoznamku(order.note, poznamkaVraceni(kUlozeni, dnes));
      const { error: e2 } = await supabase.from('orders').update({ note: novaPoznamka }).eq('id', order.id);
      if (e2) throw new Error(e2.message);
      uspech(`Vráceno ${celkem} ks — přičteno na sklad, objednávka zůstává beze změny.`);
      setPocty({});
      onSaved();
      onClose();
    } catch (e: any) {
      chyba('Vrácení se nepovedlo: ' + (e?.message || e));
    } finally {
      setUkladam(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Vrátit pivo">
      <div className="space-y-3">
        <p className="text-udaj text-neutral-600">
          Kolik z téhle objednávky se doopravdy vrátilo zpátky do pivovaru. <b>Přičte se na sklad dneškem.</b> Původní
          položky objednávky se nemění — u objednávky jen přibude poznámka a přehled ukáže i efektivní počet.
        </p>

        {items.length === 0 ? (
          <p className="text-udaj text-neutral-500">Tahle objednávka nemá žádné položky.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => {
              const beer = it.beer_id ? beers.find((b) => b.id === it.beer_id) : null;
              const klic = it.beer_id && it.package_id ? `${it.beer_id}__${it.package_id}` : null;
              const drivVraceno = klic ? (jizVraceno.get(klic) ?? 0) : 0;
              const zbyva = Math.max(0, Number(it.quantity) - drivVraceno);
              return (
                <li key={it.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex items-center gap-1.5 text-sm">
                    <span
                      className="px-1.5 py-0.5 rounded font-black text-xs shrink-0"
                      style={{ backgroundColor: beerBg(beer), color: beerInk(beer) }}
                    >
                      {formatPackageLabel(it.package_label)}
                    </span>
                    <span className="truncate text-neutral-800">{it.beer_name}</span>
                    <span className="text-neutral-400 shrink-0 text-udaj">
                      zavezeno {it.quantity}{drivVraceno > 0 ? ` · už vráceno ${drivVraceno}` : ''}
                    </span>
                  </span>
                  <input
                    type="number" min={0} max={zbyva} inputMode="numeric" placeholder="0"
                    onWheel={(e) => e.currentTarget.blur()}
                    disabled={zbyva === 0}
                    className="input !w-20 !py-1 text-center shrink-0 disabled:opacity-40"
                    aria-label={`Vráceno ${it.beer_name} ${it.package_label}`}
                    value={pocty[it.id] ?? ''}
                    onChange={(e) => setPocty((m) => ({ ...m, [it.id]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
          <span className="text-sm font-black text-neutral-700">
            {celkem > 0 ? `Vrací se ${celkem} ks` : 'Zatím nic nezadáno'}
          </span>
          <button
            type="button"
            className="btn-primary !rounded text-xs font-black"
            onClick={() => { void uloz(); }}
            disabled={ukladam || celkem === 0}
          >
            {ukladam ? <RotateCcw size={14} className="animate-spin" /> : <Check size={14} />}
            {ukladam ? 'Ukládám…' : 'Vrátit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
