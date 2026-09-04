-- Odbery push upozorneni (jedno zarizeni = jeden radek).
--
-- Upozorneni v aplikaci (src/lib/notifications.ts) fungujou jen tehdy,
-- kdyz je appka otevrena — takze "prisla objednavka na WhatsApp" nebo
-- "vycep je po terminu" se dozvedel jen ten, kdo se zrovna koukal.
-- Skutecny push potrebuje ulozit zarizeni; odesila edge funkce
-- posli-push.
--
-- Endpoint je primarni klic: prohlizec pro jedno zarizeni vraci porad
-- stejnou adresu, takze opakovane zapnuti radek prepise misto toho, aby
-- se na jeden telefon posilalo petkrat.

CREATE TABLE IF NOT EXISTS public.push_odbery (
  endpoint text PRIMARY KEY,
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- "Android · Chrome" — at je v seznamu poznat, ktery telefon to je.
  zarizeni text,
  -- Posledni chyba pri odesilani. Kdyz push prestane chodit, ma se to
  -- poznat tady, ne z toho, ze nekdo neprisel do prace.
  posledni_chyba text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_odbery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_read_push_odbery" ON public.push_odbery
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_write_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_write_push_odbery" ON public.push_odbery
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_update_push_odbery" ON public.push_odbery
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_push_odbery" ON public.push_odbery;
CREATE POLICY "auth_delete_push_odbery" ON public.push_odbery
  FOR DELETE TO authenticated USING (true);

INSERT INTO public.migrace_aplikovane (nazev, zdroj, poznamka)
VALUES ('20261228030000_push_odbery.sql', 'migrace sama', 'odbery push upozorneni')
ON CONFLICT (nazev) DO NOTHING;
