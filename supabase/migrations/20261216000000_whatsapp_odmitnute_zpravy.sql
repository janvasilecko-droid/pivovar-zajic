-- Odmitnute WhatsApp zpravy — konec tichemu zahazovani.
--
-- Stav pred touto migraci: trigger check_whatsapp_sender_allowed() (migrace
-- 20260818000000) u zpravy od odesilatele mimo seznam povolenych vrati NULL,
-- takze se radek NEULOZI a nikde po nem nezustane stopa. Zamer je spravny —
-- do aplikace maji chodit jen zpravy ze skupiny „Objednavky pivovar" — ale
-- ma to slepe misto:
--
--   Kdyz hospoda napise z NOVEHO cisla (novy telefon, jiny clovek, zmena
--   jmena kontaktu), objednavka zmizi uplne. V appce po ni neni ani zaznam,
--   takze na ni nikdo neprijde — ani kontrolou, protoze kontrolovat jde jen
--   to, co v databazi je. Prakticky to znamena nezavezenou hospodu.
--
-- Nove se odmitnuta zprava zapise do whatsapp_rejected: kdo, kdy, zacatek
-- textu. Do objednavek se porad nedostane (chovani se nemeni), ale v kontrole
-- objednavek je videt „prisly 3 zpravy od neznameho odesilatele" a da se
-- rozhodnout, jestli ho pridat mezi povolene.
--
-- Text se uklada ORIZNUTY na 500 znaku — pro rozpoznani, o co slo, to staci,
-- a neni to plnohodnotne uchovavani obsahu od lidi mimo schvaleny okruh.

CREATE TABLE IF NOT EXISTS public.whatsapp_rejected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name text NOT NULL,
  sender_number text,
  chat_id text,
  -- Zacatek textu, at je poznat, jestli slo o objednavku, nebo o nahodnou zpravu.
  message_preview text,
  message_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Odkliknute upozorneni: „vim o tom, neresit". Nemaze se, jen se schova.
  acknowledged_at timestamptz,
  acknowledged_by text
);

CREATE INDEX IF NOT EXISTS whatsapp_rejected_created_idx ON public.whatsapp_rejected (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_rejected_sender_idx ON public.whatsapp_rejected (sender_name);

ALTER TABLE public.whatsapp_rejected ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_whatsapp_rejected" ON public.whatsapp_rejected;
CREATE POLICY "auth_read_whatsapp_rejected" ON public.whatsapp_rejected
  FOR SELECT TO authenticated USING (true);

-- Odklikavani upozorneni smi kazdy prihlaseny; zaznam se tim nemaze.
DROP POLICY IF EXISTS "auth_update_whatsapp_rejected" ON public.whatsapp_rejected;
CREATE POLICY "auth_update_whatsapp_rejected" ON public.whatsapp_rejected
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_insert_whatsapp_rejected" ON public.whatsapp_rejected;
CREATE POLICY "service_insert_whatsapp_rejected" ON public.whatsapp_rejected
  FOR INSERT TO service_role WITH CHECK (true);

-- Prepsany trigger: chovani vuci objednavkam zustava (zprava se neulozi),
-- ale odmitnuti se zaznamena.
--
-- SECURITY DEFINER je tu nutny: trigger bezi v kontextu toho, kdo vklada
-- zpravu, a ten na whatsapp_rejected nemusi mit pravo zapisu. Bez toho by
-- zapis selhal a s nim spadl cely INSERT — tedy hur nez dosud.
CREATE OR REPLACE FUNCTION public.check_whatsapp_sender_allowed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_count bigint;
  v_is_allowed boolean;
BEGIN
  SELECT count(*) INTO v_allowed_count FROM whatsapp_senders;
  IF v_allowed_count = 0 THEN
    RETURN NEW;  -- prazdny seznam = povoleno vse (zpetna kompatibilita)
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM whatsapp_senders
    WHERE LOWER(trim(sender_name)) = LOWER(trim(NEW.sender_name))
  ) INTO v_is_allowed;

  IF v_is_allowed THEN
    RETURN NEW;
  END IF;

  -- Zprava se do objednavek nedostane, ale uz nezmizi beze stopy.
  BEGIN
    INSERT INTO public.whatsapp_rejected (sender_name, sender_number, message_preview, message_timestamp)
    VALUES (
      NEW.sender_name,
      NEW.sender_number,
      left(COALESCE(NEW.message_text, ''), 500),
      NEW.message_timestamp
    );
  EXCEPTION WHEN OTHERS THEN
    -- Zapis do prehledu je pomocny. Kdyby selhal, nesmi to shodit prijem
    -- zprav — puvodni chovani (zahodit) je porad lepsi nez chyba webhooku.
    RAISE NOTICE 'whatsapp_rejected zapis selhal: %', SQLERRM;
  END;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_check_sender_allowed ON public.whatsapp_incoming;
CREATE TRIGGER trg_whatsapp_check_sender_allowed
  BEFORE INSERT ON public.whatsapp_incoming
  FOR EACH ROW
  EXECUTE FUNCTION public.check_whatsapp_sender_allowed();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_rejected;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'whatsapp_rejected uz v publikaci: %', SQLERRM;
END $$;
