-- Dokonceni server-side vynuceni opravneni na zbyle tabulky (bezpecnostni audit).
--
-- Migrace 20261128 a 20261204 pokryly hlavni moduly, 20261206 pak akce.
-- Tyhle tabulky ale porad mely INSERT/UPDATE/DELETE povolene KAZDEMU
-- prihlasenemu uzivateli bez ohledu na jeho roli — omezeni platilo jen
-- v prohlizeci. Uzivatel s odepřenym modulem je mohl pres prime REST
-- volani (devtools) i tak menit nebo mazat.
--
-- Stejny fail-open vzorec user_can_edit_module(): chybejici profil, admin
-- role nebo nenastavene omezeni vraci true, takze se nikomu nic nezamyka,
-- kdo dosud omezeni nemel.
--
-- ZAMERNE VYNECHANO (maji vlastni bezpecnostni model, ktery by se timhle
-- rozbil): allowed_emails, profiles, audit_log, whatsapp_session,
-- user_app_versions. A feedback_notes — hlaseni chyb ma zustat dostupne
-- vsem odkudkoliv (tlacitko "Nahlasit chybu" je v cele appce).

-- ===== Planovani staceni (modul "kegging") =====
DROP POLICY IF EXISTS perm_insert_bottling_plans ON public.bottling_plans;
CREATE POLICY perm_insert_bottling_plans ON public.bottling_plans FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging') OR public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS perm_update_bottling_plans ON public.bottling_plans;
CREATE POLICY perm_update_bottling_plans ON public.bottling_plans FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('kegging') OR public.user_can_edit_module('entry'))
  WITH CHECK (public.user_can_edit_module('kegging') OR public.user_can_edit_module('entry'));
DROP POLICY IF EXISTS perm_delete_bottling_plans ON public.bottling_plans;
CREATE POLICY perm_delete_bottling_plans ON public.bottling_plans FOR DELETE TO authenticated
  USING (public.user_can_edit_module('kegging') OR public.user_can_edit_module('entry'));

-- ===== Cykly leżackych tanku (modul "cellar") =====
DROP POLICY IF EXISTS perm_insert_cellar_tank_cycles ON public.cellar_tank_cycles;
CREATE POLICY perm_insert_cellar_tank_cycles ON public.cellar_tank_cycles FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS perm_update_cellar_tank_cycles ON public.cellar_tank_cycles;
CREATE POLICY perm_update_cellar_tank_cycles ON public.cellar_tank_cycles FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('cellar')) WITH CHECK (public.user_can_edit_module('cellar'));
DROP POLICY IF EXISTS perm_delete_cellar_tank_cycles ON public.cellar_tank_cycles;
CREATE POLICY perm_delete_cellar_tank_cycles ON public.cellar_tank_cycles FOR DELETE TO authenticated
  USING (public.user_can_edit_module('cellar'));

-- ===== Tanky pro staceni KEG (modul "kegging") =====
DROP POLICY IF EXISTS perm_insert_kegging_tanks ON public.kegging_tanks;
CREATE POLICY perm_insert_kegging_tanks ON public.kegging_tanks FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS perm_update_kegging_tanks ON public.kegging_tanks;
CREATE POLICY perm_update_kegging_tanks ON public.kegging_tanks FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('kegging')) WITH CHECK (public.user_can_edit_module('kegging'));
DROP POLICY IF EXISTS perm_delete_kegging_tanks ON public.kegging_tanks;
CREATE POLICY perm_delete_kegging_tanks ON public.kegging_tanks FOR DELETE TO authenticated
  USING (public.user_can_edit_module('kegging'));

-- ===== Naucene zkratky parseru objednavek (modul "orders") =====
DROP POLICY IF EXISTS perm_insert_parser_aliases ON public.parser_aliases;
CREATE POLICY perm_insert_parser_aliases ON public.parser_aliases FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_update_parser_aliases ON public.parser_aliases;
CREATE POLICY perm_update_parser_aliases ON public.parser_aliases FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('orders')) WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_delete_parser_aliases ON public.parser_aliases;
CREATE POLICY perm_delete_parser_aliases ON public.parser_aliases FOR DELETE TO authenticated
  USING (public.user_can_edit_module('orders'));

DROP POLICY IF EXISTS perm_insert_place_aliases ON public.place_aliases;
CREATE POLICY perm_insert_place_aliases ON public.place_aliases FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_update_place_aliases ON public.place_aliases;
CREATE POLICY perm_update_place_aliases ON public.place_aliases FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('orders')) WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_delete_place_aliases ON public.place_aliases;
CREATE POLICY perm_delete_place_aliases ON public.place_aliases FOR DELETE TO authenticated
  USING (public.user_can_edit_module('orders'));

-- ===== Prichozi WhatsApp zpravy (modul "orders") =====
-- Mazani navic jen pro admina: smazanim zpravy zmizi i stopa po objednavce,
-- kterou nekdo nechtel vyridit, a obchazi to logiku "at jde v appce dohledat".
DROP POLICY IF EXISTS perm_insert_whatsapp_incoming ON public.whatsapp_incoming;
CREATE POLICY perm_insert_whatsapp_incoming ON public.whatsapp_incoming FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_update_whatsapp_incoming ON public.whatsapp_incoming;
CREATE POLICY perm_update_whatsapp_incoming ON public.whatsapp_incoming FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('orders')) WITH CHECK (public.user_can_edit_module('orders'));
DROP POLICY IF EXISTS perm_delete_whatsapp_incoming ON public.whatsapp_incoming;
CREATE POLICY perm_delete_whatsapp_incoming ON public.whatsapp_incoming FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ===== Whitelist WhatsApp odesilatelu — JEN ADMIN =====
-- Tenhle seznam je bezpecnostni hranice: rozhoduje, ktere zpravy se vubec
-- zpracuji, a kam se posilaji odchozi potvrzeni objednavek. Dosud ho mohl
-- menit kterykoli prihlaseny uzivatel — mohl si pridat vlastni skupinu a
-- tlacit do systemu vlastni "objednavky", nebo presmerovat odchozi zpravy.
DROP POLICY IF EXISTS perm_insert_whatsapp_senders ON public.whatsapp_senders;
CREATE POLICY perm_insert_whatsapp_senders ON public.whatsapp_senders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS perm_update_whatsapp_senders ON public.whatsapp_senders;
CREATE POLICY perm_update_whatsapp_senders ON public.whatsapp_senders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS perm_delete_whatsapp_senders ON public.whatsapp_senders;
CREATE POLICY perm_delete_whatsapp_senders ON public.whatsapp_senders FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ===== Poznamky (modul "reminders" — spolecna zalozka Planovani) =====
DROP POLICY IF EXISTS perm_insert_notes ON public.notes;
CREATE POLICY perm_insert_notes ON public.notes FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS perm_update_notes ON public.notes;
CREATE POLICY perm_update_notes ON public.notes FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('reminders')) WITH CHECK (public.user_can_edit_module('reminders'));
DROP POLICY IF EXISTS perm_delete_notes ON public.notes;
CREATE POLICY perm_delete_notes ON public.notes FOR DELETE TO authenticated
  USING (public.user_can_edit_module('reminders'));
