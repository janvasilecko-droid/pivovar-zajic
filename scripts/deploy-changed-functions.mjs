#!/usr/bin/env node
/**
 * Nasadí VŠECHNY edge funkce, které mezi dvěma commity ovlivnil pushnutý
 * kód — buď se změnil jejich vlastní index.ts, nebo sdílený modul
 * (../_shared/x.ts), který importují.
 *
 * PROČ TENHLE SKRIPT VZNIKL: edge funkce se na rozdíl od webu a APK
 * nenasazovaly přes CI vůbec — jediná cesta byla `node
 * scripts/deploy-function.mjs <slug>` ručně z počítače s tokenem v .env.
 * Oprava, která žila jen v `src/`, se nasadila sama; oprava v edge funkci
 * (např. čtení objednávek z WhatsAppu) čekala, dokud si někdo nesedl
 * k počítači. Z provozu 9. 9. 2026: „proč to nejde nasadit odsud" u opravy
 * whatsapp-auto-parse.
 *
 * Použití:
 *   node scripts/deploy-changed-functions.mjs <před-sha> <po-sha>
 *   node scripts/deploy-changed-functions.mjs --all
 *
 * Rozdíl commitů se počítá přes `git diff --name-only`. Když se spočítat
 * nedá (nová větev, force push — GitHub u téhle situace posílá `before`
 * jako samé nuly), nasadí se radši VŠECHNY funkce, než aby se něco tiše
 * přeskočilo — to je jediné bezpečné chování, když si skript nemůže být
 * jistý, co se změnilo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nactiToken, deployEdgeFunction } from './lib/edgeFunctionDeploy.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNKCE_DIR = join(KOREN, 'supabase/functions');

/** Všechny slugy edge funkcí v repozitáři (adresáře s index.ts, mimo _shared). */
export function vsechnySlugy() {
  return readdirSync(FUNKCE_DIR)
    .filter((jmeno) => jmeno !== '_shared' && !jmeno.startsWith('.'))
    .filter((jmeno) => {
      const cesta = join(FUNKCE_DIR, jmeno);
      return statSync(cesta).isDirectory() && existsSync(join(cesta, 'index.ts'));
    })
    .sort();
}

/** Jména sdílených modulů, které funkce importuje (`../_shared/x.ts` → `x.ts`). */
export function sdileneZavislosti(slug) {
  const kod = readFileSync(join(FUNKCE_DIR, slug, 'index.ts'), 'utf8');
  return [...kod.matchAll(/from\s+["']\.\.\/_shared\/([\w.-]+)["']/g)].map((m) => m[1]);
}

/**
 * Seznam souborů změněných mezi dvěma commity, nebo `null`, když se to
 * spočítat nedá (viz komentář nahoře — pak volající nasadí radši vše).
 */
export function zmeneneSoubory(pred, po) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', pred, po], {
      cwd: KOREN,
      encoding: 'utf8',
    });
    return out.split('\n').map((r) => r.trim()).filter(Boolean);
  } catch (e) {
    console.warn(`Nepodařilo se spočítat git diff (${pred}..${po}), nasazují se VŠECHNY funkce: ${e.message}`);
    return null;
  }
}

export function kNasazeniPodleZmen(zmeny) {
  const slugy = vsechnySlugy();
  if (zmeny === null) return slugy;
  return slugy.filter((slug) => {
    if (zmeny.includes(`supabase/functions/${slug}/index.ts`)) return true;
    return sdileneZavislosti(slug).some((dep) => zmeny.includes(`supabase/functions/_shared/${dep}`));
  });
}

async function main() {
  const [, , prvniArg, druhyArg] = process.argv;

  let kNasazeni;
  if (prvniArg === '--all') {
    kNasazeni = vsechnySlugy();
  } else {
    if (!prvniArg || !druhyArg) {
      console.error('Použití: node scripts/deploy-changed-functions.mjs <před-sha> <po-sha>');
      console.error('     nebo: node scripts/deploy-changed-functions.mjs --all');
      process.exit(1);
    }
    kNasazeni = kNasazeniPodleZmen(zmeneneSoubory(prvniArg, druhyArg));
  }

  if (kNasazeni.length === 0) {
    console.log('Žádná edge funkce se tímto pushem nezměnila, nic k nasazení.');
    return;
  }

  const token = nactiToken();
  if (!token) {
    console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN — ani v prostředí, ani v .env.');
    process.exit(1);
  }

  console.log('K nasazení:', kNasazeni.join(', '));

  let selhalo = false;
  for (const slug of kNasazeni) {
    console.log(`\n=== ${slug} ===`);
    try {
      const { ok, status, body } = await deployEdgeFunction(slug, token);
      console.log(`HTTP ${status}`);
      console.log(body);
      if (!ok) selhalo = true;
    } catch (e) {
      console.error(`Nasazení ${slug} spadlo: ${e.message}`);
      selhalo = true;
    }
  }
  if (selhalo) process.exit(1);
}

// Spustit jen při přímém volání ("node scripts/deploy-changed-functions.mjs"),
// ne při importu z testu — jinak by import sám o sobě spouštěl síťová volání
// a `process.exit`.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
