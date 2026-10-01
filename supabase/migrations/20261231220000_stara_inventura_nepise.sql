-- 🔒 Stará funkce uložení inventury už nic nemaže ani nepřepisuje.
--
-- Z provozu 1. 10. 2026: „inventura 12° Světlá KEG 50 l a 30 l vychází míň"
-- a „jsou vrácené sudy ze zrušených objednávek Maneo a Mutěnice započítané
-- správně?"
--
-- CO SE DĚJE: migrace 20261231210000 zavedla save_physical_inventory_v2,
-- která maže a přepisuje jen ZTRÁTY (bez objednávky a bez důvodu). Starou
-- save_physical_inventory ale nechala beze změny „kvůli telefonům se starou
-- verzí appky". Jenže právě ta stará dvojice (stará appka + stará funkce)
-- dělá škodu, kvůli které v2 vznikla:
--   • funkce smaže VŠECHNA dorovnání měsíce — vrácení z objednávek,
--     zrušení s vrácením (Maneo, Mutěnice) i dorovnání týdenní inventury,
--   • stará appka je posílá zpátky sečtené jako „ztráty" k poslednímu dni
--     měsíce, bez objednávky a bez důvodu.
-- Inventura pak ztráty do očekávaného stavu nepočítá: vrácené sudy z něj
-- zmizí, a když vypadne kladné týdenní dorovnání (např. u 12° Světlé 50 l
-- a 30 l), vyjde nižší. Stačí jedno uložení z neaktualizovaného telefonu
-- nebo APK.
--
-- OPRAVA: stará funkce uložení odmítne s jasnou hláškou a nic nezapíše.
-- Stará appka ukáže chybu ukládání, napočítané stavy jí zůstanou
-- v telefonu (localStorage) a po aktualizaci se uloží přes _v2.
-- Aktuální appka starou funkci nevolá (hlídá src/lib/inventuraZtraty.test.ts).
--
-- Data, která už stará funkce přepsala, tahle migrace NEOPRAVUJE — pozná se
-- to až z ostrých dat (npm run rozbor-skladu: zrušená objednávka
-- „vráceno o X míň" a dorovnání „bez důvodu = ztráta" se stejným časem
-- zápisu k poslednímu dni měsíce). Oprava dat bude samostatná migrace.

CREATE OR REPLACE FUNCTION public.save_physical_inventory(p_entry_date date, p_rows jsonb, p_adjustments jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Tahle verze appky ukládá inventuru postaru a smazala by vrácení z objednávek. Aktualizuj appku (zavři ji a otevři znovu) a ulož inventuru znovu — napočítané stavy zůstaly v telefonu.'
    USING ERRCODE = 'P0001';
END
$function$;

REVOKE ALL ON FUNCTION public.save_physical_inventory(date, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_physical_inventory(date, jsonb, jsonb) TO authenticated;
