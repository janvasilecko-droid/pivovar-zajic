-- Podpis prevzeti objednavky prstem na displeji.
--
-- Ridic dnes veze papir, na nem se podepisuje a papir se vraci do
-- pivovaru — takze dokud se nevrati, neni jak zjistit, co bylo doopravdy
-- prevzato. Odtud "to jsme nedostali" u faktury.
--
-- Podpis je ZVLASTNI TABULKA, ne dalsi sloupec v orders. Obrazovka
-- Objednavky nacita vsechny objednavky naraz a obrazek podpisu (i mala
-- cernobila cmaranice ma nekolik kB) by se posilal do telefonu i tehdy,
-- kdyz se zadny detail neotevre. Takhle se cte jen tam, kde je videt.
--
-- Jeden podpis na objednavku: order_id je primarni klic, dalsi podpis
-- prepise ten predchozi (podepsalo se znovu, protoze se prvni nepovedl).

CREATE TABLE IF NOT EXISTS public.objednavka_podpisy (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  -- PNG jako data URL. Cmaranice, ne fotka — velikost hlida aplikace
  -- (src/lib/podpis.ts, strop 200 kB).
  podpis_png text NOT NULL,
  -- Kdo prevzal, jak se podepsal/rekl. Volny text, muze byt prazdny.
  prevzal text,
  -- Rozmery platna, na kterem se podepisovalo — podpis se pak da
  -- nakreslit ve spravnem pomeru i na jinem telefonu a na papire.
  sirka integer,
  vyska integer,
  podepsano_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.objednavka_podpisy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_podpisy" ON public.objednavka_podpisy;
CREATE POLICY "auth_read_podpisy" ON public.objednavka_podpisy
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_podpisy" ON public.objednavka_podpisy;
CREATE POLICY "auth_insert_podpisy" ON public.objednavka_podpisy
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_podpisy" ON public.objednavka_podpisy;
CREATE POLICY "auth_update_podpisy" ON public.objednavka_podpisy
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- Mazat podpis muze jen ten, kdo ho porizoval, nebo admin — je to doklad
-- o prevzeti, ne pracovni poznamka. Mazani proto zamerne NENI povolene
-- vsem prihlasenym; pripadne smazani resi servisni klic.

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228010000_podpis_prevzeti.sql', 'migrace sama', 'podpis prevzeti u objednavky')
ON CONFLICT (nazev) DO NOTHING;
