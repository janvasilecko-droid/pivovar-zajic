/*
# Seed piv a obalů z evidence (kveten.xlsx)

## 1. Účel
Doplnění základního číselníku piv (`beers`) a obalů (`packages`) daty, která se
používala v provozní evidenci minipivovaru (kveten.xlsx). Bez těchto dat se
piva/obaly nezobrazují nikde v aplikaci (Katalogy, Fotky/OCR objednávek,
inventura, sklad, sklep...), protože katalogy jsou v DB prázdné.

## 2. Změny
- `beers` — zajištěn sloupec `beer_color` (idempotentně, pro jistotu — kód
  frontendu ho používá, ale v historii migrací chyběl).
- `beers` — vloženo 8 piv z evidence: 12° Světlá, 11° Světlá, 10° Desítka,
  12° Tmavá, Jantar, Summer Ale, 13 Hazy Bunny, Hazy Spring Day.
  Barva pozadí (beer_color) zvolena podle typu (světlé/tmavé/jantarové/ovocné).
- `packages` — vloženo 9 obalů: KEG 50/30/20/15/10 l a lahve/PET 1.5/1/0.5/0.33 l.

## 3. Bezpečnost
- Žádné změny RLS/policy — používají se existující policy z brewery_schema
  (authenticated CRUD).

## 4. Poznámky
- Idempotentní: piva se vkládají přes `INSERT ... WHERE NOT EXISTS` podle názvu,
  obaly přes `INSERT ... ON CONFLICT (code) DO NOTHING`, takže opakované
  spuštění migrace nevytvoří duplicity.
*/

-- 1) Zajistit sloupec beer_color na beers (pro jistotu, kód ho používá)
ALTER TABLE public.beers
  ADD COLUMN IF NOT EXISTS beer_color text;

-- 2) Piva
INSERT INTO public.beers (name, degree, color, beer_color, is_active, sort_order)
SELECT v.name, v.degree, v.color, v.beer_color, true, v.sort_order
FROM (VALUES
  ('12° Světlá',       '12°', 'světlé',  '#FDE68A', 1),
  ('11° Světlá',       '11°', 'světlé',  '#FEF3C7', 2),
  ('10° Desítka',      '10°', 'světlé',  '#FCD34D', 3),
  ('12° Tmavá',        '12°', 'tmavé',   '#44403B', 4),
  ('Jantar',           NULL,  'jantarové','#F59E0B', 5),
  ('Summer Ale',       NULL,  'ovocné',  '#86EFAC', 6),
  ('13 Hazy Bunny',    '13°', 'nefiltrované', '#FCA5A5', 7),
  ('Hazy Spring Day',  NULL,  'nefiltrované', '#F9A8D4', 8)
) AS v(name, degree, color, beer_color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.beers b WHERE lower(btrim(b.name)) = lower(btrim(v.name))
);

-- 3) Obaly (KEG + lahve/PET)
INSERT INTO public.packages (code, kind, volume_l, label, sort_order)
VALUES
  ('KEG50',   'keg',    50,   'KEG 50l',    1),
  ('KEG30',   'keg',    30,   'KEG 30l',    2),
  ('KEG20',   'keg',    20,   'KEG 20l',    3),
  ('KEG15',   'keg',    15,   'KEG 15l',    4),
  ('KEG10',   'keg',    10,   'KEG 10l',    5),
  ('LAHEV15', 'bottle', 1.5,  'Lahve 1.5l', 6),
  ('LAHEV1',  'bottle', 1,    'Lahve 1l',   7),
  ('LAHEV05', 'bottle', 0.5,  'Lahve 0.5l', 8),
  ('LAHEV033','bottle', 0.33, 'Lahve 0.33l',9)
ON CONFLICT (code) DO NOTHING;
