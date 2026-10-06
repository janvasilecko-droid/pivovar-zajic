-- Výchozí den závozu: STŘEDA — kromě Restaurace, Lužce a Seebergu.
--
-- Z provozu 6. 10. 2026: „Food truck bude mít vždy středu" a hned potom
-- „dej primárně u všech závozů středu mimo Restaurace, Lužec, Seeberg —
-- pokud je to závoz Praha nebo kolem Prahy a není uveden den závozu
-- v objednávce, nastav středu." Objednávka Food trucku (3× 20 l a 2× 10 l
-- 10° Desítky) přišla bez dne: databáze ji brala jako pátek a malé sudy
-- i plán stáčení ji počítaly do jiného dne, než doopravdy jede.
--
-- ŘEŠENÍ: objednávce bez dne i bez data doplní databáze výchozí den
-- odběratele (places.vychozi_den_zavozu):
--   NULL    = středa (pražské závozy — výchozí pro všechny),
--   'po'…'ne' = ten den,
--   'zadny' = nic se nedoplňuje (Restaurace, Lužec, Seeberg, Prodejna).
-- Platí pro formulář, WhatsApp, fotku i import. Den nebo datum zadané
-- ručně se nikdy nepřepisuje.

-- 1) Sloupec u odběratele ------------------------------------------------
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS vychozi_den_zavozu text
  CHECK (vychozi_den_zavozu IS NULL OR vychozi_den_zavozu IN ('po', 'ut', 'st', 'ct', 'pa', 'so', 'ne', 'zadny'));

COMMENT ON COLUMN public.places.vychozi_den_zavozu IS
  'Den doplněný objednávce bez dne a data závozu: NULL = středa, po–ne = ten den, zadny = nedoplňovat (doplnit_datum_zavozu).';

-- 2) Výchozí den pro objednávku (podle id odběratele, jinak podle jména) ---
CREATE OR REPLACE FUNCTION public.vychozi_den_zavozu(p_place_id uuid, p_place_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_den text;
BEGIN
  SELECT p.vychozi_den_zavozu INTO v_den
  FROM public.places p
  WHERE p.id = p_place_id
     OR lower(btrim(p.name)) = lower(btrim(COALESCE(p_place_name, '')))
  ORDER BY (p.id = p_place_id) DESC NULLS LAST, (p.vychozi_den_zavozu IS NOT NULL) DESC
  LIMIT 1;
  IF v_den = 'zadny' THEN RETURN NULL; END IF;
  RETURN COALESCE(v_den, 'st');
END;
$$;

-- 3) Doplnění dne — tělo jako v 20261215000000 + výchozí den --------------
CREATE OR REPLACE FUNCTION public.doplnit_datum_zavozu()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.delivery_day, '') = '' AND NEW.delivery_date IS NULL THEN
    NEW.delivery_day := public.vychozi_den_zavozu(NEW.place_id, NEW.place_name);
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

-- I při změně odběratele — přehozená objednávka bez dne dostane jeho den.
DROP TRIGGER IF EXISTS trg_doplnit_datum_zavozu ON public.orders;
CREATE TRIGGER trg_doplnit_datum_zavozu
  BEFORE INSERT OR UPDATE OF delivery_day, delivery_date, order_date, place_id, place_name ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.doplnit_datum_zavozu();

-- 4) Výjimky: Restaurace, Lužec, Seeberg (a Prodejna — není to závoz) ------
-- Přesná jména, ne „začíná na": „Restaurace U Zajíce" v Praze středu dostat má.
UPDATE public.places
SET vychozi_den_zavozu = 'zadny'
WHERE lower(btrim(name)) IN ('restaurace', 'lužec', 'luzec', 'seeberg', 'prodejna')
   OR id IN (
     SELECT o.place_id FROM public.orders o
     WHERE o.place_id IS NOT NULL
       AND lower(btrim(o.place_name)) IN ('restaurace', 'lužec', 'luzec', 'seeberg', 'prodejna')
   );

-- Objednávky jen se jménem (bez odběratele v seznamu) — výjimka musí mít řádek.
INSERT INTO public.places (name, vychozi_den_zavozu)
SELECT v.jmeno, 'zadny'
FROM (VALUES ('Restaurace'), ('Lužec'), ('Seeberg'), ('Prodejna')) AS v(jmeno)
WHERE NOT EXISTS (
  SELECT 1 FROM public.places p
  WHERE lower(btrim(p.name)) = lower(v.jmeno)
     OR (v.jmeno = 'Lužec' AND lower(btrim(p.name)) = 'luzec')
);

-- 5) Otevřené objednávky bez dne → výchozí den ----------------------------
-- Jen ty, co ještě neodjely (den závozu podle dosavadního výpočtu je dnes
-- nebo později). Starší by přesunuly už založené odpočty do jiného dne
-- (i měsíce) — ty se nechávají být.
UPDATE public.orders o
SET delivery_day = public.vychozi_den_zavozu(o.place_id, o.place_name)
WHERE COALESCE(o.delivery_day, '') = ''
  AND o.delivery_date IS NULL
  AND o.status <> 'storno'
  AND o.is_delivered = false
  AND public.ucinny_den_zavozu(NULL, NULL, o.order_date) >= (now() AT TIME ZONE 'Europe/Prague')::date
  AND public.vychozi_den_zavozu(o.place_id, o.place_name) IS NOT NULL;
