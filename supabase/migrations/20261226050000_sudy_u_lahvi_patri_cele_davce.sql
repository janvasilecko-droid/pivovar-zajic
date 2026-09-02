-- 🛢️ Doplnění sudů k lahvím ze srovnání inventury.
--
-- Srovnání inventury zapisovalo lahve po obalech a počet sudů mezi ty obaly
-- ROZPOČÍTALO podle litrů. U malých balení vedle velkých z toho po
-- zaokrouhlení vyšla nula:
--
--   Summer Ale, srpen 2026, 17 sudů po 50 l
--     1 l    717 ks → 16 sudů      0,5 l   10 ks → 0 sudů
--     1,5 l   15 ks →  1 sud       0,33 l  10 ks → 0 sudů
--
-- SKLAD TÍM NETRPĚL — sudy se neztratily, jen se sesypaly na dva řádky ze
-- čtyř: 0 + 0 + 1 + 16 = 17, a přesně sedmnáct sudů se ze skladu odepsalo.
-- Špatně vypadal jen PŘEHLED STÁČENÍ: u 0,33 l a 0,5 l nebyl žádný zdroj,
-- takže to čtvrt tisíce lahví vypadalo, že vzniklo bez sudu.
--
-- Od verze 2.186 se počet sudů zapisuje CELÝ ke každému obalu, který z té
-- skupiny něco dostal (jako u ručního zápisu, kde se zadá jednou pro celou
-- dávku). Vícekrát se nespočítá: skladová kniha sourozenecké řádky slučuje
-- podle (datum, pivo, počet sudů, obal sudu, čas vzniku).
--
-- Tahle migrace srovná řádky, které vznikly PŘED opravou. Skupina se pozná
-- z poznámky („z 50l sudů"), její celkový počet sudů je součet toho, co se
-- mezi obaly rozpočítalo — takže se celkové číslo NEMĚNÍ, jen se rozprostře.
WITH radky AS (
  SELECT
    b.id,
    b.entry_date,
    b.beer_id,
    b.created_at,
    -- Velikost sudu z poznámky: „… z 50l sudů (dávka)".
    NULLIF(substring(b.note FROM ' z ([0-9]+(?:\.[0-9]+)?)l sudů'), '')::numeric AS objem_sudu
  FROM public.bottling b
  WHERE b.note ILIKE '%(dávka)%'
    AND b.note ~ ' z [0-9]+(\.[0-9]+)?l sudů'
),
skupiny AS (
  SELECT
    r.entry_date, r.beer_id, r.created_at, r.objem_sudu,
    p.id AS keg_pkg_id,
    SUM(COALESCE(b.kegs_used, 0)) AS sudu_celkem
  FROM radky r
  JOIN public.bottling b ON b.id = r.id
  JOIN public.packages p ON p.kind = 'keg' AND p.volume_l = r.objem_sudu
  GROUP BY r.entry_date, r.beer_id, r.created_at, r.objem_sudu, p.id
)
UPDATE public.bottling b
SET kegs_used = s.sudu_celkem,
    kegs_used_package_id = s.keg_pkg_id,
    source_volume_l = s.sudu_celkem * s.objem_sudu
FROM radky r
JOIN skupiny s
  ON s.entry_date = r.entry_date
 AND s.beer_id = r.beer_id
 AND s.created_at = r.created_at
 AND s.objem_sudu = r.objem_sudu
WHERE b.id = r.id
  AND s.sudu_celkem <> 0
  AND (b.kegs_used IS DISTINCT FROM s.sudu_celkem
       OR b.kegs_used_package_id IS DISTINCT FROM s.keg_pkg_id);
