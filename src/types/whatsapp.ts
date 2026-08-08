export interface WhatsAppMessage {
  id: string;
  createdAt: Date;
  sender: string;
  senderNumber?: string;
  messageText: string;
  messageTimestamp: Date;
  status: 'received' | 'processing' | 'done' | 'error';
  parsedOrderId?: string;
  errorMessage?: string;
  
  // Lokální metadata
  isProcessing?: boolean;
  processingError?: string;
}

export interface WhatsAppMessageStore {
  messages: WhatsAppMessage[];
  addMessage: (text: string, sender?: string, timestamp?: Date) => string;
  deleteMessage: (id: string) => void;
  updateMessageStatus: (id: string, status: WhatsAppMessage['status'], error?: string) => void;
  markAsDone: (id: string, orderId: string) => void;
  getUnprocessedMessages: () => WhatsAppMessage[];
  getMessage: (id: string) => WhatsAppMessage | undefined;
}

export interface TaskerShareData {
  text: string;
  sender?: string;
  timestamp?: Date;
}