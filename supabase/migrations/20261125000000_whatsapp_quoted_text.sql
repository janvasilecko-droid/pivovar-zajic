-- Text CITOVANÉ zprávy (na kterou tahle odpovídá — WhatsApp "reply").
-- Sdílený chat často přeposílá objednávky více různých odběratelů; bez
-- téhle informace AI mohla jen hádat, ke které dřívější objednávce odpověď
-- patří podle pořadí zpráv v chatu — a hádala špatně, když mezi odpovědí a
-- původní objednávkou přišla mezitím objednávka jiného odběratele.
ALTER TABLE public.whatsapp_incoming
  ADD COLUMN IF NOT EXISTS quoted_text text;
