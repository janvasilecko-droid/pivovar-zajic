// 🧩 Obnova PLOCHY jednoho uživatele ze (šifrované) zálohy.
// ---------------------------------------------------------------------------
// Z provozu 7. 10. 2026: jednorázový krok z 6. 10. (dlaždice Odběratelé,
// piva, obaly na první stránku) se kvůli chybě spouštěl po každé úpravě
// plochy a plochu přepisoval — „kde jsou papírové poznámky na ploše? barvy
// jsou jiné, dlaždice mají jiné uspořádání, spodní menu má jiné položky".
//
// Celá obnova (obnov-ze-zalohy.mjs --tabulka profiles) by vrátila profily
// VŠEM — i oprávnění a plochy ostatních. Tenhle skript vrací jen
// `profiles.home_layout` jednoho profilu a i z něj jen vzhled: rozložení,
// barvy, schované dlaždice, spodní lištu. Poznámky a odpočty zůstávají
// aktuální (mezitím se mohly změnit).
//
// Ve výchozím stavu se NIC nezapisuje. Bez --profil vypíše profily, jejichž
// plocha se od zálohy liší (jen id a čísla — repozitář je veřejný, jména ani
// texty poznámek se nevypisují).
//
//   node scripts/obnov-plochu.mjs --commit 6cb6d60
//   node scripts/obnov-plochu.mjs --commit 6cb6d60 --profil <uuid>
//   node scripts/obnov-plochu.mjs --commit 6cb6d60 --profil <uuid> --opravdu
//
// Předchozí stav plochy (bez poznámek) se před zápisem uloží do
// predchozi-plocha.json — kdyby bylo potřeba vrátit to zpátky.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desifruj } from './lib/sifraZalohy.mjs';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hodnota = (jmeno) => { const i = args.indexOf(`--${jmeno}`); return i >= 0 ? (args[i + 1] ?? '').trim() : ''; };
const opravdu = args.includes('--opravdu');
const commit = hodnota('commit');
const profil = hodnota('profil');

const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HESLO = process.env.ZALOHA_HESLO;
const hlavicky = { apikey: KLIC, Authorization: `Bearer ${KLIC}`, 'Content-Type': 'application/json' };

/** Klíče plochy, které se NEVRACEJÍ — obsah, ne vzhled. */
const OBSAH = ['notes', 'countdowns'];

/** Vzhled plochy ze zálohy + aktuální poznámky a odpočty. */
export function obnovenaPlocha(zaloha, ted) {
  const z = zaloha && typeof zaloha === 'object' ? zaloha : {};
  const t = ted && typeof ted === 'object' ? ted : {};
  const vysledek = { ...z };
  for (const k of OBSAH) {
    if (k in t) vysledek[k] = t[k];
  }
  return vysledek;
}

/** Plocha bez obsahu (poznámek a odpočtů) — to jediné se vypisuje a ukládá. */
function jenVzhled(hl) {
  const kopie = { ...(hl ?? {}) };
  for (const k of OBSAH) delete kopie[k];
  return kopie;
}

function souhrn(hl) {
  const h = hl ?? {};
  const stranky = Array.isArray(h.pages) ? h.pages : [];
  const dlazdice = stranky.flat();
  return {
    dlazdic: dlazdice.length,
    stranek: stranky.filter((p) => Array.isArray(p) && p.length > 0).length,
    lista: Array.isArray(h.dock) ? h.dock.join(',') : '(výchozí)',
    poznamkyNaPlose: dlazdice.includes('notes') ? 'ano' : 'ne',
    barev: Object.values(h.overrides ?? {}).filter((o) => o && o.color).length,
  };
}

function rozdilBarev(a, b) {
  const oa = a?.overrides ?? {};
  const ob = b?.overrides ?? {};
  return [...new Set([...Object.keys(oa), ...Object.keys(ob)])]
    .filter((id) => (oa[id]?.color ?? null) !== (ob[id]?.color ?? null)).length;
}

