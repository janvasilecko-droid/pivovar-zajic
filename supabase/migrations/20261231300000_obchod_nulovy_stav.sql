-- 🏪 Obchod: nulový (počáteční) stav piv z ručně psaného sešitu.
--
-- Zadání 13. 10. 2026: „tohle je nulový stav obchodu, přečti data a doplň je;
-- inventura se bude sledovat a odečty z piva a pálenky, ostatní položky
-- z uzávěrek budeš jen sčítat a bude se sledovat, kolik se jich prodalo."
-- K „+": „pokud je tam plus, tak ho sečti" (6x +8 = 14).
--
-- Co migrace dělá (jen přidává, nic nemaže ani nemění):
--   1) přidá zboží obchodu (kód z pokladny z lib/obchodKatalog.ts) k pivům,
--      která jsou v sešitě, s vazbou na pivo a obal z katalogu,
--   2) zapíše jejich počáteční inventuru ke konci dne 13. 10. 2026
--      (sklad se od ní počítá: + fasování a příjmy, − prodej z uzávěrek).
--   Co už v obchodě je (stejný kód / stejné pivo a obal / stejný den
--   a zboží), se přeskočí.
--
-- PŘEČTENO ZE SEŠITU (číslo = ks; kde je „+", sečteno):
--   PET 1 l :  10° 7 · 12° světlá 10 · Jantar 9+5 = 14 · 12° tmavá 7 ·
--              11° 10+6 = 16 · Osma (Cyklistička Vosmička) 5
--   PET 1,5 l: 10° 7 · 12° světlá 10 · 12° tmavá 8 · 11° 4 · Osma 5
--   sklo 0,5 l: 12° světlá 4 · 12° tmavá 4 · 10° 6+8 = 14
--   sklo 0,33 l: 12° tmavá 5 · 11° 2+5 = 7
--
-- ZÁMĚRNĚ NEZAPSÁNO (nejasné nebo chybí v katalogu zboží) — doplnit v Obchod
-- → Inventura po ověření sešitu:
--   • sklo 0,33 l 12° světlá — v sešitě „9 12", nejde jednoznačně přečíst,
--   • sklo 0,33 l 10° — v sešitě 7+8 = 15, ale zboží s kódem z pokladny
--     v katalogu není (přidat v Obchod → Zboží jako „Jiné zboží"),
--   • Jantar 1,5 l a 11° 0,5 l — v sešitě nejsou.

-- 1) Zboží ---------------------------------------------------------------
INSERT INTO public.obchod_zbozi (kod, nazev, beer_id, package_id, cena, updated_by)
SELECT z.kod, z.nazev, b.id, p.id, z.cena, 'nulový stav ze sešitu'
FROM (VALUES
  ('11140', 'Pivo PET 1l 10° světlá',                 '10° Desítka',  '1l',   74),
  ('11141', 'Pivo PET 1l 12° světlá',                 '12° Světlá',   '1l',   84),
  ('11142', 'Pivo PET 1l 12° jantarový ležák',        'Jantar',       '1l',   85),
  ('11143', 'Pivo PET 1l 12° tmavá',                  '12° Tmavá',    '1l',   86),
  ('11144', 'Pivo PET 1l 11° světlý ležák',           '11° Světlá',   '1l',   81),
  ('11197', 'Pivo PET 1l 8° Cyklistička Vosmička',    'Osma',         '1l',   73),
  ('11146', 'Pivo PET 1,5l 10° světlá',               '10° Desítka',  '1.5l', 106),
  ('11147', 'Pivo PET 1,5l 12° světlá',               '12° Světlá',   '1.5l', 119),
  ('11149', 'Pivo PET 1,5l 12° tmavá',                '12° Tmavá',    '1.5l', 124),
  ('11190', 'Pivo PET 1,5l 11° světlý ležák',         '11° Světlá',   '1.5l', 115),
  ('11198', 'Pivo PET 1,5l 8° Cyklistička Vosmička',  'Osma',         '1.5l', 105),
  ('11001', 'Pivo sklo 12° světlá 0,5l',              '12° Světlá',   '0.5l', 48),
  ('11004', 'Pivo sklo 12° tmavá 0,5l',               '12° Tmavá',    '0.5l', 49),
  ('11009', 'Pivo sklo 10° sv. 0,5l',                 '10° Desítka',  '0.5l', 43),
  ('11005', 'Pivo sklo 12° tmavá 0,33l',              '12° Tmavá',    '0.33l', 36),
  ('11172', 'Pivo sklo 11° světlý ležák 0,33l',       '11° Světlá',   '0.33l', 34)
) AS z(kod, nazev, pivo, obal, cena)
JOIN public.beers b ON btrim(b.name) = z.pivo
JOIN public.packages p ON btrim(p.label) = z.obal
WHERE NOT EXISTS (SELECT 1 FROM public.obchod_zbozi o WHERE o.kod = z.kod)
ON CONFLICT DO NOTHING;

-- 2) Počáteční inventura k 13. 10. 2026 -----------------------------------
INSERT INTO public.obchod_inventura (datum, kod, napocitano, poznamka, zapsal)
SELECT DATE '2026-10-13', v.kod, v.ks, 'Nulový stav ze sešitu (13. 10. 2026)', 'přepis ze sešitu'
FROM (VALUES
  ('11140', 7),  ('11141', 10), ('11142', 14), ('11143', 7),  ('11144', 16), ('11197', 5),
  ('11146', 7),  ('11147', 10), ('11149', 8),  ('11190', 4),  ('11198', 5),
  ('11001', 4),  ('11004', 4),  ('11009', 14),
  ('11005', 5),  ('11172', 7)
) AS v(kod, ks)
WHERE EXISTS (SELECT 1 FROM public.obchod_zbozi z WHERE z.kod = v.kod)
ON CONFLICT (datum, kod) DO NOTHING;
