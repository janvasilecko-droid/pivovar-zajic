-- Seeberg a Lužec: výchozí den závozu PÁTEK.
--
-- Majitel 17. 11. 2026: „U objednávek Seeberg, Lužec dávej automaticky
-- objednávky na pátek."
--
-- Dosud měli oba výjimku „žádný den" (places.vychozi_den_zavozu = 'zadny',
-- migrace 20261231260000 — tehdy šlo jen o to, aby nedostávali pražskou
-- středu). Objednávka bez dne ve zprávě tak zůstala bez dne závozu: sklad
-- s ní sice počítal na pátek (tak databáze bere každou objednávku bez dne),
-- ale v objednávkách, v plánu stáčení ani v kontrole zprávy pátek vidět nebyl
-- a musel se doklikávat ručně.
--
-- Nově: objednávka Seebergu nebo Lužce bez dne dostane PÁTEK — nejbližší od
-- data objednávky (trigger trg_doplnit_datum_zavozu, beze změny). Den napsaný
-- ve zprávě („na čtvrtek") nebo vybraný ručně platí dál a nepřepisuje se.
-- Appka čte stejný sloupec (src/lib/denZavozu.ts), takže pátek ukáže předem
-- už v kontrole zprávy a jde tam změnit.

-- 1) Odběratelé: „žádný den" → pátek ---------------------------------------
-- Přesná jména (jako ve 20261231260000). Jen kde je pořád původní výjimka —
-- den, který by mezitím někdo nastavil jinak, se nepřepisuje.
UPDATE public.places
SET vychozi_den_zavozu = 'pa'
WHERE lower(btrim(name)) IN ('seeberg', 'lužec', 'luzec')
  AND vychozi_den_zavozu = 'zadny';

-- 2) Otevřené objednávky Seebergu a Lužce bez dne → pátek -------------------
-- Jen ty, co ještě neodjely: den závozu podle dosavadního výpočtu (pátek
-- v týdnu objednávky) je dnes nebo později. Starší se nechávají být — jejich
-- odpočty ze skladu už k tomu pátku vznikly. Den se tím neposouvá (pátek to
-- byl i dosud), jen je u objednávky zapsaný a vidět. K 17. 11. 2026 taková
-- objednávka není (ověřeno na datech); krok je tu pro tu, která přijde, než
-- se migrace pustí. Objednávky „bez závozu" a ty s vyplněným dnem nebo datem
-- se nemění.
UPDATE public.orders o
SET delivery_day = 'pa'
WHERE COALESCE(o.delivery_day, '') = ''
  AND o.delivery_date IS NULL
  AND o.status <> 'storno'
  AND o.is_delivered = false
  AND COALESCE(o.no_delivery, false) = false
  AND public.ucinny_den_zavozu(NULL, NULL, o.order_date) >= (now() AT TIME ZONE 'Europe/Prague')::date
  AND public.vychozi_den_zavozu(o.place_id, o.place_name) = 'pa'
  AND (
    o.place_id IN (
      SELECT p.id FROM public.places p
      WHERE lower(btrim(p.name)) IN ('seeberg', 'lužec', 'luzec')
    )
    OR (o.place_id IS NULL AND lower(btrim(o.place_name)) IN ('seeberg', 'lužec', 'luzec'))
  );
