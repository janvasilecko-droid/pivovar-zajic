// Generates PWA icons (192, 512, maskable 512) as simple monogram PNGs.
// Run once: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../public');

// Minimal 1x1 transparent PNG (placeholder). Real icons should be designed properly.
// We craft a simple solid-color PNG with a "P" feel using raw bytes is overkill here;
// instead we generate a proper PNG via a tiny encoder below.

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Store-only zlib (no compression) via zlib headers — simplest valid deflate stream.
function deflateStore(raw) {
  const chunks = [];
  const MAX = 65535;
  for (let i = 0; i < raw.length; i += MAX) {
    const slice = raw.subarray(i, i + MAX);
    const isLast = i + MAX >= raw.length ? 1 : 0;
    const block = Buffer.alloc(5 + slice.length);
    block[0] = isLast;
    block.writeUInt16BE(slice.length, 1);
    block.writeUInt16BE(slice.length ^ 0xffff, 3);
    slice.copy(block, 5);
    chunks.push(block);
  }
  const zlibHeader = Buffer.from([0x78, 0x01]);
  const adler = Buffer.alloc(4); adler.writeUInt32BE(adler32(raw), 0);
  return Buffer.concat([zlibHeader, ...chunks, adler]);
}

function makePng(size, { bg, fg, maskable = false } = {}) {
  const W = size, H = size;
  const bgRgb = bg ?? [26, 36, 24];     // primary-950
  const fgRgb = fg ?? [163, 138, 74];  // accent-500 (gold)
  const pad = maskable ? Math.round(size * 0.1) : 0;

  const raw = Buffer.alloc(W * H * 4 + H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < W; x++) {
      // Draw a filled circle (beer glass body) + monogram "P"
      const cx = W / 2, cy = H / 2;
      const r = W / 2 - pad;
      const dx = x - cx, dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r * r;

      // Monogram "P" stroke: vertical bar + top bowl
      const bw = W * 0.14;
      const bx0 = cx - W * 0.18, bx1 = bx0 + bw;
      const byTop = cy - H * 0.28, byBowl = cy - H * 0.02;
      const bowlR = W * 0.16;
      const inStem = x >= bx0 && x <= bx1 && y >= byTop && y <= cy + H * 0.28;
      const inBowl = (x - (bx1)) ** 2 + (y - (byTop + bowlR)) ** 2 <= bowlR ** 2
        && x <= bx1 + bowlR && y <= byBowl && x >= bx0 - bw * 0.2;

      const isFg = inCircle && (inStem || inBowl);
      const [r1, g1, b1] = isFg ? fgRgb : (inCircle ? bgRgb : (maskable ? bgRgb : [245, 243, 238]));
      raw[p++] = r1; raw[p++] = g1; raw[p++] = b1; raw[p++] = 255;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateStore(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon-192.png'), makePng(192));
writeFileSync(resolve(outDir, 'icon-512.png'), makePng(512));
writeFileSync(resolve(outDir, 'icon-maskable-512.png'), makePng(512, { maskable: true }));
console.log('Icons generated in', outDir);