async function profilyZDb() {
  const r = await fetch(`${URL_DB}/rest/v1/profiles?select=id,home_layout`, { headers: hlavicky });
  if (!r.ok) throw new Error(`profiles: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function main() {
  if (!URL_DB || !KLIC) throw new Error('Chybí SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.');
  if (!HESLO) throw new Error('Chybí ZALOHA_HESLO.');
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new Error('Zadej --commit se zálohou (např. 6cb6d60).');
  if (profil && !/^[0-9a-f-]{36}$/i.test(profil)) throw new Error('--profil musí být id profilu (uuid).');

  const kdy = execFileSync('git', ['log', '-1', '--format=%ci %s', commit], { cwd: KOREN, encoding: 'utf8' }).trim();
  const sifrovana = execFileSync('git', ['show', `${commit}:zalohy/profiles.json.enc`], { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const zaloha = JSON.parse(desifruj(sifrovana, HESLO));
  const dbPodle = new Map((await profilyZDb()).map((p) => [p.id, p]));
  console.log(`Záloha: ${kdy}`);
  console.log('─'.repeat(72));

  const lisiSe = zaloha
    .filter((p) => dbPodle.has(p.id))
    .filter((p) => JSON.stringify(jenVzhled(p.home_layout)) !== JSON.stringify(jenVzhled(dbPodle.get(p.id).home_layout)));

  if (!profil) {
    if (!lisiSe.length) { console.log('Žádná plocha se od zálohy neliší.'); return; }
    console.log(`Plocha se od zálohy liší u ${lisiSe.length} profilů:\n`);
    for (const p of lisiSe) {
      const z = souhrn(p.home_layout);
      const t = souhrn(dbPodle.get(p.id).home_layout);
      console.log(`${p.id}`);
      console.log(`  záloha: ${z.dlazdic} dlaždic na ${z.stranek} str., poznámky na ploše ${z.poznamkyNaPlose}, lišta ${z.lista}`);
      console.log(`  teď:    ${t.dlazdic} dlaždic na ${t.stranek} str., poznámky na ploše ${t.poznamkyNaPlose}, lišta ${t.lista}`);
      console.log(`  jinou barvu má ${rozdilBarev(p.home_layout, dbPodle.get(p.id).home_layout)} dlaždic\n`);
    }
    console.log('NIC SE NEZAPSALO. Pro obnovu jednoho profilu spusť s --profil <id> (a --opravdu).');
    return;
  }

  const zDb = dbPodle.get(profil);
  const zZalohy = zaloha.find((p) => p.id === profil);
  if (!zDb) throw new Error('Profil v databázi není.');
  if (!zZalohy) throw new Error('Profil v záloze není.');
  const nova = obnovenaPlocha(zZalohy.home_layout, zDb.home_layout);
  const z = souhrn(zZalohy.home_layout);
  const t = souhrn(zDb.home_layout);
  console.log(`Profil ${profil}`);
  console.log(`  teď:       ${t.dlazdic} dlaždic na ${t.stranek} str., poznámky na ploše ${t.poznamkyNaPlose}, lišta ${t.lista}`);
  console.log(`  po obnově: ${z.dlazdic} dlaždic na ${z.stranek} str., poznámky na ploše ${z.poznamkyNaPlose}, lišta ${z.lista}`);
  console.log(`  jinou barvu dostane ${rozdilBarev(zZalohy.home_layout, zDb.home_layout)} dlaždic`);
  console.log('  poznámky a odpočty zůstávají, jak jsou teď');

  if (!opravdu) { console.log('\nNIC SE NEZAPSALO. Spusť znovu s --opravdu.'); return; }

  writeFileSync(resolve(KOREN, 'predchozi-plocha.json'), JSON.stringify({ profil, home_layout: jenVzhled(zDb.home_layout) }, null, 2));
  const r = await fetch(`${URL_DB}/rest/v1/profiles?id=eq.${profil}`, {
    method: 'PATCH',
    headers: { ...hlavicky, Prefer: 'return=minimal' },
    body: JSON.stringify({ home_layout: nova }),
  });
  if (!r.ok) throw new Error(`Zápis selhal: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  console.log('\n✅ Plocha obnovená. Předchozí stav (bez poznámek) je v predchozi-plocha.json.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
