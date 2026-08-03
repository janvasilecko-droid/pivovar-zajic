-- Přidání sloupců do tabulky bottling pro evidenci použitých sudů KEG
-- (kolik sudů KEG bylo použito na stočení do lahví a jaký typ sudu)
-- Při stáčení např. 2x50L do 1L lahví (~98 lahví) se odečtou 2 kegy ze skladu.

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS kegs_used numeric,
  ADD COLUMN IF NOT EXISTS kegs_used_package_id uuid;
