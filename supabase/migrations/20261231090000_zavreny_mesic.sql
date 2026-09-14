-- "Zavřít měsíc" — tvrdý zámek na objednávky a všechny zápisy výroby/skladu
-- za daný měsíc. Bez tohohle šlo do dávno napočítaného a dorovnaného měsíce
-- dopsat cokoliv a schodek se pak hledal jako záhada (viz komentář u
-- lib/mesicUzamcen.ts — to je jen NEVYNUCENÉ upozornění, appka zápisu
-- nezabrání).
--
-- Z provozu 14. 9. 2026: "udělej, když dám zavřít měsíc, ať už nemůže nic
-- a nikdo sahat do objednávek a stáčení, jen budou k nahlížení, upravit je
-- může jen admin".
--
-- ROZSAH ZÁMKU: všechno, co mění sklad za ten měsíc — objednávky
-- (orders/order_items), stáčení (kegging), lahvování (bottling), fasování
-- (fasovani/fasovani_private), odpisy (writeoffs) a akce (akce/akce_items).
-- NE inventura samotná (inventory/inventory_adjustments) — do napočítaného
-- měsíce se právě TAM dopisuje dorovnání, kterým se měsíc uzavírá.
--
-- ODEMČENÍ: podle přihlášené role, ŽÁDNÉ zvláštní heslo navíc — appka už
-- rozlišuje role (admin/šéf/sládek/manažer, viz lib/permissions.ts,
-- canUserEdit) a přesně tahle sada rolí už dnes obchází omezení modulů
-- (user_can_edit_module() → `IF v_role = 'admin' THEN RETURN true`). Zámek
-- měsíce je stejná myšlenka, jen navíc kontroluje i sládka/šéfa/manažera —
-- ti sice per-modul omezení nemívají, ale i pro ně platí, že do uzavřeného
-- měsíce se má sahat jen vědomě.
--
-- PROČ FUNKCE, NE JEN SLOUPEC is_closed NA orders/kegging/...: měsíc se
-- zavírá JEDNOU na jednom místě (tabulka closed_months), ne opakovaně na
-- každé tabulce zvlášť — a nová objednávka/zápis v UŽ zavřeném měsíci
-- (výjimečně, admin) nemusí měnit nic jinde.

CREATE TABLE IF NOT EXISTS public.closed_months (
  month text PRIMARY KEY, -- 'YYYY-MM'
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.closed_months IS
  'Měsíce uzavřené v Inventuře. Existence řádku = objednávky a zápisy výroby/skladu za ten měsíc jsou pro běžné role jen ke čtení (viz smi_zapisovat_pro_datum).';

ALTER TABLE public.closed_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_closed_months" ON public.closed_months;
CREATE POLICY "auth_read_closed_months" ON public.closed_months
  FOR SELECT TO authenticated USING (true);

-- Zavřít i znovu otevřít měsíc smí jen admin/šéf/sládek/manažer — je to
-- rozhodnutí o účetní uzávěrce, ne běžný provozní zápis.
CREATE OR REPLACE FUNCTION public.is_admin_tier_role()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true; -- service_role / trigger kontext, ne appka
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role IN ('admin', 'sef', 'sladek', 'boss', 'manager');
EXCEPTION WHEN OTHERS THEN
  RETURN true; -- fail-open, stejný vzor jako user_can_edit_module()
END;
$$;

DROP POLICY IF EXISTS "admin_insert_closed_months" ON public.closed_months;
CREATE POLICY "admin_insert_closed_months" ON public.closed_months
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_tier_role());
DROP POLICY IF EXISTS "admin_delete_closed_months" ON public.closed_months;
CREATE POLICY "admin_delete_closed_months" ON public.closed_months
  FOR DELETE TO authenticated USING (public.is_admin_tier_role());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.closed_months;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'closed_months už v publikaci: %', SQLERRM;
END $$;

-- Patří datum do uzavřeného měsíce?
CREATE OR REPLACE FUNCTION public.mesic_je_uzavren(p_datum date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_datum IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.closed_months WHERE month = to_char(p_datum, 'YYYY-MM')
  );
$$;

-- Smí se zapisovat k tomuhle datu? Ano, pokud měsíc není zavřený, nebo je
-- zavřený ale píše admin/šéf/sládek/manažer. Chybějící datum (NULL) NEBLOKUJE
-- — radši nechat projít, než appku zaseknout na řádku bez data, který zámek
-- stejně nemá jak posoudit.
CREATE OR REPLACE FUNCTION public.smi_zapisovat_pro_datum(p_datum date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_datum IS NULL
      OR NOT public.mesic_je_uzavren(p_datum)
      OR public.is_admin_tier_role();
$$;

-- ===== Objednávky (orders/order_items) =====
-- Rozhodné datum je den závozu (delivery_date), a když není zadaný, den
-- zadání objednávky — stejná dvojice, jakou appka zobrazuje jako "kdy se to
-- řeší". Přesný přepočet na den v týdnu (viz process_zavoz_deductions_for_date)
-- by tu byl zbytečně složitý, zámek je jen hrubá ochrana proti zápisu do
-- starého měsíce, ne přesný plánovač.
DROP POLICY IF EXISTS "perm_insert_orders" ON public.orders;
CREATE POLICY "perm_insert_orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND public.smi_zapisovat_pro_datum(COALESCE(delivery_date, order_date)));
DROP POLICY IF EXISTS "perm_update_orders" ON public.orders;
CREATE POLICY "perm_update_orders" ON public.orders FOR UPDATE TO authenticated
  USING ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND public.smi_zapisovat_pro_datum(COALESCE(delivery_date, order_date)))
  WITH CHECK ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND public.smi_zapisovat_pro_datum(COALESCE(delivery_date, order_date)));
