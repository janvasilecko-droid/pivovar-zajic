export class TaskerShareService {
  private static instance: TaskerShareService;
  
  private constructor() {
    // Inicializace bez store
  }
  
  static getInstance(): TaskerShareService {
    if (!TaskerShareService.instance) {
      TaskerShareService.instance = new TaskerShareService();
    }
    return TaskerShareService.instance;
  }
  
  /**
   * Zpracuje sdílený text z Taskeru/Android Share
   */
  processSharedText(text: string): string {
    if (!text || !text.trim()) {
      throw new Error('Text cannot be empty');
    }
    
    console.log('[TaskerShare] Processing shared text:', text.substring(0, 100));
    
    // Parsování WhatsApp zprávy (jednoduché)
    const parsed = this.parseWhatsAppMessage(text);
    
    // Přidání zprávy do localStorage
    const messageId = this.addMessageToStorage(
      parsed.message,
      parsed.sender,
      parsed.timestamp
    );
    
    // Automatická klasifikace zprávy
    this.classifyMessage(messageId);
    
    return messageId;
  }
  
  /**
   * Jednoduché parsování WhatsApp zprávy
   * Formát: "Jméno Odesílatele: Text zprávy"
   */
  private parseWhatsAppMessage(text: string): {
    sender: string;
    message: string;
    timestamp: Date;
  } {
    const lines = text.trim().split('\n');
    
    if (lines.length === 0) {
      return {
        sender: 'Unknown',
        message: text,
        timestamp: new Date(),
      };
    }
    
    // Zkusíme extrahovat odesílatele z prvního řádku
    let sender = 'WhatsApp';
    let message = text;
    
    // Typický formát WhatsApp notifikace
    const firstLine = lines[0];
    const senderMatch = firstLine.match(/^([^:]+):/);
    if (senderMatch && senderMatch[1]) {
      sender = senderMatch[1].trim();
      message = lines.slice(1).join('\n').trim() || text;
    }
    
    // Zkusíme najít timestamp v textu
    const dateMatch = text.match(/(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}|\d{1,2}:\d{2})/);
    const timestamp = dateMatch ? new Date() : new Date();
    
    return {
      sender,
      message,
      timestamp,
    };
  }
  
  /**
   * Přidá zprávu do localStorage a vrátí ID
   */
  private addMessageToStorage(message: string, sender: string, timestamp: Date): string {
    const messageId = Date.now().toString() + Math.random().toString(36).substring(2);
    
    try {
      const stored = localStorage.getItem('whatsapp_messages');
      const messages = stored ? JSON.parse(stored) : [];
      
      const newMessage = {
        id: messageId,
        messageText: message,
        sender: sender,
        createdAt: timestamp.toISOString()
      };
      
      messages.push(newMessage);
      localStorage.setItem('whatsapp_messages', JSON.stringify(messages));
      
      return messageId;
    } catch (error) {
      console.error('[TaskerShare] Error saving message to storage:', error);
      return messageId;
    }
  }

  /**
   * Načte zprávu z localStorage
   */
  private getMessageFromStorage(messageId: string): any {
    try {
      const stored = localStorage.getItem('whatsapp_messages');
      const messages = stored ? JSON.parse(stored) : [];
      return messages.find((m: any) => m.id === messageId);
    } catch (error) {
      console.error('[TaskerShare] Error loading message from storage:', error);
      return null;
    }
  }

  /**
   * Klasifikuje zprávu - detekuje, zda obsahuje objednávku
   */
  private classifyMessage(messageId: string): void {
    try {
      const message = this.getMessageFromStorage(messageId);
      if (!message) return;
      
      const text = message.messageText.toLowerCase();
      
      // Jednoduchá detekce objednávek
      const orderKeywords = [
        'objednávka', 'objednavka', 'potřebujeme', 'dodání', 'dodani',
        'pivo', 'piva', 'sud', 'sudů', 'sudovy', 'lahve', 'litr',
        '12°', '13°', '11°', 'světlý', 'tmavý', 'jantar',
        'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek',
        'na pondělí', 'na úterý', 'na středu', 'na čtvrtek', 'na pátek'
      ];
      
      const isOrder = orderKeywords.some(keyword => text.includes(keyword));
      
      if (isOrder) {
        console.log(`[TaskerShare] Message ${messageId} classified as order`);
        
        // Pokud je to objednávka, můžeme ji automaticky zpracovat později
        // Prozatím pouze zaznamenáme
      }
    } catch (error) {
      console.error('[TaskerShare] Error classifying message:', error);
    }
  }
  
  /**
   * Inicializuje službu a nastaví globální funkci pro přijetí textu
   */
  initialize(): void {
    if (typeof window !== 'undefined') {
      // Globální funkce pro Android Intent
      (window as any).receiveSharedText = (text: string) => {
        try {
          const messageId = this.processSharedText(text);
          console.log(`[TaskerShare] Shared text received and stored as message: ${messageId}`);
          
          // Notifikace uživateli
          if (typeof (window as any).showToast === 'function') {
            (window as any).showToast('WhatsApp zpráva přijata');
          }
        } catch (error) {
          console.error('[TaskerShare] Error processing shared text:', error);
        }
      };
    }
  }
}

// Export singleton instance
export const taskerShareService = TaskerShareService.getInstance();