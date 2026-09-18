#!/usr/bin/env node
/**
 * ⏰ Připomínka: edge funkce se změnila, ale nikdo ji nenasadil na Supabase.
 * ---------------------------------------------------------------------------
 * Proč tohle vzniklo (18. 9. 2026): oprava `whatsapp-auto-parse` — odpověď
 * bez odběratele si má vzít odběratele z citované zprávy — ležela v mainu
 * od 17. 9. a v provozu pořád běžela stará verze. Nikdo to nepoznal:
 * aplikace se nasazuje sama (Cloudflare bere main z GitHubu), edge funkce
 * NE. Majitel to popsal jako „říkal jsi, že to umí, a furt nic".
 *
 * Nasazení edge funkce potřebuje klíč `SUPABASE_ACCESS_TOKEN`, který je jen
 * v `.env` na jednom počítači (v GitHubu jako secret nastavený není — běh
 * nasazení pak vypíše „edge funkce se nasazují ručně"). Proto tahle
 * připomínka mlčí všude, kde se stejně nedá nic dělat, a ozve se jen tam,
 * kde `.env` je.
 *
 * Jak pozná nenasazenou funkci: u každé složky v supabase/functions se vezme
 * commit, který se jí naposledy dotkl, a porovná se s tím, co je zapsané
 * v supabase/nasazeno.json. Ten soubor píše scripts/deploy-function.mjs po
 * povedeném nasazení, takže se to udržuje samo.
 *
 * Nikdy nekončí chybou — je to připomínka, ne hlídač. Rozbít kvůli ní build
 * by znamenalo, že ji někdo vypne.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { KOREN, nactiZaznam, rozhodujiciCommit } from './nasazeni-zaznam.mjs';

const FUNKCE_DIR = join(KOREN, 'supabase', 'functions');

export function nenasazeneFunkce() {
  if (!existsSync(FUNKCE_DIR)) return [];
  const zaznam = nactiZaznam();
  const out = [];
  for (const jmeno of readdirSync(FUNKCE_DIR)) {
    const cesta = join(FUNKCE_DIR, jmeno);
    if (jmeno.startsWith('_') || !statSync(cesta).isDirectory()) continue;
    const commit = rozhodujiciCommit(jmeno);
    if (!commit) continue;
    if (zaznam[jmeno] !== commit) out.push({ jmeno, commit, nasazeno: zaznam[jmeno] ?? null });
  }
  return out;
}

// Spuštění z příkazové řádky (ne při importu v testu).
if (process.argv[1] && process.argv[1].endsWith('zkontroluj-nasazeni.mjs')) {
  const cekaji = nenasazeneFunkce();
  if (cekaji.length === 0) {
    console.log('Edge funkce: všechno nasazené.');
    process.exit(0);
  }

  const muzuTady = existsSync(join(KOREN, '.env'));
  console.log('');
  console.log('\u23f0 TYHLE EDGE FUNKCE NEB\u011a\u017d\u00cd V POSLEDN\u00cd VERZI:');
  console.log('');
  for (const f of cekaji) {
    console.log(`   \u2022 ${f.jmeno}${f.nasazeno ? '' : '   (nasazen\u00e1 verze nen\u00ed zaznamenan\u00e1)'}`);
  }
  console.log('');
  console.log('   Normální cestou to jde samo: pushni do mainu a nasazení');
  console.log('   změněné funkce nahraje (od 18. 9. 2026, kdy je v repozitáři');
  console.log('   klíč SUPABASE_ACCESS_TOKEN). Tahle hláška znamená, že se to');
  console.log('   z nějakého důvodu nestalo — mrkni na poslední běh:');
  console.log('     https://github.com/janvasilecko-droid/pivovar-zajic/actions');
  if (muzuTady) {
    console.log('');
    console.log('   Ručně to jde i odsud (.env s klíčem tu je):');
    for (const f of cekaji) console.log(`     node scripts/deploy-function.mjs ${f.jmeno}`);
  }
  console.log('');
  // Schválně 0: připomínka nesmí rozbít build ani kontroly.
  process.exit(0);
}
