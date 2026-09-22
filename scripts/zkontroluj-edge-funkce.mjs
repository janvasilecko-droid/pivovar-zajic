#!/usr/bin/env node
/**
 * Kontrola edge funkcí (supabase/functions/*) na neexistující proměnné.
 *
 * PROČ TENHLE SKRIPT EXISTUJE: edge funkce běží v Denu, ne v aplikaci —
 * `npx tsc --noEmit -p .` je vůbec nevidí a vitest je nespouští. Překlep ve
 * jménu proměnné se tak nepozná NIKDE: projde review, projde CI, nasadí se
 * a spadne až v provozu, u první zprávy.
 *
 * Přesně to se stalo 18.–22. 9. 2026: ve `whatsapp-auto-parse` se do zápisu
 * dostalo `parsedData?.otazky`, jenže ta proměnná se jmenuje `parseResult`.
 * Každá WhatsApp objednávka od 21. 9. spadla na „parsedData is not defined",
 * skončila ve stavu 'error' a musela se přečíst ručně. Hlídač zpráv ani cron
 * si nestěžovaly — obojí fungovalo, jen ta funkce padala.
 *
 * Hlídá se JEN tahle třída chyb (TS2304 „Cannot find name", TS2552 „Did you
 * mean"), protože ta v provozu spolehlivě shodí celý požadavek. Ostatní
 * poznámky Dena k typům (možné `undefined`, implicitní `any`) se vypisují jen
 * pro přehled a kontrolu neshodí — jinak by se kvůli desítkám starších
 * drobností zablokovalo nasazení.
 */
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DIR = 'supabase/functions';
// Verze se drží napevno, ať se kontrola nerozbije samovolně novým Denem.
const DENO = 'deno@2.1.4';

function vstupniSoubory() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { withFileTypes: true })
    .filter((p) => p.isDirectory())
    .map((p) => join(DIR, p.name, 'index.ts'))
    .filter((cesta) => existsSync(cesta));
}

const soubory = vstupniSoubory();
if (soubory.length === 0) {
  console.log('Kontrola edge funkcí: žádné funkce k ověření.');
  process.exit(0);
}

// --node-modules-dir=none: v kořeni je package.json aplikace a Deno by jinak
// chtělo npm závislosti funkcí (npm:web-push…) v místním node_modules, které
// tam nepatří. Takhle si je stáhne do vlastní mezipaměti.
// Přes shell jako jeden příkaz: `npx.cmd` samostatně Node na Windows spustit
// odmítne (EINVAL) a pole argumentů se shellem zase hlásí zastaralé.
const prikaz = ['npx', '-y', DENO, 'check', '--node-modules-dir=none', ...soubory]
  .map((c) => (/[^\w@.\-/=]/.test(c) ? `"${c}"` : c))
  .join(' ');
const beh = spawnSync(prikaz, { encoding: 'utf8', shell: true });

if (beh.error) {
  console.error(`Kontrola edge funkcí: Deno se nepodařilo spustit — ${beh.error.message}`);
  process.exit(1);
}

const vystup = `${beh.stdout || ''}${beh.stderr || ''}`;
// Barvy z Dena pryč, ať se v logu CI dá hledat.
const cisty = vystup.replace(/\u001b\[[0-9;]*m/g, '');

// Deno neumí spustit kontrolu vůbec (chybí síť, špatná verze) — to není
// zelená, to je neprovedená kontrola.
if (/^error: (?!TS)/m.test(cisty) && !/^Found \d+ error/m.test(cisty)) {
  console.error('Kontrola edge funkcí: Deno kontrolu nedokončilo.');
  console.error(cisty.trim().slice(0, 2000));
  process.exit(1);
}

const radky = cisty.split('\n');
const nalezy = [];
radky.forEach((radek, i) => {
  if (!/TS2304|TS2552|Cannot find name/.test(radek)) return;
  // Hláška zabírá víc řádků; místo (soubor:řádek) je pár řádků pod ní.
  const misto = radky.slice(i, i + 6).find((r) => r.includes(' at file:'));
  nalezy.push({
    hlaska: radek.replace(/^\s*/, '').trim(),
    misto: (misto || '').replace(/^\s*at\s*/, '').trim(),
  });
});

const pocetCelkem = Number(cisty.match(/^Found (\d+) error/m)?.[1] ?? 0);

if (nalezy.length > 0) {
  console.error(`\n❌ Edge funkce používají ${nalezy.length} neexistujících jmen:\n`);
  for (const n of nalezy) {
    console.error(`   ${n.hlaska}`);
    if (n.misto) console.error(`      ${n.misto}`);
  }
  console.error(
    '\nTakový překlep shodí funkci až v provozu (u WhatsAppu to znamená, že\n' +
    'se objednávky musí číst ručně). Oprav jméno proměnné; změněné funkce pak\n' +
    'nasadí CI samo (job „nasad-databazi-a-funkce"). Ručně jen když je potřeba\n' +
    'hned:\n' +
    '   npx supabase functions deploy <nazev> --project-ref sasqexjadvlqyticxwja\n',
  );
  process.exit(1);
}

console.log(
  `✅ Kontrola edge funkcí: ${soubory.length} funkcí, žádné neexistující jméno` +
  (pocetCelkem > 0 ? ` (${pocetCelkem} starších poznámek k typům kontrolu neshazuje).` : '.'),
);
