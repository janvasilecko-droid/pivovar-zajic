// ♻️ Obnova databáze ze (šifrované) zálohy.
// ---------------------------------------------------------------------------
// Protějšek k zaloha-objednavek.mjs. Záloha, kterou neumíte obnovit, není záloha.
//
// Ve výchozím stavu se NIC nezapisuje: skript jen spočítá, co by se změnilo,
// a vypíše to. Zapisuje se teprve s přepínačem --opravdu.
//
// Použití:
//   node scripts/obnov-ze-zalohy.mjs                    … náhled z aktuálních souborů
//   node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20 … náhled ze zálohy k datu
//   node scripts/obnov-ze-zalohy.mjs --tabulka orders   … jen jedna tabulka
//   node scripts/obnov-ze-zalohy.mjs --opravdu          … a teď to fakt zapiš
//   node scripts/obnov-ze-zalohy.mjs --smazat-navic --opravdu
//                                    … + smaže řádky, které v záloze nejsou
//
// Heslo: ZALOHA_HESLO v prostředí nebo v .env. Zálohy před 13. 9. 2026 jsou
// nešifrované (jen 4 tabulky) a čtou se bez hesla.
//
// Pořadí a kruhové odkazy (objednávky ↔ WhatsApp zprávy): scripts/lib/zalohaTabulky.mjs.
// Sloupce z ODLOZENE_SLOUPCE se napřed zapíšou prázdné a doplní se ve druhém
// kole, až jsou v databázi obě strany vazby.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desifruj } from './lib/sifraZalohy.mjs';
import { TABULKY, ODLOZENE_SLOUPCE, pk } from './lib/zalohaTabulky.mjs';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOZKA = resolve(KOREN, 'zalohy');
const NAZVY = TABULKY.map(([t]) => t);

const args = process.argv.slice(2);
const prepinac = (jmeno) => args.includes(`--${jmeno}`);
const hodnota = (jmeno) => {
  const i = args.indexOf(`--${jmeno}`);
  return i >= 0 ? args[i + 1] : null;
};

const opravdu = prepinac('opravdu');
const smazatNavic = prepinac('smazat-navic');
const datum = hodnota('datum');
const jenTabulka = hodnota('tabulka');

/** Lokálně se klíče berou z .env, na GitHubu ze secrets. */
function zEnvSouboru(jmeno) {
  const f = resolve(KOREN, '.env');
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(new RegExp(`^\\s*${jmeno}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'));
  return m ? m[1].trim() : null;
}

const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || zEnvSouboru('VITE_SUPABASE_URL');
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY || zEnvSouboru('VITE_SUPABASE_SERVICE_ROLE_KEY');
const HESLO = process.env.ZALOHA_HESLO || zEnvSouboru('ZALOHA_HESLO');

const hlavicky = { apikey: KLIC, Authorization: `Bearer ${KLIC}`, 'Content-Type': 'application/json' };

function git(argumenty) {
  return execFileSync('git', argumenty, { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Commit, ze kterého se obnovuje (poslední k --datum), nebo null = aktuální soubory. */
function commitKDatu() {
  if (!datum) return null;
  const commit = git(['log', '-1', '--format=%H', `--before=${datum} 23:59:59`, '--', 'zalohy/']).trim();
  if (!commit) {
    throw new Error(`K datu ${datum} není v historii žádná záloha.\nZálohy existují k těmto dnům:\n  ${dostupneDny().join('\n  ') || '(žádné)'}`);
  }
  return commit;
}

/** Obsah souboru z pracovní kopie nebo z commitu; null když neexistuje. */
function soubor(cesta, commit) {
  if (!commit) {
    const f = resolve(KOREN, cesta);
    return existsSync(f) ? readFileSync(f, 'utf8') : null;
  }
  try { return git(['show', `${commit}:${cesta}`]); } catch { return null; }
}

/** Řádky tabulky ze zálohy; null = tabulka v téhle záloze není. */
function nactiZalohu(tabulka, commit) {
  const sifrovana = soubor(`zalohy/${tabulka}.json.enc`, commit);
  if (sifrovana !== null) {
    if (!HESLO) throw new Error('Záloha je zašifrovaná — chybí ZALOHA_HESLO (v .env nebo v prostředí).');
    return JSON.parse(desifruj(sifrovana, HESLO));
  }
  const stara = soubor(`zalohy/${tabulka}.json`, commit);
  return stara === null ? null : JSON.parse(stara);
}

function dostupneDny() {
  try {
    return git(['log', '--format=%ad', '--date=short', '--', 'zalohy/manifest.json', 'zalohy/orders.json'])
      .trim().split('\n').filter(Boolean).filter((d, i, a) => a.indexOf(d) === i).slice(0, 14);
  } catch {
    return [];
  }
}

async function nactiZDb(tabulka) {
  const STRANKA = 1000;
  const out = [];
  for (let od = 0; ; od += STRANKA) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?select=*&order=${pk(tabulka)}`, {
      headers: { ...hlavicky, Range: `${od}-${od + STRANKA - 1}` },
    });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < STRANKA) break;
  }
  return out;
}

