-- 🔔 Připomínka „vyplň konec stáčení" na telefon (16:00 a 18:00).
--
-- Zadání z provozu 22. 9. 2026: „konec stáčení lahve a sud checklist, pokud ho
-- člověk nezadá … ať vyskočí upozornění s koncem stáčení a vyplněním
-- checklistu na telefonu (ne na aplikaci), objeví se v 16:00; pokud i tak ho
-- stáčeč odmítne — že stáčí, ale nevyplní ho — tak upozornit v 18:00 na
-- telefon a tabulku k vyplnění checklistu. Checklist každý stáčecí den musí
-- být vyplněn."
--
-- PROČ TO NEJDE Z APPKY: upozornění má přijít na telefon i se zavřenou
-- aplikací. Appka o tom neví — když ji nikdo nemá otevřenou, nic se
-- nespustí. Proto to hlídá databáze (pg_cron → pg_net → edge funkce
-- posli-push), stejně jako ranní souhrn (migrace 20261230010000) a čtení
-- WhatsAppu (20261121000000), a ověřuje se stejným interním secretem.
--
-- CO JE „STÁČECÍ DEN": den, kdy je zapsané stáčení lahví (tabulka bottling)
-- nebo KEG sudů (kegging). Jen tehdy má smysl se na úklid ptát.
--
-- JAK SE POZNÁ VYPLNĚNÝ CHECKLIST: appka spolu s odškrtáváním ukládá
-- odvozenou položku `konec_hotovo` (viz src/lib/konecStaceni.ts) — je
-- splněná, právě když jsou hotové všechny povinné kroky sekce „2. Konec
-- stáčení". Databáze se tak nemusí starat o to, které kroky to zrovna jsou;
-- seznam se v appce mění a tahle funkce by se s ním rozešla.
--
-- ČAS: pg_cron umí jen UTC, a Praha se mezi létem a zimou posouvá. Proto běží
-- každou hodinu a na místní čas se ptá uvnitř funkce — stejný vzorec jako
-- zavoz-deductions-prague (migrace 20260816130000). Kdyby se použila pevná
-- hodina v UTC, v zimě by připomínka chodila o hodinu dřív.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.pripomen_konec_staceni()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hodina int;
  v_dnes date;
  v_secret text;
  v_lahve boolean;
  v_kegy boolean;
  v_lahve_hotovo boolean;
  v_kegy_hotovo boolean;
  v_chybi text[] := ARRAY[]::text[];
  v_stranka text;
  v_telo text;
  v_titulek text;
BEGIN
  v_hodina := EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Prague'))::int;
  -- 16:00 první připomínka, 18:00 druhá (důraznější, rovnou s formulářem).
  IF v_hodina NOT IN (16, 18) THEN
    RETURN;
  END IF;

  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  v_dnes := (now() AT TIME ZONE 'Europe/Prague')::date;

  SELECT EXISTS (SELECT 1 FROM bottling WHERE entry_date = v_dnes) INTO v_lahve;
  SELECT EXISTS (SELECT 1 FROM kegging WHERE entry_date = v_dnes) INTO v_kegy;

  -- Dneska se nestáčelo → není co připomínat.
  IF NOT v_lahve AND NOT v_kegy THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM checklisty_hotovo
    WHERE pracoviste = 'lahve' AND datum = v_dnes AND polozka = 'konec_hotovo'
  ) INTO v_lahve_hotovo;
  SELECT EXISTS (
    SELECT 1 FROM checklisty_hotovo
    WHERE pracoviste = 'kegy' AND datum = v_dnes AND polozka = 'konec_hotovo'
  ) INTO v_kegy_hotovo;

  IF v_lahve AND NOT v_lahve_hotovo THEN
    v_chybi := v_chybi || 'lahve'::text;
  END IF;
  IF v_kegy AND NOT v_kegy_hotovo THEN
    v_chybi := v_chybi || 'sudy (KEG)'::text;
  END IF;

  -- Všechno vyplněné → ticho. Připomínka, která chodí i po splnění, se
  -- během týdne odnaučí číst.
  IF array_length(v_chybi, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Kam odkaz vede: když chybí jen KEG, ať se otevře stáčení KEG.
  v_stranka := CASE WHEN v_kegy AND NOT v_kegy_hotovo AND (v_lahve_hotovo OR NOT v_lahve)
                    THEN 'kegging' ELSE 'bottling' END;

  IF v_hodina = 16 THEN
    v_titulek := 'Konec stáčení — vyplň checklist';
    v_telo := 'Dnes se stáčelo (' || array_to_string(v_chybi, ' a ') ||
              ') a úklidový checklist ještě není vyplněný.';
  ELSE
    v_titulek := 'Checklist konce stáčení pořád chybí';
    v_telo := 'Druhá připomínka: ' || array_to_string(v_chybi, ' a ') ||
              ' — bez vyplněného checklistu není záznam do sanitačního deníku.';
  END IF;

  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := jsonb_build_object(
      'titulek', v_titulek,
      'telo', v_telo,
      'stranka', v_stranka,
      -- Klepnutí otevře rovnou tabulku k vyplnění (appka čte ?checklist=konec).
      'parametry', 'checklist=konec',
      -- Tag se liší podle hodiny: se stejným tagem by druhá připomínka jen
      -- tiše přepsala tu první a v 18:00 by telefon nezazvonil.
      'tag', 'konec-staceni-' || v_hodina::text
    )
  );
END;
$$;

-- cron.schedule podle jména existující úlohu přepíše, takže druhé spuštění
-- migrace nevytvoří duplicitní hlídače.
SELECT cron.unschedule('pripominka-konce-staceni')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pripominka-konce-staceni');

SELECT cron.schedule(
  'pripominka-konce-staceni',
  '3 * * * *',
  $$SELECT public.pripomen_konec_staceni();$$
);

COMMENT ON FUNCTION public.pripomen_konec_staceni() IS
  'Push v 16:00 a 18:00 (čas Prahy), když se dnes stáčelo a chybí vyplněný checklist konce stáčení. Značku konec_hotovo ukládá appka, viz src/lib/konecStaceni.ts.';
