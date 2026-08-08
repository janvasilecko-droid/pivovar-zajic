#!/usr/bin/env node
/**
 * Deployuje edge funkci na produkční Supabase projekt přes Management API.
 * Použití: node scripts/deploy-function.mjs [slug]
 * Token se vezme z .env (SUPABASE_ACCESS_TOKEN / SB_TOKEN).
 * Zachová aktuální verify_jwt funkce (jinak true).
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const projectRef = 'sasqexjadvlqyticxwja';
const slug = process.argv[2] || 'whatsapp-auto-parse';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN v .env');
  process.exit(1);
}
const token = m[1].trim();

const file = new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url);
const code = await readFile(file, 'utf8');
console.log(`Deploying ${slug}/index.ts (${code.length} chars) ...`);

// Zachovat aktuální verify_jwt a název funkce
let verifyJwt = true;
let fnName = slug;
try {
  const list = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const fns = await list.json();
  const existing = Array.isArray(fns) ? fns.find((f) => f?.slug === slug) : undefined;
  if (existing) {
    verifyJwt = existing.verify_jwt;
    fnName = existing.name || slug;
  }
} catch (e) {
  console.warn('Nepodařilo se načíst aktuální nastavení, používám verify_jwt=true:', e.message);
}
console.log('verify_jwt =', verifyJwt);

// POST /v1/projects/{ref}/functions/deploy?slug=... (multipart: file + metadata)
const form = new FormData();
form.append('file', new Blob([code], { type: 'text/plain' }), 'index.ts');
form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', verify_jwt: verifyJwt, name: fnName }));

const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const text = await resp.text();
console.log(`HTTP ${resp.status}`);
console.log(text);
process.exit(resp.ok ? 0 : 1);
