#!/usr/bin/env node
/**
 * Nasadí whatsapp-bridge na Render.
 *
 * Most běží jako samostatná služba na Renderu (viz whatsapp-bridge/render.yaml),
 * takže push do gitu sám o sobě nestačí — pokud služba nemá zapnuté automatické
 * nasazení, změny ve whatsapp-bridge/ se do běžícího mostu nedostanou.
 *
 * Použití:
 *   node scripts/deploy-bridge.mjs           # spustí nasazení a počká na výsledek
 *   node scripts/deploy-bridge.mjs --stav    # jen vypíše stav služby a poslední nasazení
 *
 * Klíč se bere z .env (RENDER_API_KEY) — stejný vzorec jako u ostatních
 * deploy skriptů v tomhle adresáři.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const klic = env.match(/^\s*RENDER_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();
if (!klic) {
  console.error('Chybí RENDER_API_KEY v .env');
  process.exit(1);
}

const JEN_STAV = process.argv.includes('--stav');
const API = 'https://api.render.com/v1';
const hlavicky = { Authorization: `Bearer ${klic}`, Accept: 'application/json' };

async function api(cesta, init = {}) {
  const r = await fetch(`${API}${cesta}`, { ...init, headers: { ...hlavicky, ...(init.headers || {}) } });
  const text = await r.text();
  let telo;
  try { telo = JSON.parse(text); } catch { telo = text; }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${cesta}: ${text.slice(0, 300)}`);
  return telo;
}

const sluzby = await api('/services?limit=50');
// Render vrací pole obálek { service: {...} } i holá pole podle verze API.
const seznam = sluzby.map((s) => s.service ?? s);
const most = seznam.find((s) => (s.name || '').includes('whatsapp-bridge'));
if (!most) {
  console.error('Služba "whatsapp-bridge" na účtu není. Dostupné:', seznam.map((s) => s.name).join(', ') || '(žádné)');
  process.exit(1);
}

console.log(`Služba: ${most.name} (${most.id})`);
console.log(`Adresa: ${most.serviceDetails?.url || '(neuvedena)'}`);
console.log(`Automatické nasazení: ${most.autoDeploy}`);

const posledni = await api(`/services/${most.id}/deploys?limit=1`);
const p = (posledni[0]?.deploy) ?? posledni[0];
if (p) console.log(`Poslední nasazení: ${p.status} (${p.finishedAt || p.createdAt})`);

if (JEN_STAV) process.exit(0);

console.log('\nSpouštím nasazení…');
const nove = await api(`/services/${most.id}/deploys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  // clearCache: most si drží jen node_modules, čistit není proč.
  body: JSON.stringify({ clearCache: 'do_not_clear' }),
});
const deployId = nove.id || nove.deploy?.id;
console.log(`Nasazení ${deployId} zahájeno.`);

// Čekání na výsledek — Render staví docker image, takže to trvá minuty.
const KONECNE = new Set(['live', 'build_failed', 'update_failed', 'canceled', 'deactivated']);
const start = Date.now();
let stav = '';
while (Date.now() - start < 12 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 15000));
  const d = await api(`/services/${most.id}/deploys/${deployId}`);
  const akt = (d.deploy ?? d).status;
  if (akt !== stav) {
    stav = akt;
    console.log(`  ${new Date().toLocaleTimeString('cs-CZ')} — ${stav}`);
  }
  if (KONECNE.has(stav)) break;
}

if (stav === 'live') {
  console.log('\nHotovo — most běží v nové verzi.');
  process.exitCode = 0;
} else {
  console.log(`\nNasazení skončilo ve stavu "${stav}". Log najdeš v Renderu na kartě služby.`);
  process.exitCode = 1;
}
