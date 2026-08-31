-- Denni checklisty pripravy pracoviste do databaze.
--
-- Dosud zily jen v localStorage (`bottling_checklist_<datum>`,
-- `keg_checklist_<datum>`). Melo to dva dusledky, ktere jdou proti sobe:
--   • kdo checklist proklikal na tabletu, musel ho na mobilu projit ZNOVU;
--   • zaroven sla brana „bez checklistu nezapises staceni" OBEJIT tim, ze se
--     clovek prepnul na jine zarizeni.
-- Pro HACCP je to zrovna ta polovina, ktera chybela: sanitace, ktera z
-- checklistu vyplyne, se do databaze zapisovala, ale zaznam o tom, ze
-- checklist vubec probehl, ne.
--
-- Jeden radek = jedna splnena polozka. Nesplnena polozka radek nema;
-- odskrtnuti se rusi smazanim. Stejny vzorec jako zavoz_ukoly_hotovo — nic
-- se nemusi predvytvaret dopredu a zmena seznamu polozek nevyzaduje zadnou
-- udrzbu, osirely radek se proste neuplatni.
--
-- Klice `pracoviste` i `polozka` jsou textove zamerne: odpovidaji id z
-- BottlingChecklistModal.tsx / KeggingChecklistModal.tsx. Kdyz se seznam
-- polozek rozsiri, databaze se menit nemusi.

CREATE TABLE IF NOT EXISTS public.checklisty_hotovo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'lahve' | 'kegy' — ktere pracoviste se pripravovalo.
  pracoviste text NOT NULL,
  -- Provozni den, ke kteremu checklist patri (businessDateISO).
  datum date NOT NULL,
  -- Id polozky checklistu (napr. 'start_2', 'month_5').
  polozka text NOT NULL,
  splneno_at timestamptz NOT NULL DEFAULT now(),
  -- Kdo odskrtl. Diky tomu je dohledatelne, kdo pripravu potvrdil — to
  -- localStorage nikdy nevedel.
  splnil text
);

-- Jedna polozka jednoho pracoviste v jednom dni = nejvyse jeden radek. Bez
-- toho by dve klepnuti (nebo dva lide naraz) zalozily dva zaznamy a
-- odskrtnuti by pak neslo zrusit jednim smazanim.
CREATE UNIQUE INDEX IF NOT EXISTS checklisty_hotovo_unique_idx
  ON public.checklisty_hotovo (pracoviste, datum, polozka);

-- Nacita se vzdy "cely dnesek pro jedno pracoviste".
CREATE INDEX IF NOT EXISTS checklisty_hotovo_den_idx
  ON public.checklisty_hotovo (pracoviste, datum);

ALTER TABLE public.checklisty_hotovo ENABLE ROW LEVEL SECURITY;

-- Cist smi kazdy prihlaseny — brana pred zapisem staceni musi umet overit
-- stav i uzivateli, ktery sam odskrtavat nesmi.
DROP POLICY IF EXISTS checklisty_hotovo_select ON public.checklisty_hotovo;
CREATE POLICY checklisty_hotovo_select ON public.checklisty_hotovo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perm_insert_checklisty_hotovo ON public.checklisty_hotovo;
CREATE POLICY perm_insert_checklisty_hotovo ON public.checklisty_hotovo
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_edit_module('entry'));

DROP POLICY IF EXISTS perm_update_checklisty_hotovo ON public.checklisty_hotovo;
CREATE POLICY perm_update_checklisty_hotovo ON public.checklisty_hotovo
  FOR UPDATE TO authenticated
  USING (public.user_can_edit_module('entry'))
  WITH CHECK (public.user_can_edit_module('entry'));

DROP POLICY IF EXISTS perm_delete_checklisty_hotovo ON public.checklisty_hotovo;
CREATE POLICY perm_delete_checklisty_hotovo ON public.checklisty_hotovo
  FOR DELETE TO authenticated
  USING (public.user_can_edit_module('entry'));
