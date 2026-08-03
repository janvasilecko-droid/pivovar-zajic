/*
# Přidání sloupce short_name do tabulky beers

## 1. Účel
Frontend (Catalogs.tsx, supabase.ts) používá sloupec `short_name` na tabulce
`beers` (zkratka piva pro úzké sloupce), ale tento sloupec v databázi chybí
(nebyl přidán v žádné migraci). To způsobuje, že INSERT/UPDATE piva selhává
s chybou "column short_name does not exist" a pivo se nepodaří uložit.

## 2. Změny
- `beers` — nový sloupec `short_name text` (nullable).

## 3. Bezpečnost
- Žádné změny RLS/policy — sloupec je součástí existující tabulky `beers`,
  řídí se stávajícími policy (authenticated CRUD).

## 4. Poznámky
- Idempotentní — `ADD COLUMN IF NOT EXISTS`.
*/

ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS short_name text;
