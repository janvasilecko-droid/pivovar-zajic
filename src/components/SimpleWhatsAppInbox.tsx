import React, { useEffect, useState } from 'react';
import { taskerShareService } from '../lib/taskerShareService';

interface WhatsAppMessage {
  id: string;
  messageText: string;
  sender: string;
  createdAt: Date;
}

const SimpleWhatsAppInbox: React.FC = () => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  useEffect(() => {
    if (!initialized) {
      initializeStore();
      taskerShareService.initialize();
    }
  }, [initialized]);

  const initializeStore = () => {
    // Načíst zprávy z localStorage
    try {
      const stored = localStorage.getItem('whatsapp_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((m: any) => ({
          ...m,
          createdAt: new Date(m.createdAt)
        })));
      }
      setInitialized(true);
    } catch (error) {
      console.error('Error loading WhatsApp messages:', error);
    }
  };

  const deleteMessage = (id: string) => {
    const updated = messages.filter(m => m.id !== id);
    setMessages(updated);
    localStorage.setItem('whatsapp_messages', JSON.stringify(updated));
  };
  
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('cs-CZ');
  };
  
  const selected = selectedId ? messages.find((m: any) => m.id === selectedId) : null;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b pb-3">
        <div>
          <h2 className="text-lg font-semibold">WhatsApp zprávy</h2>
          <p className="text-sm text-gray-600">{messages.length} zpráv</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
        >
          Obnovit
        </button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Seznam */}
        <div className="bg-white rounded-lg border">
          {messages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-3xl mb-3">📱</div>
              <p className="font-medium mb-2">Žádné zprávy</p>
              <p className="text-sm">WhatsApp zprávy se zobrazí zde</p>
            </div>
          ) : (
            <div className="divide-y">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedId(msg.id)}
                  className={`p-3 cursor-pointer ${selectedId === msg.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium mb-1">{msg.sender}</div>
                      <div className="text-sm text-gray-600 mb-1">
                        {formatDate(msg.createdAt)} {formatTime(msg.createdAt)}
                      </div>
                      <div className="text-sm text-gray-800 truncate">
                        {msg.messageText}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMessage(msg.id);
                      }}
                      className="ml-2 p-1 text-gray-500 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Detail */}
        <div>
          {selected ? (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Detail zprávy</h3>
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">
                  <span className="font-medium">Odesílatel:</span> {selected.sender}
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  <span className="font-medium">Čas:</span> {formatDate(selected.createdAt)} {formatTime(selected.createdAt)}
                </div>
                <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
                  {selected.messageText}
                </div>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(selected.messageText)}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
              >
                📋 Kopírovat text
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border p-8 text-center text-gray-500">
              <div className="text-3xl mb-3">📄</div>
              <p>Vyberte zprávu pro zobrazení</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleWhatsAppInbox;