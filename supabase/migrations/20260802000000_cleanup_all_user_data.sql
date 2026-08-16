-- SECURITY NO-OP
--
-- Tato migracni verze drive obsahovala destruktivni pripravu databaze pro
-- prvni produkcni start (TRUNCATE provoznich tabulek a DELETE auth.users).
-- Destruktivni maintenance operace nesmi byt soucasti automatickeho
-- migracniho retezce: pri novem prostredi nebo opozdenem db push by mohly
-- nevratne odstranit produkcni data a uzivatele.
--
-- Soubor zustava jako prazdna migrace, aby byla zachovana verze v migration
-- ledgeru u prostredi, kde uz byla v minulosti oznacena jako aplikovana.
-- Pripadny rucni reset databaze musi mit samostatny, explicitne autorizovany
-- runbook se zalohou a kontrolou ciloveho project ID.

DO $$
BEGIN
  RAISE NOTICE '20260802000000: destructive cleanup retired; no changes applied';
END
$$;
