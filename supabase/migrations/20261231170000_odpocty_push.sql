-- ⏰ Konec odpočtu jako push upozornění na telefon — i se zhasnutým displejem.
--
-- Z provozu 29. 9. 2026: „ten odpočet ať jede, i když není aplikace aktivní,
-- ať může být aplikace v pozadí nebo zhasnutý displej."
--
-- PROČ TO NEJDE Z APPKY: telefon appku v pozadí (a se zhasnutým displejem)
-- uspí — časovač v JavaScriptu stojí a alarm se ozve až po odemčení. Proto
-- appka při spuštění odpočtu zapíše sem, KDY doběhne, a databáze (pg_cron →
-- pg_net → edge funkce posli-push) pošle push jen tomu, kdo odpočet spustil
-- — stejný vzorec jako připomínka konce stáčení (20261231140000).
--
-- Když appka doběhnutí zachytí sama (je otevřená), řádek smaže dřív, než ho
-- databáze stihne poslat — upozornění tak nepřijde dvakrát.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.odpocty_push (
  -- „<user_id>:<id odpočtu>" — jeden odpočet jednoho člověka = jeden řádek.
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nazev text NOT NULL,
  konec timestamptz NOT NULL,
  odeslano_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS odpocty_push_cekajici ON public.odpocty_push (konec) WHERE odeslano_at IS NULL;

ALTER TABLE public.odpocty_push ENABLE ROW LEVEL SECURITY;

-- Každý vidí a mění jen své odpočty.
DROP POLICY IF EXISTS "own_select_odpocty_push" ON public.odpocty_push;
CREATE POLICY "own_select_odpocty_push" ON public.odpocty_push
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own_insert_odpocty_push" ON public.odpocty_push;
CREATE POLICY "own_insert_odpocty_push" ON public.odpocty_push
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own_update_odpocty_push" ON public.odpocty_push;
CREATE POLICY "own_update_odpocty_push" ON public.odpocty_push
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own_delete_odpocty_push" ON public.odpocty_push;
CREATE POLICY "own_delete_odpocty_push" ON public.odpocty_push
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.posli_dobehle_odpocty()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  r record;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  -- Staré řádky (appka je nesmazala, třeba se odhlásil) pryč.
  DELETE FROM odpocty_push WHERE konec < now() - interval '1 day';

  -- Označit a poslat v jednom kroku — souběžný běh stejný řádek nepošle znovu.
  FOR r IN
    UPDATE odpocty_push SET odeslano_at = now()
    WHERE odeslano_at IS NULL AND konec <= now()
    RETURNING id, user_id, nazev
  LOOP
    PERFORM net.http_post(
      url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Cron-Secret', v_secret
      ),
      body := jsonb_build_object(
        'titulek', '⏰ ' || r.nazev || ' — hotovo',
        'telo', 'Odpočet doběhl.',
        'stranka', 'home',
        'tag', 'odpocet-' || r.id,
        -- Jen tomu, kdo odpočet spustil, a jako alarm (vibrace, nezmizí sám).
        'uzivatel', r.user_id,
        'alarm', true
      )
    );
  END LOOP;
END;
$$;

-- Každých 10 sekund (pg_cron 1.5+). Kde sekundy nejdou, aspoň každou minutu.
-- cron.schedule podle jména existující úlohu přepíše — druhé spuštění nic
-- nezdvojí.
DO $$
BEGIN
  PERFORM cron.schedule('odpocty-push', '10 seconds', 'SELECT public.posli_dobehle_odpocty();');
EXCEPTION WHEN OTHERS THEN
  PERFORM cron.schedule('odpocty-push', '* * * * *', 'SELECT public.posli_dobehle_odpocty();');
END $$;
