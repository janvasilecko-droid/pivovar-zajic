-- Fronta zprav, ktere se nepodarilo predat webhooku.
--
-- Denik prijmu (whatsapp_prijem_log, migrace 20261217000000) zaznamena kazde
-- DORUCENI NA WEBHOOK. Cely usek PRED nim ale nikde vidiet neni:
--
--   WhatsApp → most (bridge) → [tady] → webhook → whatsapp_incoming
--
-- Most zkusi preposlat ctyrikrat s prodluzujici se pauzou, a kdyz to ani
-- napoctvrte nevyjde, zpravu jen zapise do sveho logu na Renderu a ZAHODI.
-- Ten log nikdo necte a po case zmizi — objednavka se tim ztrati beze stopy
-- a v aplikaci to vypada, jako by ji zakaznik nikdy neposlal. 4xx (spatne
-- tajemstvi, odmitnuty payload) se navic neopakuje vubec.
--
-- Tahle tabulka je pro takove zpravy odkladiste: most do ni ulozi cely
-- payload, at ho jde poslat znovu, az bude webhook zase odpovidat. Zaroven
-- je to jediny signal, ze se neco takoveho vubec deje — hloubkovy audit
-- v aplikaci se na ni diva.
--
-- Payload obsahuje text zpravy. Je to stejna trida udaju, jakou uz drzi
-- whatsapp_incoming, takze zadny novy druh dat to do databaze neprinasi.

CREATE TABLE IF NOT EXISTS public.whatsapp_neodeslane (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `wa-<key.id>` z mostu. Unikatni, aby opakovane padajici pokusy o tutez
  -- zpravu nevyrobily deset radku misto jednoho.
  webhook_id text NOT NULL UNIQUE,
  -- Cely payload tak, jak mel jit na webhook — pri opakovanem odeslani se
  -- posle beze zmeny, takze zprava projde uplne stejnou cestou jako ostatni.
  payload jsonb NOT NULL,
  sender_name text,
  message_preview text,
  -- Posledni duvod selhani (HTTP stav a zacatek odpovedi, nebo sitova chyba).
  chyba text,
  pokusu integer NOT NULL DEFAULT 1,
  posledni_pokus timestamptz NOT NULL DEFAULT now(),
  -- Vyplni se, az zpravu webhook prijme. Radek zustava jako stopa, ze
  -- k vypadku doslo — audit pak umi rict „3 zpravy se musely poslat znovu".
  odeslano_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_neodeslane_ceka_idx
  ON public.whatsapp_neodeslane (created_at DESC)
  WHERE odeslano_at IS NULL;

ALTER TABLE public.whatsapp_neodeslane ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_whatsapp_neodeslane" ON public.whatsapp_neodeslane;
CREATE POLICY "auth_read_whatsapp_neodeslane" ON public.whatsapp_neodeslane
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_whatsapp_neodeslane" ON public.whatsapp_neodeslane;
CREATE POLICY "service_write_whatsapp_neodeslane" ON public.whatsapp_neodeslane
  FOR ALL TO service_role USING (true) WITH CHECK (true);
