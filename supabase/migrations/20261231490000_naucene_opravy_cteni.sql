-- 🧠 Naučené opravy čtení objednávek — jen to, co člověk výslovně potvrdil.
--
-- Zadání majitele 23. 11. 2026: „pokud se něco přečte nesprávně, přidej tam
-- možnost tlačítko naučit; pokud to uživatel opraví a bude chtít, aby si AI
-- pamatovala tu opravu, tak to může zakliknout a appka si to bude na příště
-- pamatovat."
--
-- Do té doby se appka „učila" potichu z KAŽDÉ ruční změny piva nebo obalu
-- (tabulka parser_aliases) — i když šlo o záměnu jen pro jednu objednávku.
-- Vzniklo 184 pravidel typu „30l → 1 l" a „0.33l → 0,5 l", podle kterých se
-- pak četly další zprávy špatně. Čtení zpráv z WhatsAppu je proto už nepoužívá
-- (viz supabase/functions/whatsapp-auto-parse) a pamatuje si jen řádky této
-- tabulky: opravu, u které uživatel v kontrole zprávy zaškrtl „Naučit".
--
-- Oprava platí pro odběratele, u kterého vznikla („bedna" je u Lužce třetinka,
-- jinde půllitr): řádek se stejným textem (bez počtu kusů) se u něj příště
-- přečte stejně a AI ji dostane jako příklad pro podobně napsané řádky.
--
-- Tabulka parser_aliases zůstává beze změny — nic se nemaže ani nepřevádí.

CREATE TABLE IF NOT EXISTS public.naucene_opravy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Komu oprava patří: id odběratele z katalogu, nebo „jmeno:<název malými písmeny>"
  -- u odběratele psaného jen jménem. Spolu s klíčem řádku je jedinečný —
  -- nové naučení téhož řádku staré přepíše.
  misto_klic text NOT NULL,
  place_id uuid REFERENCES public.places(id) ON DELETE CASCADE,
  place_name text,
  -- Řádek, jak stál ve zprávě (pro člověka a jako příklad pro AI).
  radek text NOT NULL,
  -- Tentýž řádek bez diakritiky a bez počtu kusů — podle něj se pozná „totéž".
  klic text NOT NULL,
  -- Co se má příště přečíst. Vyplněné je jen to, co uživatel opravil.
  beer_id uuid REFERENCES public.beers(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.packages(id) ON DELETE CASCADE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT naucene_opravy_neco_uci CHECK (beer_id IS NOT NULL OR package_id IS NOT NULL),
  CONSTRAINT naucene_opravy_delky CHECK (
    char_length(misto_klic) BETWEEN 1 AND 200
    AND char_length(radek) BETWEEN 1 AND 200
    AND char_length(klic) BETWEEN 1 AND 200
  ),
  CONSTRAINT naucene_opravy_jedna_na_radek UNIQUE (misto_klic, klic)
);

COMMENT ON TABLE public.naucene_opravy IS
  'Opravy čtení objednávek, které uživatel výslovně potvrdil zaškrtnutím „Naučit" v kontrole zprávy z WhatsAppu. Platí pro odběratele, u kterého vznikly. Čte je whatsapp-auto-parse a „Přečíst znovu" v appce.';

ALTER TABLE public.naucene_opravy ENABLE ROW LEVEL SECURITY;

-- Číst smí každý přihlášený (kontrola zprávy, přehled v Katalozích); zapisovat
-- ten, kdo smí upravovat objednávky — stejně jako order_items.
DROP POLICY IF EXISTS "auth_read_naucene_opravy" ON public.naucene_opravy;
CREATE POLICY "auth_read_naucene_opravy" ON public.naucene_opravy
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "perm_insert_naucene_opravy" ON public.naucene_opravy;
CREATE POLICY "perm_insert_naucene_opravy" ON public.naucene_opravy
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));

DROP POLICY IF EXISTS "perm_update_naucene_opravy" ON public.naucene_opravy;
CREATE POLICY "perm_update_naucene_opravy" ON public.naucene_opravy
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'))
  WITH CHECK (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));

DROP POLICY IF EXISTS "perm_delete_naucene_opravy" ON public.naucene_opravy;
CREATE POLICY "perm_delete_naucene_opravy" ON public.naucene_opravy
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('orders') OR public.user_can_edit_module('zavoz'));

CREATE INDEX IF NOT EXISTS idx_naucene_opravy_created_at ON public.naucene_opravy (created_at DESC);
