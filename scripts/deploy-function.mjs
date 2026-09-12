#!/usr/bin/env node
/**
 * Deployuje edge funkci na produkční Supabase projekt přes Management API.
 * Použití: node scripts/deploy-function.mjs [slug]
 * Token: SUPABASE_ACCESS_TOKEN / SB_TOKEN v prostředí (GitHub Actions
 * secret), jinak .env (ruční spuštění z počítače).
 * Zachová aktuální verify_jwt funkce (jinak true).
 *
 * Samotné nasazení dělá scripts/lib/edgeFunctionDeploy.mjs — tenhle soubor
 * je jen příkazová řádka nad ním. Automatické nasazení po každém pushi (podle
 * toho, které funkce se doopravdy změnily) dělá deploy-changed-functions.mjs.
 */
import { jePlatnySlug, nactiToken, deployEdgeFunction } from './lib/edgeFunctionDeploy.mjs';

const slug = process.argv[2] || 'whatsapp-auto-parse';
if (!jePlatnySlug(slug)) {
  console.error(`Neplatný název funkce: "${slug}" (jen malá písmena, čísla, - a _).`);
  process.exit(1);
}

const token = nactiToken();
if (!token) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN — ani v prostředí, ani v .env.');
  process.exit(1);
}

const { ok, status, body } = await deployEdgeFunction(slug, token);
console.log(`HTTP ${status}`);
console.log(body);
process.exit(ok ? 0 : 1);
