-- Tydenni inventura — evidence toho, ze se v danem tydnu opravdu pocitalo.
--
-- PROC SAMOSTATNA TABULKA A NE RADKY DO `inventory`:
-- Radek v `inventory` je podle skladove knihy (src/lib/stockLedger.ts) RESET —
-- k jeho datu se stav ROVNA zapsanemu mnozstvi a starsi pohyby uz do vysledku
-- nevstupuji. Tydenni pocitani ulozene tudy by tedy kazdy rozdil TICHE
-- SPOLKLO: cislo by po ulozeni sedelo, ale staceni KEG, staceni lahvi ani
-- sklad by o nem nevedely. Presne to uzivatel oznacil za spatne — „nemuze se
-- to propsat jen v jedny tabulce a nikde ne".
--
-- Tydenni inventura proto zadny reset nezapisuje. Rozdil se propise TAM, KDE
-- VZNIKL — prebytek jako chybejici zapis staceni, manko jako zaporny radek ve
-- staceni (viz src/lib/inventoryFix.ts) — takze ho uvidi vsechny obrazovky
-- naraz, protoze ctou tytez tabulky. Do teto tabulky jde jen ZAZNAM O
-- KONTROLE: co se ten tyden napocitalo, co se cekalo a jak se rozdil vyresil.
--
-- K cemu to je:
--   • dohledatelnost — po tydnech je videt, kde se rozdil vzal a kdo ho resil,
--   • hloubkovy audit se muze zeptat „byl tenhle tyden zkontrolovany?",
--   • mesicni uzaverka zustava netknuta, tydenni kontrola do ni nesaha.

CREATE TABLE IF NOT EXISTS public.tydenni_inventura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Pondeli a nedele kontrolovaneho tydne (ISO tyden).
  tyden_od date NOT NULL,
  tyden_do date NOT NULL,
  beer_id uuid REFERENCES public.beers(id) ON DELETE SET NULL,
  beer_name text,
  package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
  package_label text,
  -- Co sklad cekal ke konci tydne (stockForObdobi) a co se fyzicky naslo.
  ocekavano numeric NOT NULL DEFAULT 0,
  napocitano numeric NOT NULL DEFAULT 0,
  -- napocitano − ocekavano. Kladne = prebytek, zaporne = manko.
  rozdil numeric NOT NULL DEFAULT 0,
  -- Jak se rozdil vyresil:
  --   'staceni'    — propsal se do bottling/kegging (prebytek i manko),
  --   'dorovnani'  — sel do inventory_adjustments (nesouvisi s vyrobou),
  --   'ponechano'  — necha se na mesicni uzaverku,
  --   NULL         — jen se spocitalo, jeste se nerozhodlo.
  vyreseno text CHECK (vyreseno IN ('staceni', 'dorovnani', 'ponechano')),
  poznamka text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Jedno pivo × obal ma v jednom tydnu jediny radek. Opakovane ulozeni tehoz
-- tydne tedy prepisuje, misto aby vyrabelo druhou verzi pravdy.
CREATE UNIQUE INDEX IF NOT EXISTS tydenni_inventura_klic_idx
  ON public.tydenni_inventura (tyden_od, beer_id, package_id);

CREATE INDEX IF NOT EXISTS tydenni_inventura_tyden_idx
  ON public.tydenni_inventura (tyden_od DESC);

ALTER TABLE public.tydenni_inventura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tydenni_inventura_select ON public.tydenni_inventura;
CREATE POLICY tydenni_inventura_select ON public.tydenni_inventura
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_insert_tydenni_inventura ON public.tydenni_inventura
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('inventory'));

DROP POLICY IF EXISTS perm_update_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_update_tydenni_inventura ON public.tydenni_inventura
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('inventory'))
  WITH CHECK (public.user_can_edit_module('inventory'));

DROP POLICY IF EXISTS perm_delete_tydenni_inventura ON public.tydenni_inventura;
CREATE POLICY perm_delete_tydenni_inventura ON public.tydenni_inventura
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('inventory'));
