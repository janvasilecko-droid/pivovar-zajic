-- Stáčení KEG bez záporných řádků: oprava z inventury se započítá přímo do stočených sudů.
--
-- Zadání 13. 10. 2026: „žádný minusový položky… prostě jednoduchý vzorec: stav na
-- začátku měsíce + stáčení keg − objednávky a fasování = inventura." Týdenní
-- inventura z 20. a 25. 9. zapsala do stáčení 8 záporných řádků (-41 ks,
-- −14,3 hl za září). Tahle migrace je odečte přímo od stejného piva a obalu ve
-- stejném měsíci (nejdřív ve stejný den, pak nejbližší dřívější, pak pozdější)
-- a záporné řádky odstraní. Součet za měsíc i stav skladu zůstávají stejné
-- (září: 170,9 hl), jen už nikde není záporná položka.
--
-- Pojistka: proběhne jen když všech 19 dotčených řádků má pořád přesně
-- očekávané množství. Jinak se nestane nic (a vypíše se upozornění).
DO $$
BEGIN
  IF NOT (
    (SELECT quantity FROM public.kegging WHERE id = '39624816-11f5-420e-87db-d30b6d5a5e43') IS NOT DISTINCT FROM 8 AND
    (SELECT quantity FROM public.kegging WHERE id = '41b46dbf-c1dc-4c53-a991-c4402ef6a02b') IS NOT DISTINCT FROM 5 AND
    (SELECT quantity FROM public.kegging WHERE id = '694e6aec-4474-465f-b428-08ef439bd5f5') IS NOT DISTINCT FROM 3 AND
    (SELECT quantity FROM public.kegging WHERE id = '73f8b8b1-5ae9-4096-8d33-f0e9478ebb66') IS NOT DISTINCT FROM 12 AND
    (SELECT quantity FROM public.kegging WHERE id = '83fcd9e1-5913-4de5-bcc4-4a70e4bd8527') IS NOT DISTINCT FROM 10 AND
    (SELECT quantity FROM public.kegging WHERE id = '926207a0-02db-4313-b86b-da9685e6553f') IS NOT DISTINCT FROM 1 AND
    (SELECT quantity FROM public.kegging WHERE id = 'a7a4751a-70d5-4a29-9363-82bcf0b8a02e') IS NOT DISTINCT FROM 4 AND
    (SELECT quantity FROM public.kegging WHERE id = 'c23994b1-76f3-4ba5-bdb0-3b498d2cc01e') IS NOT DISTINCT FROM 2 AND
    (SELECT quantity FROM public.kegging WHERE id = 'd53dc93b-6315-40d7-bcd0-a7cffd6c5d91') IS NOT DISTINCT FROM 13 AND
    (SELECT quantity FROM public.kegging WHERE id = 'da0db029-07c3-45ee-aaec-588769e27f46') IS NOT DISTINCT FROM 2 AND
    (SELECT quantity FROM public.kegging WHERE id = 'e4f49d73-d95e-4087-b50e-fbeebb2c4b0c') IS NOT DISTINCT FROM 5 AND
    (SELECT quantity FROM public.kegging WHERE id = '30083556-9d5d-45a1-8439-25ef7da3fde5') IS NOT DISTINCT FROM -1 AND
    (SELECT quantity FROM public.kegging WHERE id = '4b42f601-0c28-4988-874c-1d05e2efb1a2') IS NOT DISTINCT FROM -1 AND
    (SELECT quantity FROM public.kegging WHERE id = '7979ee09-24e3-4cc6-a083-1533727156e7') IS NOT DISTINCT FROM -28 AND
    (SELECT quantity FROM public.kegging WHERE id = '7d2cbd03-fed7-420c-a4d4-b159bfe24b37') IS NOT DISTINCT FROM -3 AND
    (SELECT quantity FROM public.kegging WHERE id = 'a31ab562-739b-4cc6-be97-cf6c3b65bfa2') IS NOT DISTINCT FROM -3 AND
    (SELECT quantity FROM public.kegging WHERE id = 'ac0aaab8-5141-45a3-9504-e9091a7e9cdf') IS NOT DISTINCT FROM -3 AND
    (SELECT quantity FROM public.kegging WHERE id = 'd5605c90-e86d-452f-95ba-3278b4d4d398') IS NOT DISTINCT FROM -1 AND
    (SELECT quantity FROM public.kegging WHERE id = 'ea662bfc-f4ad-4cdc-9d54-685b47aa85b8') IS NOT DISTINCT FROM -1
  ) THEN
    RAISE NOTICE 'Stáčení KEG: řádky se mezitím změnily, nic jsem neupravil.';
    RETURN;
  END IF;

  UPDATE public.kegging SET quantity = 5 WHERE id = '39624816-11f5-420e-87db-d30b6d5a5e43' AND quantity = 8;  -- 2026-09-22 12° Světlá 50l: 8 → 5
  UPDATE public.kegging SET quantity = 2 WHERE id = '41b46dbf-c1dc-4c53-a991-c4402ef6a02b' AND quantity = 5;  -- 2026-09-15 10° Desítka 50l: 5 → 2
  UPDATE public.kegging SET quantity = 2 WHERE id = '694e6aec-4474-465f-b428-08ef439bd5f5' AND quantity = 3;  -- 2026-09-15 10° Desítka 10l: 3 → 2
  DELETE FROM public.kegging WHERE id = '73f8b8b1-5ae9-4096-8d33-f0e9478ebb66' AND quantity = 12;  -- 2026-09-15 10° Desítka 30l: 12 → 0 (celý řádek pohlcen)
  UPDATE public.kegging SET quantity = 9 WHERE id = '83fcd9e1-5913-4de5-bcc4-4a70e4bd8527' AND quantity = 10;  -- 2026-09-21 11° Světlá 50l: 10 → 9
  DELETE FROM public.kegging WHERE id = '926207a0-02db-4313-b86b-da9685e6553f' AND quantity = 1;  -- 2026-09-30 Osma 50l: 1 → 0 (celý řádek pohlcen)
  UPDATE public.kegging SET quantity = 3 WHERE id = 'a7a4751a-70d5-4a29-9363-82bcf0b8a02e' AND quantity = 4;  -- 2026-09-14 Jantar 30l: 4 → 3
  UPDATE public.kegging SET quantity = 1 WHERE id = 'c23994b1-76f3-4ba5-bdb0-3b498d2cc01e' AND quantity = 2;  -- 2026-09-14 12° Tmavá 50l: 2 → 1
  UPDATE public.kegging SET quantity = 2 WHERE id = 'd53dc93b-6315-40d7-bcd0-a7cffd6c5d91' AND quantity = 13;  -- 2026-09-15 10° Desítka 30l: 13 → 2
  DELETE FROM public.kegging WHERE id = 'da0db029-07c3-45ee-aaec-588769e27f46' AND quantity = 2;  -- 2026-09-22 11° Světlá 50l: 2 → 0 (celý řádek pohlcen)
  DELETE FROM public.kegging WHERE id = 'e4f49d73-d95e-4087-b50e-fbeebb2c4b0c' AND quantity = 5;  -- 2026-09-18 10° Desítka 30l: 5 → 0 (celý řádek pohlcen)
  DELETE FROM public.kegging WHERE id = '30083556-9d5d-45a1-8439-25ef7da3fde5' AND quantity = -1;  -- 2026-09-20 10° Desítka 10l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = '4b42f601-0c28-4988-874c-1d05e2efb1a2' AND quantity = -1;  -- 2026-09-25 12° Tmavá 50l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = '7979ee09-24e3-4cc6-a083-1533727156e7' AND quantity = -28;  -- 2026-09-20 10° Desítka 30l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = '7d2cbd03-fed7-420c-a4d4-b159bfe24b37' AND quantity = -3;  -- 2026-09-25 12° Světlá 50l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = 'a31ab562-739b-4cc6-be97-cf6c3b65bfa2' AND quantity = -3;  -- 2026-09-20 10° Desítka 50l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = 'ac0aaab8-5141-45a3-9504-e9091a7e9cdf' AND quantity = -3;  -- 2026-09-25 11° Světlá 50l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = 'd5605c90-e86d-452f-95ba-3278b4d4d398' AND quantity = -1;  -- 2026-09-20 Osma 50l: záporný řádek z inventury
  DELETE FROM public.kegging WHERE id = 'ea662bfc-f4ad-4cdc-9d54-685b47aa85b8' AND quantity = -1;  -- 2026-09-20 Jantar 30l: záporný řádek z inventury
END
$$;
