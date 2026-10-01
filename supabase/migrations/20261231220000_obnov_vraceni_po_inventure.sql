-- ↩️ Obnova záznamů vrácení, které přepsalo uložení inventury.
--
-- Z provozu 1. 10. 2026: „je tam ztráta (měsíční inventura)… to je blbost,
-- je to zrušení objednávky a vrácení na sklad."
--
-- CO SE STALO: uložení měsíční inventury (stará save_physical_inventory, viz
-- 20261231210000) smazalo všechny záznamy v inventory_adjustments za září
-- a zapsalo je zpátky jako „ztráty" — bez objednávky a bez důvodu, k poslednímu
-- dni měsíce. Tak přišlo o vazbu i vrácení ze zrušených objednávek Maneo a
-- Mutěnice (zrušení s vrácením, od 29. 9. 2026).
--
-- OPRAVA: záznam bez objednávky a bez důvodu od 29. 9. 2026 (dřív zrušení
-- s vrácením neexistovalo), jehož pivo × obal je v položkách objednávky
-- zrušené s vrácením (poznámka „Zrušeno. Vráceno …"), dostane zpátky důvod
-- „Zrušená objednávka, vráceno na sklad — <odběratel>". Když pivo × obal
-- patří jen jedné takové objednávce, dostane i její order_id. Uložení
-- inventury záznamy sloučilo po pivu a obalu, takže když jich víc
-- objednávek vracelo stejné pivo a obal, vazba na jednu z nich se nastavit
-- nedá — důvod jmenuje všechny.
--
-- Kusy se nemění, jen popis a vazba: appka pak záznam ukáže jako vrácení
-- (ne jako ztrátu) a započítá ho do očekávaného stavu inventury.
-- Idempotentní: podruhé už záznam důvod má a podmínka ho nevybere.

UPDATE public.inventory_adjustments AS ia
SET reason = 'Zrušená objednávka, vráceno na sklad — ' || sub.mista
             || ' (záznam obnoven, přepsalo ho uložení inventury)',
    order_id = CASE WHEN sub.pocet = 1 THEN sub.jedna_objednavka ELSE NULL END
FROM (
  SELECT oi.beer_id,
         oi.package_id,
         string_agg(DISTINCT COALESCE(NULLIF(btrim(o.place_name), ''), 'objednávka'), ', ') AS mista,
         count(DISTINCT o.id) AS pocet,
         (array_agg(o.id ORDER BY o.id))[1] AS jedna_objednavka
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.status = 'storno'
    AND COALESCE(o.note, '') LIKE '%Zrušeno. Vráceno %'
    AND oi.beer_id IS NOT NULL
    AND oi.package_id IS NOT NULL
  GROUP BY oi.beer_id, oi.package_id
) AS sub
WHERE ia.order_id IS NULL
  AND NULLIF(btrim(COALESCE(ia.reason, '')), '') IS NULL
  AND ia.entry_date >= DATE '2026-09-29'
  AND ia.quantity > 0
  AND ia.beer_id = sub.beer_id
  AND ia.package_id = sub.package_id;
