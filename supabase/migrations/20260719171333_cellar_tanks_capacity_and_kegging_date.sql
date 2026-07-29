/*
# Sklep tanky — kapacita 8000L + datum sudování

1. Zmeny tabulky cellar_tanks
- capacity_l: zmena defaultu na 8000 (sloupec zustava numeric, zadna destrukce dat).
- Pridan sloupec kegging_date (date) — datum sudovani tanku.
- Pridan sloupec beer_type (text) — typ piva (svetle/tmave/rezane/polenka...), volitelny text.

2. Aktualizace existujicich tanku 1-8 na kapacitu 8000L.

3. Bezpecnost — bez zmen (RLS uz povoleno).
*/

alter table public.cellar_tanks
  add column if not exists kegging_date date,
  add column if not exists beer_type text;

-- Aktualizace kapacity existujicich tanku na 8000L
update public.cellar_tanks set capacity_l = 8000 where capacity_l <> 8000;