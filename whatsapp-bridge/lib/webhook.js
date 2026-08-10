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
