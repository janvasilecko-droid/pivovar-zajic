-- BEZPECNOST: bucket whatsapp-media dovoloval ANONYMNIMU uzivateli vylistovat
-- si cely svuj obsah a stahnout vsechny fotky objednavek.
--
-- Puvodni politika (20261010000000_add_whatsapp_media_bucket.sql) byla:
--   CREATE POLICY "whatsapp_media_public_read" ON storage.objects
--     FOR SELECT USING (bucket_id = 'whatsapp-media');
-- Chybelo "TO authenticated", takze platila i pro roli anon. Anon klic je
-- verejne v JS bundlu appky, takze kdokoli mohl zavolat
-- POST /storage/v1/object/list/whatsapp-media a vypsat si vsechny soubory
-- (overeno: vraci HTTP 200 se seznamem wa-*.jpg vcetne velikosti).
-- Fotky objednavek obsahuji rucne psane objednavky, ceny, kontakty.
--
-- Tahle migrace omezuje SELECT politiku na prihlasene uzivatele, cimz
-- anonymni LISTING (enumerace) prestane fungovat.
--
-- POZOR - zamerne se NEMENI bucket.public na false: appka zobrazuje fotky
-- primo pres ulozene verejne URL (/object/public/...) na vic mistech
-- (Orders.tsx, WhatsAppOrderReviewModal.tsx, WhatsAppAutoProcessorModal.tsx)
-- a zavreni bucketu by rozbilo denni praci s objednavkami, dokud se
-- nepredela na podepsane URL (createSignedUrl). To je samostatny nasledny
-- krok. Po nem je potreba nastavit i:
--   UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';
--
-- Zbytkove riziko po teto migraci: kdo ZNA presnou URL souboru, stahne ho i
-- bez prihlaseni. Nazvy jsou ale wa-<32 hex znaku>.jpg (z WhatsApp media ID),
-- takze je nelze uhodnout - odpada prave ta enumerace, ktera z toho delala
-- prakticky zneuzitelnou diru.

DROP POLICY IF EXISTS "whatsapp_media_public_read" ON storage.objects;

CREATE POLICY "whatsapp_media_authenticated_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'whatsapp-media');
