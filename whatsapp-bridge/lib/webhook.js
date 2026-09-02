/**
 * Odeslání zprávy na Supabase edge funkci `whatsapp-webhook`
 * (POST, hlavička x-webhook-token, payload přesně ve formátu Tasker).
 */

export function getWebhookConfig() {
  const webhookUrl =
    process.env.WEBHOOK_URL ||
    (process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL}/functions/v1/whatsapp-webhook`
      : '');
  const secret = process.env.WEBHOOK_SECRET || '';
  if (!webhookUrl) {
    throw new Error('Chybí WEBHOOK_URL (nebo SUPABASE_URL). Nastav je jako environment variables.');
  }
  return { webhookUrl, secret };
}

/**
 * Pošle payload na webhook s retry (exponenciální backoff, max. 4 pokusy).
 * 4xx se neopakují (webhook zprávu odmítl — retry nepomůže).
 */
export async function forwardToWebhook(payload, logger) {
  const { webhookUrl, secret } = getWebhookConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-webhook-token'] = secret;

  let lastErr = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();

      if (res.ok) {
        logger.info(`[webhook] HTTP ${res.status} (pokus ${attempt}): ${text.slice(0, 160)}`);
        return { ok: true, status: res.status, body: text };
      }

      lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      if (res.status < 500) {
        // 4xx = trvalé odmítnutí (401 token, 400 payload apod.) — bez retry
        logger.error(`[webhook] HTTP ${res.status} — bez retry: ${text.slice(0, 200)}`);
        return { ok: false, status: res.status, body: text };
      }
    } catch (e) {
      lastErr = e; // síťová chyba / timeout
    }

    const wait = Math.min(2 ** attempt * 1000, 10000) + Math.floor(Math.random() * 500);
    logger.warn(`[webhook] pokus ${attempt} selhal (${lastErr?.message}) — opakuji za ${wait} ms`);
    await new Promise((r) => setTimeout(r, wait));
  }

  logger.error(
    `[webhook] VŠECHNY pokusy selhaly (${lastErr?.message}) — zpráva se NEULOŽILA: ${JSON.stringify(payload)}`
  );
  return { ok: false, error: lastErr?.message };
}

/**
 * Odloží zprávu, kterou se nepodařilo předat webhooku, do fronty
 * `whatsapp_neodeslane` (migrace 20261226060000).
 *
 * Do téhle chvíle končila taková zpráva jen v logu na Renderu — ten nikdo
 * nečte a po čase zmizí, takže objednávka se ztratila beze stopy a v aplikaci
 * to vypadalo, že ji zákazník nikdy neposlal.
 *
 * `upsert` podle webhook_id: opakovaně padající zpráva má pořád jeden řádek,
 * jen se zvyšuje počítadlo pokusů.
 */
export async function odloZpravu(supabase, payload, chyba, logger) {
  try {
    const { data: stary } = await supabase
      .from('whatsapp_neodeslane')
      .select('pokusu')
      .eq('webhook_id', payload.webhookId)
      .maybeSingle();
    const { error } = await supabase.from('whatsapp_neodeslane').upsert(
      {
        webhook_id: payload.webhookId,
        payload,
        sender_name: payload.sender ?? null,
        message_preview: (payload.message || '').slice(0, 200),
        chyba: (chyba || '').slice(0, 500),
        pokusu: (stary?.pokusu ?? 0) + 1,
        posledni_pokus: new Date().toISOString(),
      },
      { onConflict: 'webhook_id' },
    );
    if (error) throw error;
    logger?.warn?.(`[fronta] zpráva ${payload.webhookId} odložena do whatsapp_neodeslane — pošle se znovu`);
  } catch (e) {
    // Odkladiště je záchranná síť; když selže i ono, nesmí to shodit most.
    logger?.error?.({ err: e }, '[fronta] zprávu se nepodařilo odložit — TEĎ je opravdu ztracená');
  }
}

/**
 * Zkusí znovu odeslat, co ve frontě čeká. Volá se po připojení a pak
 * pravidelně — výpadek webhooku (nasazení edge funkce, výpadek Supabase)
 * trvá typicky minuty, takže se zprávy doženou samy, bez zásahu člověka.
 *
 * Vrací počet úspěšně doposlaných.
 */
export async function posliOdlozene(supabase, logger) {
  let hotovo = 0;
  try {
    const { data, error } = await supabase
      .from('whatsapp_neodeslane')
      .select('id, payload')
      .is('odeslano_at', null)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    if (!data?.length) return 0;

    logger?.info?.(`[fronta] ve frontě čeká ${data.length} zpráv — zkouším doposlat`);
    for (const radek of data) {
      const res = await forwardToWebhook(radek.payload, logger);
      if (!res.ok) break; // webhook pořád nefunguje, zbytek nemá cenu zkoušet
      await supabase
        .from('whatsapp_neodeslane')
        .update({ odeslano_at: new Date().toISOString() })
        .eq('id', radek.id);
      hotovo += 1;
    }
    if (hotovo) logger?.info?.(`[fronta] doposláno ${hotovo} zpráv`);
  } catch (e) {
    logger?.warn?.({ err: e }, '[fronta] doposlání selhalo');
  }
  return hotovo;
}
