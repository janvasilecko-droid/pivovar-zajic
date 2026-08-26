-- Akce/festivaly: dorovnani schematu, aby se do DB dala ulozit CELA akce.
--
-- Stav pred touto migraci: obrazovka Akce (src/screens/Akce.tsx) ukladala
-- vsechno JEN do localStorage prohlizece a do DB nikdy nezapsala nic -
-- overeno na produkci: akce i akce_items mely 0 radku, zatimco objednavky
-- 165 a staceni 164. Osm mist v appce pritom z techto prazdnych tabulek
-- cte spotrebu piva na akcich (Sklad, Dashboard, Inventura, Staceni KEG,
-- Lahve, Objednavky, Historie, Planovac staceni), takze odvezene pivo se
-- nikdy neodecetlo ze skladu.
--
-- Tabulky uz existovaly, ale chybely jim sloupce, ktere appka pouziva
-- (stav, pripraveno, vybaveni, trzba, hodnoceni, doporuceni). Bez nich
-- nelze akci ulozit bez ztraty dat.
--
-- Sloupce beer_id/package_id/quantity_* primo na tabulce `akce` jsou
-- pozustatek puvodniho navrhu "jedna akce = jedna polozka". Polozky dnes
-- patri do akce_items, takze se na `akce` uvolnuji NOT NULL, aby hlavicka
-- akce mohla existovat samostatne.

ALTER TABLE public.akce
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment jsonb,
  ADD COLUMN IF NOT EXISTS revenue numeric,
  ADD COLUMN IF NOT EXISTS rating integer,
  ADD COLUMN IF NOT EXISTS recommend text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Hlavicka akce uz nenese vlastni polozku (ta je v akce_items).
ALTER TABLE public.akce ALTER COLUMN quantity_taken DROP NOT NULL;
ALTER TABLE public.akce ALTER COLUMN quantity_returned DROP NOT NULL;

-- Smazani akce musi uklidit i jeji polozky (jinak zustanou sirotci, ktere
-- skladove vypocty dal pocitaji jako spotrebu).
ALTER TABLE public.akce_items
  DROP CONSTRAINT IF EXISTS akce_items_akce_id_fkey;
ALTER TABLE public.akce_items
  ADD CONSTRAINT akce_items_akce_id_fkey
    FOREIGN KEY (akce_id) REFERENCES public.akce(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS akce_entry_date_idx ON public.akce (entry_date);
CREATE INDEX IF NOT EXISTS akce_items_akce_id_idx ON public.akce_items (akce_id);

-- Server-side vynuceni opravneni modulu "akce" (dosud tyto tabulky
-- kontrolu prav na urovni DB vubec nemely - viz nalez z bezpecnostniho
-- auditu, kde brigadnik s omezenym uctem mohl pres REST smazat celou
-- evidenci akci). Stejny fail-open vzorec jako u ostatnich modulu.
DROP POLICY IF EXISTS "perm_insert_akce" ON public.akce;
CREATE POLICY "perm_insert_akce" ON public.akce FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('akce'));
DROP POLICY IF EXISTS "perm_update_akce" ON public.akce;
CREATE POLICY "perm_update_akce" ON public.akce FOR UPDATE TO authenticated USING (public.user_can_edit_module('akce')) WITH CHECK (public.user_can_edit_module('akce'));
DROP POLICY IF EXISTS "perm_delete_akce" ON public.akce;
CREATE POLICY "perm_delete_akce" ON public.akce FOR DELETE TO authenticated USING (public.user_can_edit_module('akce'));

DROP POLICY IF EXISTS "perm_insert_akce_items" ON public.akce_items;
CREATE POLICY "perm_insert_akce_items" ON public.akce_items FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('akce'));
DROP POLICY IF EXISTS "perm_update_akce_items" ON public.akce_items;
CREATE POLICY "perm_update_akce_items" ON public.akce_items FOR UPDATE TO authenticated USING (public.user_can_edit_module('akce')) WITH CHECK (public.user_can_edit_module('akce'));
DROP POLICY IF EXISTS "perm_delete_akce_items" ON public.akce_items;
CREATE POLICY "perm_delete_akce_items" ON public.akce_items FOR DELETE TO authenticated USING (public.user_can_edit_module('akce'));
