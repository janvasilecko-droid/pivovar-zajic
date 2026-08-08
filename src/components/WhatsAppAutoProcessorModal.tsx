import { useState, useEffect } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import { WhatsAppIncoming, fetchPendingWhatsAppMessages, updateWhatsAppMessageStatus, fetchWhatsAppSenders, isSenderAllowed, type WhatsAppSender } from '../lib/whatsappApi';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';
import { Modal, Spinner } from './ui';
import { MessageSquare, AlertCircle, Check, X, RefreshCw, Trash2, Square, CheckSquare } from 'lucide-react';

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

export function WhatsAppAutoProcessorModal(props: WhatsAppAutoProcessorModalProps) {
  const [messages, setMessages] = useState<WhatsAppIncoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [parsedResults, setParsedResults] = useState<Map<string, any>>(new Map());
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allowedSenders, setAllowedSenders] = useState<WhatsAppSender[]>([]);

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
    } catch (error) {
      console.error('Error loading WhatsApp messages:', error);
    } finally {
      setLoading(false);
    }
  }

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
        // jako automatické zpracování i čtení z fotky. Nahrazuje starý
        // heuristický regex parser (parseVoiceOrder), který špatně přiřazoval
        // piva/obaly u textových objednávek.
        const parsed = await parseWhatsAppOrderMessageWithAI(
          message.message_text,
          props.beers,
          props.packages,
          props.places,
          message.sender_name,
          message.message_timestamp
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
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-600">
            {messages.length > 0
              ? `${messages.length} zpráv čeká na zpracování`
              : 'Žádné nové zprávy'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadMessages}
              className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100"
              disabled={processing}
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
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
            <p>Žádné nové WhatsApp zprávy</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {messages.map((message) => {
              const status = getMessageStatus(message);
              const parsedResult = parsedResults.get(message.id);

              return (
                <div
                  key={message.id}
                  onClick={() => props.onOpenMessage && props.onOpenMessage(message)}
                  className={`border rounded-xl p-4 cursor-pointer transition hover:border-blue-300 hover:bg-blue-50/40 ${selectedIds.has(message.id) ? 'border-emerald-300 bg-emerald-50/40' : ''}`}
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
                            title="Odesílatel není v seznamu povolených — zprávu lze načíst pouze ručně"
                          >
                            nepovolený odesílatel
                          </span>
                        )}
                        <div className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${getStatusColor(status)}`}>
                          {getStatusIcon(status)}
                          {getStatusText(status)}
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {new Date(message.created_at).toLocaleDateString('cs-CZ')}
                      </div>
                      <div className="text-sm bg-neutral-50 p-3 rounded-lg mt-2">
                        {message.message_text.substring(0,104).trim()}
                        {message.message_text.length > 104 && '...'}
                      </div>
                      <div className="text-xs text-blue-600 mt-1 font-medium">
                        Klepnutím zobrazit celou zprávu →
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
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

