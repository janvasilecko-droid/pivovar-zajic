-- 🍺 Doplnění chybějícího stáčení KEG podle srpnové inventury 2026.
--
-- Inventura z 1. 9. 2026 je zdroj pravdy: co je fyzicky ve skladu, se
-- opravdu vyrobilo. U šesti piv v 50l sudech skladová kniha čekala MÍŇ, než
-- kolik se napočítalo — přebytek tedy znamená stáčení, které se neudělalo
-- zápisem. Dopisuje se sem, aby výroba i sklad seděly na to, co bylo v regálu:
--
--   12° Světlá  50 l   +5      Osma        50 l   +1
--   10° Desítka 50 l   +4      12° Tmavá   50 l   +1
--   Jantar      50 l   +1      Summer Ale  50 l   +1
--
-- Citron a Grep se ZÁMĚRNĚ vynechávají (u nich chybí stáčení 100 lahví a
-- 5+1 sudu, ale řeší se zvlášť) a lahve ani sudy spotřebované na lahve se
-- nedoplňují — ty u piv sedí.
--
-- Zapisuje se BEZ TANKU (cellar_tank_id NULL), stejně jako když se v appce
-- u doplňku tank nevybere: objem se tedy neodečítá ze Sklepa.
--
-- Rozdíl se počítá znovu při každém spuštění, takže druhé spuštění už
-- nezapíše nic — po prvním je rozdíl nula.
with pohyby as (
  select beer_id, package_id, quantity::numeric as q from kegging where entry_date between '2026-08-01' and '2026-08-31'
  union all
  select beer_id, package_id, quantity::numeric from bottling where entry_date between '2026-08-01' and '2026-08-31'
  union all
  select b.beer_id,
         coalesce(b.kegs_used_package_id,
                  (select p.id from packages p where p.kind='keg' and p.volume_l = b.source_volume_l / nullif(b.kegs_used,0) limit 1),
                  (select p.id from packages p where p.id=b.package_id and p.kind='keg')),
         -b.kegs_used::numeric
  from bottling b where b.entry_date between '2026-08-01' and '2026-08-31' and coalesce(b.kegs_used,0) <> 0
  union all
  select beer_id, package_id, -quantity::numeric from fasovani where entry_date between '2026-08-01' and '2026-08-31'
  union all
  select beer_id, package_id, -quantity::numeric from fasovani_private where entry_date between '2026-08-01' and '2026-08-31'
  union all
  select beer_id, package_id, -quantity::numeric from writeoffs where entry_date between '2026-08-01' and '2026-08-31'
  union all
  select beer_id, package_id, -quantity::numeric from zavoz_deductions where deduct_date between '2026-08-01' and '2026-08-31'
  union all
  select i.beer_id, i.package_id, -(coalesce(i.quantity_taken,0)-coalesce(i.quantity_returned,0))::numeric
  from akce_items i join akce a on a.id=i.akce_id where a.entry_date between '2026-08-01' and '2026-08-31'
  union all
  select beer_id, from_package_id, -from_count::numeric from keg_prefuk where entry_date between '2026-08-01' and '2026-08-31' and from_package_id is not null
  union all
  select beer_id, to_package_id, to_count::numeric from keg_prefuk where entry_date between '2026-08-01' and '2026-08-31' and to_package_id is not null
),
pocatek as (select beer_id, package_id, sum(quantity)::numeric q from inventory where entry_date='2026-08-01' and note ilike '%Počáteč%' group by 1,2),
napocitano as (select beer_id, package_id, sum(quantity)::numeric q from inventory where entry_date='2026-08-31' group by 1,2),
klice as (
  select beer_id, package_id from pohyby where beer_id is not null and package_id is not null
  union select beer_id, package_id from pocatek union select beer_id, package_id from napocitano
),
doplnit as (
  select k.beer_id, k.package_id, b.name as beer_name, p.label as package_label,
         (coalesce(n.q,0) - (coalesce(pc.q,0) + coalesce((select sum(q) from pohyby h where h.beer_id=k.beer_id and h.package_id=k.package_id),0))) as rozdil
  from klice k join beers b on b.id=k.beer_id join packages p on p.id=k.package_id
  left join pocatek pc on pc.beer_id=k.beer_id and pc.package_id=k.package_id
  left join napocitano n on n.beer_id=k.beer_id and n.package_id=k.package_id
  where b.name not ilike 'citron%' and b.name not ilike 'grep%' and p.kind='keg'
)
insert into kegging (entry_date, beer_id, beer_name, package_id, package_label, quantity, cellar_tank_id, source_volume_l, note)
select '2026-08-31', beer_id, beer_name, package_id, package_label, rozdil, null, null,
       'Doplněno z inventury 2026-08 — ' || package_label || ' bez tanku (přebytek ' || rozdil::int || ' ks)'
from doplnit where rozdil > 0
returning beer_name, package_label, quantity, note;
