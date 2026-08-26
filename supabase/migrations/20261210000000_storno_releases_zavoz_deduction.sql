-- Storno objednavky po odectu zavozu nevratilo pivo do skladu (nalez c.10).
--
-- Odpocet ze skladu bezi automaticky v 01:00 rano v den zavozu
-- (process_zavoz_deductions_for_date). Ten sice filtruje `status <> 'storno'`,
-- ale jen v okamziku vkladani. Kdyz odberatel objednavku v deset dopoledne
-- zrusi, radek v zavoz_deductions uz zustane NAVZDY — sklad je trvale nizsi
-- o zrusenych sudu a v inventure se to projevi jako nevysvetlitelny prebytek.
--
-- Reseni: jedna atomicka funkce, ktera zmeni stav objednavky a soucasne
-- uklidi jeji odpocty. Jde o jednu transakci, takze nemuze nastat stav
-- "stornovano, ale odpocet zustal" (ani naopak).
--
-- SECURITY INVOKER — RLS na orders i zavoz_deductions plati stejne jako
-- pri primem volani, zadna elevace prav.

CREATE OR REPLACE FUNCTION public.set_order_status(
  p_order_id uuid,
  p_status text
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
  IF p_order_id IS NULL OR p_status IS NULL OR btrim(p_status) = '' THEN
    RAISE EXCEPTION 'Order id and status are required';
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist or is not accessible', p_order_id;
  END IF;

  -- Pri stornu vratit sklad: smazat odpocty zavozu teto objednavky.
  -- Pri navratu ze storna zpet do bezneho stavu se odpocet NEobnovuje —
  -- nocni davka ho pripadne vytvori znovu, pokud je den zavozu jeste pred
  -- nami; zpetne dogenerovani by naopak mohlo odecist pivo, ktere uz
  -- fyzicky nikam neodjelo.
  IF p_status = 'storno' THEN
    DELETE FROM public.zavoz_deductions WHERE order_id = p_order_id;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.set_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_status(uuid, text) TO authenticated;
