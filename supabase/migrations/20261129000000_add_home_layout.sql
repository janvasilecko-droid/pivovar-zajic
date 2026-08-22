-- Přizpůsobitelný launcher (domovská obrazovka): pořadí/velikost/barva dlaždic
-- a zvolené barevné pozadí, uložené per uživatel tak, aby se synchronizovalo
-- napříč zařízeními (dřív podobné UI preference — theme/density/hidden
-- modules — žily jen v localStorage jednoho zařízení).
--
-- RLS: žádná nová politika není potřeba — "update_own_profile"
-- (auth.uid() = id) z brewery_schema.sql už dovoluje uživateli měnit
-- libovolný sloupec vlastního řádku, home_layout nevyjímaje.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_layout jsonb NOT NULL DEFAULT '{}'::jsonb;
