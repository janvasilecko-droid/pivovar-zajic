-- 🚚❌ Objednávka „bez závozu" — odběratel, který nepotřebuje závozovou trasu.
--
-- Zadání 24. 9. 2026: „do obednavek pridej zaskrtavaci volbu bez zavozu,
-- automaticky ji zaskrtni kdyz bude mates,jitka,restaurace,terasa u zbytku
-- se musi zadat rucne."
--
-- Zaškrtávací pole ve formuláři zadání objednávky (src/screens/Orders.tsx).
-- U čtyř jmenovaných odběratelů se zaškrtne samo (src/lib/bezZavozu.ts),
-- u ostatních zůstává odškrtnuté, dokud ho někdo nezaškrtne ručně — appka
-- si o nikom jiném nesmí domýšlet, že závoz nepotřebuje.
--
-- ZÁMĚRNĚ SE NIC JINÉHO NEMĚNÍ: obrazovka Závoz (trasa) tenhle sloupec zatím
-- nefiltruje — to není součástí týhle žádosti a bez jasného zadání by appka
-- mohla objednávku schovat týmu, který ji přesto potřebuje sledovat.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS no_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.no_delivery IS
  'Objednávka nepotřebuje závozovou trasu (odběratel si bere pivo sám / je to prodej na místě). Zaškrtává se ve formuláři zadání, automaticky pro jmenované odběratele (viz src/lib/bezZavozu.ts).';
