import { useState, useEffect } from 'react';
import { Beer, Package, Place } from '../lib/supabase';
import { WhatsAppIncoming, fetchPendingWhatsAppMessages, ignoreWhatsAppMessage } from '../lib/whatsappApi';
import { Modal, Spinner } from './ui';
import { MessageSquare, RefreshCw, Trash2 } from 'lucide-react';

interface WhatsAppIncomingModalProps {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  places: Place[];
  onImport: (orders: any) => Promise<void>;
  /** Otevře kontrolu zprávy (rozparsované položky + schválení/zamítnutí). */
  onOpenMessage?: (message: WhatsAppIncoming) => void;
}

export function WhatsAppIncomingModal(props: WhatsAppIncomingModalProps) {
  const [messages, setMessages] = useState<WhatsAppIncoming[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (props.isOpen) {
      loadMessages();
    }
  }, [props.isOpen]);

  async function loadMessages() {
    setLoading(true);
    try {
      const data = await fetchPendingWhatsAppMessages();
      setMessages(data);
    } catch (error) {
      console.error('Error loading WhatsApp messages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleIgnoreMessage(id: string) {
    try {
      await ignoreWhatsAppMessage(id);
      await loadMessages();
    } catch (error) {
      console.error('Error ignoring message:', error);
    }
  }

  return (
    <>
      <Modal open={props.isOpen} onClose={props.onClose} title="Příchozí WhatsApp zprávy" wide>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              {messages.length > 0 ? `${messages.length} zpráv čeká na zpracování` : 'Žádné nové zprávy'}
            </div>
            <button onClick={loadMessages} className="p-1.5 rounded text-neutral-600 hover:bg-neutral-100">
              <RefreshCw size={16} />
            </button>
          </div>

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
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => props.onOpenMessage?.(message)}
                  className={`border rounded p-4 cursor-pointer transition hover:border-blue-300 hover:bg-blue-50/40 ${message.status === 'error' ? 'border-rose-300 bg-rose-50/40' : ''}`}
                  title="Klepnutím otevřete kontrolu objednávky"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="text-sm font-medium">{message.sender_name}</div>
                        <div className="text-xs text-neutral-500">
                          {new Date(message.message_timestamp || message.created_at).toLocaleDateString('cs-CZ')}
                        </div>
                        {message.status === 'error' && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white shrink-0">❌ Chyba</span>
                        )}
                      </div>
                      <div className="text-sm bg-neutral-50 p-3 rounded">
                        {message.message_text.substring(0, 200)}
                        {message.message_text.length > 200 && '...'}
                      </div>
                      {message.status === 'error' && message.error_message && (
                        <div className="text-xs text-rose-700 font-semibold mt-1.5 bg-rose-50 border border-rose-200 rounded px-2 py-1">
                          {message.error_message}
                        </div>
                      )}
                      <div className="text-xs text-blue-600 mt-1 font-medium">
                        {message.status === 'error' ? 'Klepnutím zkusit znovu →' : 'Klepnutím zkontrolovat objednávku →'}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleIgnoreMessage(message.id); }}
                        className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100"
                        title="Ignorovat zprávu"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}