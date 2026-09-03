-- Sbirani chyb aplikace.
--
-- Do teto chvile se chyba ukazala uzivateli (ErrorBoundary v main.tsx nebo
-- prazdna obrazovka) a tim to skoncilo — nikam se nezapsala. Rozbita
-- obrazovka se proto poznala jedine tak, ze nekdo zavolal. Pri deseti
-- nasazenich za den je to nejpomalejsi mozna cesta ke zjisteni, ze posledni
-- verze neco pokazila.
--
-- Radek nese verzi aplikace a zarizeni, takze jde rict "pada to jen na
-- verzi 2.208 a jen na Androidu" — presne to, co se pri hledani priciny
-- potrebuje vedet nejdriv.
--
-- CO SE SEM NEUKLADA: nic z obsahu obrazovky. Jen zprava chyby, zacatek
-- stack trace, nazev obrazovky, verze a user agent. Text objednavek,
-- jmena zakazniku ani cisla se do hlaseni nedostanou.

CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Kdo to videl. Muze byt NULL: chyba muze nastat i pred prihlasenim.
  user_id uuid,
  user_email text,
  -- Verze aplikace, ve ktere chyba nastala. Nejdulezitejsi sloupec z celeho
  -- radku: rekne, jestli chybu privezlo posledni nasazeni.
  app_version text,
  -- 'boundary' = zachytil React ErrorBoundary (bila obrazovka),
  -- 'unhandled' = neodchycena vyjimka, 'rejection' = neodchyceny promise.
  druh text NOT NULL DEFAULT 'boundary',
  -- Obrazovka, na ktere se to stalo (page id z Layout.tsx), kdyz je znama.
  obrazovka text,
  zprava text NOT NULL,
  -- Zkraceny stack (prvnich ~4000 znaku). Cely nema cenu: to podstatne je
  -- vzdy na zacatku a dlouhy text by tabulku jen nafoukl.
  stack text,
  user_agent text,
  -- Kolikrat se tataz chyba u tehoz cloveka zopakovala. Klient stejnou chybu
  -- neposila znovu a znovu (viz lib/chybyHlaseni.ts) — jinak by jedna
  -- smycka v renderu vyrobila tisice radku za minutu.
  pocet integer NOT NULL DEFAULT 1,
  -- Odklepnuto adminem = "uz to vim, resim". Radek zustava.
  vyrizeno_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_errors_cas_idx
  ON public.app_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS app_errors_nevyrizene_idx
  ON public.app_errors (created_at DESC)
  WHERE vyrizeno_at IS NULL;

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

-- Cist smi kazdy prihlaseny (v aplikaci to zobrazuje jen admin v Nastaveni),
-- zapisovat taky — hlaseni chyby musi projit i cloveku bez zvlastnich prav,
-- jinak se nedozvime prave o tech chybach, ktere ma on.
DROP POLICY IF EXISTS "auth_read_app_errors" ON public.app_errors;
CREATE POLICY "auth_read_app_errors" ON public.app_errors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_app_errors" ON public.app_errors;
CREATE POLICY "auth_insert_app_errors" ON public.app_errors
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_app_errors" ON public.app_errors;
CREATE POLICY "auth_update_app_errors" ON public.app_errors
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_write_app_errors" ON public.app_errors;
CREATE POLICY "service_write_app_errors" ON public.app_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);
