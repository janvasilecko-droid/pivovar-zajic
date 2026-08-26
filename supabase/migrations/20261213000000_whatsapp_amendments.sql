-- Odpovedi na WhatsApp objednavky, ktere puvodni objednavku UPRAVUJI.
--
-- Ve skupine "Objednavky pivovar" se na objednavku casto odpovida a ta
-- odpoved ji meni: "Bez summera", "Radek nakonec summer 9x30", "30 litru,
-- ne 20??", "Plus 3x10 11sv". Aplikace s tim dosud neumela nic — odpoved
-- bud skoncila jako ignorovana, nebo se z ni zalozila SAMOSTATNA objednavka
-- pro tehoz odberatele.
--
-- Ze 108 zprav v srpnu 2026 bylo 16 odpovedi a 8 z nich slo navazat na
-- konkretni objednavku. U "Radek nakonec summer 9x30" musela obsluha rucne
-- opravit 15 ks na 9, prestoze odpoved na to doslova odpovidala.
--
-- amends_order_id   = objednavka, kterou tahle odpoved upravuje
-- amends_message_id = puvodni zprava, na kterou odpoved reaguje (pro zobrazeni
--                     kontextu v kontrole)
-- Parovani dela lib/whatsappAmendment.ts (findQuotedMessage) — porovnava
-- quoted_text s zacatkem puvodni zpravy, protoze WhatsApp delsi citace oreze.

ALTER TABLE public.whatsapp_incoming
  ADD COLUMN IF NOT EXISTS amends_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_incoming
  ADD COLUMN IF NOT EXISTS amends_message_id uuid REFERENCES public.whatsapp_incoming(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_incoming_amends_order_idx
  ON public.whatsapp_incoming (amends_order_id)
  WHERE amends_order_id IS NOT NULL;
