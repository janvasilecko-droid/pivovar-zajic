/*
# Ceník — cena za litr piva pro automatický přepočet ceny kegů

## 1. Účel
Ceník kegů se má počítat automaticky: u piva se zadá jen cena za litr a
z ní se dopočítá cena kegu podle jeho objemu (30l keg = 30 × cena/l).
Ceny lahví se nadále zadávají ručně (tabulka `price_list`), protože se
neřídí čistě objemem (obchodní cena za balení).

## 2. Změny
- `beers` — nový sloupec `price_per_liter numeric(10,2)` — cena za litr
  piva v Kč. Výchozí NULL (nezadáno).

## 3. Bezpečnost
- Žádné nové RLS politiky — sloupec je součástí existující tabulky `beers`,
  řídí se stávajícími policy (authenticated CRUD).

## 4. Poznámky
- Idempotentní — `ADD COLUMN IF NOT EXISTS`.
*/

ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS price_per_liter numeric(10,2);
