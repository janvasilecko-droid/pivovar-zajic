import { useState, useEffect, useMemo } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import { WhatsAppIncoming, fetchPendingWhatsAppMessages, updateWhatsAppMessageStatus, fetchWhatsAppSenders, isSenderAllowed, fetchRecentWhatsAppMessages, type WhatsAppSender } from '../lib/whatsappApi';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';
import { analyzeReadback, findRepeatedReadbackErrors, findSimilarMessages, type RepeatedReadbackError } from '../lib/whatsappReadback';
import { Modal, Spinner } from './ui';
import { MessageSquare, AlertCircle, Check, X, RefreshCw, Trash2, Square, CheckSquare, Image as ImageIcon, Filter, ArrowDownUp, Clock, Copy, Download } from 'lucide-react';

interface WhatsAppAutoProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  onImport: (orders: any) => Promise<void>;
  /** Otevře detail zprávy (celý text + rozparsované položky + schválení/zamítnutí). */
  onOpenMessage?: (message: WhatsAppIncoming) => void;
  /** Když se změní, seznam se znovu načte (potvrzené/zamítnuté zprávy zmizí). */
  refreshKey?: number;
}

// U fotoobjednávek nemá kontrola čtení (diff popisku zprávy vs. přepisu
// fotky) smysl — popisek typu "Maneo" nikdy neobsahuje text položek, takže
// by vždy hlásil nesoulady. Tam kontrolu řeší tlačítko "Zkontrolovat fotku
// a potvrdit" v detailu zprávy, ne tenhle textový diff.
function mismatchCountFor(m: WhatsAppIncoming): number {
  if (m.media_url) return 0;
  return analyzeReadback(m).mismatchCount;
}

