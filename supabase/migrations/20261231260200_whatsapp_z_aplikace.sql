-- Zpráva odeslaná z appky na WhatsApp se po návratu přes most nezpracuje znovu.
--
-- Z provozu 6. 10. 2026: „když si pošlu z aplikace objednávku na WhatsApp,
-- ať se mi tam nezobrazuje, ať to program pozná, že jde o objednávku
-- odeslanou od něj, ať se pak nezpracuje 2× zbytečně."
--
-- Tlačítko „Sdílet na WhatsApp" (src/lib/whatsapp.ts) dává do textu
-- NEVIDITELNOU značku (U+2063 U+200B U+2063, viz ZNACKA_Z_APLIKACE
-- v supabase/functions/_shared/vlastni-hlaseni-objednavky.ts). Most zprávu
-- ze skupiny vrátí appce jako každou jinou — tady se hned při uložení označí
-- jako ignorovaná, takže se neobjeví mezi čekajícími a AI ji nezpracuje.
-- (whatsapp-auto-parse ji pozná taky — pojistka pro případ, že tenhle
-- trigger ještě nebude puštěný.)

CREATE OR REPLACE FUNCTION public.whatsapp_zprava_z_aplikace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF strpos(COALESCE(NEW.message_text, ''), E'⁣​⁣') > 0 THEN
    NEW.status := 'ignored';
    NEW.error_message := 'Odesláno z aplikace — objednávka už v appce je, znovu se nezpracovává';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_zprava_z_aplikace ON public.whatsapp_incoming;
CREATE TRIGGER trg_whatsapp_zprava_z_aplikace
  BEFORE INSERT ON public.whatsapp_incoming
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_zprava_z_aplikace();
