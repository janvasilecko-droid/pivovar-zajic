-- Bezpecne OPAKOVANI odectu objemu z tanku.
--
-- PROBLEM: stacenim se objem z tanku odecita zvlast, druhym krokem
-- (RPC adjust_tank_volume) AZ POTOM, co je stoceni zapsane. Kdyz ten druhy
-- krok selze — vypadek site v pivovarskem sklepe je bezna vec — zustane
-- tank nafouknuty o pivo, ktere uz odteklo. Aplikace to rekne
-- ("Oprav objem ve Sklepe rucne") a dal je to na cloveku. Odtud jsou ty
-- velke schodky, kdyz na to nekdo zapomene.
--
-- Chce se to opakovat samo. Jenze adjust_tank_volume je RELATIVNI (prictu
-- delta) a to se opakovat NESMI: kdyz odpoved nedojde, ale server ji uz
-- provedl, druhy pokus odecte objem DVAKRAT. Tise, a pozna se to az na
-- inventure.
--
-- RESENI: klic idempotence. Klient si ke kazdemu odectu vymysli jednorazovy
-- klic a posila ho s sebou. Funkce nejdriv zapise klic do logu — a protoze
-- je klic PRIMARY KEY, druhy pokus se stejnym klicem na zapisu skonci a
-- objem se NEUPRAVI. Odpoved rekne, jestli se to provedlo nebo uz bylo
-- provedeno driv; oboji je pro klienta uspech (fronta polozku zahodi).
--
-- Log zaroven poprve rika, kdy a odkud se objem menil — to se dosud nikde
-- neevidovalo.

CREATE TABLE IF NOT EXISTS public.tank_uprava_log (
  -- Klic si vyrabi klient (uuid). PRIMARY KEY je tady cely mechanismus
  -- ochrany proti dvojimu odectu.
  klic text PRIMARY KEY,
  tank_id uuid NOT NULL,
  delta_l numeric NOT NULL,
  -- Odkud uprava prisla: 'staceni', 'inventura', 'vraceni', 'fronta'.
  zdroj text,
  provedl uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tank_uprava_log_tank_idx
  ON public.tank_uprava_log (tank_id, created_at DESC);

ALTER TABLE public.tank_uprava_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_tank_uprava_log" ON public.tank_uprava_log;
CREATE POLICY "auth_read_tank_uprava_log" ON public.tank_uprava_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_write_tank_uprava_log" ON public.tank_uprava_log;
CREATE POLICY "service_write_tank_uprava_log" ON public.tank_uprava_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Zapisuje jen funkce nize (SECURITY DEFINER), z klienta se do logu psat
-- nema — jinak by si nekdo mohl "zabrat" klic bez toho, aby se objem
-- upravil, a odecet by se tim nenavratne zahodil.

CREATE OR REPLACE FUNCTION public.adjust_tank_volume_once(
  p_tank_id uuid,
  p_delta_l numeric,
  p_klic text,
  p_zdroj text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_klic IS NULL OR length(p_klic) < 8 THEN
    RAISE EXCEPTION 'Chybi klic idempotence';
  END IF;
  IF p_tank_id IS NULL OR p_delta_l IS NULL OR p_delta_l = 0 THEN
    RETURN 'nic';
  END IF;

  BEGIN
    INSERT INTO public.tank_uprava_log (klic, tank_id, delta_l, zdroj)
    VALUES (p_klic, p_tank_id, p_delta_l, p_zdroj);
  EXCEPTION WHEN unique_violation THEN
    -- Tenhle odecet uz jednou proslo. Objem se NEUPRAVUJE.
    RETURN 'jiz_provedeno';
  END;

  PERFORM public.adjust_tank_volume(p_tank_id, p_delta_l);
  RETURN 'provedeno';
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_tank_volume_once(uuid, numeric, text, text) TO authenticated;
