-- Skladovy pohyb bez piva nebo obalu je "neviditelny" zaznam (nalez z auditu).
--
-- Formulare kontrolovaly jen obal a mnozstvi, ne pivo. Zaznam se ulozil,
-- byl videt v seznamu — ale VSECHNY skladove vypocty ho preskoci, protoze
-- vsude filtruji `if (!beer_id || !package_id) return`. Zamestnanec tedy
-- vyfasoval 12 lahvi, zapomnel vybrat pivo, a sklad se o tom nikdy nedozvedel:
-- trvale nadhodnoceny stav, ktery nikdo nedokaze vysvetlit.
--
-- Klientska validace uz je doplnena (ProdejnaScreen, Kegging, BottlingScreen).
-- Tohle je pojistka na urovni databaze, aby to neslo obejit ani jinou cestou.
--
-- Overeno pred nasazenim: ve vsech peti tabulkach je 0 takovych radku,
-- takze se validaci nic existujiciho nerozbije.
--
-- Pozn.: order_items se zamerne NEomezuje — objednavka muze legitimne
-- vznikat po castech (import z fotky, rozpracovana objednavka) a nulove
-- polozky uz blokuje UI pri schvalovani WhatsApp objednavek.

ALTER TABLE public.bottling DROP CONSTRAINT IF EXISTS bottling_beer_package_required;
ALTER TABLE public.bottling
  ADD CONSTRAINT bottling_beer_package_required
  CHECK (beer_id IS NOT NULL AND package_id IS NOT NULL);

ALTER TABLE public.kegging DROP CONSTRAINT IF EXISTS kegging_beer_package_required;
ALTER TABLE public.kegging
  ADD CONSTRAINT kegging_beer_package_required
  CHECK (beer_id IS NOT NULL AND package_id IS NOT NULL);

ALTER TABLE public.fasovani DROP CONSTRAINT IF EXISTS fasovani_beer_package_required;
ALTER TABLE public.fasovani
  ADD CONSTRAINT fasovani_beer_package_required
  CHECK (beer_id IS NOT NULL AND package_id IS NOT NULL);

ALTER TABLE public.fasovani_private DROP CONSTRAINT IF EXISTS fasovani_private_beer_package_required;
ALTER TABLE public.fasovani_private
  ADD CONSTRAINT fasovani_private_beer_package_required
  CHECK (beer_id IS NOT NULL AND package_id IS NOT NULL);

ALTER TABLE public.writeoffs DROP CONSTRAINT IF EXISTS writeoffs_beer_package_required;
ALTER TABLE public.writeoffs
  ADD CONSTRAINT writeoffs_beer_package_required
  CHECK (beer_id IS NOT NULL AND package_id IS NOT NULL);

-- Smazani piva/obalu z ciselniku dosud nastavilo beer_id/package_id na NULL
-- (ON DELETE SET NULL) — cimz se VSECHNY historicke pohyby toho piva razem
-- staly neviditelnymi pro skladove vypocty, vcetne zpetnych dopoctu
-- minulych mesicu. Denormalizovane beer_name/package_label pritom zustaly,
-- takze v seznamech to porad vypadalo v poradku.
-- RESTRICT znamena, ze pivo s historii uz nejde smazat — v UI se ma misto
-- toho pouzit "neaktivni" (is_active = false), coz uz appka umi.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND c.confdeltype = 'n'  -- ON DELETE SET NULL
      AND t.relname IN ('bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'zavoz_deductions')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
    RAISE NOTICE 'Odstranen ON DELETE SET NULL: %.%', r.relname, r.conname;
  END LOOP;
END $$;

ALTER TABLE public.bottling
  ADD CONSTRAINT bottling_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT bottling_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
ALTER TABLE public.kegging
  ADD CONSTRAINT kegging_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT kegging_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
ALTER TABLE public.fasovani
  ADD CONSTRAINT fasovani_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fasovani_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
ALTER TABLE public.fasovani_private
  ADD CONSTRAINT fasovani_private_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fasovani_private_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
ALTER TABLE public.writeoffs
  ADD CONSTRAINT writeoffs_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT writeoffs_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
ALTER TABLE public.zavoz_deductions
  ADD CONSTRAINT zavoz_deductions_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT zavoz_deductions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE RESTRICT;
