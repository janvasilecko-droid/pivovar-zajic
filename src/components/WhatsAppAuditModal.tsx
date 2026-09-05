import { useState, useEffect, useMemo } from 'react';
import {
  WhatsAppIncoming,
  fetchAllWhatsAppMessagesSince,
  updateWhatsAppMessageStatus,
  triggerAutoParse,
} from '../lib/whatsappApi';
import { Modal, Spinner } from './ui';
import { AlertTriangle, Check, MessageSquare, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import { chyba } from '../lib/toast';

interface WhatsAppAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMessage?: (message: WhatsAppIncoming) => void;
}

const STATUS_LABEL: Record<WhatsAppIncoming['status'], string> = {
  pending: 'Čeká na zpracování',
  processing: 'Zpracovává se',
  parsed: 'Rozpoznáno (čeká na schválení)',
  imported: 'Naimportováno do objednávky',
  error: 'Chyba při zpracování',
  ignored: 'Ignorováno',
};

const STATUS_STYLE: Record<WhatsAppIncoming['status'], string> = {
  pending: 'bg-sky-100 text-sky-900 border-sky-300',
  processing: 'bg-amber-100 text-amber-900 border-amber-300',
  parsed: 'bg-violet-100 text-violet-900 border-violet-300',
  imported: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  error: 'bg-rose-100 text-rose-900 border-rose-300',
  ignored: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

const DAY_OPTIONS = [7, 14, 30, 90];

/**
 * Kontrolní přehled WhatsApp zpráv — na rozdíl od ostatních modalů (které
 * zobrazují jen pending/parsed) ukazuje VŠECHNY zprávy za zvolené období bez
 * ohledu na stav, aby šlo ověřit, že žádná objednávka "nezmizela" (uvízla na
 * chybě, byla omylem ignorovaná, nebo na ni prostě nikdo nekliknul).
 */
export function WhatsAppAuditModal({ isOpen, onClose, onOpenMessage }: WhatsAppAuditModalProps) {
  const [days, setDays] = useState(14);
  const [messages, setMessages] = useState<WhatsAppIncoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [runningAutoParse, setRunningAutoParse] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const data = await fetchAllWhatsAppMessagesSince(since.toISOString());
      setMessages(data);
    } catch (e) {
      console.error('Chyba při načítání kontrolního přehledu WhatsApp zpráv:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, days]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, processing: 0, parsed: 0, imported: 0, error: 0, ignored: 0 };
    messages.forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
    return c;
  }, [messages]);

  const needsAttentionCount = counts.pending + counts.processing + counts.parsed + counts.error;

  const shown = onlyNeedsAttention
    ? messages.filter((m) => m.status !== 'imported' && m.status !== 'ignored')
    : messages;

  async function handleRetry(id: string) {
    setRetrying(id);
    try {
      await updateWhatsAppMessageStatus(id, 'pending');
      await load();
    } catch (e) {
      chyba(`Nepodařilo se vrátit zprávu do fronty: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRetrying(null);
    }
  }

  async function handleRunAutoParse() {
    setRunningAutoParse(true);
    try {
      await triggerAutoParse();
      await load();
    } catch (e) {
      chyba(`AI zpracování se nepodařilo spustit: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRunningAutoParse(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Kontrola WhatsApp zpráv" wide>
      <div className="space-y-4">
        <p className="text-xs text-neutral-500 font-medium">
          Zobrazuje VŠECHNY přijaté zprávy za zvolené období bez ohledu na stav — i ty, co uvízly
          na chybě, nebo byly omylem ignorované. Pokud appka zprávu vůbec nedostala (špatný
          odesílatel, výpadek mobilu), tady se neobjeví — to je potřeba zkontrolovat na telefonu.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`tap px-3 py-1.5 rounded text-xs font-black transition ${
                  days === d ? 'bg-white text-neutral-900 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-amber-50'
                }`}
              >
                {d} dní
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunAutoParse}
              disabled={runningAutoParse}
              className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-800 text-white text-xs font-black shadow-xs flex items-center gap-1.5 disabled:opacity-50 tap"
              title="Spustit AI zpracování nevyřízených zpráv"
            >
              <Zap size={14} /> {runningAutoParse ? 'Zpracovávám…' : 'Zpracovat nevyřízené'}
            </button>
            <button type="button" onClick={load} className="p-1.5 rounded text-neutral-600 hover:bg-neutral-100 tap" title="Obnovit">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Souhrn podle stavu */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {(Object.keys(STATUS_LABEL) as WhatsAppIncoming['status'][]).map((s) => (
            <div key={s} className={`rounded border px-2 py-1.5 text-center ${STATUS_STYLE[s]}`}>
              <div className="text-lg font-black leading-none">{counts[s] || 0}</div>
              <div className="text-[11px] font-bold uppercase leading-tight mt-0.5">{STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>

        {needsAttentionCount > 0 && (
          <div className="flex items-center gap-2 p-3 rounded bg-amber-50 border-2 border-amber-300 text-xs font-black text-amber-900">
            <ShieldAlert size={16} className="text-amber-600 shrink-0" />
            <span><AlertTriangle className="ikona-text" /> {needsAttentionCount}× zpráva ještě nemá výsledek (čeká, zpracovává se, nebo skončila chybou) — zkontroluj níže.</span>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyNeedsAttention}
            onChange={(e) => setOnlyNeedsAttention(e.target.checked)}
            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500"
          />
          Zobrazit jen to, co potřebuje pozornost (skrýt naimportované a ignorované)
        </label>

        {loading ? (
          <div className="py-10 text-center"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="py-10 text-center text-neutral-500">
            <MessageSquare size={40} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-bold">{onlyNeedsAttention ? 'Nic nečeká na vyřízení.' : 'Za zvolené období nejsou žádné zprávy.'}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {shown.map((m) => (
              <div
                key={m.id}
                className={`border rounded p-3 ${
                  m.status === 'pending' || m.status === 'parsed'
                    ? 'cursor-pointer hover:border-amber-300 hover:bg-amber-50/40'
                    : ''
                }`}
                onClick={() => {
                  if (m.status === 'pending' || m.status === 'parsed') onOpenMessage?.(m);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-neutral-900">{m.sender_name}</span>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {new Date(m.message_timestamp || m.created_at).toLocaleString('cs-CZ')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-black ${STATUS_STYLE[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-700 bg-neutral-50 p-2 rounded mt-1.5 line-clamp-2">
                      {m.message_text?.slice(0, 220)}{(m.message_text?.length ?? 0) > 220 ? '…' : ''}
                    </div>
                    {(m.status === 'error' || m.status === 'ignored') && m.error_message && (
                      <div className="text-[11px] text-rose-700 font-bold mt-1"><AlertTriangle className="ikona-text" /> {m.error_message}</div>
                    )}
                    {m.status === 'imported' && (
                      <div className="text-[11px] text-emerald-700 font-bold mt-1">
                        <Check className="ikona-text" /> Vytvořeno {m.imported_at ? new Date(m.imported_at).toLocaleString('cs-CZ') : ''}
                      </div>
                    )}
                  </div>
                  {(m.status === 'error' || m.status === 'ignored') && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRetry(m.id); }}
                      disabled={retrying === m.id}
                      className="shrink-0 px-2.5 py-1.5 rounded bg-sky-100 hover:bg-sky-200 text-sky-900 text-[11px] font-black transition disabled:opacity-50 tap"
                    >
                      {retrying === m.id ? '…' : 'Vrátit do fronty'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
