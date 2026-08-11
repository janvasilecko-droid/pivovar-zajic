/**
 * WhatsApp média → Supabase Storage
 * ---------------------------------
 * Textový model AI (DeepSeek) fotky NEČTE — objednávka poslaná jako fotka se
 * proto přeposílá do aplikace spolu s odkazem na médium, kde si ji člověk
 * může otevřít a stáhnout (případně objednávku zadat ručně).
 *
 * Fotka se stáhne ze serverů WhatsApp (Baileys `downloadMediaMessage`) a uloží
 * se do veřejného Supabase Storage bucketu `whatsapp-media`. Ukládáme ji tam
 * záměrně: přímá WhatsApp URL časem vyprší, objekt v Storage zůstává, takže
 * odkaz ke stažení funguje i při pozdější kontrole objednávky.
 *
 * URL se webhooku pošle jako `mediaUrl` → sloupec `whatsapp_incoming.media_url`
 * (migrace 20260810120000_add_whatsapp_readback_and_media.sql).
 */

import { downloadMediaMessage } from '@whiskeysockets/baileys';

export const DEFAULT_MEDIA_BUCKET = 'whatsapp-media';

/** Název bucketu (dá se přepsat env proměnnou WHATSAPP_MEDIA_BUCKET). */
export function getMediaBucket() {
  return (process.env.WHATSAPP_MEDIA_BUCKET || DEFAULT_MEDIA_BUCKET).trim().replace(/\/+$/, '');
}

// Přípona souboru podle MIME typu fotky (imageMessage.mimetype).
const MIME_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

/** MIME → přípona (fallback jpg pro neznámé / chybějící image MIME). */
export function extensionFromMime(mime) {
  const m = String(mime || '').toLowerCase().trim();
  if (MIME_EXTENSION[m]) return MIME_EXTENSION[m];
  if (m.startsWith('image/')) {
    const rest = m.split('/')[1];
    if (rest && /^[a-z0-9.+-]+$/.test(rest)) return rest;
  }
  return 'jpg';
}

/**
 * Cesta objektu v bucketu — unikátní podle webhookId zprávy (`wa-<key.id>`),
 * takže se dvě stejné zprávy nepřepíšou.
 */
export function buildStoragePath(webhookId, extension) {
  const id = String(webhookId || 'msg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = String(extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '');
  return `incoming/${id}.${ext}`;
}

/** Veřejná URL objektu v bucketu (použito i jako fallback bez supabase klienta). */
export function buildPublicUrl(supabaseUrl, bucket, path) {
  return `${String(supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${path}`;
}

/** Rozbalí imageMessage ze zprávy (i z ephemeral / view-once). */
export function getImageMessage(msg) {
  const m = msg?.message || {};
  const unwrapped = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;
  return unwrapped?.imageMessage || null;
}

/** MIME typ fotky (fallback image/jpeg). */
export function getImageMime(msg) {
  const img = getImageMessage(msg);
  return (img && img.mimetype) || 'image/jpeg';
}

/** Přímá WhatsApp URL fotky (vyprší — jen nouzový fallback). */
export function getImageDirectUrl(msg) {
  const img = getImageMessage(msg);
  const url = (img && (img.url || img.directPath)) || '';
  return typeof url === 'string' && url.startsWith('http') ? url : null;
}

/**
 * Stáhne fotku ze serverů WhatsApp. Vrací Buffer, nebo null, když se médium
 * stáhnout nedá (view-once bez povolení, odepřený přístup, timeout…).
 * Chyby JEN loguje a vrací null — zpráva se má přeposlat i bez fotky.
 */
export async function downloadImageBuffer(msg, { logger } = {}) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
    return buffer && buffer.length > 0 ? buffer : null;
  } catch (e) {
    logger?.warn(`[media] stažení fotky selhalo: ${e?.message || e}`);
    return null;
  }
}

