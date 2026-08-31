-- Volitelna hodnota u polozky checklistu.
--
-- KEG checklist neuklada jen „splneno / nesplneno". U kroku sanitace se voli
-- POSTUP — NaOH, nebo Persteril (`keg_start_1_choice`). To je udaj, ktery do
-- sanitacniho deniku patri: pri kontrole je rozdil, cim se sanitovalo.
--
-- Sloupec je volitelny: bezna odskrtnuta polozka ho necha prazdny.
ALTER TABLE public.checklisty_hotovo
  ADD COLUMN IF NOT EXISTS hodnota text;
