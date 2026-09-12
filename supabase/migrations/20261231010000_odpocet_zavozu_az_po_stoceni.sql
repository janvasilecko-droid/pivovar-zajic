-- Automatický odpočet závozu přestává odepisovat sklad podle KALENDÁŘE
-- a začíná vyžadovat, aby bylo pivo doopravdy STOČENÉ.
--
-- CO SE DĚLO: process_zavoz_deductions_for_date() (spouští ji každou hodinu
-- run_today_zavoz_deductions přes pg_cron) odepisovala položku ze skladu,
-- jakmile její den závozu DOŠEL — bez ohledu na to, jestli se pivo doopravdy
-- stočilo. Je to JEDINÉ místo v appce, které do zavoz_deductions kdy zapisuje
-- (žádný klientský kód do tabulky nepíše přímo — ověřeno). A protože
-- 20261215000000_zavoz_datum_a_uzavreni.sql zavedla spouštěč, který
-- objednávku SAMA uzavře (status 'vyrizeno_zavoz', is_delivered = true),
-- jakmile mají odpočet úplně všechny její položky, appka se stejným
-- zpožděním sama označila za zavezenou i celou objednávku.
--
-- Z provozu 11.–12. 9. 2026: v plánu stáčení bylo u pátku „vše stočeno" pro
-- 12° Světlou a 12° Tmavou, přestože se ještě NESTOČILY — appka to napsala
-- sama, protože pátek už jen prošel. Protože spouštěč běží každou hodinu,
-- i ruční přepnutí zpátky na „Nová" by appka do hodiny sama zase přepsala
-- zpět, dokud by odpočet položkám zůstával.
--
-- ŘEŠENÍ: řídit se skutečností, ne kalendářem. Objednávka projde třemi stavy
-- (viz 20261229010000_objednavka_stoceno.sql): STOČENO → PŘIPRAVENO →
-- ZAVEZENO. `order_items.is_bottled` je právě to první, ruční zaškrtnutí
-- „Stočeno" u položky (Objednávky i Závoz čtou stejný sloupec). Automatický
-- odpočet teď vyžaduje `is_bottled = true` navíc k tomu, že den závozu
-- prošel — objednávka, kterou nikdo neoznačil jako stočenou, se sama
-- neodepíše ani nezavře, ať je sebevíc po termínu.
--
-- CO SE NEMĚNÍ: ruční tlačítko „Zavezeno" v Závozu (Zavoz.tsx toggleDelivered)
-- zůstává na obsluze beze změny — kdo chce objednávku zavézt a odbavit
-- i bez odškrtnutí Stočeno u každé položky, pořád může. Tahle migrace mění
-- jen AUTOMATICKÝ odpočet, který dřív běžel bez jakéhokoliv potvrzení.
--
-- DŮSLEDEK PRO PROVOZ: bez zaškrtnutí „Stočeno" u KAŽDÉ položky se appka
-- sama neodepíše ani nezavře, i když den závozu dávno prošel — „co je
-- potřeba stočit" tak zůstane pravdivé, ale kapku je teď potřeba
-- odškrtávat doopravdy.

CREATE OR REPLACE FUNCTION public.process_zavoz_deductions_for_date(p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Deduction date is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('zavoz_deductions:' || p_date::text));

  INSERT INTO public.zavoz_deductions (
    deduct_date,
    order_id,
    order_item_id,
    beer_id,
    package_id,
    quantity,
    note
  )
  SELECT
    p_date,
    o.id,
    oi.id,
    oi.beer_id,
    oi.package_id,
    oi.quantity,
    'Automaticky odpocet zavozu'
  FROM public.orders AS o
  JOIN public.order_items AS oi ON oi.order_id = o.id
  WHERE o.status <> 'storno'
    AND oi.quantity > 0
    -- Nové: bez odškrtnutého „Stočeno" u položky se sklad neodepisuje, ať je
    -- den závozu sebevíc v minulosti — kalendář sám o sobě nic nedokazuje.
    AND oi.is_bottled = true
    AND COALESCE(
      o.delivery_date,
      date_trunc('week', o.order_date::timestamp)::date
        + CASE split_part(COALESCE(NULLIF(o.delivery_day, ''), 'pa'), '/', 1)
            WHEN 'po' THEN 0
            WHEN 'ut' THEN 1
            WHEN 'st' THEN 2
            WHEN 'ct' THEN 3
            WHEN 'pa' THEN 4
            WHEN 'so' THEN 5
            WHEN 'ne' THEN 6
            ELSE 4
          END
    ) = p_date
  ON CONFLICT (order_item_id) WHERE order_item_id IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$$;

-- Obranné znovu-udělení práv, stejný důvod jako u
-- 20261230020000_znovu_prava_zavoz_odpoctu.sql: CREATE OR REPLACE FUNCTION
-- práva normálně zachovává (stejné OID), ale u run_today_zavoz_deductions()
-- se jednou (9. 9. 2026) po přesně takovém nahrazení objevilo "permission
-- denied" a skutečná příčina zůstala nejasná. Radši explicitně, ať se appka
-- nezasekne na klientském volání kvůli něčemu, co se nedá dopředu vyloučit.
REVOKE ALL ON FUNCTION public.process_zavoz_deductions_for_date(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_zavoz_deductions_for_date(date)
  TO service_role;

-- Úklid zpětně: zrušit odpočty, které automat stihl zapsat pro NESTOČENÉ
-- položky, než tahle migrace proběhla — jinak by „už jednou odečteno"
-- (UNIQUE index na order_item_id) navždy blokovalo správný zápis, až se
-- pivo doopravdy stočí.
--
-- Mažou se JEN automatické odpočty (note = 'Automaticky odpocet zavozu';
-- žádný jiný kód do tabulky nikdy nezapisuje, ověřeno) u položek bez
-- is_bottled. Bezpečné i pro položku, která byla ve skutečnosti v pořádku
-- zavezená, jen bez odškrtnuté kapky: smazáním se jen vrátí do stavu „ještě
-- nepočítáno" a příští běh automatu (jakmile kapku někdo odškrtne) ji
-- zapíše znovu — stejná samoopravná vlastnost, na které stavěla i migrace
-- 20261123000000 (viz její popis „safe to re-run").
--
-- ÚMYSLNĚ SE TADY NESAHÁ NA orders.is_delivered / status. Spouštěč
-- uzavrit_odectenou_objednavku zapisuje STEJNÁ pole, ať objednávku zavřel
-- SÁM (chyba, kterou tahle migrace opravuje), nebo ji ručně zavezl a odbavil
-- člověk v Závozu (toggleDelivered) — v datech se to nedá rozlišit.
-- Automaticky přepnout takovou objednávku zpátky na „Nová" by tak riskovalo
-- vrátit i objednávky, které byly doopravdy v pořádku doručené — to je
-- horší škoda, než jaká se opravuje. Která konkrétní objednávka byla zavřena
-- omylem, pozná jen člověk (u ní bude „Zavezeno", ale položka bez
-- odškrtnutého Stočeno) — tu je potřeba přepnout ručně v Závozu.
DELETE FROM public.zavoz_deductions AS zd
USING public.order_items AS oi
WHERE zd.order_item_id = oi.id
  AND zd.note = 'Automaticky odpocet zavozu'
  AND oi.is_bottled = false;
