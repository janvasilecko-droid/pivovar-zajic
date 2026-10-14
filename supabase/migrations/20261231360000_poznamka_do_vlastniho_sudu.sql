-- Poznámka „do vlastního sudu“ u otevřených objednávek, které WhatsApp zpráva
-- zadala „do jejich sudu“.
--
-- CO SE STALO: Egon (14. 10. 2026): „Egon od důchodců prosím 20l 12sv do jejich
-- sudu“. Pivo se stáčí do sudu odběratele, ne do sudu pivovaru, a appka přesto
-- psala „Nejsou sudy (1× 20l)“. Od teď to appka pozná z poznámky objednávky
-- (lib/vlastniSudy.ts) a při schválení zprávy ji do poznámky sama připíše.
-- Objednávky schválené PŘED touhle změnou poznámku nemají — zpráva, ze které
-- vznikly, to ale říká.
--
-- CO MIGRACE DĚLÁ: k otevřeným objednávkám (nezavezeným, nestornovaným), jejichž
-- zdrojová WhatsApp zpráva říká „do jejich / vlastního / svého sudu“, připíše do
-- poznámky „do vlastního sudu“. Existující poznámka zůstane, text se jen přidá
-- za ni. Kdo už poznámku s vlastním sudem má, nezmění se nic (pustit migraci
-- podruhé nic nepřidá). Zavezené objednávky se nedotknou. Nic se nemaže.

UPDATE public.orders o
SET note = CASE
  WHEN btrim(coalesce(o.note, '')) = '' THEN 'do vlastního sudu'
  ELSE btrim(o.note) || '; do vlastního sudu'
END
WHERE o.is_delivered = false
  AND o.status IS DISTINCT FROM 'storno'
  AND coalesce(o.note, '') !~* '(vlastn[^[:space:]]*[[:space:]]+([^[:space:]]+[[:space:]]+)?(sud|keg)|jejich[[:space:]]+([^[:space:]]+[[:space:]]+)?(sud|keg))'
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_incoming w
    WHERE w.imported_order_id = o.id
      AND w.message_text ~* '(^|[^[:alnum:]])do[[:space:]]+(jejich|jeho|sv[eé]ho|sv[uů]j|vlastn[^[:space:]]*)[[:space:]]+([^[:space:]]+[[:space:]]+)?(sud|keg)'
  );
