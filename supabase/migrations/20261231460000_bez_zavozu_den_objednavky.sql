-- Objednávka „bez závozu" bez vybraného dne odchází v den objednávky.
--
-- CO SE DĚLO (16. 11. 2026): „V objednávkách mám 1x50 Restaurace a nevidím ji
-- v rozboru, nesedí mi tam 2x50." Objednávka Restaurace (bez závozu, 12° Světlá
-- 50 l a 10° Desítka 50 l) se zapsala bez vybraného dne. Restauraci se výchozí
-- den nedoplňuje (places.vychozi_den_zavozu = 'zadny', migrace 20261231260000),
-- takže zůstala bez dne i bez data — a ucinny_den_zavozu takové objednávce dává
-- PÁTEK. Odpočet ze skladu by vznikl až v pátek 20. 11.; do té doby ji Sklad,
-- Pohyby ani Inventura neviděly a Rozbor ji podle data zadání řadil do minulého
-- týdne. U ostatních odběratelů „bez závozu" (Jitka, Mates, Terasa) by se
-- doplnila středa — taky ne den, kdy si pivo vzali.
--
-- ŘEŠENÍ: „bez závozu" znamená, že si odběratel bere pivo sám. Když se den
-- nevybere, pivo odchází v den objednávky: objednávce se doplní den i datum
-- závozu = datum objednávky. Tím se hned odečte ze skladu (trigger
-- trg_odecist_hned_z_objednavky / z_polozky) a všude se řadí ke stejnému dni.
-- Den nebo datum zadané ručně se nikdy nepřepisuje. Objednávky se závozem se
-- nemění (výchozí den odběratele, jinak pátek).
--
-- Stejné pravidlo má formulář appky (src/lib/bezZavozu.ts, denZavozuProUlozeni).

-- 1) Den v týdnu ('po'…'ne') z data ----------------------------------------
CREATE OR REPLACE FUNCTION public.den_v_tydnu(p_datum date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (ARRAY['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'])[EXTRACT(ISODOW FROM p_datum)::int];
$$;

-- 2) Doplnění dne — tělo jako v 20261231260000 + „bez závozu" ---------------
CREATE OR REPLACE FUNCTION public.doplnit_datum_zavozu()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.delivery_day, '') = '' AND NEW.delivery_date IS NULL THEN
    IF NEW.no_delivery AND NEW.order_date IS NOT NULL THEN
      -- Bez závozu: odběratel si pivo bere sám — bez zadaného dne v den objednávky.
      NEW.delivery_day := public.den_v_tydnu(NEW.order_date);
      NEW.delivery_date := NEW.order_date;
    ELSE
      NEW.delivery_day := public.vychozi_den_zavozu(NEW.place_id, NEW.place_name);
    END IF;
  END IF;

  -- Den zavozu je zdroj pravdy: kdyz se ZMENI, datum se prepocita.
  -- Rucne zadane konkretni datum se nikdy neprepisuje — objednavka zalozena
  -- s datem ("na 7.8.") si ho nechá, dopocitava se jen kdyz datum chybi.
  IF NEW.delivery_day IS NOT NULL AND NEW.delivery_day <> '' AND (
       NEW.delivery_date IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.delivery_day IS DISTINCT FROM OLD.delivery_day)
     ) THEN
    NEW.delivery_date := public.ucinny_den_zavozu(NULL, NEW.delivery_day, NEW.order_date);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger zůstává, jak je (BEFORE INSERT OR UPDATE OF delivery_day,
-- delivery_date, order_date, place_id, place_name) — mění se jen funkce.

-- 3) Objednávka Restaurace zapsaná 16. 11. 2026 ---------------------------
-- Zapsala se 16. 11. ve 14:29, ale s datem 15. 11.: formulář si držel datum
-- z doby, kdy se obrazovka otevřela (appka zůstala otevřená přes půlnoc —
-- opraveno v src/screens/Orders.tsx, datum se bere až při uložení). Majitel
-- 16. 11. 2026 potvrdil, že si Restaurace pivo vzala v pondělí 16. 11.
-- Mění se jen, když je objednávka pořád ve stavu, ve kterém se našla (datum
-- 15. 11., bez dne, bez data závozu a bez odpočtu) — ruční oprava v appce má
-- přednost. Změna data spustí doplnění dne (funkce výš: pondělí 16. 11.)
-- a hned i odpočet ze skladu k 16. 11. (trg_odecist_hned_z_objednavky).
UPDATE public.orders o
SET order_date = DATE '2026-11-16'
WHERE o.id = 'a8fff7ab-d612-4d8a-b429-4a2561f0cce0'
  AND o.order_date = DATE '2026-11-15'
  AND o.no_delivery
  AND COALESCE(o.delivery_day, '') = ''
  AND o.delivery_date IS NULL
  AND o.status <> 'storno'
  AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_id = o.id);

-- 4) Dorovnat ostatní objednávky bez závozu, které takhle čekají -----------
-- Jen ty, které ještě nemají ŽÁDNÝ odpočet ze skladu (a nejsou zrušené).
-- Starší objednávky bez závozu bez dne už odečtené jsou (k pátku) — ty se
-- nechávají být, přesun by jim přepsal odpočty do jiného dne (i do uzavřeného
-- měsíce). K 17. 11. 2026 žádná další taková není (ověřeno na datech); krok
-- je tu pro objednávku zapsanou starou verzí appky, než se migrace pustí.
-- Odpočet vznikne hned při téhle změně (trg_odecist_hned_z_objednavky).
UPDATE public.orders o
SET delivery_day = public.den_v_tydnu(o.order_date),
    delivery_date = o.order_date
WHERE o.no_delivery
  AND COALESCE(o.delivery_day, '') = ''
  AND o.delivery_date IS NULL
  AND o.order_date IS NOT NULL
  AND o.status <> 'storno'
  AND NOT EXISTS (SELECT 1 FROM public.zavoz_deductions zd WHERE zd.order_id = o.id);
