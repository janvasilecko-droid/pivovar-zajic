-- Obranné znovu-udělení práv na run_today_zavoz_deductions().
--
-- app_errors (9. 9. 2026, 4×) zaznamenal "permission denied for function
-- run_today_zavoz_deductions" u volání z appky (lib/zavozDeduction.ts).
-- Migrace 20260816130000 grant uděluje ("TO authenticated, service_role"),
-- migrace 20261123000000 funkci nahrazuje (CREATE OR REPLACE) beze GRANTu
-- za sebou — CREATE OR REPLACE v Postgresu práva normálně zachová (stejné
-- OID), takže přesná příčina zůstává nejasná (možná souběh s nasazením
-- migrace v tu chvíli). Ruční ověření 10. 9. 2026 přes přímé REST volání
-- RPC ukázalo funkci jako dostupnou (HTTP 200) — nejde tedy vyloučit, že
-- šlo o přechodný stav. Tahle migrace je jen levná pojistka: znovu explicitně
-- udělit práva, ať appka na tuhle chybu nenarazí znovu bez ohledu na
-- skutečnou příčinu. Bezpečné spustit i když už práva sedí (idempotentní).

GRANT EXECUTE ON FUNCTION public.run_today_zavoz_deductions()
  TO authenticated, service_role;
