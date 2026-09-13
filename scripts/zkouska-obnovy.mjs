// 🧪 Zkouška obnovy zálohy — běží jednou měsíčně (.github/workflows/zkouska-obnovy.yml).
// ---------------------------------------------------------------------------
// Záloha, kterou nikdo nezkusil obnovit, je jen naděje. Tohle ji obnoví
// NANEČISTO — do prázdné dočasné databáze v GitHub Actions, nikdy ne na
// produkci — a ověří:
//   1. každý soubor jde rozšifrovat heslem ZALOHA_HESLO,
//   2. obsah sedí s manifestem (počet řádků a otisk SHA-256),
//   3. návaznosti (položky → objednávky apod.) — jen upozornění: tabulky se
//      zálohují postupně, takže řádek vzniklý mezi čtením dvou tabulek může
//      chybět, a to není chyba zálohy,
//   4. data se dají nahrát do PostgreSQL a počty po nahrání sedí
//      (jen když je nastavené DATABASE_URL — v CI služba postgres).
//
// Lokálně: ZALOHA_HESLO=… node scripts/zkouska-obnovy.mjs  (bez databáze jen body 1–3)
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { desifruj, otisk } from './lib/sifraZalohy.mjs';
import { VAZBY } from './lib/zalohaTabulky.mjs';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOZKA = resolve(KOREN, 'zalohy');
const HESLO = process.env.ZALOHA_HESLO;
const DATABASE_URL = process.env.DATABASE_URL;

const vypis = [];
const chyby = [];
const pozor = [];
const radek = (t) => { vypis.push(t); console.log(t); };

function konec() {
  const souhrn = [
    '### Zkouška obnovy zálohy',
    ...vypis,
    '',
    ...(pozor.length ? ['**Upozornění:**', ...pozor.map((p) => `- ${p}`), ''] : []),
    chyby.length ? `❌ **Selhalo (${chyby.length}):**` : '✅ **Záloha jde obnovit.**',
    ...chyby.map((c) => `- ${c}`),
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, souhrn + '\n');
  if (chyby.length) { console.error(chyby.join('\n')); process.exitCode = 1; }
}

try {
  if (!HESLO) throw new Error('Chybí ZALOHA_HESLO.');
  const cestaManifestu = resolve(SLOZKA, 'manifest.json');
  if (!existsSync(cestaManifestu)) throw new Error('Chybí zalohy/manifest.json — šifrovaná záloha ještě neproběhla.');
  const manifest = JSON.parse(readFileSync(cestaManifestu, 'utf8'));
  const stariDnu = (Date.now() - Date.parse(manifest.datum)) / 86_400_000;
  radek(`Záloha z ${manifest.datum} (${stariDnu.toFixed(1)} dne stará), tabulek ${Object.keys(manifest.tabulky).length}.`);
  if (stariDnu > 2) chyby.push(`Poslední záloha je ${Math.floor(stariDnu)} dní stará — denní záloha neběží.`);

  const data = {};
  for (const [tabulka, ocekavano] of Object.entries(manifest.tabulky)) {
    const f = resolve(SLOZKA, `${tabulka}.json.enc`);
    if (!existsSync(f)) { chyby.push(`${tabulka}: soubor chybí`); continue; }
    try {
      const text = desifruj(readFileSync(f, 'utf8'), HESLO);
      if (otisk(text) !== ocekavano.sha256) { chyby.push(`${tabulka}: otisk nesedí s manifestem`); continue; }
      const radky = JSON.parse(text);
      if (!Array.isArray(radky) || radky.length !== ocekavano.radku) {
        chyby.push(`${tabulka}: ${Array.isArray(radky) ? radky.length : '?'} řádků, manifest říká ${ocekavano.radku}`);
        continue;
      }
      data[tabulka] = radky;
    } catch (e) {
      chyby.push(`${tabulka}: ${e instanceof Error ? e.message : e}`);
    }
  }
  radek(`Rozšifrováno a ověřeno: ${Object.keys(data).length} z ${Object.keys(manifest.tabulky).length} tabulek, ` +
    `${Object.values(data).reduce((s, r) => s + r.length, 0)} řádků.`);

  for (const [tabulka, sloupec, cil] of VAZBY) {
    if (!data[tabulka] || !data[cil]) continue;
    const ids = new Set(data[cil].map((r) => r.id));
    const sirotci = data[tabulka].filter((r) => r[sloupec] != null && !ids.has(r[sloupec])).length;
    if (sirotci) pozor.push(`${tabulka}.${sloupec}: ${sirotci} řádků odkazuje na chybějící ${cil}`);
  }

  if (DATABASE_URL && Object.keys(data).length) {
    // Každá tabulka jako jeden sloupec jsonb: ověřuje se, že data jdou do
    // PostgreSQL nahrát a nic se cestou neztratí — ne schéma (to drží migrace).
    const tag = `$z${randomBytes(6).toString('hex')}$`;
    const sql = ['DROP SCHEMA IF EXISTS obnova CASCADE;', 'CREATE SCHEMA obnova;'];
    for (const [tabulka, radky] of Object.entries(data)) {
      sql.push(`CREATE TABLE obnova."${tabulka}" (radek jsonb NOT NULL);`);
      for (let i = 0; i < radky.length; i += 200) {
        const hodnoty = radky.slice(i, i + 200).map((r) => {
          const json = JSON.stringify(r);
          if (json.includes(tag)) throw new Error('Kolize značky v datech — spusť znovu.');
          return `(${tag}${json}${tag}::jsonb)`;
        });
        sql.push(`INSERT INTO obnova."${tabulka}" (radek) VALUES ${hodnoty.join(',')};`);
      }
    }
    const dir = mkdtempSync(join(tmpdir(), 'obnova-'));
    const soubor = join(dir, 'obnova.sql');
    writeFileSync(soubor, sql.join('\n'), 'utf8');
    execFileSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', soubor], { stdio: 'inherit' });

    const dotaz = Object.keys(data).map((t) => `SELECT '${t}', count(*) FROM obnova."${t}"`).join(' UNION ALL ');
    const vysledek = execFileSync('psql', [DATABASE_URL, '-At', '-F', '\t', '-c', dotaz], { encoding: 'utf8' });
    let sedi = 0;
    for (const r of vysledek.trim().split('\n')) {
      const [t, n] = r.split('\t');
      if (Number(n) === data[t].length) sedi++;
      else chyby.push(`${t}: po nahrání ${n} řádků, v záloze ${data[t].length}`);
    }
    radek(`Nahráno do PostgreSQL: počty sedí u ${sedi} z ${Object.keys(data).length} tabulek.`);
  } else if (!DATABASE_URL) {
    radek('DATABASE_URL není nastavené — nahrání do databáze přeskočeno.');
  }
} catch (e) {
  chyby.push(e instanceof Error ? e.message : String(e));
}

konec();
