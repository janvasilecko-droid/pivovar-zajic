-- ⏰ Budíček pro WhatsApp most, aby na bezplatném Renderu neusnul.
--
-- Most běží jako web service na free plánu Renderu, který instanci po 15
-- minutách bez requestu uspí. Spící most NENÍ připojený k WhatsAppu — zprávy
-- tedy nikam nechodí a nikdo se to nedozví, protože se nic nerozbije, jen
-- přestane přibývat. 1. 9. 2026 takhle propadlo 33 hodin zpráv; probudil ho
-- teprve ruční dotaz na /health (odpověď za 22 s, uptime 12 s).
--
-- whatsapp-bridge/render.yaml na to upozorňuje a doporučuje pingovat zvenčí
-- (cron-job.org, UptimeRobot). Nikdo to nenastavil a nikdo si toho nevšiml —
-- proto to dělá databáze, která už pět jiných úloh spouští.
--
-- Free plán Renderu dává 750 instance-hodin měsíčně; nepřetržitě běžící
-- služba jich spotřebuje ~730, takže se to do limitu vejde, ale jen pro
-- JEDNU takovou službu.
create or replace function public.wake_whatsapp_bridge()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
BEGIN
  -- Fire-and-forget: pg_net odpověď zahodí, o obsah nám nejde. Stačí, že
  -- request dorazí — tím Render instanci drží vzhůru.
  PERFORM net.http_get(
    url := 'https://whatsapp-bridge-g1v0.onrender.com/health',
    timeout_milliseconds := 30000
  );
END;
$function$;

-- Každých 5 minut — s patnáctiminutovým limitem Renderu to má trojnásobnou
-- rezervu, takže most přežije i dva zaseknuté pingy po sobě.
-- cron.schedule podle jména existující úlohu přepíše, takže druhé spuštění
-- migrace nic nezdvojí.
SELECT cron.schedule('whatsapp-bridge-keepalive', '*/5 * * * *', 'SELECT public.wake_whatsapp_bridge();');
