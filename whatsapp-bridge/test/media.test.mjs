// Unit testy media helperů (lib/media.js) — bez sítě a bez databáze.
// Spuštění: npm test   (v whatsapp-bridge/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extensionFromMime,
  buildStoragePath,
  buildPublicUrl,
  getMediaBucket,
  getImageMessage,
  getImageMime,
  getImageDirectUrl,
} from '../lib/media.js';

test('extensionFromMime: známé i neznámé image MIME typy', () => {
  assert.equal(extensionFromMime('image/jpeg'), 'jpg');
  assert.equal(extensionFromMime('image/jpg'), 'jpg');
  assert.equal(extensionFromMime('image/png'), 'png');
  assert.equal(extensionFromMime('image/webp'), 'webp');
  assert.equal(extensionFromMime('image/heic'), 'heic');
  assert.equal(extensionFromMime('image/gif'), 'gif');
  // neznámé image/* → přípona podle subtypu
  assert.equal(extensionFromMime('image/avif'), 'avif');
  // chybějící / ne-typické MIME → fallback jpg
  assert.equal(extensionFromMime(''), 'jpg');
  assert.equal(extensionFromMime(null), 'jpg');
  assert.equal(extensionFromMime(undefined), 'jpg');
  assert.equal(extensionFromMime('application/octet-stream'), 'jpg');
  // velikost písmen se sjednotí
  assert.equal(extensionFromMime('IMAGE/JPEG'), 'jpg');
});

test('buildStoragePath: bezpečný webhookId → cesta v bucketu', () => {
  assert.equal(buildStoragePath('wa-ABC123', 'jpg'), 'incoming/wa-ABC123.jpg');
  // cizí znaky se nahradí (webhookId může obsahovat „:“, „/“ apod.)
  assert.equal(buildStoragePath('wa:AB/CD', 'png'), 'incoming/wa_AB_CD.png');
  // prázdný webhookId → fallback „msg“
  assert.equal(buildStoragePath('', 'jpg'), 'incoming/msg.jpg');
  assert.equal(buildStoragePath(null, 'jpg'), 'incoming/msg.jpg');
});

test('buildPublicUrl: sestavení veřejné URL', () => {
  assert.equal(
    buildPublicUrl('https://abc.supabase.co', 'whatsapp-media', 'incoming/wa-1.jpg'),
    'https://abc.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg'
  );
  // koncové lomítko v base URL se uřízne
  assert.equal(
    buildPublicUrl('https://abc.supabase.co/', 'whatsapp-media', 'incoming/wa-1.jpg'),
    'https://abc.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg'
  );
});

test('getMediaBucket: defaultní bucket + env proměnná', () => {
  assert.equal(getMediaBucket(), 'whatsapp-media');
  const prev = process.env.WHATSAPP_MEDIA_BUCKET;
  process.env.WHATSAPP_MEDIA_BUCKET = '  media-test/ ';
  assert.equal(getMediaBucket(), 'media-test');
  if (prev === undefined) delete process.env.WHATSAPP_MEDIA_BUCKET;
  else process.env.WHATSAPP_MEDIA_BUCKET = prev;
  assert.equal(getMediaBucket(), 'whatsapp-media');
});

test('getImageMessage: rozbalí imageMessage i z ephemeral / view-once obalu', () => {
  const plain = { message: { imageMessage: { mimetype: 'image/jpeg' } } };
  assert.equal(getImageMessage(plain)?.mimetype, 'image/jpeg');

  const ephemeral = { message: { ephemeralMessage: { message: { imageMessage: { mimetype: 'image/png' } } } } };
  assert.equal(getImageMessage(ephemeral)?.mimetype, 'image/png');

  const viewOnce = { message: { viewOnceMessage: { message: { imageMessage: { mimetype: 'image/webp' } } } } };
  assert.equal(getImageMessage(viewOnce)?.mimetype, 'image/webp');

  // textová zpráva / prázdné objekty → žádná fotka
  assert.equal(getImageMessage({ message: { conversation: 'ahoj' } }), null);
  assert.equal(getImageMessage(null), null);
  assert.equal(getImageMessage({}), null);
});

test('getImageMime / getImageDirectUrl: MIME typ a (vyprchávající) přímá URL', () => {
  const msg = { message: { imageMessage: { mimetype: 'image/jpeg', url: 'https://mmg.whatsapp.net/x.jpg' } } };
  assert.equal(getImageMime(msg), 'image/jpeg');
  assert.equal(getImageDirectUrl(msg), 'https://mmg.whatsapp.net/x.jpg');

  // bez mimetype → fallback image/jpeg
  assert.equal(getImageMime({ message: { imageMessage: {} } }), 'image/jpeg');

  // lokální (ne-http) URL / directPath se jako veřejná URL nevrátí
  assert.equal(getImageDirectUrl({ message: { imageMessage: { url: '/tmp/encrypted' } } }), null);
  assert.equal(getImageDirectUrl({ message: { imageMessage: { directPath: 'abcd' } } }), null);
});
