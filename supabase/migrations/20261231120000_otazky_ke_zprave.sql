-- ❓ Otázky, které má AI k přečtené WhatsApp zprávě.
-- ---------------------------------------------------------------------------
-- Do teď byl model nucený pokaždé HÁDAT: buď položku vrátil, nebo ne, a když
-- si nebyl jistý (je „2x10" deset piv, nebo dva sudy 10 l? má odpověď
-- objednávku upravit, nebo je to nová?), nedalo se to nikde říct. Obsluha
-- zprávu stejně kontroluje, takže otázka ji stojí vteřinu — špatně uhádnutá
-- objednávka ale odjede k odběrateli.
--
-- Sloupec je jsonb pole vět. Prázdné pole = všechno bylo jasné.
-- Bez hodnoty (NULL) = zpráva se četla ještě před touhle změnou.
--
-- auto-migrace: povoleno
ALTER TABLE public.whatsapp_incoming
  ADD COLUMN IF NOT EXISTS parsed_otazky jsonb;

COMMENT ON COLUMN public.whatsapp_incoming.parsed_otazky IS
  'Otázky AI k této zprávě (pole vět). Prázdné pole = nic nejasného. NULL = zpráva je starší než tahle funkce.';