DROP POLICY IF EXISTS "perm_delete_orders" ON public.orders;
CREATE POLICY "perm_delete_orders" ON public.orders FOR DELETE TO authenticated
  USING ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND public.smi_zapisovat_pro_datum(COALESCE(delivery_date, order_date)));

-- order_items nemá vlastní datum — bere ho z rodičovské objednávky.
DROP POLICY IF EXISTS "perm_insert_order_items" ON public.order_items;
CREATE POLICY "perm_insert_order_items" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(COALESCE(o.delivery_date, o.order_date))
                  FROM public.orders o WHERE o.id = order_id), true));
DROP POLICY IF EXISTS "perm_update_order_items" ON public.order_items;
CREATE POLICY "perm_update_order_items" ON public.order_items FOR UPDATE TO authenticated
  USING ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(COALESCE(o.delivery_date, o.order_date))
                  FROM public.orders o WHERE o.id = order_id), true))
  WITH CHECK ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(COALESCE(o.delivery_date, o.order_date))
                  FROM public.orders o WHERE o.id = order_id), true));
DROP POLICY IF EXISTS "perm_delete_order_items" ON public.order_items;
CREATE POLICY "perm_delete_order_items" ON public.order_items FOR DELETE TO authenticated
  USING ((public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(COALESCE(o.delivery_date, o.order_date))
                  FROM public.orders o WHERE o.id = order_id), true));

-- ===== Stáčení (kegging) =====
DROP POLICY IF EXISTS "auth_write_kegging" ON public.kegging;
DROP POLICY IF EXISTS "perm_insert_kegging" ON public.kegging;
CREATE POLICY "perm_insert_kegging" ON public.kegging FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "auth_update_kegging" ON public.kegging;
DROP POLICY IF EXISTS "perm_update_kegging" ON public.kegging;
CREATE POLICY "perm_update_kegging" ON public.kegging FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('kegging') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('kegging') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "auth_delete_kegging" ON public.kegging;
DROP POLICY IF EXISTS "perm_delete_kegging" ON public.kegging;
CREATE POLICY "perm_delete_kegging" ON public.kegging FOR DELETE TO authenticated
  USING (public.user_can_edit_module('kegging') AND public.smi_zapisovat_pro_datum(entry_date));

-- ===== Výroba (bottling, fasovani, fasovani_private, writeoffs — modul "entry") =====
DROP POLICY IF EXISTS "perm_insert_bottling" ON public.bottling;
CREATE POLICY "perm_insert_bottling" ON public.bottling FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_update_bottling" ON public.bottling;
CREATE POLICY "perm_update_bottling" ON public.bottling FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_delete_bottling" ON public.bottling;
CREATE POLICY "perm_delete_bottling" ON public.bottling FOR DELETE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));

DROP POLICY IF EXISTS "perm_insert_fasovani" ON public.fasovani;
CREATE POLICY "perm_insert_fasovani" ON public.fasovani FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_update_fasovani" ON public.fasovani;
CREATE POLICY "perm_update_fasovani" ON public.fasovani FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_delete_fasovani" ON public.fasovani;
CREATE POLICY "perm_delete_fasovani" ON public.fasovani FOR DELETE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));

DROP POLICY IF EXISTS "perm_insert_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_insert_fasovani_private" ON public.fasovani_private FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_update_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_update_fasovani_private" ON public.fasovani_private FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_delete_fasovani_private" ON public.fasovani_private;
CREATE POLICY "perm_delete_fasovani_private" ON public.fasovani_private FOR DELETE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));

DROP POLICY IF EXISTS "perm_insert_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_insert_writeoffs" ON public.writeoffs FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_update_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_update_writeoffs" ON public.writeoffs FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_delete_writeoffs" ON public.writeoffs;
CREATE POLICY "perm_delete_writeoffs" ON public.writeoffs FOR DELETE TO authenticated
  USING (public.user_can_edit_module('entry') AND public.smi_zapisovat_pro_datum(entry_date));

-- ===== Akce (akce/akce_items) =====
DROP POLICY IF EXISTS "perm_insert_akce" ON public.akce;
CREATE POLICY "perm_insert_akce" ON public.akce FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('akce') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_update_akce" ON public.akce;
CREATE POLICY "perm_update_akce" ON public.akce FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('akce') AND public.smi_zapisovat_pro_datum(entry_date))
  WITH CHECK (public.user_can_edit_module('akce') AND public.smi_zapisovat_pro_datum(entry_date));
DROP POLICY IF EXISTS "perm_delete_akce" ON public.akce;
CREATE POLICY "perm_delete_akce" ON public.akce FOR DELETE TO authenticated
  USING (public.user_can_edit_module('akce') AND public.smi_zapisovat_pro_datum(entry_date));

DROP POLICY IF EXISTS "perm_insert_akce_items" ON public.akce_items;
CREATE POLICY "perm_insert_akce_items" ON public.akce_items FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('akce')
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(a.entry_date) FROM public.akce a WHERE a.id = akce_id), true));
DROP POLICY IF EXISTS "perm_update_akce_items" ON public.akce_items;
CREATE POLICY "perm_update_akce_items" ON public.akce_items FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('akce')
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(a.entry_date) FROM public.akce a WHERE a.id = akce_id), true))
  WITH CHECK (public.user_can_edit_module('akce')
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(a.entry_date) FROM public.akce a WHERE a.id = akce_id), true));
DROP POLICY IF EXISTS "perm_delete_akce_items" ON public.akce_items;
CREATE POLICY "perm_delete_akce_items" ON public.akce_items FOR DELETE TO authenticated
  USING (public.user_can_edit_module('akce')
    AND COALESCE((SELECT public.smi_zapisovat_pro_datum(a.entry_date) FROM public.akce a WHERE a.id = akce_id), true));
