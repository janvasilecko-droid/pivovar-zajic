-- 🔔 Ranní souhrn umí víc + středeční upozornění na mlčící odběratele.
--
-- Návrhy z 13. 9. 2026 (páté kolo), body 12 a 13:
--
--  • Ranní souhrn dosud hlásil jen čekající WhatsApp zprávy a výčepy po
--    termínu. Přibývá:
--      – končící nebo prošlá STK a dálniční známka (stejný práh 30 dní jako
--        lib/vozidla.ts — do teď to viděl jen ten, kdo otevřel Domů),
--      – sudy dlouho u odběratele (stejné pravidlo jako lib/sudyVenku.ts:
--        nevrácené sudy a od posledního vrácení, případně prvního odvozu,
--        uplynulo aspoň 30 dní).
--    „Docházející zboží" se do souhrnu záměrně NEPŘIDÁVÁ: stav skladu počítá
--    skladová kniha v aplikaci (lib/stockLedger.ts) z dvanácti tabulek a
--    druhá kopie téhož výpočtu v SQL by se od ní dřív nebo později rozešla.
--
--  • Pravidelný odběratel, který mlčí déle, než je u něj obvyklé. Seznam
--    existuje v kontrole objednávek (lib/kontrolaObjednavek.ts,
--    tichoUOdberatelu), ale vidí ho jen ten, kdo tu kontrolu otevře. Push jde
--    ve středu ráno — ještě je čas zavolat před čtvrtečním a pátečním
--    závozem. Pravidlo je stejné: aspoň 4 zprávy za poslední 3 měsíce,
--    ticho delší než 2,5× medián odstupů a zároveň aspoň 7 dní.

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
  v_vozidla int;
  v_vozidla_nazvy text;
  v_sudy_mist int;
  v_sudy_kusu int;
  v_radky text[] := ARRAY[]::text[];
  v_stranka text;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_whatsapp_cekajici
  FROM whatsapp_incoming
  WHERE status IN ('pending', 'parsed', 'error');

  SELECT count(*), coalesce(sum(kauce_czk), 0)
  INTO v_vycepy_po_terminu, v_kauce_czk
  FROM vycepy_rezervace
  WHERE vraceno = false
    AND coalesce(datum_do, datum_od) <= current_date - interval '2 days';

  SELECT count(*), string_agg(coalesce(nullif(spz, ''), name), ', ' ORDER BY name)
  INTO v_vozidla, v_vozidla_nazvy
  FROM vehicles
  WHERE (stk_valid_until IS NOT NULL AND stk_valid_until <= current_date + 30)
     OR (highway_toll_valid_until IS NOT NULL AND highway_toll_valid_until <= current_date + 30);

  WITH konto AS (
    SELECT
      coalesce(place_id::text, 'name:' || lower(coalesce(place_name, ''))) AS klic,
      sum(CASE WHEN direction = 'out' THEN quantity ELSE -quantity END) AS pocet,
      max(entry_date) FILTER (WHERE direction = 'in') AS posledni_vraceni,
      min(entry_date) FILTER (WHERE direction = 'out') AS prvni_odvoz
    FROM keg_returns
    GROUP BY 1
  )
  SELECT count(*), coalesce(sum(pocet), 0)
  INTO v_sudy_mist, v_sudy_kusu
  FROM konto
  WHERE klic <> 'name:'
    AND pocet > 0
    AND current_date - coalesce(posledni_vraceni, prvni_odvoz) >= 30;

  IF v_whatsapp_cekajici = 0 AND v_vycepy_po_terminu = 0 AND v_vozidla = 0 AND v_sudy_mist = 0 THEN
    RETURN;
  END IF;

  IF v_whatsapp_cekajici > 0 THEN
    v_radky := v_radky || (v_whatsapp_cekajici::text || 'x WhatsApp objednávka čeká na schválení');
    v_stranka := coalesce(v_stranka, 'orders');
  END IF;
  IF v_vycepy_po_terminu > 0 THEN
    v_radky := v_radky || (v_vycepy_po_terminu::text || 'x výčep po termínu (kauce ' || v_kauce_czk::text || ' Kč)');
    v_stranka := coalesce(v_stranka, 'vycepy');
  END IF;
  IF v_sudy_mist > 0 THEN
    v_radky := v_radky || (v_sudy_kusu::text || ' sudů leží přes 30 dní u ' || v_sudy_mist::text || ' odběratelů');
    v_stranka := coalesce(v_stranka, 'zavoz');
  END IF;
  IF v_vozidla > 0 THEN
    v_radky := v_radky || ('STK nebo dálniční známka končí: ' || v_vozidla_nazvy);
    v_stranka := coalesce(v_stranka, 'catalogs');
  END IF;

  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := jsonb_build_object(
      'titulek', 'Ranní souhrn',
      'telo', array_to_string(v_radky, ' · '),
      'stranka', v_stranka,
      'tag', 'ranni-souhrn'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.posli_ranni_souhrn() IS
  'Denní push: WhatsApp čeká na schválení, výčepy po termínu, sudy přes 30 dní u odběratele, končící STK/známka. Viz docs/20-navrhu-2026-09-13.md body 12-13.';

CREATE OR REPLACE FUNCTION public.posli_tydenni_ticho()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_pocet int;
  v_jmena text;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  WITH zpravy AS (
    SELECT trim(sender_name) AS kdo, created_at
    FROM whatsapp_incoming
    WHERE coalesce(trim(sender_name), '') <> ''
      AND created_at >= now() - interval '3 months'
  ),
  odstupy AS (
    SELECT kdo, created_at,
      extract(epoch FROM created_at - lag(created_at) OVER (PARTITION BY kdo ORDER BY created_at)) / 86400 AS odstup
    FROM zpravy
  ),
  rytmus AS (
    SELECT kdo,
      count(*) AS pocet,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY odstup) FILTER (WHERE odstup IS NOT NULL) AS obvykle,
      max(created_at) AS posledni
    FROM odstupy
    GROUP BY kdo
  ),
  mlci AS (
    SELECT kdo, extract(epoch FROM now() - posledni) / 86400 / obvykle AS pomer
    FROM rytmus
    WHERE pocet >= 4
      AND obvykle > 0
      AND extract(epoch FROM now() - posledni) / 86400 >= greatest(7, obvykle * 2.5)
  )
  SELECT count(*), string_agg(kdo, ', ' ORDER BY pomer DESC)
  INTO v_pocet, v_jmena
  FROM mlci;

  IF v_pocet = 0 THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := jsonb_build_object(
      'titulek', 'Odběratelé se neozvali',
      'telo', v_pocet::text || ' pravidelných odběratelů mlčí déle než obvykle: ' || v_jmena,
      'stranka', 'orders',
      'tag', 'tydenni-ticho'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.posli_tydenni_ticho() IS
  'Středeční push: pravidelní odběratelé, kteří mlčí déle než 2,5× obvyklý odstup (stejně jako lib/kontrolaObjednavek.ts tichoUOdberatelu).';

-- Středa 5:00 UTC = 7:00 v létě, 6:00 v zimě (stejný kompromis jako ranní souhrn).
SELECT cron.schedule(
  'tydenni-ticho-push',
  '0 5 * * 3',
  $$SELECT public.posli_tydenni_ticho();$$
);

-- Volat smí jen plánovač (běží jako vlastník), ne přihlášený uživatel.
REVOKE ALL ON FUNCTION public.posli_ranni_souhrn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.posli_tydenni_ticho() FROM PUBLIC, anon, authenticated;
