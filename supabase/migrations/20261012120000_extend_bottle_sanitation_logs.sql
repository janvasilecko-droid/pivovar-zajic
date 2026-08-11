-- Extend bottle_sanitation_logs with detailed checklist fields.
-- Created: 2026-08-11
-- Reason: Detailed bottle packaging line sanitation log requirements (HACCP compliant).

ALTER TABLE bottle_sanitation_logs
  ADD COLUMN IF NOT EXISTS eq_pegas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eq_hoses boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eq_coupler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eq_co2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS chemical_name text,
  ADD COLUMN IF NOT EXISTS chemical_concentration text,
  ADD COLUMN IF NOT EXISTS chemical_temperature text,
  ADD COLUMN IF NOT EXISTS chemical_contact_time text,
  ADD COLUMN IF NOT EXISTS proc_rinse_water boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proc_circulation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proc_rinse_co2 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proc_disassembly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ctrl_visual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ctrl_co2_pressure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ctrl_tightness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ctrl_valve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mismatch_note text,
  ADD COLUMN IF NOT EXISTS mismatch_action text,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS sanitation_time text;

COMMENT ON COLUMN bottle_sanitation_logs.eq_pegas IS 'Zařízení: PEGAS (hlava/y)';
COMMENT ON COLUMN bottle_sanitation_logs.eq_hoses IS 'Zařízení: hadice';
COMMENT ON COLUMN bottle_sanitation_logs.eq_coupler IS 'Zařízení: narážeč';
COMMENT ON COLUMN bottle_sanitation_logs.eq_co2 IS 'Zařízení: rozvody CO2';
COMMENT ON COLUMN bottle_sanitation_logs.reason IS 'Důvod: pred_stacenim, po_staceni, pravidelna';
COMMENT ON COLUMN bottle_sanitation_logs.chemical_name IS 'Název chemie';
COMMENT ON COLUMN bottle_sanitation_logs.chemical_concentration IS 'Koncentrace chemie (např. 0,5%)';
COMMENT ON COLUMN bottle_sanitation_logs.chemical_temperature IS 'Teplota roztoku';
COMMENT ON COLUMN bottle_sanitation_logs.chemical_contact_time IS 'Doba působení roztoku';
COMMENT ON COLUMN bottle_sanitation_logs.proc_rinse_water IS 'Postup: Oplach vodou';
COMMENT ON COLUMN bottle_sanitation_logs.proc_circulation IS 'Postup: Cirkulace přes PEGAS + hadice';
COMMENT ON COLUMN bottle_sanitation_logs.proc_rinse_co2 IS 'Postup: Proplach CO2 / sterilní vodou';
COMMENT ON COLUMN bottle_sanitation_logs.proc_disassembly IS 'Postup: Rozebrání a ruční čištění';
COMMENT ON COLUMN bottle_sanitation_logs.ctrl_visual IS 'Kontrolní bod: vizuální kontrola (čistota, zápach)';
COMMENT ON COLUMN bottle_sanitation_logs.ctrl_co2_pressure IS 'Kontrolní bod: tlak CO2';
COMMENT ON COLUMN bottle_sanitation_logs.ctrl_tightness IS 'Kontrolní bod: těsnost systému';
COMMENT ON COLUMN bottle_sanitation_logs.ctrl_valve IS 'Kontrolní bod: funkčnost ventilu';
COMMENT ON COLUMN bottle_sanitation_logs.mismatch_note IS 'Neshoda (co bylo špatně)';
COMMENT ON COLUMN bottle_sanitation_logs.mismatch_action IS 'Opatření (co jsi udělal)';
COMMENT ON COLUMN bottle_sanitation_logs.approved_by IS 'Schválil (jméno odpovědné osoby)';
COMMENT ON COLUMN bottle_sanitation_logs.sanitation_time IS 'Čas provedení sanitace (HH:MM)';