/**
 * Zajistí, že bucket existuje (veřejný). Volá se při startu bridge a pak už se
 * jen pamatuje výsledek. Vytvoření bucketu se může provést i migrací
 * `20261010000000_add_whatsapp_media_bucket.sql` — tohle je samo-opravné.
 */
export async function ensureMediaBucket(supabase, { logger } = {}) {
  const bucket = getMediaBucket();
  try {
    const { data, error } = await supabase.storage.getBucket(bucket);
    if (!error && data) {
      logger?.debug(`[media] bucket „${bucket}“ existuje`);
      return true;
    }
    const { error: createErr } = await supabase.storage.createBucket(bucket, { public: true });
    if (createErr) {
      logger?.warn(`[media] bucket „${bucket}“ nelze vytvořit: ${createErr.message}`);
      return false;
    }
    logger?.info(`[media] bucket „${bucket}“ vytvořen (public)`);
    return true;
  } catch (e) {
    logger?.warn(`[media] kontrola bucketu „${bucket}“ selhala: ${e?.message || e}`);
    return false;
  }
}

/**
 * Nahraje Buffer do Supabase Storage. Vrací { path, publicUrl }, nebo null.
 * Pokud bucket ještě neexistuje, zkusí ho vytvořit a upload opakuje jednou.
 */
export async function uploadMediaToSupabase(supabase, { buffer, contentType, webhookId, bucket, logger } = {}) {
  const b = bucket || getMediaBucket();
  const ext = extensionFromMime(contentType);
  const path = buildStoragePath(webhookId, ext);
  const mime = contentType || 'image/jpeg';

  const tryUpload = async () => {
    const { error } = await supabase.storage
      .from(b)
      .upload(path, buffer, { contentType: mime, upsert: true });
    return error;
  };

  try {
    let error = await tryUpload();
    if (error) {
      // Bucket chybí (migrace ještě neproběhla) → vytvoř a zkus znovu.
      if (/bucket|not found|does not exist/i.test(error.message || '')) {
        const ok = await ensureMediaBucket(supabase, { logger });
        if (ok) error = await tryUpload();
      }
    }
    if (error) {
      logger?.warn(`[media] upload do bucketu „${b}“ selhal: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from(b).getPublicUrl(path);
    const publicUrl = (data && data.publicUrl) || buildPublicUrl(process.env.SUPABASE_URL || '', b, path);
    if (!publicUrl || !publicUrl.startsWith('http')) {
      logger?.warn(`[media] nepodařilo se sestavit veřejnou URL (path=${path})`);
      return null;
    }
    return { path, publicUrl };
  } catch (e) {
    logger?.warn(`[media] upload do bucketu „${b}“ selhal: ${e?.message || e}`);
    return null;
  }
}

/**
 * Celý řetězec pro jednu fotku: stáhni → nahraj do Storage → vrať veřejnou URL.
 * Vrací:
 *   - veřejnou Storage URL (běžný případ — trvalý odkaz ke stažení),
 *   - přímou WhatsApp URL (nouzový fallback, pokud se upload nepovedl),
 *   - null, když se fotku nepovedlo ani stáhnout (zpráva se pošle bez mediaUrl).
 */
export async function prepareImageForForwarding({ msg, supabase, webhookId, logger } = {}) {
  const buffer = await downloadImageBuffer(msg, { logger });
  if (!buffer) {
    logger?.warn('[media] fotka se nepodařila stáhnout — posílám zprávu bez mediaUrl');
    return null;
  }

  const uploaded = await uploadMediaToSupabase(supabase, {
    buffer,
    contentType: getImageMime(msg),
    webhookId,
    logger,
  });
  if (uploaded) {
    logger?.info(`[media] fotka uložena do Storage: ${uploaded.publicUrl}`);
    return uploaded.publicUrl;
  }

  // Upload selhal → aspoň dočasná přímá WA URL (vyprší, ale ihned funguje).
  const direct = getImageDirectUrl(msg);
  if (direct) {
    logger?.warn('[media] používám přímou WhatsApp URL (vyprší) — zkontroluj nastavení bucketu');
    return direct;
  }
  return null;
}

