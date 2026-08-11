-- Fotky z WhatsApp objednávek: veřejný Supabase Storage bucket „whatsapp-media“.
--
-- Proč: DeepSeek (textový model AI) fotky NEČTE, takže objednávku poslanou jako
-- fotka musí v aplikaci zkontrolovat a stáhnout člověk. whatsapp-bridge stáhne
-- fotku ze serverů WhatsApp a nahraje ji sem (service role klíč); výsledná URL
-- se uloží do whatsapp_incoming.media_url (viz whatsapp_readback_and_media).
--
-- Bucket je veřejný → fotka je dostupná přímo v prohlížeči (<img>, download)
-- bez přihlášení. Zápis dělá jen whatsapp-bridge se service role klíčem (RLS
-- se obejde), aplikace ke čtení nepotřebuje žádný extra grant.

-- 1) Vytvoř bucket idempotentně (DO blok → migrace je bezpečná i při opětovném
--    spuštění na existující databázi).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'whatsapp-media') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('whatsapp-media', 'whatsapp-media', true);
  END IF;
END $$;

-- 2) Veřejné čtení objektů bucketu (storage.objects má vlastní RLS). Bez této
--    politiky by i GET /object/public/... mohl skončit 401 u nereplikovaných
--    bucketů; zápis zůstává omezen na service role (RLS se obejde).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'whatsapp_media_public_read'
  ) THEN
    CREATE POLICY "whatsapp_media_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;
