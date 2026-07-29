import { useState, useEffect } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import { ParserAliasMap } from '../lib/orderParser';
import { parseWhatsAppOrderMessage } from '../lib/whatsappParser';
import { Modal, Field, Spinner } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import { DAYS } from '../lib/shared';
import { MessageSquare, Clipboard, Check, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react';

interface WhatsAppImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  aliasMap?: ParserAliasMap;
  onSave: (data: {
    placeId: string | null;
    placeNameFree: string;
    deliveryDay: string;
    deliveryDate: string;
    note: string;
    items: { beerId: string; pkgId: string; qty: number }[];
  }) => Promise<void>;
}

interface ItemRow {
  id: string;
  beerId: string;
  pkgId: string;
  qty: string;
  rawText?: string;
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
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeNameFree, setPlaceNameFree] = useState('');
  const [deliveryDay, setDeliveryDay] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-parse automatically whenever text changes
  useEffect(() => {
    if (!rawText.trim()) {
      setItems([]);
      return;
    }

    const parsed = parseWhatsAppOrderMessage(rawText, beers, packages, places, aliasMap);

    if (parsed.placeId) {
      setPlaceId(parsed.placeId);
      setPlaceNameFree('');
    } else if (parsed.placeName) {
      setPlaceId(null);
      setPlaceNameFree(parsed.placeName);
    }

    if (parsed.deliveryDay) setDeliveryDay(parsed.deliveryDay);
    if (parsed.deliveryDate) setDeliveryDate(parsed.deliveryDate);
    if (parsed.note) setNote(parsed.note);

    if (parsed.items.length > 0) {
      const newItems: ItemRow[] = parsed.items.map((it, idx) => ({
        id: `wa-${idx}-${Date.now()}`,
        beerId: it.beer_id || '',
        pkgId: it.package_id || '',
        qty: it.quantity ? String(it.quantity) : '1',
        rawText: it.raw,
      }));
      setItems(newItems);
    }
  }, [rawText, beers, packages, places, aliasMap]);

  async function handlePasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setRawText(text);
    } catch {
      setError('Nepodařilo se přistoupit ke schránce. Vlož text manuálně (Ctrl+V).');
    }
  }

  function handleAddItem() {
    setItems((arr) => [
      ...arr,
      { id: `wa-custom-${Date.now()}`, beerId: beers[0]?.id || '', pkgId: packages[0]?.id || '', qty: '1' },
    ]);
  }

  function handleRemoveItem(id: string) {
    setItems((arr) => arr.filter((i) => i.id !== id));
  }

  function updateItem(id: string, field: keyof ItemRow, value: string) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validItems = items
      .filter((i) => i.beerId && i.pkgId && Number(i.qty) > 0)
      .map((i) => ({ beerId: i.beerId, pkgId: i.pkgId, qty: Number(i.qty) }));

    if (validItems.length === 0) {
      setError('Zadej alespoň jednu položku s vybraným pivem, obalem a množstvím.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        placeId,
        placeNameFree,
        deliveryDay,
        deliveryDate,
        note,
        items: validItems,
      });
      // reset & close
      setRawText('');
      setItems([]);
      setNote('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při ukládání objednávky');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="💬 Vložit objednávku z WhatsApp">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={14} className="text-emerald-600" />
              <span>Vlož text zprávy z WhatsApp</span>
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
            rows={4}
            placeholder={`Vlož sem zprávu z WhatsApp, např.:\n"Ahoj sládku, na čtvrtek pro Hospodu U Zajíce:\n- 2x 12° 50l keg\n- 3x 10° 30l keg\nProsím dovézt do 14:00"`}
            className="w-full p-3 bg-neutral-50 border border-neutral-300 rounded-2xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
          />
        </div>

        {/* Form fields parsed from message */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-100/70 p-3.5 rounded-2xl border border-neutral-200">
          <Field label="Odběratel / Hospoda">
            <PlaceCombobox
              value={placeId || placeNameFree}
              onChange={(pid, pname) => {
                setPlaceId(pid);
                setPlaceNameFree(pname);
              }}
              places={places}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Den rozvozu">
              <select
                value={deliveryDay}
                onChange={(e) => setDeliveryDay(e.target.value)}
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
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="input text-xs font-mono font-bold"
              />
            </Field>
          </div>
        </div>

        {/* Parsed items list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700">
              Položky piva & obalů ({items.length})
            </h4>
            <button
              type="button"
              onClick={handleAddItem}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-extrabold transition flex items-center gap-1"
            >
              <Plus size={13} />
              <span>Přidat položku</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-4 bg-neutral-50 rounded-2xl border border-dashed border-neutral-300 text-center text-xs text-neutral-500">
              Vlož nahoře text zprávy z WhatsApp a položky se automaticky načtou.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-white border border-neutral-200 flex flex-wrap items-center gap-2 shadow-2xs"
                >
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                    placeholder="Ks"
                    className="w-14 input !py-1 text-center font-mono font-black text-xs"
                  />

                  <select
                    value={item.beerId}
                    onChange={(e) => updateItem(item.id, 'beerId', e.target.value)}
                    className="select !py-1 text-xs font-bold flex-1 min-w-[130px]"
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
                    onChange={(e) => updateItem(item.id, 'pkgId', e.target.value)}
                    className="select !py-1 text-xs font-medium flex-1 min-w-[120px]"
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
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition shrink-0"
                    title="Odstranit položku"
                  >
                    <Trash2 size={15} />
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
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="např. Příjezd do 14:00, složit do sklepa"
            className="input text-xs"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={saving || items.length === 0}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Spinner />
            ) : (
              <>
                <Check size={16} />
                <span>✓ Vytvořit objednávku z WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
