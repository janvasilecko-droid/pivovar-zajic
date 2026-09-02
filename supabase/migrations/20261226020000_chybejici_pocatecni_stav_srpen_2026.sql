-- 📅 Chybějící „Počáteční stav" k 1. 8. 2026 u 12° Světlé 0,33 l.
--
-- Sklad si počátek měsíce DOPOČÍTÁVÁ z historie, Inventura ho bere ze
-- zapsaného řádku „Počáteční stav". Když ten řádek chybí, Inventura počítá od
-- nuly a obě strany se rozejdou. V srpnu 2026 se to stalo u jediné položky:
--
--   12° Světlá 0,33 l — Inventura 0, Sklad 80
--
-- Odkud těch 80: červnová inventura (30. 6.) jich napočítala 80, červenec je
-- převzal jako počáteční stav a za celý červenec se u nich nic nezměnilo
-- (10 + 150 stočeno, 160 zavezeno). Do červencové SCHVÁLENÉ inventury se ale
-- tahle položka nedostala — má jen 19 řádků — takže se do srpnového
-- „Počátečního stavu" nepřenesla a Inventura o těch 80 nevěděla.
--
-- Napočítaná srpnová inventura říká 0 ks a doplněné stáčení (+100 k 31. 8.)
-- už bylo spočítané proti nulovému počátku. Zapisuje se tedy nula: sedí s tím,
-- co se skutečně napočítalo, a obě obrazovky pak ukazují totéž.
--
-- Pozor: nepoužívá se RPC save_inventory_snapshot — ta maže všechny „Počáteční
-- stav" řádky daného dne a nahrazuje je tím, co dostane. Tady se doplňuje
-- JEDEN chybějící řádek k devatenácti existujícím.
insert into public.inventory (entry_date, beer_id, beer_name, package_id, package_label, quantity, note)
select '2026-08-01', b.id, b.name, p.id, p.label, 0, 'Počáteční stav'
from public.beers b
cross join public.packages p
where b.name = '12° Světlá' and p.label = '0.33l'
  and not exists (
    select 1 from public.inventory i
    where i.entry_date = '2026-08-01' and i.beer_id = b.id and i.package_id = p.id
      and i.note ilike '%Počáteč%'
  );
