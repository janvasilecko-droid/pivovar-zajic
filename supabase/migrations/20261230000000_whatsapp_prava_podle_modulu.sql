-- Dodělání kontroly oprávnění u WhatsAppu.
--
-- CO ZBYLO
-- Migrace 20261229000000 zavřela přebíjející politiky u 29 tabulek, ale dvě
-- WhatsAppové vynechala. Změřeno 8. 9. 2026 po jejím spuštění: zůstalo pět
-- politik, které pustí každého přihlášeného bez ohledu na oprávnění —
--   whatsapp_incoming: „Users can update", „Users can delete"
--   whatsapp_senders:  „Users can insert", „Users can update", „Users can delete"
-- a protože PostgreSQL povolující politiky spojuje přes OR, stačilo, aby
-- prošla jedna. U příchozích objednávek je to zrovna to místo, kde na
-- opravdové kontrole záleží nejvíc: zpráva se odsud označuje jako
-- vyřízená, ignorovaná i mazaná.
--
-- PROČ SE ZÁROVEŇ MĚNÍ NÁHRADNÍ POLITIKY
-- Ty, co tam po nich zbudou, chtějí roli `admin` v tabulce `profiles`
-- (`whatsapp_senders` celé a mazání u `whatsapp_incoming`). V pivovaru jsou
-- dva profily — jeden admin, jeden běžný uživatel — a seznam povolených
-- odesílatelů WhatsAppu má spravovat i ten druhý člověk. Prosté zrušení
-- starých politik by mu tedy vzalo práci, kterou dělá.
--
-- Proto se náhradní politiky zároveň převádějí na `user_can_edit_module('orders')`,
-- tedy na stejné pravidlo, jaké má vkládání zpráv (`perm_insert_whatsapp_incoming`)
-- a celý zbytek objednávek. Kdo smí upravovat objednávky, smí i spravovat
-- odesílatele — a komu se Objednávky odeberou, ztratí obojí naráz.
--
-- `user_can_edit_module()` je fail-open (viz 20261128): bez profilu, bez role
-- i u admina bez nastavených oprávnění vrací true. Komu se dnes nic nezakazuje,
-- ten po téhle migraci nic neztratí.
--
-- ČTENÍ SE NEMĚNÍ — politiky SELECT zůstávají otevřené všem přihlášeným.
-- NEDOTČENÁ ZŮSTÁVÁ I politika pro `service_role`: tudy zapisuje WhatsApp
-- most a bez ní by přestaly chodit zprávy úplně.
--
-- Jde pustit opakovaně (IF EXISTS / DROP + CREATE).

-- ---------------------------------------------------------------------------
-- whatsapp_incoming — zrušení přebíjejících politik
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update whatsapp_incoming" ON public.whatsapp_incoming;
DROP POLICY IF EXISTS "Users can delete whatsapp_incoming" ON public.whatsapp_incoming;

-- Mazání zprávy bylo admin-only. Zprávu ale zahazuje ten, kdo ji čte.
DROP POLICY IF EXISTS "perm_delete_whatsapp_incoming" ON public.whatsapp_incoming;
CREATE POLICY "perm_delete_whatsapp_incoming" ON public.whatsapp_incoming
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('orders'));

-- ---------------------------------------------------------------------------
-- whatsapp_senders — zrušení přebíjejících politik
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert whatsapp_senders" ON public.whatsapp_senders;
DROP POLICY IF EXISTS "Users can update whatsapp_senders" ON public.whatsapp_senders;
DROP POLICY IF EXISTS "Users can delete whatsapp_senders" ON public.whatsapp_senders;

-- Seznam povolených odesílatelů: z role admin na oprávnění k Objednávkám.
DROP POLICY IF EXISTS "perm_insert_whatsapp_senders" ON public.whatsapp_senders;
CREATE POLICY "perm_insert_whatsapp_senders" ON public.whatsapp_senders
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('orders'));

DROP POLICY IF EXISTS "perm_update_whatsapp_senders" ON public.whatsapp_senders;
CREATE POLICY "perm_update_whatsapp_senders" ON public.whatsapp_senders
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('orders'))
  WITH CHECK (public.user_can_edit_module('orders'));

DROP POLICY IF EXISTS "perm_delete_whatsapp_senders" ON public.whatsapp_senders;
CREATE POLICY "perm_delete_whatsapp_senders" ON public.whatsapp_senders
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('orders'));
