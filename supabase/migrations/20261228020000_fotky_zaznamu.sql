-- Fotka k zapisu (odpis, rozbity sud, zavoz, objednavka).
--
-- K odpisu "zkazene, rozbita lahev" je dnes jedinym dokladem veta v
-- poznamce; po mesici si nikdo nevzpomene, jak to vypadalo, a u
-- reklamace neni co ukazat. Zmensovani obrazku aplikace umi
-- (src/lib/obrazek.ts), chybelo uloziste a policko u zapisu.
--
-- Dve veci schvalne:
--
--  1) Obrazek jde do Storage, do databaze jen CESTA. Radky zapisu se
--     ctou po tisicich a base64 fotka v radku by se stahovala do telefonu
--     pri kazdem nacteni obrazovky.
--  2) Bucket je NEVEREJNY, na rozdil od whatsapp-media (viz
--     20261205000000 — verejny bucket sel anonymne vylistovat). Cte se
--     pres podepsane URL, ktere plati hodinu.

INSERT INTO storage.buckets (id, name, public)
SELECT 'zaznam-fotky', 'zaznam-fotky', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_read" ON storage.objects;
CREATE POLICY "zaznam_fotky_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_insert" ON storage.objects;
CREATE POLICY "zaznam_fotky_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'zaznam-fotky');

DROP POLICY IF EXISTS "zaznam_fotky_delete" ON storage.objects;
CREATE POLICY "zaznam_fotky_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'zaznam-fotky');

CREATE TABLE IF NOT EXISTS public.zaznam_fotky (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- K cemu fotka patri: 'odpis', 'objednavka', 'sud', 'zavoz'.
  -- Text, ne cizi klic: zapisy zijou v peti ruznych tabulkach a jeden
  -- spolecny cizi klic by na ne stejne neslo navesit.
  typ text NOT NULL,
  zaznam_id text NOT NULL,
  -- Cesta v bucketu zaznam-fotky.
  cesta text NOT NULL,
  popis text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zaznam_fotky_zaznam_idx
  ON public.zaznam_fotky (typ, zaznam_id, created_at DESC);

ALTER TABLE public.zaznam_fotky ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_read_zaznam_fotky" ON public.zaznam_fotky
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_insert_zaznam_fotky" ON public.zaznam_fotky
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_zaznam_fotky" ON public.zaznam_fotky;
CREATE POLICY "auth_delete_zaznam_fotky" ON public.zaznam_fotky
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228020000_fotky_zaznamu.sql', 'migrace sama', 'fotky k zapisum + neverejny bucket')
ON CONFLICT (nazev) DO NOTHING;
