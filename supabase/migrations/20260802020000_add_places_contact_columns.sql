-- Přidání chybějících sloupců do tabulky places
-- (contact_name, email, delivery_group) — tyto sloupce aplikace používá,
-- ale v databázi zatím neexistovaly, takže vkládání nového odběratele selhávalo.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS delivery_group text;
