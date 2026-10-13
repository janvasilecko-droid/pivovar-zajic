-- Oprava zdvojené objednávky Malešice (závoz 14. 10. 2026).
--
-- CO SE STALO: zpráva „Ještě plus 1x50l 12sv" (13. 10. 2026 6:43) se k původní
-- objednávce přičetla a zbytek objednávky se zdvojil (50 l 5× místo 3×,
-- 1,5 l 24× místo 12× atd.). Původní zpráva z 12. 10. 12:37 říká:
--     SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET + 20x0,5l lahev
--     Jantar 12 = 1x30l KEG + 10x0,5l lahev
--   a k tomu „ještě plus 1x50l 12sv" → 50 l má být 3×.
--
-- CO MIGRACE DĚLÁ: přepíše množství šesti položek téhle JEDNÉ objednávky na
-- správné hodnoty. Každá změna má pojistku: proběhne jen tehdy, když má
-- položka pořád ten zdvojený počet. Kdo už objednávku ručně opravil, nic
-- se nepřepíše. Nic se nemaže. Odpočty ze skladu (mají datum 14. 10.) se
-- potom srovnají s novými počty.

UPDATE public.order_items SET quantity = 3  WHERE id = 'df9341f8-bc07-4450-8c36-627d832b68cc' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 5;   -- 12° Světlá 50 l
UPDATE public.order_items SET quantity = 12 WHERE id = 'f58083bb-b0cd-4fac-937e-12c468b19b0a' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 24;  -- 12° Světlá 1,5 l
UPDATE public.order_items SET quantity = 20 WHERE id = 'e05d7cbb-9385-4c33-bb0b-57e34d93e06d' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 40;  -- 12° Světlá 0,5 l
UPDATE public.order_items SET quantity = 1  WHERE id = '8d7775e9-c93f-4a80-a7d3-7b35c94c17ae' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 2;   -- Jantar 30 l
UPDATE public.order_items SET quantity = 10 WHERE id = 'f36504eb-64e8-4cb4-a6e1-061f40be42bd' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 20;  -- Jantar 0,5 l
UPDATE public.order_items SET quantity = 2  WHERE id = '2c1c6a17-ef47-4dc9-b406-4458b286f70a' AND order_id = '1e20f6fc-ec94-423d-a098-5c06fc933e57' AND quantity = 4;   -- 12° Světlá 30 l

-- Odpočty ze skladu s novými počty (funkce jen upravuje existující odpočty).
SELECT public.srovnat_odpocty_objednavky('1e20f6fc-ec94-423d-a098-5c06fc933e57'::uuid)
WHERE EXISTS (SELECT 1 FROM public.orders WHERE id = '1e20f6fc-ec94-423d-a098-5c06fc933e57');
