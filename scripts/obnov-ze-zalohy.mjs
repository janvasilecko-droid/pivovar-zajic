// ♻️ Obnova objednávek a stáčení ze zálohy.
// ---------------------------------------------------------------------------
// Protějšek k zaloha-objednavek.mjs. Do teď se dalo jen zálohovat — soubory
// v zalohy/ ležely v gitu a vrátit je zpátky znamenalo ručně klikat v Supabase.
// Záloha, kterou neumíte obnovit, není záloha.
//
// Ve výchozím stavu se NIC nezapisuje: skript jen spočítá, co by se změnilo,
// a vypíše to. Zapisuje se teprve s přepínačem --opravdu. Je to nevratná
// operace na ostrých datech, takže se raději zeptá dvakrát než jednou.
//
// Použití:
//   node scripts/obnov-ze-zalohy.mjs                    … náhled z aktuálních souborů
//   node scripts/obnov-ze-zalohy.mjs --datum 2026-08-20 … náhled ze zálohy k datu
//   node scripts/obnov-ze-zalohy.mjs --tabulka orders   … jen jedna tabulka
//   node scripts/obnov-ze-zalohy.mjs --opravdu          … a teď to fakt zapiš
//   node scripts/obnov-ze-zalohy.mjs --smazat-navic --opravdu
//                                    … + smaže řádky, které v záloze nejsou
//
// Bez --smazat-navic se jen doplňuje a opravuje. To je skoro vždycky to, co
// chcete: omylem smazaná objednávka se vrátí a nic novějšího se nezahodí.
// S --smazat-navic se databáze srovná PŘESNĚ do stavu zálohy — všechno, co
// vzniklo po ní, zmizí.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOZKA = resolve(KOREN, 'zalohy');

// Pořadí je závazné: order_items ukazují na orders, takže objednávky musí být
// v databázi dřív než jejich položky. Při mazání se jde obráceně.
const TABULKY = ['orders', 'order_items', 'kegging', 'bottling'];

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

const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || zEnvSouboru('VITE_SUPABASE_URL');
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY || zEnvSouboru('VITE_SUPABASE_SERVICE_ROLE_KEY');

/** Lokálně se klíč bere z .env, na GitHubu ze secrets. */
function zEnvSouboru(jmeno) {
  const f = resolve(KOREN, '.env');
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(new RegExp(`^\\s*${jmeno}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'));
  return m ? m[1].trim() : null;
}

if (!URL_DB || !KLIC) {
  console.error(
    'Obnova se nespustila — chybí přístup k databázi.\n' +
    (URL_DB ? '' : '  • SUPABASE_URL / VITE_SUPABASE_URL není nastavené\n') +
    (KLIC ? '' : '  • SUPABASE_SERVICE_ROLE_KEY není nastavený\n') +
    '\nLokálně stačí mít v .env VITE_SUPABASE_URL a VITE_SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exitCode = 1;
}

const hlavicky = { apikey: KLIC, Authorization: `Bearer ${KLIC}`, 'Content-Type': 'application/json' };

/**
 * Načte zálohu buď z aktuálních souborů, nebo z gitu ke dni --datum.
 * Bere se poslední commit, který ten den (nebo dřív) sáhl na zalohy/ —
 * záloha se dělá jednou denně, ale kdyby ten den workflow neproběhl,
 * je lepší vrátit o den starší stav než spadnout.
 */
function nactiZalohu(tabulka) {
  const cesta = `zalohy/${tabulka}.json`;
  if (!datum) {
    const f = resolve(SLOZKA, `${tabulka}.json`);
    if (!existsSync(f)) throw new Error(`Chybí soubor ${cesta}`);
    return JSON.parse(readFileSync(f, 'utf8'));
  }
  const commit = execFileSync('git', ['log', '-1', '--format=%H', `--before=${datum} 23:59:59`, '--', cesta], {
    cwd: KOREN, encoding: 'utf8',
  }).trim();
  if (!commit) {
    const dny = dostupneDny();
    throw new Error(
      `K datu ${datum} není v historii žádná záloha ${cesta}.\n` +
      `Zálohy existují k těmto dnům:\n  ${dny.join('\n  ') || '(žádné)'}`,
    );
  }
  const obsah = execFileSync('git', ['show', `${commit}:${cesta}`], { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(obsah);
}

/** Dny, ke kterým je v historii gitu záloha — pro nápovědu při překlepu v --datum. */
function dostupneDny() {
  try {
    return execFileSync('git', ['log', '--format=%ad', '--date=short', '--', 'zalohy/orders.json'], {
      cwd: KOREN, encoding: 'utf8',
      // Jeden den může mít víc commitů (denní záloha + ruční spuštění),
      // ale ve výpisu nás zajímá datum, ne kolikrát se ten den ukládalo.
    }).trim().split('\n').filter(Boolean).filter((d, i, a) => a.indexOf(d) === i).slice(0, 14);
  } catch {
    return [];
  }
}

/** Načte celou tabulku z databáze po stránkách (PostgREST vrací max 1000). */
async function nactiZDb(tabulka) {
  const STRANKA = 1000;
  const out = [];
  for (let od = 0; ; od += STRANKA) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?select=*&order=id`, {
      headers: { ...hlavicky, Range: `${od}-${od + STRANKA - 1}` },
    });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < STRANKA) break;
  }
  return out;
}