function formatWaitTime(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'právě teď';
  if (minutes < 60) return `čeká ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `čeká ${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `čeká ${days} d`;
}

export function WhatsAppAutoProcessorModal(props: WhatsAppAutoProcessorModalProps) {
  const [messages, setMessages] = useState<WhatsAppIncoming[]>([]);
  const [recentMessages, setRecentMessages] = useState<WhatsAppIncoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [parsedResults, setParsedResults] = useState<Map<string, any>>(new Map());
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allowedSenders, setAllowedSenders] = useState<WhatsAppSender[]>([]);
  // Filtr „jen ⚠" a řazení (#8)
  const [filterMismatchOnly, setFilterMismatchOnly] = useState(false);
  const [sortMode, setSortMode] = useState<'newest' | 'mismatch'>('newest');

  useEffect(() => {
    fetchWhatsAppSenders().then(setAllowedSenders).catch(() => {});
  }, []);

  useEffect(() => {
    if (props.isOpen) {
      loadMessages();
    }
  }, [props.isOpen, props.refreshKey]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadMessages() {
    setLoading(true);
    try {
      const data = await fetchPendingWhatsAppMessages();
      setMessages(data);
      setParsedResults(new Map());
      // Statistika kontroly čtení z posledních 100 zpráv (#13) + opakované
      // chyby (#14) + duplicity (#25).
      fetchRecentWhatsAppMessages(100).then(setRecentMessages).catch(() => {});
    } catch (error) {
      console.error('Error loading WhatsApp messages:', error);
    } finally {
      setLoading(false);
    }
  }

  // Statistika čekajících zpráv.
  const listStats = useMemo(() => {
    const parsed = messages.filter((m) => m.status === 'parsed' || parsedResults.has(m.id));
    const mismatched = messages.filter((m) => mismatchCountFor(m) > 0);
    return { total: messages.length, parsed: parsed.length, mismatched: mismatched.length };
  }, [messages, parsedResults]);

  // Statistika z posledních 100 zpráv (bez čekajících) — přesnost čtení.
  const recentStats = useMemo(() => {
    const done = recentMessages.filter((m) => m.status !== 'pending');
    let ok = 0;
    let mismatch = 0;
    let noItems = 0;
    for (const m of done) {
      const rb = analyzeReadback(m);
      if (rb.items.length === 0) { noItems++; continue; }
      if (mismatchCountFor(m) === 0) ok++;
      else mismatch++;
    }
    return { total: done.length, ok, mismatch, noItems };
  }, [recentMessages]);

  // Opakované chyby čtení (#14) a podobné/duplicitní zprávy (#25).
  const repeatedErrors: RepeatedReadbackError[] = useMemo(
    () => findRepeatedReadbackErrors(recentMessages.length > 0 ? recentMessages : messages),
    [recentMessages, messages]
  );
  const similarPairs = useMemo(() => findSimilarMessages(messages), [messages]);
  const similarIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of similarPairs) { ids.add(p.first.id); ids.add(p.second.id); }
    return ids;
  }, [similarPairs]);

  const visibleMessages = useMemo(() => {
    let list = messages;
    if (filterMismatchOnly) {
      list = list.filter((m) => mismatchCountFor(m) > 0);
    }
    if (sortMode === 'mismatch') {
      list = [...list].sort((a, b) => {
        const diff = mismatchCountFor(b) - mismatchCountFor(a);
        if (diff !== 0) return diff;
        const timeB = new Date(b.message_timestamp || b.created_at).getTime();
        const timeA = new Date(a.message_timestamp || a.created_at).getTime();
        return timeB - timeA;
      });
    }
    return list;
  }, [messages, filterMismatchOnly, sortMode]);

  async function importOrder(messageId: string) {
    const parsedResult = parsedResults.get(messageId);
    if (!parsedResult) return;

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const orderData = {
        placeId: parsedResult.placeId,
        placeNameFree: parsedResult.placeName || 'Neznámý odběratel',
        orderDate: new Date().toISOString().split('T')[0],
        deliveryDay: parsedResult.deliveryDay || 'po',
        deliveryDate: parsedResult.deliveryDate || new Date().toISOString().split('T')[0],
        note: parsedResult.note || '',
        whatsappMessageId: message.id, // zpětný odkaz objednávka → zpráva (#18)
        items: parsedResult.items.map((item: any) => ({
          beerId: item.beer_id,
          pkgId: item.package_id,
          qty: item.quantity
        }))
      };

      await props.onImport([orderData]);
      await updateWhatsAppMessageStatus(messageId, 'imported');

      const newResults = new Map(parsedResults);
      newResults.delete(messageId);
      setParsedResults(newResults);

      await loadMessages();
      setStatus(`Objednávka od ${message.sender_name} byla úspěšně importována`);
    } catch (error) {
      console.error('Error importing order:', error);
      setStatus(`Chyba při importu: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function ignoreMessage(messageId: string) {
    try {
      await updateWhatsAppMessageStatus(messageId, 'ignored');
      await loadMessages();
    } catch (error) {
      console.error('Error ignoring message:', error);
    }
  }

  function getMessageStatus(message: WhatsAppIncoming) {
    if (parsedResults.has(message.id)) {
      return 'parsed';
    }
    return message.status;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'parsed': return 'bg-green-100 text-green-800';
      case 'imported': return 'bg-emerald-100 text-emerald-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'ignored': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'pending': return <AlertCircle size={14} />;
      case 'processing': return <RefreshCw size={14} className="animate-spin" />;
      case 'parsed': return <Check size={14} />;
      case 'imported': return <Check size={14} />;
      case 'error': return <X size={14} />;
      case 'ignored': return <X size={14} />;
      default: return <AlertCircle size={14} />;
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case 'pending': return 'Čeká na zpracování';
      case 'processing': return 'Zpracovává se';
      case 'parsed': return 'Rozpoznáno';
      case 'imported': return 'Importováno';
      case 'error': return 'Chyba';
      case 'ignored': return 'Ignorováno';
      default: return 'Neznámý stav';
    }
  }

  async function processMessages(targets?: WhatsAppIncoming[]) {
    const list = targets ?? messages;
    if (list.length === 0) return;

    setProcessing(true);
    setProgress(0);

    const results = new Map<string, any>();
    let processed = 0;
    for (const message of list) {
      try {
        setStatus(`Zpracovávám zprávu od ${message.sender_name}...`);

        // 🧠 AI čtení — stejná cesta (parse-order-text + parseGeminiItems)
        // jako automatické zpracování i čtení z fotky.
        const parsed = await parseWhatsAppOrderMessageWithAI(
          message.message_text,
          props.beers,
          props.packages,
          props.places,
          message.sender_name,
          message.message_timestamp,
          undefined,
          undefined,
          message.id,
          message.media_url ?? null
        );

        results.set(message.id, parsed);
        await updateWhatsAppMessageStatus(message.id, 'parsed');

        processed++;
        setProgress((processed / list.length) * 100);

      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        await updateWhatsAppMessageStatus(
          message.id,
          'error',
          error instanceof Error ? error.message : 'Unknown error'
        );
        processed++;
      }
    }

    setParsedResults(results);
    setProcessing(false);
    setStatus('Zpracování dokončeno');
    await loadMessages();
  }

  if (!props.isOpen) return null;

  return (
    <Modal open={props.isOpen} onClose={props.onClose} title="🤖 Automatické zpracování WhatsApp" wide>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-neutral-600">
            {messages.length > 0
              ? `${messages.length} zpráv čeká na zpracování`
              : 'Žádné nové zprávy'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadMessages()}
              disabled={processing}
              className="p-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
              title="Obnovit seznam"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => processMessages()}
              disabled={processing || messages.length === 0}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Zpracovává se...' : 'Zpracovat automaticky'}
            </button>
            <button
              onClick={() => processMessages(messages.filter((m) => selectedIds.has(m.id)))}
              disabled={processing || selectedIds.size === 0}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Načíst vybrané ({selectedIds.size})
            </button>
          </div>
        </div>

        {/* Filtr „jen ⚠" a řazení (#8) */}
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <button
            onClick={() => setFilterMismatchOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-sm font-medium flex items-center gap-1.5 ${
              filterMismatchOnly
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
            title="Zobrazit pouze zprávy, kde přepis AI nesouhlasí s originálem"
          >
            <Filter size={14} />
            Jen ⚠ nesoulady ({listStats.mismatched})
          </button>
          <label className="flex items-center gap-1.5 text-xs text-neutral-500">
            <ArrowDownUp size={14} />
            Řadit:
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as 'newest' | 'mismatch')}
              className="select !py-0.5 !px-1.5 text-xs"
            >
              <option value="newest">nejnovější</option>
              <option value="mismatch">podle počtu ⚠</option>
            </select>
          </label>
        </div>

        {/* Statistika kontroly čtení (#13) */}
        {(messages.length > 0 || recentStats.total > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-2 text-center">
              <div className="text-neutral-500">Čeká na schválení</div>
              <div className="text-lg font-bold text-neutral-800">{listStats.total}</div>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-2 text-center">
              <div className="text-green-700">Rozparsováno</div>
              <div className="text-lg font-bold text-green-800">{listStats.parsed}</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-center">
              <div className="text-amber-700">⚠ v čekajících</div>
              <div className="text-lg font-bold text-amber-800">{listStats.mismatched}</div>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2 text-center" title="Z posledních 100 zpracovaných zpráv">
              <div className="text-blue-700">Přesnost čtení (100)</div>
              <div className="text-lg font-bold text-blue-800">
                {recentStats.total > recentStats.noItems
                  ? `${Math.round((recentStats.ok / (recentStats.total - recentStats.noItems)) * 100)} %`
                  : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Opakované chyby čtení (#14) — návrh na naučení aliasu */}
        {repeatedErrors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-medium text-amber-800 mb-1.5 flex items-center gap-1.5">
              <AlertCircle size={13} />
              Opakované chyby čtení — opravte položku v detailu a AI si to zapamatuje:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {repeatedErrors.slice(0, 5).map((err, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-white border border-amber-300 text-[11px] text-amber-800">
                  „{err.rawLine}" · {err.sender} ({err.count}×)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Možná duplicita (#25) */}
        {similarPairs.length > 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div className="text-xs font-medium text-orange-800 mb-1.5 flex items-center gap-1.5">
              <Copy size={13} />
              Možná duplicitní objednávka — dvě zprávy mají téměř stejný obsah:
            </div>
            <div className="text-[11px] text-orange-700 space-y-0.5">
              {similarPairs.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium">{p.first.sender_name}</span> ⇄ <span className="font-medium">{p.second.sender_name}</span>
                  <span className="opacity-70">(„{p.first.message_text.slice(0, 40)}…") · shoda {Math.round(p.score * 100)} %</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {processing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{status}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status && !processing && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm text-blue-800">{status}</div>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center">
            <Spinner />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
            <p>{filterMismatchOnly ? 'Žádné zprávy s nesouladem čtení' : 'Žádné nové WhatsApp zprávy'}</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {visibleMessages.map((message) => {
              const status = getMessageStatus(message);
              const parsedResult = parsedResults.get(message.id);
              const rb = analyzeReadback(message);
              // U fotoobjednávek nemá textový diff smysl (viz mismatchCountFor výše).
              const isMismatch = !message.media_url && rb.mismatchCount > 0;
              const isRepeated = repeatedErrors.some((err) => err.messageIds.includes(message.id));
              const isDup = similarIds.has(message.id);

              return (
                <div
                  key={message.id}
                  onClick={() => props.onOpenMessage && props.onOpenMessage(message)}
                  className={`border rounded-xl p-4 cursor-pointer transition hover:border-blue-300 hover:bg-blue-50/40 ${
                    selectedIds.has(message.id) ? 'border-emerald-300 bg-emerald-50/40' : isMismatch ? 'border-amber-200 bg-amber-50/30' : ''
                  }`}
                  title="Klepnutím otevřete celou zprávu"
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelected(message.id); }}
                      className="mt-0.5 p-1 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-blue-600 shrink-0"
                      title="Označit zprávu k načtení"
                    >
                      {selectedIds.has(message.id)
                        ? <CheckSquare size={18} className="text-emerald-600" />
                        : <Square size={18} />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="text-sm font-medium">{message.sender_name}</div>
                        {!isSenderAllowed(allowedSenders, message.sender_name) && (
                          <span
                            className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800"
                            title="Odesílatel není v seznamu povolených"
                          >
                            nepovolený odesílatel
                          </span>
                        )}
                        <div className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${getStatusColor(status)}`}>
                          {getStatusIcon(status)}
                          {getStatusText(status)}
                        </div>
                        {isMismatch && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${
                              rb.unmatchedCount > 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                            }`}
                            title={
                              rb.unmatchedCount > 0
                                ? `${rb.unmatchedCount} položek se v originálu nenašlo`
                                : `${rb.partialCount} položek částečně souhlasí`
                            }
                          >
                            ⚠ {rb.unmatchedCount > 0 ? rb.unmatchedCount : rb.partialCount} × nesouhlasí
                          </span>
                        )}
                        {isRepeated && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 flex items-center gap-1" title="Opakovaná chyba čtení — oprava se naučí jako alias">
                            <AlertCircle size={12} /> opakovaná chyba
                          </span>
                        )}
                        {isDup && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800 flex items-center gap-1" title="Další zpráva má téměř stejný obsah">
                            <Copy size={12} /> možná duplicita
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${
                            isMismatch && Date.now() - new Date(message.message_timestamp || message.created_at).getTime() > 60 * 60 * 1000
                              ? 'bg-red-50 text-red-700'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                          title="Čas čekání na zpracování"
                        >
                          <Clock size={11} /> {formatWaitTime(message.message_timestamp || message.created_at)}
                        </span>
                      </div>

                      {/* Náhled fotky (#22) — DeepSeek fotky nečte, odkaz umožní stažení */}
                      {message.media_url && (
                        <div className="flex items-center gap-1 mb-2">
                          <img
                            src={message.media_url}
                            alt="Příloha"
                            className="h-16 w-16 object-cover rounded-lg border"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <a
                            href={message.media_url}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-blue-600"
                            title="Stáhnout fotografii"
                          >
                            <Download size={16} />
                          </a>
                        </div>
                      )}

                      <div className="text-xs text-neutral-500">
                        {new Date(message.message_timestamp || message.created_at).toLocaleDateString('cs-CZ')}
                        {message.parsed_delivery_date ? ` · dodání ${message.parsed_delivery_date}` : ''}
                      </div>
                      <div className="text-sm bg-neutral-50 p-3 rounded-lg mt-2">
                        {message.message_text.substring(0, 104).trim()}
                        {message.message_text.length > 104 && '...'}
                      </div>
                      <div className="text-xs text-blue-600 mt-1 font-medium">
                        Klepnutím zobrazit celou zprávu →
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      {parsedResult && parsedResult.items && parsedResult.items.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); importOrder(message.id); }}
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                          title="Importovat objednávku"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); processMessages([message]); }}
                        disabled={processing}
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                        title="Přečíst / rozparsovat přes AI"
                      >
                        <RefreshCw size={16} className={processing ? "animate-spin" : ""} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); ignoreMessage(message.id); }}
                        className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"
                        title="Ignorovat zprávu"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}


