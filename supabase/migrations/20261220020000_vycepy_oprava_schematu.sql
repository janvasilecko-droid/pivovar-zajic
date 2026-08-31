-- Oprava schematu vycepu — sladeni s tim, jak data vypadaji v aplikaci.
--
-- Predchozi migrace (20261220000000) navrhla tabulky driv, nez jsem se
-- podival na skutecny tvar dat ve VycepyScreen.tsx. Rozdily byly zasadni:
--   • rezervace je ROZSAH dnu (date_from/date_to), ne jeden den — puvodni
--     unikatni index (vycep_id, datum) by vicedenni rezervaci vubec nedovolil;
--   • vycep nese TYP (jedno/dvoj/troj/sestikohout) a STAV cistoty, ne pocet
--     kohoutu;
--   • rezervace vede jmeno odberatele volnym textem, telefon, kauci a
--     priznak vraceni.
--
-- Obe tabulky vznikly pred nekolika minutami, maji NULA radku a zadny kod je
-- zatim necte ani nezapisuje. Proto se zahazuji a zakladaji znovu misto
-- retezu ALTER prikazu — neni co ztratit a vysledek je citelnejsi.
-- Zadnych existujicich dat se to nedotyka.

DROP TABLE IF EXISTS public.vycepy_rezervace;
DROP TABLE IF EXISTS public.vycepy;

-- ── Vycepni zarizeni ────────────────────────────────────────────────────────
CREATE TABLE public.vycepy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nazev, pod kterym vycep znaji v provozu ("Výčep #1 — Lindr Pygmy 25").
  nazev text NOT NULL,
  -- jednokohout | dvojkohout | trojkohout | sestikohout (volny text zamerne —
  -- pribyde-li dalsi typ, databaze se menit nemusi).
  typ text NOT NULL DEFAULT 'jednokohout',
  -- clean | dirty_beer | needs_louh — stav cistoty z pohledu sanitace.
  stav text NOT NULL DEFAULT 'clean',
  posledni_oplach timestamptz,
  posledni_sanitace_louhem timestamptz,
  kohouty_rozebrane boolean NOT NULL DEFAULT false,
  poznamka text,
  -- Vyrazeny vycep se uz nenabizi, ale historie rezervaci na nej zustava.
  aktivni boolean NOT NULL DEFAULT true,
  poradi integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dva vycepy stejneho jmena by v rozbalovacim seznamu nesly rozlisit.
CREATE UNIQUE INDEX vycepy_nazev_unique_idx ON public.vycepy (lower(nazev));

-- ── Rezervace vycepu ───────────────────────────────────────────────────────
CREATE TABLE public.vycepy_rezervace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Smazani vycepu bere s sebou i jeho rezervace: rezervace bez zarizeni
  -- nema co rezervovat a v kalendari by strasila.
  vycep_id uuid NOT NULL REFERENCES public.vycepy(id) ON DELETE CASCADE,
  -- Jmeno vycepu v dobe rezervace — at je v historii videt, co si kdo pujcil,
  -- i kdyz se vycep pozdeji prejmenuje.
  vycep_nazev text,
  datum_od date NOT NULL,
  datum_do date NOT NULL,
  -- Odberatel volnym textem: rezervace muze byt i na akci nebo servis, ktere
  -- v ciselniku odberatelu nikoho nemaji.
  odberatel text NOT NULL DEFAULT '',
  telefon text,
  kauce_czk numeric,
  vraceno boolean NOT NULL DEFAULT false,
  vraceno_at timestamptz,
  poznamka text,
  -- Objednavka, ze ktere rezervace vznikla automaticky (lib/tapReservations.ts).
  -- SET NULL: smazana objednavka nesmi vzit s sebou zaznam, ze vycep byl pryc.
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  vytvoril text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Rozsah musi davat smysl. Jednodenni rezervace ma datum_od = datum_do.
  CONSTRAINT vycepy_rezervace_rozsah CHECK (datum_do >= datum_od)
);

-- Z jedne objednavky nejvyse jedna automaticka rezervace. Bez toho by
-- opakovane ulozeni objednavky zakladalo dalsi a dalsi rezervace tehoz vycepu
-- (autoReserveTapIfNeeded se voli pri kazdem ulozeni).
CREATE UNIQUE INDEX vycepy_rezervace_order_unique_idx
  ON public.vycepy_rezervace (order_id) WHERE order_id IS NOT NULL;

-- Kalendar se cte po obdobich.
CREATE INDEX vycepy_rezervace_obdobi_idx
  ON public.vycepy_rezervace (datum_od, datum_do);
CREATE INDEX vycepy_rezervace_vycep_idx
  ON public.vycepy_rezervace (vycep_id);

-- ── Prava ──────────────────────────────────────────────────────────────────
-- Stejny vzorec jako u ostatnich provoznich tabulek: cist smi kazdy
-- prihlaseny, menit jen kdo ma pravo k modulu "vycepy".
ALTER TABLE public.vycepy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vycepy_rezervace ENABLE ROW LEVEL SECURITY;

CREATE POLICY vycepy_select ON public.vycepy
  FOR SELECT TO authenticated USING (true);
CREATE POLICY perm_insert_vycepy ON public.vycepy
  FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('vycepy'));
CREATE POLICY perm_update_vycepy ON public.vycepy
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('vycepy'))
  WITH CHECK (public.user_can_edit_module('vycepy'));
CREATE POLICY perm_delete_vycepy ON public.vycepy
  FOR DELETE TO authenticated USING (public.user_can_edit_module('vycepy'));

CREATE POLICY vycepy_rezervace_select ON public.vycepy_rezervace
  FOR SELECT TO authenticated USING (true);
CREATE POLICY perm_insert_vycepy_rezervace ON public.vycepy_rezervace
  FOR INSERT TO authenticated WITH CHECK (public.user_can_edit_module('vycepy'));
CREATE POLICY perm_update_vycepy_rezervace ON public.vycepy_rezervace
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('vycepy'))
  WITH CHECK (public.user_can_edit_module('vycepy'));
CREATE POLICY perm_delete_vycepy_rezervace ON public.vycepy_rezervace
  FOR DELETE TO authenticated USING (public.user_can_edit_module('vycepy'));
