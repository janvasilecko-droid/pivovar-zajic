-- 🔒 Vlastní zprávy (from_me) přestávají obcházet whitelist.
--
-- Do aplikace se nahrály VŠECHNY zprávy majitele — včetně čistě soukromých
-- konverzací, které pak v provozním systému viděli všichni, kdo do něj mají
-- přístup. Příčinou byla výjimka hned na začátku téhle funkce: `IF NEW.from_me
-- THEN RETURN NEW`, tedy „co si majitel napíše, projde vždy a odkudkoliv".
--
-- Výjimka měla řešit objednávku napsanou z vlastního telefonu do objednávkové
-- skupiny. Na to ale žádná není potřeba: skupina je ve `whatsapp_senders`
-- zapsaná jménem i chat_id, takže vlastní zpráva z ní projde běžnou branou
-- stejně jako zákaznická. Výjimka tedy nepouštěla dál nic, co mělo projít —
-- jen všechno ostatní.
--
-- Příznak `from_me` zůstává a dál se ukládá: aplikace podle něj vlastní
-- zprávu odliší od zákaznické objednávky. Rozhoduje o POPISKU, ne o vstupu.
--
-- Táž změna je provedená i na ostatních třech místech, kde tahle brána žije
-- (pravidla musí zůstat identická, jinak se rozejdou):
--   • whatsapp-bridge/index.js       — filtr čtení na mostu
--   • whatsapp-bridge/lib/filter.js  — soukromá zpráva neprojde na prázdný whitelist
--   • supabase/functions/whatsapp-webhook/index.ts
--   • supabase/functions/whatsapp-auto-parse/index.ts
CREATE OR REPLACE FUNCTION public.check_whatsapp_sender_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  -- 1) Prázdný seznam = povoleno vše (zpětná kompatibilita). Pozor: tohle je
  --    jediná zbylá cesta, kudy projde neregistrovaný odesílatel — jakmile je
  --    ve `whatsapp_senders` aspoň jeden řádek, platí whitelist na všechny,
  --    majitele nevyjímaje.
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;
  END IF;

  -- 2) Povoleno podle CHAT_ID (stabilní) NEBO podle názvu (bez diakritiky).
  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders s
    WHERE (
      NEW.chat_id IS NOT NULL AND btrim(NEW.chat_id) <> ''
      AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
      AND lower(btrim(s.chat_id)) = lower(btrim(NEW.chat_id))
    ) OR (
      NEW.sender_name IS NOT NULL
      AND whatsapp_norm(NEW.sender_name) = whatsapp_norm(s.sender_name)
    )
  ) INTO v_is_allowed;

  IF v_is_allowed THEN
    RETURN NEW;
  END IF;

  -- Zpráva se do objednávek nedostane, ale už nezmizí beze stopy.
  BEGIN
    INSERT INTO public.whatsapp_rejected (sender_name, sender_number, chat_id, message_preview, message_timestamp)
    VALUES (
      NEW.sender_name,
      NEW.sender_number,
      NEW.chat_id,
      left(COALESCE(NEW.message_text, ''), 500),
      NEW.message_timestamp
    );
  EXCEPTION WHEN OTHERS THEN
    -- Zápis do přehledu je pomocný. Kdyby selhal, nesmí to shodit příjem
    -- zpráv — původní chování (zahodit) je pořád lepší než chyba webhooku.
    RAISE NOTICE 'whatsapp_rejected zapis selhal: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

COMMENT ON TRIGGER trg_whatsapp_check_sender_allowed ON public.whatsapp_incoming IS
  'Zahodí zprávu od nepovoleného odesílatele (whitelist podle chat_id NEBO názvu) a zapíše ji do whatsapp_rejected. Platí i na vlastní zprávy majitele (from_me) — ty branu neobchazeji, jen se odlisi priznakem.';
