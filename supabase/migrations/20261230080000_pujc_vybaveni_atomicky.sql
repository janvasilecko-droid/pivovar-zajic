-- Bug: FestivalEquipmentTracker.confirmLoan() zapisoval pujcku jako DVA
-- nezavisle volani (UPDATE festival_equipment, pak INSERT do
-- festival_equipment_loans). Vypadek spojeni mezi nimi (bezny prave na
-- festivalu, k cemu tahle funkce je) nechal polozku navzdy "vypujcenou"
-- bez zaznamu v historii pujcek - a nasledne vraceni pak neslo napojit na
-- zadnou otevrenou pujcku, takze tise preskocilo i zaznam o vraceni kauce.
--
-- Reseni: jedno RPC volani, jedna transakce - selze-li insert, update se
-- vrati taky. SECURITY INVOKER (ne DEFINER): RLS na obou tabulkach uz je
-- "kdokoli prihlaseny" (zamerny model sdilenych dat maleho tymu), tady jde
-- jen o atomicitu dvou zapisu, ne o zmenu prav.

CREATE OR REPLACE FUNCTION public.pujc_vybaveni(
  p_equipment_id uuid,
  p_borrower_name text,
  p_borrower_phone text,
  p_event_name text,
  p_borrowed_at date,
  p_expected_return_at date,
  p_deposit_kic numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_equipment_id IS NULL OR p_borrower_name IS NULL OR btrim(p_borrower_name) = '' THEN
    RAISE EXCEPTION 'Chybí vybavení nebo jméno pořadatele';
  END IF;

  UPDATE public.festival_equipment SET
    status = 'borrowed',
    borrower_name = p_borrower_name,
    borrower_phone = p_borrower_phone,
    event_name = p_event_name,
    borrowed_at = p_borrowed_at,
    expected_return_at = p_expected_return_at,
    deposit_kic = p_deposit_kic,
    updated_at = now()
  WHERE id = p_equipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vybavení % neexistuje nebo není přístupné', p_equipment_id;
  END IF;

  INSERT INTO public.festival_equipment_loans (
    equipment_id, borrower_name, borrower_phone, event_name,
    borrowed_at, expected_return_at, deposit_kic
  ) VALUES (
    p_equipment_id, p_borrower_name, p_borrower_phone, p_event_name,
    p_borrowed_at, p_expected_return_at, p_deposit_kic
  );
END
$$;

REVOKE ALL ON FUNCTION public.pujc_vybaveni(uuid, text, text, text, date, date, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pujc_vybaveni(uuid, text, text, text, date, date, numeric) TO authenticated;
