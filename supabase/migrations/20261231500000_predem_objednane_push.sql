-- 🔔 Pondělní push „Předem objednané — tento týden se stáčí“.
--
-- Majitel 26. 11. 2026 (ke zprávě „Na 18.12. …20l 12sv…“, objednávka tři týdny předem):
-- „…aplikace to musí nastavit ten datum a upozornit v pondělí týden kdy to má být stočený.“
--
-- Datum appka čte správně (den ze zprávy má přednost před výchozí středou) a plán stáčení takovou objednávku
-- zařadí do správného týdne — jenže jako obyčejné číslo mezi ostatními, tři týdny po zadání. V aplikaci ukazuje
-- Domů → Co stočit od 26. 11. žlutý pruh „Předem objednané“ (src/lib/predemObjednane.ts). Tohle je druhá půlka:
-- push na telefon v pondělí ráno, ať se na to nezapomene ani tehdy, když nikdo appku neotevře.
--
-- Pravidlo je stejné jako v appce (PREDSTIH_DNI = 7 v lib/predemObjednane.ts): objednávka s dnem závozu v TOMHLE
-- týdnu (pondělí až neděle, pražský čas), zadaná aspoň 7 dní před závozem, ještě nezavezená a nestornovaná.
-- Z pravidla plyne, že taková objednávka vznikla nejpozději předchozí neděli — pondělní push je tedy úplný
-- a později v týdnu žádná „předem objednaná“ nepřibude.
--
-- Nic se nezapisuje: funkce jen čte `orders` a `order_items` a pošle push přes edge funkci posli-push (stejně jako
-- ranní souhrn a středeční ticho). Není-li co hlásit, neodejde nic. Žádný UPDATE ani DELETE.
--
-- Parametr `p_dnes` je jen kvůli zkoušce (a ruční kontrole „co by přišlo“); plánovač ho nezadává a bere dnešek
-- v Praze. Volat funkci smí jen plánovač a vlastník — ne přihlášený uživatel (viz REVOKE dole).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.posli_predem_objednane(
  p_dnes date DEFAULT (now() AT TIME ZONE 'Europe/Prague')::date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_pondeli date := date_trunc('week', p_dnes::timestamp)::date;
  v_nedele date := date_trunc('week', p_dnes::timestamp)::date + 6;
  v_pocet int;
  v_seznam text;
  v_telo text;
BEGIN
  SELECT value INTO v_secret FROM app_secrets WHERE key = 'WHATSAPP_CRON_SECRET';
  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*), string_agg(x.radek, ' · ' ORDER BY x.delivery_date, x.misto)
  INTO v_pocet, v_seznam
  FROM (
    SELECT
      o.delivery_date,
      coalesce(nullif(trim(o.place_name), ''), 'Bez názvu') AS misto,
      coalesce(nullif(trim(o.place_name), ''), 'Bez názvu')
        || ' ('
        || (ARRAY['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'])[extract(isodow FROM o.delivery_date)::int]
        || ' ' || extract(day FROM o.delivery_date)::int
        || '. ' || extract(month FROM o.delivery_date)::int || '.'
        || CASE WHEN pol.co <> '' THEN ': ' || pol.co ELSE '' END
        || ')' AS radek
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT coalesce(string_agg(
        trim_scale(oi.quantity)::text || '× '
          || trim(concat_ws(' ', coalesce(p.label, oi.package_label), coalesce(b.name, oi.beer_name))),
        ', ' ORDER BY oi.created_at, oi.id
      ), '') AS co
      FROM order_items oi
      LEFT JOIN beers b ON b.id = oi.beer_id
      LEFT JOIN packages p ON p.id = oi.package_id
      WHERE oi.order_id = o.id
        AND oi.quantity > 0
    ) pol ON true
    WHERE o.delivery_date BETWEEN v_pondeli AND v_nedele
      AND o.order_date IS NOT NULL
      AND o.delivery_date - o.order_date >= 7
      AND coalesce(o.status, '') NOT IN ('storno', 'vyrizeno_zavoz', 'vyrizeno', 'vyrizena', 'hotova')
      AND NOT coalesce(o.is_delivered, false)
  ) x;

  -- Není co hlásit → neposílat prázdný push každé pondělí naprázdno.
  IF v_pocet = 0 THEN
    RETURN;
  END IF;

  v_telo := CASE
    WHEN v_pocet = 1 THEN '1 objednávka zadaná týden předem se vozí tento týden: '
    WHEN v_pocet < 5 THEN v_pocet::text || ' objednávky zadané týden předem se vozí tento týden: '
    ELSE v_pocet::text || ' objednávek zadaných týden předem se vozí tento týden: '
  END || v_seznam;
  IF length(v_telo) > 300 THEN
    v_telo := left(v_telo, 299) || '…';
  END IF;

  -- Bez `stranka`: klepnutí otevře appku na Domů, kde je nad plánem stáčení pruh „Předem objednané“ (otevřená
  -- appka se jen vytáhne dopředu — viz notificationclick v public/sw.js).
  PERFORM net.http_post(
    url := 'https://sasqexjadvlqyticxwja.supabase.co/functions/v1/posli-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Cron-Secret', v_secret
    ),
    body := jsonb_build_object(
      'titulek', 'Předem objednané — tento týden se stáčí',
      'telo', v_telo,
      'tag', 'predem-objednane'
    )
  );
END;
$$;

COMMENT ON FUNCTION public.posli_predem_objednane(date) IS
  'Pondělní push: objednávky zadané aspoň 7 dní před závozem, které se vozí tento týden (stejné pravidlo jako src/lib/predemObjednane.ts). Majitel 26. 11. 2026.';

-- Pondělí 5:00 UTC = 7:00 v létě, 6:00 v zimě (stejný kompromis jako ranní souhrn a středeční ticho).
SELECT cron.schedule(
  'predem-objednane-push',
  '0 5 * * 1',
  $$SELECT public.posli_predem_objednane();$$
);

-- Volat smí jen plánovač (běží jako vlastník), ne přihlášený uživatel.
REVOKE ALL ON FUNCTION public.posli_predem_objednane(date) FROM PUBLIC, anon, authenticated;
