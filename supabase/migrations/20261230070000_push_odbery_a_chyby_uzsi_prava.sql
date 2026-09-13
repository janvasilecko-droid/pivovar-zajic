-- Dve drobne zpresneni prav, obe nalezene pri auditu 13. 9. 2026.
--
-- 1) push_odbery: UPDATE/DELETE bylo otevrene komukoli prihlasenemu, i kdyz
-- tabulka ma sloupec user_id primo pro rozliseni vlastnika. Kdokoli mohl
-- smazat/prepsat cizi odber push upozorneni. Klient (src/lib/pushOdber.ts)
-- teď pri prihlaseni k odberu posila user_id vyslovne (misto spolehnuti na
-- DB vychozi hodnotu jen pri INSERTu) — na sdilenem zarizeni se tak
-- vlastnictvi radku pri prihlaseni dalsiho cloveka spravne prepise na nej,
-- takze omezeni na vlastnika nerozbije bezny provoz.
DROP POLICY IF EXISTS "auth_write_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_write_push_odbery" ON public.push_odbery
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_update_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_update_push_odbery" ON public.push_odbery
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_delete_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_delete_push_odbery" ON public.push_odbery
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2) app_errors: UPDATE bylo otevrene na vsechny sloupce, ale jedine pouziti
-- v appce je odklepnuti "vyrizeno" (AdminDiagnostika). Kdokoli prihlaseny
-- mohl primym REST volanim prepsat text/stack cizi chyby. RLS radek pusti
-- dal (to zustava — cist a odklepavat smi kazdy), sloupcove opravneni navic
-- omezi, CO smi UPDATE menit.
REVOKE UPDATE ON public.app_errors FROM authenticated;
GRANT UPDATE (vyrizeno_at) ON public.app_errors TO authenticated;
