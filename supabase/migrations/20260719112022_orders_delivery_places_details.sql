/*
# Objednávky: den dodání, připraveno, fasování + Odběratelé: adresa/telefon/otvírací doba

1. orders — nové sloupce
- `delivery_day` (text) — zkratka dne v týdnu, kdy se pováží (po/ut/st/ct/pa/so/ne). Volitelné.
- `is_prepared` (boolean, default false) — zaškrtávací pole "připraveno".
- `is_packaged` (boolean, default false) — zaškrtávací pole "fasování" hotovo.
   Poznámka: `note` už existuje (text), používáme ho pro poznámky k objednávce.

2. places — nové sloupce
- `address` (text) — adresa odběratele.
- `phone` (text) — telefonní kontakt.
- `opening_hours` (text) — otvírací doba (volný text).
   Poznámka: `note` už existuje (text), používáme ho pro obecné poznámky.

3. Security
- RLS už je zapnuté na orders i places. Neměníme žádné policy — nové sloupce dědí stávající policy (authenticated CRUD).

4. Důležité poznámky
- Nepouštíme žádná data, jen přidáváme sloupce s výchozími hodnotami.
- `delivery_day` je volitelný text (ne enum), aby uživatel mohl zapsat i "po/ct" pro více dnů.
- Pro detekci "zda je pivo stáčené v daném týdnu" slouží aplikace (JOIN bottling/kegging), ne sloupec.
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_day text,
  ADD COLUMN IF NOT EXISTS is_prepared boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_packaged boolean NOT NULL DEFAULT false;

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS opening_hours text;
