import { supabase } from './supabase';

// Interface for WhatsApp incoming message
export interface WhatsAppIncoming {
  id: string;
  created_at: string;
  sender_name: string;
  sender_number?: string;
  message_text: string;
  message_timestamp?: string;
  message_type: string;
  status: 'pending' | 'processing' | 'parsed' | 'imported' | 'error' | 'ignored';
  error_message?: string;
  parsed_place_id?: string | null;
  parsed_place_name?: string | null;
  parsed_delivery_day?: string | null;
  parsed_delivery_date?: string | null;
  parsed_note?: string | null;
  /** Doslovný přepis zprávy od AI (raw_text) — pro kontrolu, že AI přečetla zprávu správně. */
  parsed_raw_text?: string | null;
  /** URL fotky/přílohy. Fotky z WhatsApp stahuje whatsapp-bridge a ukládá je do
      veřejného Supabase Storage bucketu „whatsapp-media“ (DeepSeek fotky nečte,
      proto je potřeba fotka ke zobrazení a stažení v aplikaci). */
  media_url?: string | null;
  /** Počet položek, jejichž přepis AI nesouhlasí s originálem (kontrola čtení). */
  readback_unmatched_count?: number | null;
  /** Kdy byl výsledek kontroly čtení potvrzen (audit). */
  readback_checked_at?: string | null;
  /** Kdo kontrolu čtení potvrdil (audit). */
  readback_checked_by?: string | null;
  parsed_items?: Array<{
    beer_id?: string | null;
    pkg_id?: string | null;
    qty?: number | null;
    degree?: string | null;
    beer_name?: string | null;
    package_label?: string | null;
    raw_line?: string | null;
  }>;
  imported_order_id?: string;
  imported_at?: string;
  webhook_id?: string;
  webhook_timestamp?: string;
}

// Interface for parsed order item
export interface ParsedOrderItem {
  beerId: string;
  pkgId: string;
  qty: number;
  degree?: string;
  beerName?: string;
  packageLabel?: string;
  rawLine?: string;
}

// Interface for creating order from parsed message
export interface CreateOrderFromWhatsApp {
  placeId?: string;
  placeNameFree: string;
  orderDate: string;
  deliveryDay: string;
  deliveryDate: string;
  note?: string;
  items: Array<{
    beerId: string;
    pkgId: string;
    qty: number;
  }>;
}

/**
 * Fetch pending WhatsApp messages
 */
export async function fetchPendingWhatsAppMessages(): Promise<WhatsAppIncoming[]> {
  
  const { data, error } = await supabase
    .from('whatsapp_incoming')
    .select('*')
    .in('status', ['pending', 'parsed'])
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching WhatsApp messages:', error);
    throw error;
  }
  
  // Do aplikace se ukládají jen zprávy ze skupiny „Objednávky pivovar" (webhook
  // na to filtruje), takže se vrací vše, co v DB je — každá zpráva je objednávka.
  return data || [];
}

/**
 * Fetch the number of WhatsApp messages waiting for approval (pending/parsed).
 * Počítají se všechny zprávy ze skupiny „Objednávky pivovar" (webhook jiné
 * zprávy neuloží) — každá je potenciální objednávka.
 */
export async function fetchPendingWhatsAppCount(): Promise<number> {
  const { data, error } = await supabase
    .from('whatsapp_incoming')
    .select('id')
    .in('status', ['pending', 'parsed']);

  if (error) {
    console.error('Error counting WhatsApp messages:', error);
    throw error;
  }

  return (data || []).length;
}


/**
 * Fetch WhatsApp message by ID
 */
export async function fetchWhatsAppMessage(id: string): Promise<WhatsAppIncoming | null> {
  const { data, error } = await supabase
    .from('whatsapp_incoming')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching WhatsApp message:', error);
    throw error;
  }
  
  return data;
}

/**
 * Update WhatsApp message status
 */
export async function updateWhatsAppMessageStatus(
  id: string, 
  status: WhatsAppIncoming['status'],
  errorMessage?: string
): Promise<void> {
  const updates: any = { status };
  if (errorMessage) updates.error_message = errorMessage;
  
  const { error } = await supabase
    .from('whatsapp_incoming')
    .update(updates)
    .eq('id', id);
  
  if (error) {
    console.error('Error updating WhatsApp message:', error);
    throw error;
  }
}

/**
 * Mark WhatsApp message as imported
 */
export async function markWhatsAppMessageAsImported(
  id: string, 
  orderId: string
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_incoming')
    .update({
      status: 'imported',
      imported_order_id: orderId,
      imported_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error marking WhatsApp message as imported:', error);
    throw error;
  }
}

/**
 * Ignore WhatsApp message (mark as ignored)
 */
export async function ignoreWhatsAppMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_incoming')
    .update({
      status: 'ignored',
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error ignoring WhatsApp message:', error);
    throw error;
  }
}

/**
 * Delete WhatsApp message
 */
export async function deleteWhatsAppMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_incoming')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting WhatsApp message:', error);
    throw error;
  }
}

/**
 * Trigger auto-parsing of pending messages
 */
