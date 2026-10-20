-- Špatně naučené zkratky piv (parser_aliases) — vynulovat piva u zkratek, které pivo určují chybně.
--
-- Z provozu 20. 10. 2026: u fotky objednávky vyšel řádek „5x 30l 11° Sv" jako Citron,
-- protože se 4. 8. 2026 při ruční opravě uložila zkratka „5x 30l 11° sv" → Citron.
-- Kontrola všech zkratek (124 s pivem) našla další, které pivo určují špatně nebo
-- vůbec nic o pivu neříkají (celé řádky objednávek s několika pivy, počet × objem).
--
-- CO MIGRACE DĚLÁ: u vyjmenovaných zkratek nastaví beer_id na NULL. Řádek zkratky
-- zůstane (zkratka pro OBAL, pokud ji má, se nedotkne). Nic jiného se nemění, nic
-- se nemaže. Pustit podruhé nic nezmění. Appka už takové zkratky i sama ignoruje
-- (beer-match.ts / orderParser.ts), tohle je jen úklid v datech.

UPDATE public.parser_aliases
SET beer_id = NULL
WHERE beer_id IS NOT NULL
  AND alias_text IN (
    '5x 30l 11° sv',
    '4 x 20l 11° sv',
    '2x 10l 12°sv.',
    '3 x 30l limo citr',
    '8x30 summer, 12x30 10,10x30 12',
    'craft beer spot, na patek 3x30l a jedenkrat summer',
    'malenovice 4x15 6x30 1x20',
    'bude 8x30 2x10',
    'plus 4x50l nase sudy mu pujcime',
    'terasa 2x 50l',
    'cyklo v 5x 1',
    'plus bude sklo usak 24x0, 5,12x0.3',
    'na sobotu pro vandyho na summer camp pipa dvoukohout a 6x50l 12sv, vydejka, sleva 10'
  );
