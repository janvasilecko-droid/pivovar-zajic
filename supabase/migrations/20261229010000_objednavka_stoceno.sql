-- „Stoceno" u polozky objednavky.
--
-- Objednavka projde tremi stavy: pivo se STOCI (KEG/lahve), pak se
-- PRIPRAVI k odvozu a nakonec ZAVEZE. Druhy a treti stav aplikace uz mela
-- (order_items.is_prepared, orders.is_delivered), prvni ne — a prave ten
-- clovek u vycepu potrebuje odskrtnout nejdriv.
--
-- Proc na POLOZCE a ne na objednavce: objednavka bezne obsahuje ctyri piva
-- a stacet se muzou v ruznych dnech. Priznak na objednavce by dovolil jen
-- „vsechno, nebo nic" — a to je presne stav, kvuli kteremu se dneska pise
-- na papir vedle monitoru.
--
-- Odskrtnout to jde v Objednavkach i v Zavozu; obe obrazovky ctou tenhle
-- jeden sloupec, takze druha pravda nevznikne.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_bottled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.order_items.is_bottled IS
  'Pivo pro tuto polozku je stocene (KEG/lahve). Odskrtava se v Objednavkach i v Zavozu.';

-- Index schvalne NENI: polozky se vzdycky ctou pres order_id (uz indexovane)
-- a filtr „co jeste neni stocene" se dela nad uz nactenou objednavkou.