export async function triggerAutoParse(): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-auto-parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Auto-parse failed: ${error}`);
  }
  
  return response.json();
}

/**
 * Get webhook URL for Make.com integration
 */
export function getMakeWebhookUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is not configured');
  }
  
  return `${supabaseUrl}/functions/v1/whatsapp-webhook`;
}

/**
 * Subscribe to realtime updates of WhatsApp messages
 */
// ---------------------------------------------------------------------------
// Povolení odesílatelé (whitelist) — uživatel si určuje, od kterých kontaktů
// se WhatsApp zprávy načítají automaticky.
// ---------------------------------------------------------------------------

export interface WhatsAppSender {
  id: string;
  sender_name: string;
  sender_number?: string | null;
  created_at?: string;
}

/**
 * Fetch allowed WhatsApp senders (whitelist)
 */
export async function fetchWhatsAppSenders(): Promise<WhatsAppSender[]> {
  const { data, error } = await supabase
    .from('whatsapp_senders')
    .select('*')
    .order('sender_name', { ascending: true });

  if (error) {
    console.error('Error fetching WhatsApp senders:', error);
    throw error;
  }

  return data || [];
}

/**
 * Add a new allowed sender to the whitelist
 */
export async function addWhatsAppSender(senderName: string, senderNumber?: string): Promise<void> {
  const name = (senderName || '').trim();
  if (!name) throw new Error('Zadejte jméno odesílatele');

  const { error } = await supabase
    .from('whatsapp_senders')
    .insert({
      sender_name: name,
      sender_number: senderNumber?.trim() || null,
    });

  if (error) {
    console.error('Error adding WhatsApp sender:', error);
    throw error;
  }
}

/**
 * Remove an allowed sender from the whitelist
 */
export async function removeWhatsAppSender(id: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_senders')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error removing WhatsApp sender:', error);
    throw error;
  }
}

/**
 * Normalizace názvu odesílatele/skupiny pro porovnání: malá písmena, ořezané
 * mezery, bez diakritiky. Stejná pravidla jako normName ve webhooku
 * (supabase/functions/whatsapp-webhook/index.ts), aby UI neignorovalo zprávy,
 * které brána webhooku pustila („Objednávky pivovar“ == „Objednavky pivovar“).
 */
export function normSenderName(s: string | null | undefined): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Decide whether a message from the given sender should be loaded/processed.
 * - Empty whitelist = ALLOW ALL (initial state, zpětně kompatibilní).
 * - Once at least one sender is whitelisted, only those senders are allowed.
 * - Porovnání bez diakritiky a velikosti písmen (viz normSenderName).
 */
export function isSenderAllowed(allowedSenders: WhatsAppSender[], senderName: string | null | undefined): boolean {
  if (!allowedSenders || allowedSenders.length === 0) return true;
  const name = normSenderName(senderName);
  if (!name) return false;
  return allowedSenders.some((s) => normSenderName(s.sender_name) === name);
}

export function subscribeToWhatsAppMessages(
  callback: (message: WhatsAppIncoming) => void
): () => void {
  const channel = supabase
    .channel('whatsapp_incoming_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_incoming',
      },
      (payload) => {
        callback(payload.new as WhatsAppIncoming);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_incoming',
      },
      (payload) => {
        callback(payload.new as WhatsAppIncoming);
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Uloží opravená/nově rozparsovaná data zprávy (po ručním přečtení znovu).
 */
export async function updateWhatsAppParsedData(
  id: string,
  updates: {
    parsedItems?: WhatsAppIncoming['parsed_items'];
    parsedPlaceId?: string | null;
    parsedPlaceName?: string | null;
    parsedDeliveryDay?: string | null;
    parsedDeliveryDate?: string | null;
    parsedNote?: string | null;
    parsedRawText?: string | null;
    readbackUnmatchedCount?: number | null;
  }
): Promise<void> {
  const payload: any = { status: 'parsed' };
  if (updates.parsedItems !== undefined) payload.parsed_items = updates.parsedItems;
  if (updates.parsedPlaceId !== undefined) payload.parsed_place_id = updates.parsedPlaceId || null;
  if (updates.parsedPlaceName !== undefined) payload.parsed_place_name = updates.parsedPlaceName || null;
  if (updates.parsedDeliveryDay !== undefined) payload.parsed_delivery_day = updates.parsedDeliveryDay || null;
  if (updates.parsedDeliveryDate !== undefined) payload.parsed_delivery_date = updates.parsedDeliveryDate || null;
  if (updates.parsedNote !== undefined) payload.parsed_note = updates.parsedNote || null;
  if (updates.parsedRawText !== undefined) payload.parsed_raw_text = updates.parsedRawText || null;
  if (updates.readbackUnmatchedCount !== undefined) payload.readback_unmatched_count = updates.readbackUnmatchedCount;

  const { error } = await supabase
    .from('whatsapp_incoming')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Error updating WhatsApp parsed data:', error);
    throw error;
  }
}

/**
 * Načte posledních `limit` zpráv napříč stavy (parsed/imported/ignored) —
 * pro statistiku kontroly čtení a detekci opakovaných chyb.
 */
export async function fetchRecentWhatsAppMessages(limit = 100): Promise<WhatsAppIncoming[]> {
  const { data, error } = await supabase
    .from('whatsapp_incoming')
    .select('*')
    .in('status', ['pending', 'parsed', 'imported', 'ignored'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent WhatsApp messages:', error);
    throw error;
  }
  return data || [];
}
