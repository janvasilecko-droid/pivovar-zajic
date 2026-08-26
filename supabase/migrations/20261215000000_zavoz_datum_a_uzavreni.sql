-- Den zavozu = datum zavozu = den, kdy se objednavka odecte a uzavre.
--
-- Stav pred opravou:
--   • 153 objednavek ze 165 nemelo vyplnene delivery_date. Datum se pokazde
--     dopocitavalo v SQL ze dne zavozu, takze aplikace pracovala s nahradou
--     (datem zadani) a objednavka prijata v pondeli na patek padala do jineho
--     tydne v planu staceni i do jineho dne v Zavozu.
--   • 121 objednavek bylo PLNE odectenych ze skladu (kazda polozka ma svuj
--     zavoz_deduction), ale porad mely stav 'nova' — nejstarsi z 2. 7. 2026.
--     Priznak stavu tim padem nic nerikal a seznam objednavek se jen nafukoval.
--
-- Nove:
--   1. delivery_date se ULOZI k objednavce, jakmile je znamy den zavozu.
--   2. Jakmile ma objednavka odecet u VSECH polozek, sama se uzavre
--      (status 'vyrizeno_zavoz', is_delivered = true). Zadne potvrzovani.
--
-- Pozor na "castecne odectene": uzavira se jen objednavka odectena CELA.
-- Kdyby se uzavirala i castecne, vypadla by z "objednano tento tyden"
-- (packageNeeds/bottlingNeeds ji pak preskoci), zatimco nedodane kusy by
-- porad chybely — a "co je potreba stocit" by vyslo mensi, nez ma.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Ucinny den zavozu — jedno misto misto tri kopii v ruznych funkcich.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ucinny_den_zavozu(
  p_delivery_date date,
  p_delivery_day text,
  p_order_date date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_delivery_date IS NOT NULL THEN p_delivery_date
    ELSE (
      SELECT CASE
        -- Objednavka zadana napr. v patek na pondeli by jinak dostala datum
        -- v MINULOSTI (pondeli tehoz tydne) a odectla by se okamzite.
        -- Kdyz vypocteny den uz byl, posun se o tyden dal.
        WHEN d < p_order_date THEN d + 7
        ELSE d
      END
      FROM (
        SELECT date_trunc('week', p_order_date::timestamp)::date
          + CASE split_part(COALESCE(NULLIF(p_delivery_day, ''), 'pa'), '/', 1)
              WHEN 'po' THEN 0 WHEN 'ut' THEN 1 WHEN 'st' THEN 2 WHEN 'ct' THEN 3
              WHEN 'pa' THEN 4 WHEN 'so' THEN 5 WHEN 'ne' THEN 6 ELSE 4
            END AS d
      ) x
    )
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Datum zavozu se ulozi k objednavce.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doplnit_datum_zavozu()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Den zavozu je zdroj pravdy: kdyz se ZMENI, datum se prepocita.
  -- Rucne zadane konkretni datum se nikdy neprepisuje — objednavka zalozena
  -- s datem ("na 7.8.") si ho nechá, dopocitava se jen kdyz datum chybi.
  IF NEW.delivery_day IS NOT NULL AND NEW.delivery_day <> '' AND (
       NEW.delivery_date IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.delivery_day IS DISTINCT FROM OLD.delivery_day)
     ) THEN
    NEW.delivery_date := public.ucinny_den_zavozu(NULL, NEW.delivery_day, NEW.order_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doplnit_datum_zavozu ON public.orders;
CREATE TRIGGER trg_doplnit_datum_zavozu
  BEFORE INSERT OR UPDATE OF delivery_day, delivery_date, order_date ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.doplnit_datum_zavozu();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Plne odectena objednavka se uzavre sama.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.uzavrit_odectenou_objednavku()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_chybi integer;
BEGIN
  IF v_order IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_chybi
  FROM public.order_items oi
  LEFT JOIN public.zavoz_deductions zd ON zd.order_item_id = oi.id
  WHERE oi.order_id = v_order AND oi.quantity > 0 AND zd.id IS NULL;

  IF v_chybi = 0 THEN
    UPDATE public.orders
    SET status = 'vyrizeno_zavoz',
        is_delivered = true,
        delivered_at = COALESCE(delivered_at, now())
    WHERE id = v_order AND status = 'nova';
  ELSE
    -- Odecet byl zrusen (storno objednavky vraci pivo do skladu) — objednavka
    -- se musi vratit mezi nevyrizene, jinak by zustala tvarit se jako hotova.
    UPDATE public.orders
    SET status = 'nova', is_delivered = false, delivered_at = NULL
    WHERE id = v_order AND status = 'vyrizeno_zavoz';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_uzavrit_odectenou_objednavku ON public.zavoz_deductions;
CREATE TRIGGER trg_uzavrit_odectenou_objednavku
  AFTER INSERT OR DELETE ON public.zavoz_deductions
  FOR EACH ROW EXECUTE FUNCTION public.uzavrit_odectenou_objednavku();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Jednorazovy uklid stavajicich dat.
-- ─────────────────────────────────────────────────────────────────────────

-- 4a) Doplnit chybejici datum zavozu (153 objednavek).
UPDATE public.orders
SET delivery_date = public.ucinny_den_zavozu(NULL, delivery_day, order_date)
WHERE delivery_date IS NULL;

-- 4b) Uzavrit objednavky, ktere jsou uz cele odectene ze skladu (121).
UPDATE public.orders o
SET status = 'vyrizeno_zavoz',
    is_delivered = true,
    delivered_at = COALESCE(o.delivered_at, now())
WHERE o.status = 'nova'
  AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id AND oi.quantity > 0)
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    LEFT JOIN public.zavoz_deductions zd ON zd.order_item_id = oi.id
    WHERE oi.order_id = o.id AND oi.quantity > 0 AND zd.id IS NULL
  );