/**
 * Porovnání řádku po sloupcích. Datumy z PostgREST chodí jako řetězec, takže
 * stačí mělké porovnání přes JSON — složené hodnoty se v těchhle tabulkách
 * nevyskytují.
 */
function stejne(a, b) {
  const klice = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of klice) {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  }
  return true;
}

async function posli(metoda, tabulka, telo, extraHlavicky = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${tabulka}`, {
    method: metoda,
    headers: { ...hlavicky, Prefer: 'resolution=merge-duplicates,return=minimal', ...extraHlavicky },
    body: JSON.stringify(telo),
  });
  if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function smaz(tabulka, ids) {
  // Mažou se po dávkách — URL s tisícem id by se do dotazu nevešlo.
  for (let i = 0; i < ids.length; i += 100) {
    const davka = ids.slice(i, i + 100);
    const seznam = davka.map((x) => `"${x}"`).join(',');
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?id=in.(${encodeURIComponent(seznam)})`, {
      method: 'DELETE',
      headers: { ...hlavicky, Prefer: 'return=minimal' },
    });
    if (!r.ok) throw new Error(`${tabulka} (mazání): HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

const tabulky = jenTabulka ? [jenTabulka] : TABULKY;
if (jenTabulka && !TABULKY.includes(jenTabulka)) {
  console.error(`Neznámá tabulka „${jenTabulka}". Zálohují se: ${TABULKY.join(', ')}`);
  process.exitCode = 1;
}

const plan = [];

// Celý běh v try/catch: tohle se pouští ve chvíli, kdy už se něco pokazilo,
// a výpis zásobníku z Node je v takové chvíli k ničemu.
try {

console.log(datum ? `Záloha ke dni ${datum}` : 'Záloha z aktuálních souborů v zalohy/');
console.log('─'.repeat(64));

for (const tabulka of tabulky) {
  const zalohaRadky = nactiZalohu(tabulka);
  const dbRadky = await nactiZDb(tabulka);

  const dbPodleId = new Map(dbRadky.map((r) => [r.id, r]));
  const zalohaPodleId = new Map(zalohaRadky.map((r) => [r.id, r]));

  const chybi = zalohaRadky.filter((r) => !dbPodleId.has(r.id));
  const zmenene = zalohaRadky.filter((r) => dbPodleId.has(r.id) && !stejne(r, dbPodleId.get(r.id)));
  const navic = dbRadky.filter((r) => !zalohaPodleId.has(r.id));

  plan.push({ tabulka, chybi, zmenene, navic });

  const popisNavic = navic.length === 0
    ? ''
    : smazatNavic
    ? `, ${navic.length} smazat (v záloze nejsou)`
    : `, ${navic.length} navíc v databázi (zůstanou — přidej --smazat-navic)`;

  console.log(
    `${tabulka.padEnd(12)} záloha ${String(zalohaRadky.length).padStart(5)} | databáze ${String(dbRadky.length).padStart(5)}` +
    ` → ${chybi.length} doplnit, ${zmenene.length} opravit${popisNavic}`,
  );
}

const celkemZmen = plan.reduce((s, p) => s + p.chybi.length + p.zmenene.length + (smazatNavic ? p.navic.length : 0), 0);
console.log('─'.repeat(64));

if (celkemZmen === 0) {
  console.log('Databáze se zálohou souhlasí — není co obnovovat.');
} else if (!opravdu) {
  console.log(`Celkem by se změnilo ${celkemZmen} řádků. NIC SE NEZAPSALO.`);
  console.log('Spusť znovu s --opravdu, pokud to tak má být.');
  if (!smazatNavic && plan.some((p) => p.navic.length)) {
    console.log('Pozn.: --smazat-navic srovná databázi PŘESNĚ do stavu zálohy; všechno novější zmizí.');
  }
} else {
  // Zapisuje se v pořadí tabulek (objednávky před položkami), maže obráceně —
  // jinak by cizí klíč odmítl smazat objednávku, na kterou visí položky.
  for (const { tabulka, chybi, zmenene } of plan) {
    const kZapisu = [...chybi, ...zmenene];
    if (!kZapisu.length) continue;
    for (let i = 0; i < kZapisu.length; i += 500) {
      await posli('POST', tabulka, kZapisu.slice(i, i + 500));
    }
    console.log(`${tabulka}: zapsáno ${kZapisu.length} řádků`);
  }

  if (smazatNavic) {
    for (const { tabulka, navic } of [...plan].reverse()) {
      if (!navic.length) continue;
      await smaz(tabulka, navic.map((r) => r.id));
      console.log(`${tabulka}: smazáno ${navic.length} řádků`);
    }
  }

  console.log('Hotovo.');
}

} catch (e) {
  console.error('\nObnova skončila chybou:\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