function stejne(a, b) {
  const klice = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of klice) {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  }
  return true;
}

async function posli(tabulka, telo) {
  for (let i = 0; i < telo.length; i += 500) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?on_conflict=${pk(tabulka)}`, {
      method: 'POST',
      headers: { ...hlavicky, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(telo.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

async function smaz(tabulka, klice) {
  const sloupec = pk(tabulka);
  for (let i = 0; i < klice.length; i += 100) {
    const seznam = klice.slice(i, i + 100).map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',');
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?${sloupec}=in.(${encodeURIComponent(seznam)})`, {
      method: 'DELETE',
      headers: { ...hlavicky, Prefer: 'return=minimal' },
    });
    if (!r.ok) throw new Error(`${tabulka} (mazání): HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

/** Řádek s vynulovanými sloupci, které se doplní až ve druhém kole. */
function bezOdlozenych(tabulka, radek) {
  const sloupce = ODLOZENE_SLOUPCE[tabulka];
  if (!sloupce) return radek;
  const kopie = { ...radek };
  for (const s of sloupce) if (s in kopie) kopie[s] = null;
  return kopie;
}

try {
  if (!URL_DB || !KLIC) throw new Error('Chybí přístup k databázi — v .env musí být VITE_SUPABASE_URL a VITE_SUPABASE_SERVICE_ROLE_KEY.');
  if (jenTabulka && !NAZVY.includes(jenTabulka)) throw new Error(`Neznámá tabulka „${jenTabulka}". Zálohují se: ${NAZVY.join(', ')}`);

  const commit = commitKDatu();
  const tabulky = jenTabulka ? [jenTabulka] : NAZVY;
  const plan = [];

  console.log(datum ? `Záloha ke dni ${datum}` : 'Záloha z aktuálních souborů v zalohy/');
  console.log('─'.repeat(72));

  for (const tabulka of tabulky) {
    const zalohaRadky = nactiZalohu(tabulka, commit);
    if (zalohaRadky === null) continue; // v téhle (starší) záloze tabulka není
    const klic = pk(tabulka);
    const dbRadky = await nactiZDb(tabulka);
    const dbPodle = new Map(dbRadky.map((r) => [r[klic], r]));
    const zalohaPodle = new Map(zalohaRadky.map((r) => [r[klic], r]));

    const chybi = zalohaRadky.filter((r) => !dbPodle.has(r[klic]));
    const zmenene = zalohaRadky.filter((r) => dbPodle.has(r[klic]) && !stejne(r, dbPodle.get(r[klic])));
    const navic = dbRadky.filter((r) => !zalohaPodle.has(r[klic]));
    plan.push({ tabulka, chybi, zmenene, navic });

    const popisNavic = navic.length === 0 ? ''
      : smazatNavic ? `, ${navic.length} smazat`
      : `, ${navic.length} navíc v databázi (zůstanou)`;
    console.log(`${tabulka.padEnd(32)} záloha ${String(zalohaRadky.length).padStart(5)} | databáze ${String(dbRadky.length).padStart(5)}` +
      ` → ${chybi.length} doplnit, ${zmenene.length} opravit${popisNavic}`);
  }

  const celkem = plan.reduce((s, p) => s + p.chybi.length + p.zmenene.length + (smazatNavic ? p.navic.length : 0), 0);
  console.log('─'.repeat(72));

  if (celkem === 0) {
    console.log('Databáze se zálohou souhlasí — není co obnovovat.');
  } else if (!opravdu) {
    console.log(`Celkem by se změnilo ${celkem} řádků. NIC SE NEZAPSALO. Spusť znovu s --opravdu.`);
  } else {
    // 1. kolo: v pořadí závislostí, kruhové sloupce prázdné.
    for (const { tabulka, chybi, zmenene } of plan) {
      const kZapisu = [...chybi, ...zmenene];
      if (!kZapisu.length) continue;
      await posli(tabulka, kZapisu.map((r) => bezOdlozenych(tabulka, r)));
      console.log(`${tabulka}: zapsáno ${kZapisu.length} řádků`);
    }
    // 2. kolo: doplnit kruhové odkazy, teď už existují obě strany.
    for (const { tabulka, chybi, zmenene } of plan) {
      const sloupce = ODLOZENE_SLOUPCE[tabulka];
      if (!sloupce) continue;
      const doplnit = [...chybi, ...zmenene].filter((r) => sloupce.some((s) => r[s] != null));
      if (!doplnit.length) continue;
      await posli(tabulka, doplnit);
      console.log(`${tabulka}: doplněno odkazů u ${doplnit.length} řádků`);
    }
    if (smazatNavic) {
      for (const { tabulka, navic } of [...plan].reverse()) {
        if (!navic.length) continue;
        await smaz(tabulka, navic.map((r) => r[pk(tabulka)]));
        console.log(`${tabulka}: smazáno ${navic.length} řádků`);
      }
    }
    console.log('Hotovo.');
  }
} catch (e) {
  console.error('\nObnova skončila chybou:\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
