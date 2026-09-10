-- 🔔 Ranní souhrnný push + dedup pro push u nové WhatsApp objednávky.
--
-- Návrh (docs/30-navrhu-2026-09-10.md, body 16+17): appka umí detekovat
-- výčepy po termínu (lib/vycepyVenku.ts) i čekající WhatsApp zprávy
-- (fetchPendingWhatsAppCount), ale obojí se ukáže jen tomu, kdo si appku
-- otevře. Push u NOVÉ WhatsApp objednávky (bod 15) posílá přímo edge funkce
-- whatsapp-webhook při uložení zprávy — to je vždy jednorázová událost.
-- „Výčep po termínu" ale žádnou vlastní chvíli „teď se to stalo" nemá (je to
-- stav, ne událost) — nedává smysl na něj čekat okamžitou notifikací, jde ho
-- jen pravidelně kontrolovat. Proto 16 a 17 spojené do JEDNOHO denního
-- souhrnu, který pošle obojí najednou.
--
-- Volá se stejným vzorem jako trigger_whatsapp_auto_parse (migrace
-- 20261121000000): pg_net → edge funkce posli-push, ověřeno sdíleným
-- interním secretem z app_secrets (X-Internal-Cron-Secret), který
-- _shared/require-user.ts už umí ověřit — posli-push tedy nepotřebuje
-- žádnou úpravu.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.posli_ranni_souhrn()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_whatsapp_cekajici int;
  v_vycepy_po_terminu int;
  v_kauce_czk numeric;
  v_radky text[] := ARRAY[]::text[];
  v_telo text;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_whatsapp_cekajici
  FROM whatsapp_incoming
  WHERE status IN ('pending', 'parsed', 'error');

  -- Stejná tolerance a stejný výpočet konce rezervace jako lib/vycepyVenku.ts
  -- (TOLERANCE_DNI = 1 → „po termínu" od 2. dne po konci rezervace).
  SELECT count(*), coalesce(sum(kauce_czk), 0)
  INTO v_vycepy_po_terminu, v_kauce_czk
  FROM vycepy_rezervace
  WHERE vraceno = false
    AND coalesce(datum_do, datum_od) <= current_date - interval '2 days';

  -- Není co hlásit → neposílat prázdný push každé ráno naprázdno.
  IF v_whatsapp_cekajici = 0 AND v_vycepy_po_terminu = 0 THEN
    RETURN;
  END IF;

  IF v_whatsapp_cekajici > 0 THEN
    v_radky := v_radky || (v_whatsapp_cekajici::text || 'x WhatsApp objednávka čeká na schválení');
  END IF;
  IF v_vycepy_po_terminu > 0 THEN
    v_radky := v_radky || (v_vycepy_po_terminu::text || 'x výčep po termínu (kauce ' || v_kauce_czk::text || ' Kč)');
  END IF;
  v_telo := array_to_string(v_radky, ' · ');

  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := jsonb_build_object(
      'titulek', 'Ranní souhrn',
      'telo', v_telo,
      'stranka', CASE WHEN v_whatsapp_cekajici > 0 THEN 'orders' ELSE 'vycepy' END,
      'tag', 'ranni-souhrn'
    )
  );
END;
$$;

-- 7:00 v Česku je v UTC 5:00 (letní čas, CEST) nebo 6:00 (zimní, CET) —
-- 5:00 UTC dává v zimě 6:00 místního času, což je ještě dřív, ne později,
-- takže se nikdy nepošle pozdě. Přesné zarovnání na letní/zimní čas by
-- vyžadovalo `AT TIME ZONE 'Europe/Prague'` v cron výrazu, což pg_cron
-- nepodporuje — pevná hodina je stejný kompromis jako u monthly-tank-close.
SELECT cron.schedule(
  'ranni-souhrn-push',
  '0 5 * * *',
  $$SELECT public.posli_ranni_souhrn();$$
);

COMMENT ON FUNCTION public.posli_ranni_souhrn() IS
  'Denní push: kolik WhatsApp objednávek čeká na schválení + kolik výčepů je po termínu. Viz docs/30-navrhu-2026-09-10.md body 16-17.';
