// Nasazení jedné edge funkce na produkční Supabase přes Management API —
// vytažené ze scripts/deploy-function.mjs, aby to šlo volat i z jiného
// skriptu (scripts/deploy-changed-functions.mjs), ne jen z příkazové řádky.
//
// Token se dřív bral JEN z .env, což šlo spustit jen z počítače, kde ten
// soubor leží. `nactiToken()` proto zkouší nejdřív prostředí (GitHub Actions
// secret) a teprve pak `.env` — takže stejná funkce funguje z počítače
// i z CI, beze změny chování toho prvního.
import { readFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';

export const PROJECT_REF = 'sasqexjadvlqyticxwja';

/** Bezpečný název slugu edge funkce — jen to, co může být název složky. */
export function jePlatnySlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(slug);
}

/**
 * Token pro Supabase Management API.
 * 1) SUPABASE_ACCESS_TOKEN / SB_TOKEN v prostředí — GitHub Actions secret.
 * 2) .env vedle repozitáře — ruční spuštění z počítače (dosavadní chování).
 */
export function nactiToken() {
  const zProstredi = process.env.SUPABASE_ACCESS_TOKEN || process.env.SB_TOKEN;
  if (zProstredi && zProstredi.trim()) return zProstredi.trim();

  const cestaKEnv = new URL('../../.env', import.meta.url);
  if (!existsSync(cestaKEnv)) return null;
  const env = readFileSync(cestaKEnv, 'utf8');
  const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
  return m ? m[1].trim() : null;
}

/**
 * Sesbírá kód edge funkce + všechny sdílené moduly, které importuje
 * (`../_shared/x.ts`). Funguje jen pro 1 úroveň zanoření (`_shared/x.ts`
 * smí importovat další soubor ze STEJNÉ složky, `./y.ts` — server ho najde,
 * protože se nahraje na stejnou cestu), tomu odpovídá aktuální struktura
 * supabase/functions/_shared/.
 */
async function sestavBundle(slug) {
  const souborUrl = new URL(`../../supabase/functions/${slug}/index.ts`, import.meta.url);
  const code = await readFile(souborUrl, 'utf8');

  const sharedFiles = new Map(); // relativePath (v bundlu) -> obsah
  for (const m of code.matchAll(/from\s+["']\.\.\/_shared\/([\w.-]+)["']/g)) {
    const name = m[1];
    const sharedUrl = new URL(`../../supabase/functions/_shared/${name}`, import.meta.url);
    const sharedCode = await readFile(sharedUrl, 'utf8');
    sharedFiles.set(`_shared/${name}`, sharedCode);
  }
  return { code, sharedFiles };
}

/**
 * Nasadí jednu edge funkci. Zachová aktuální `verify_jwt` a název funkce
 * (jinak by se při každém nasazení tiše přepsaly na výchozí hodnoty).
 * Vrací { ok, status, body } — volající rozhodne, co s tím (log, exit kód).
 */
export async function deployEdgeFunction(slug, token) {
  const { code, sharedFiles } = await sestavBundle(slug);
  console.log(`Deploying ${slug}/index.ts (${code.length} chars) ...`);
  for (const [relPath, content] of sharedFiles) {
    console.log(`  + ${relPath} (${content.length} chars)`);
  }

  let verifyJwt = true;
  let fnName = slug;
  try {
    const list = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
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

  const form = new FormData();
  form.append('file', new Blob([code], { type: 'text/plain' }), 'index.ts');
  for (const [relPath, content] of sharedFiles) {
    // Import v index.ts je "../_shared/x.ts" (o úroveň nad zdrojovým
    // adresářem funkce) — filename v uploadu musí tu stejnou cestu doslova
    // replikovat, jinak bundler na serveru soubor nenajde.
    form.append('file', new Blob([content], { type: 'text/plain' }), `../${relPath}`);
  }
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', verify_jwt: verifyJwt, name: fnName }));

  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}
