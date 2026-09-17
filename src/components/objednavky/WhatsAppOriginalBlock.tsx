// 💬 Původní WhatsApp zpráva u objednávky — část obrazovky Objednávky.
import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, Clock, MessageCircle, User } from 'lucide-react';
import { Beer, Package, Place, supabase } from '../../lib/supabase';
import { Spinner } from '../ui';

import type {  } from '../../lib/stockLedger';

import type {  } from '../../lib/tankUZapisu';

import { getOrCreatePlace, savePlaceAlias } from '../../lib/orderParser';
import { parseWhatsAppOrderMessageWithAI } from '../../lib/whatsappParser';

import { fetchWhatsAppMessage, WhatsAppIncoming } from '../../lib/whatsappApi';

function formatWATime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function WhatsAppOriginalBlock({ messageId, orderId, beers, packages, places, onPlaceFound, onMessageLoaded }: {
  messageId: string;
  /** Vyplněné, jen když objednávka nemá odběratele (place_id je null) — nabídne tlačítko na nové rozpoznání. */
  orderId: string | null;
  beers: Beer[]; packages: Package[]; places: Place[];
  onPlaceFound?: () => void;
  /** Zavolá se, jakmile se zpráva načte — ať volající umí z textu vytáhnout vlastní věc (např. SplitOrderModal hledá druhého odběratele). */
  onMessageLoaded?: (msg: WhatsAppIncoming) => void;
}) {
  const [msg, setMsg] = useState<WhatsAppIncoming | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  // 🔎 Ruční „zkusit znovu najít odběratele" — stejný postup, jaký se dřív
  // dělal ručně přes SQL (Vildštejn, Tomáš od Marušky, 10. 9. 2026): znovu
  // zavolá AI parsování zprávy a nabídne nalezené jméno, i pro staré
  // objednávky, které skončily jako "Neznámý odběratel" ještě před opravou
  // promptu (docs/30-navrhu-2026-09-10.md, bod 3).
  const [hledani, setHledani] = useState<'idle' | 'probiha' | 'nenalezeno' | 'chyba'>('idle');
  const [hledaniChyba, setHledaniChyba] = useState<string | null>(null);

  async function zkusNajitOdberatele() {
    if (!msg || !orderId) return;
    setHledani('probiha');
    setHledaniChyba(null);
    try {
      const vysledek = await parseWhatsAppOrderMessageWithAI(
        // messageId (skutečný pisatel u "pro mě" — viz whatsappParser.ts) až za
        // aliasy: bez messageId appka u skupinového chatu hledala odběratele
        // podle jména skupiny, ne podle toho, kdo zprávu napsal.
        msg.message_text, beers, packages, places, msg.sender_name, msg.message_timestamp,
        undefined, undefined, messageId,
      );
      const jmeno = vysledek.placeName?.trim();
      if (!jmeno) {
        setHledani('nenalezeno');
        return;
      }
      let placeId = vysledek.placeId;
      let resolvedName = jmeno;
      if (!placeId) {
        const misto = await getOrCreatePlace(jmeno, places);
        if (misto) { placeId = misto.id; resolvedName = misto.name; }
      }
      if (!placeId) { setHledani('nenalezeno'); return; }
      await supabase.from('orders').update({ place_id: placeId, place_name: resolvedName }).eq('id', orderId);
      await savePlaceAlias(jmeno, placeId, resolvedName).catch(() => {});
      setHledani('idle');
      onPlaceFound?.();
    } catch (e) {
      setHledani('chyba');
      setHledaniChyba((e as Error).message ?? 'neznámá chyba');
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMsg(null);
    fetchWhatsAppMessage(messageId)
      .then((m) => { if (!cancelled) { setMsg(m); if (m) onMessageLoaded?.(m); } })
      .catch((e) => { if (!cancelled) setError((e as Error).message ?? 'neznámá chyba'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [messageId]);

  return (
    <div className="card p-4 mb-4 border-2 border-emerald-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 font-display font-extrabold text-emerald-800 text-sm sm:text-base">
          <MessageCircle size={18} className="text-emerald-600 shrink-0" />
          Původní WhatsApp zpráva
        </span>
        <span className="text-udaj font-bold text-neutral-400">{open ? 'Sbalit ▲' : 'Zobrazit ▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && (
            <div className="py-5 flex justify-center"><Spinner /></div>
          )}
          {error && (
            <p className="text-sm text-rose-600 font-semibold">
              Nepodařilo se načíst WhatsApp zprávu: {error}
            </p>
          )}
          {!loading && !error && !msg && (
            <p className="text-sm text-neutral-500">
              WhatsApp zpráva k této objednávce nebyla nalezena (byla pravděpodobně smazána).
            </p>
          )}
          {msg && (
            <>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-udaj font-bold text-neutral-500">
                <span className="flex items-center gap-1"><User className="ikona-text" /> {msg.sender_name || 'Neznámý odesílatel'}</span>
                <span><Clock className="ikona-text" /> {formatWATime(msg.message_timestamp || msg.created_at)}</span>
                {msg.readback_unmatched_count ? (
                  <span className="text-amber-700"><AlertTriangle className="ikona-text" /> {msg.readback_unmatched_count} položek AI přečetlo jinak</span>
                ) : null}
              </div>
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3.5 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                {msg.message_text || '(prázdná zpráva)'}
              </div>
              {msg.parsed_raw_text && (
                <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3 text-xs text-neutral-600 whitespace-pre-wrap leading-relaxed">
                  <span className="font-black text-amber-700 block mb-1"><Bot className="ikona-text" /> Přepis AI (raw_text) — kontrola čtení:</span>
                  {msg.parsed_raw_text}
                </div>
              )}
              {msg.media_url && (
                <a href={msg.media_url} target="_blank" rel="noreferrer" className="inline-block">
                  <img src={msg.media_url} alt="Příloha WhatsApp objednávky" loading="lazy" decoding="async" className="max-h-44 rounded-xl border border-neutral-200" />
                </a>
              )}
              {orderId && (
                <div className="pt-1">
                  <button
                    type="button"
                    disabled={hledani === 'probiha'}
                    onClick={() => { void zkusNajitOdberatele(); }}
                    className="btn-ghost !rounded text-xs !py-1.5 border border-emerald-300 text-emerald-800 disabled:opacity-50"
                  >
                    {hledani === 'probiha' ? 'Hledám v textu zprávy…' : 'Zkusit znovu najít odběratele v téhle zprávě'}
                  </button>
                  {hledani === 'nenalezeno' && (
                    <p className="text-xs text-amber-700 font-semibold mt-1">Ani teď se v textu žádné jméno odběratele nenašlo — doplň ho ručně výše.</p>
                  )}
                  {hledani === 'chyba' && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">Nepodařilo se: {hledaniChyba}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


