# WhatsApp Auto-Import Integration - Developer Documentation

## Architektura

### Komponenty
1. **Cloudová brána (Make.com / WhatsApp webhook)**: Příjem WhatsApp zpráv
2. **Make.com**: Zpracovává a předává data
3. **Supabase Edge Functions**: Příjem webhooků
4. **Supabase Database**: Ukládání zpráv
5. **React Frontend**: Zobrazení a správa

> ✅ Tasker/AutoNotification na telefonu byly odstraněny — zprávy jdou přímo
> přes cloudovou bránu do webhooku.

## Databázová schémata

### Tabulka `whatsapp_incoming`
```sql
CREATE TABLE whatsapp_incoming (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  sender_name TEXT NOT NULL,
  sender_number TEXT,
  message_text TEXT NOT NULL,
  message_timestamp TIMESTAMP WITH TIME ZONE,
  message_type TEXT DEFAULT 'text',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  parsed_place_id UUID REFERENCES places(id),
  parsed_place_name TEXT,
  parsed_delivery_day TEXT,
  parsed_delivery_date DATE,
  parsed_note TEXT,
  parsed_items JSONB,
  imported_order_id UUID REFERENCES orders(id),
  imported_at TIMESTAMP WITH TIME ZONE,
  webhook_id TEXT,
  webhook_timestamp TIMESTAMP WITH TIME ZONE
);
```

## API Endpointy

### 1. WhatsApp Webhook
**Endpoint**: `POST /functions/v1/whatsapp-webhook`
**Popis**: Příjem zpráv z Make.com

### 2. Auto-Parse Endpoint
**Endpoint**: `POST /functions/v1/whatsapp-auto-parse`
**Popis**: Automatické parsování pending zpráv

## Frontend komponenty

### 1. WhatsAppImportModal
Hlavní modální okno pro import WhatsApp zpráv

### 2. WhatsAppIncomingModal
Modální okno pro správu příchozích zpráv

### 3. WhatsApp API modul (`src/lib/whatsappApi.ts`)
Hlavní funkce pro práci s WhatsApp zprávami

## Deployment

### 1. Migrace databáze
```bash
supabase db push
```

### 2. Edge Functions
```bash
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-auto-parse
```

## Monitoring

### Logy
- Příchozí webhook requesty
- Chyby parsování
- Duplicitní zprávy

## Bezpečnost

### Ověřování
- Webhook vyžaduje JWT token
- Rate limiting
- Service role pro DB operace

**Poslední aktualizace**: 2026-08-07  
**Verze API**: 1.0  
**Kompatibilní s aplikací**: v1.510+