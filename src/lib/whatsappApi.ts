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
  parsed_place_id?: string;
  parsed_place_name?: string;
  parsed_delivery_day?: string;
  parsed_delivery_date?: string;
  parsed_note?: string;
  parsed_items?: Array<{
    beer_id?: string;
    pkg_id?: string;
    qty?: number;
    degree?: string;
    beer_name?: string;
    package_label?: string;
    raw_line?: string;
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
  
  return data || [];
}

/**
 * Fetch the number of WhatsApp messages waiting for approval (pending/parsed).
 */
export async function fetchPendingWhatsAppCount(): Promise<number> {
  const { count, error } = await supabase
    .from('whatsapp_incoming')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'parsed']);

  if (error) {
    console.error('Error counting WhatsApp messages:', error);
    throw error;
  }

  return count ?? 0;
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
 * Decide whether a message from the given sender should be loaded/processed.
 * - Empty whitelist = ALLOW ALL (initial state, zpětně kompatibilní).
 * - Once at least one sender is whitelisted, only those senders are allowed.
 */
export function isSenderAllowed(allowedSenders: WhatsAppSender[], senderName: string | null | undefined): boolean {
  if (!allowedSenders || allowedSenders.length === 0) return true;
  const name = (senderName || '').trim().toLowerCase();
  if (!name) return false;
  return allowedSenders.some((s) => (s.sender_name || '').trim().toLowerCase() === name);
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
