-- 🧹 Úklid soukromých zpráv, které se do aplikace nahrály omylem.
--
-- PROČ: vlastní zprávy majitele (from_me) obcházely whitelist, takže se do
-- `whatsapp_incoming` uložilo VŠECHNO, co si napsal — i osobní konverzace,
-- které pak v provozní aplikaci viděli všichni, kdo do ní mají přístup.
-- Bránu zavírá migrace 20261226080000; tenhle skript uklízí, co už leží
-- v databázi.
--
-- ⚠️ TOHLE NENÍ MIGRACE A SCHVÁLNĚ SE NEPOUŠTÍ SAMO. Maže se tu provozní
-- záznam a z venku není vidět, co v těch řádcích je. Postup je proto
-- DVOUKROKOVÝ: nejdřív se podívej (krok 1 a 2), potom smaž (krok 3).
--
-- Pouští se v Supabase → SQL Editor, přihlášený jako vlastník projektu.

-- ---------------------------------------------------------------------------
-- KROK 1 — Co je vůbec ve whitelistu? Bez toho nemá smysl mazat: kdyby byl
-- prázdný, dotazy níž označí za „k smazání" úplně všechno, i objednávky.
-- ---------------------------------------------------------------------------
SELECT sender_name, chat_id FROM public.whatsapp_senders ORDER BY sender_name;

-- Když je výsledek PRÁZDNÝ, dál nepokračuj: nejdřív v aplikaci
-- (Nastavení → WhatsApp odesílatelé) zaregistruj objednávkovou skupinu —
-- jméno i chat_id. Teprve pak jde poznat, co do appky patří a co ne.


-- ---------------------------------------------------------------------------
-- KROK 2 — Prohlídka. Vypíše zprávy, které dnešní branou NEPROJDOU, tedy
-- přesně ty, co se nahrály jen díky té výjimce. Projdi si je očima.
--
-- `message_text` je zkrácený na 120 znaků — jde o to poznat, jestli je to
-- objednávka nebo osobní zpráva, ne si to celé přečíst.
-- ---------------------------------------------------------------------------
WITH nepovolene AS (
  SELECT i.*
  FROM public.whatsapp_incoming i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.whatsapp_senders s
    WHERE (
      i.chat_id IS NOT NULL AND btrim(i.chat_id) <> ''
      AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
      AND lower(btrim(s.chat_id)) = lower(btrim(i.chat_id))
    ) OR (
      i.sender_name IS NOT NULL
      AND whatsapp_norm(i.sender_name) = whatsapp_norm(s.sender_name)
    )
  )
)
SELECT
  id,
  created_at,
  sender_name,
  sender_number,
  chat_id,
  from_me,
  status,
  left(message_text, 120) AS ukazka_textu
FROM nepovolene
ORDER BY created_at DESC;

-- Kolik jich je a odkud — rychlý přehled, než začneš mazat.
WITH nepovolene AS (
  SELECT i.*
  FROM public.whatsapp_incoming i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.whatsapp_senders s
    WHERE (
      i.chat_id IS NOT NULL AND btrim(i.chat_id) <> ''
      AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
      AND lower(btrim(s.chat_id)) = lower(btrim(i.chat_id))
    ) OR (
      i.sender_name IS NOT NULL
      AND whatsapp_norm(i.sender_name) = whatsapp_norm(s.sender_name)
    )
  )
)
SELECT sender_name, chat_id, from_me, count(*) AS pocet
FROM nepovolene
GROUP BY sender_name, chat_id, from_me
ORDER BY pocet DESC;


-- ---------------------------------------------------------------------------
-- KROK 3 — Smazání. Odkomentuj AŽ potom, co jsi výpis z kroku 2 viděl
-- a souhlasíš s ním.
--
-- POZOR NA DVĚ VĚCI:
--
--  1. Objednávka, která z takové zprávy vznikla, TÍMHLE NEZMIZÍ — leží
--     v `orders` a je to samostatný záznam. Když jsi z osobní zprávy
--     omylem založil objednávku, smaž ji v aplikaci zvlášť.
--  2. `whatsapp_prijem_log` drží `message_preview`, tedy část textu, a
--     `whatsapp_rejected` totéž u odmítnutých. Kdo maže kvůli soukromí,
--     musí uklidit i je — proto jsou tu taky.
-- ---------------------------------------------------------------------------

-- BEGIN;
--
-- -- 3a) Log příjmu (drží ukázku textu). Nejdřív, kvůli odkazu na incoming.
-- DELETE FROM public.whatsapp_prijem_log p
-- WHERE p.incoming_id IN (
--   SELECT i.id FROM public.whatsapp_incoming i
--   WHERE NOT EXISTS (
--     SELECT 1 FROM public.whatsapp_senders s
--     WHERE (
--       i.chat_id IS NOT NULL AND btrim(i.chat_id) <> ''
--       AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
--       AND lower(btrim(s.chat_id)) = lower(btrim(i.chat_id))
--     ) OR (
--       i.sender_name IS NOT NULL
--       AND whatsapp_norm(i.sender_name) = whatsapp_norm(s.sender_name)
--     )
--   )
-- );
--
-- -- 3b) Samotné zprávy.
-- DELETE FROM public.whatsapp_incoming i
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.whatsapp_senders s
--   WHERE (
--     i.chat_id IS NOT NULL AND btrim(i.chat_id) <> ''
--     AND s.chat_id IS NOT NULL AND btrim(s.chat_id) <> ''
--     AND lower(btrim(s.chat_id)) = lower(btrim(i.chat_id))
--   ) OR (
--     i.sender_name IS NOT NULL
--     AND whatsapp_norm(i.sender_name) = whatsapp_norm(s.sender_name)
--   )
-- );
--
-- -- 3c) Odmítnuté zprávy starší než týden — přehled „co nám nepřišlo" má
-- --     smysl na pár dní, ne jako trvalý archiv cizích textů.
-- DELETE FROM public.whatsapp_rejected
-- WHERE created_at < now() - interval '7 days';
--
-- -- Zkontroluj počty ve výpisu výš a pak potvrď:
-- COMMIT;
-- -- (nebo ROLLBACK; když něco nesedí)
