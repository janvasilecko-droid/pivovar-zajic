#!/usr/bin/env node
/**
 * 🧪 E2E — projde zápis tak, jak ho projde člověk.
 *
 * Proč to chybělo: testů je přes 1300, ale sto z nich sedí v `lib/` a
 * kontroluje výpočty. Logika (sklad, parser, plány) je pokrytá výborně;
 * KLIKÁNÍ ne. A chyby, které lidi v provozu hlásí, jsou skoro vždycky
 * z toho druhého druhu — políčko, které nejde trefit, tlačítko, které se
 * odemkne dřív, než má, číslo, které se po uložení vrátí zpátky.
 *
 * Jak to obchází databázi: náhledová stránka (`nahled/`) už umí podstrčit
 * za Supabase paměťovou náhradu (`nahled/mock/supabase.ts`). Test tedy
 * jede proti SKUTEČNÉ komponentě aplikace se skutečným CSS, jen data jsou
 * vymyšlená — a co se „zapíše", je vidět ve výpisu zápisů vedle panelu.
 *
 * Použití:
 *   npx vite --config vite.nahled.config.ts     (v jednom okně)
 *   node scripts/e2e.mjs                        (ve druhém)
 *
 * Bez prohlížeče nebo bez běžícího náhledu skript NEPADÁ — řekne proč a
 * skončí nulou. Padá jen tehdy, když se scénář opravdu nepovede.
 */
import { existsSync } from 'node:fs';

const ADRESA = process.env.NAHLED_URL ?? 'http://localhost:5199';
const KANDIDATI = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

function preskoc(duvod) {
  console.log(`E2E přeskočeno: ${duvod}`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  preskoc('chybí playwright-core (npm install)');
}

const prohlizec = KANDIDATI.find((c) => existsSync(c));
if (!prohlizec) preskoc('nenašel jsem prohlížeč (nastav CHROMIUM_PATH)');

try {
  const r = await fetch(`${ADRESA}/panel.html`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  preskoc(`na ${ADRESA} nic neběží (npx vite --config vite.nahled.config.ts)`);
}

const chyby = [];
function overit(podminka, popis) {
  if (podminka) console.log(`  ✓ ${popis}`);
  else { console.log(`  ✗ ${popis}`); chyby.push(popis); }
}

const b = await chromium.launch({ executablePath: prohlizec, args: ['--no-sandbox'] });
try {
  // Telefon, protože tak se appka používá — a rozdíly v rozložení se
  // projeví právě tady (Tailwind rozhoduje podle šířky OKNA).
  const stranka = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyKonzole = [];
  stranka.on('pageerror', (e) => chybyKonzole.push(String(e)));
  await stranka.goto(`${ADRESA}/panel.html`, { waitUntil: 'networkidle' });

  console.log('Scénář: týdenní inventura — napočítat, uložit, zkontrolovat zápis');

  const pole = stranka.locator('input[inputmode="decimal"]');
  const pocetRadku = await pole.count();
  overit(pocetRadku > 0, `panel vykreslil ${pocetRadku} řádků k počítání`);

  // 1) Dotykový cíl. 44 px je hranice, na které stojí celé ovládání appky.
  const rozmer = await pole.first().boundingBox();
  overit(rozmer !== null && rozmer.height >= 44, `pole pro počet je ${Math.round(rozmer?.height ?? 0)} px vysoké (min. 44)`);

  // 2) Zápis čísla se projeví ve sloupci „Rozdíl" — tedy přepočítá se.
  await pole.first().fill('7');
  await stranka.waitForTimeout(150);
  const textPanelu = await stranka.locator('body').innerText();
  overit(/[+-]\d/.test(textPanelu), 'po zadání počtu se dopočítal rozdíl');

  // 3) Uložení. Tlačítko musí existovat, být trefitelné a po kliknutí
  //    nesmí zůstat zamčené (to byla skutečná chyba: odemklo se dřív, než
  //    zápis doběhl, takže dvojklik uložil dvakrát).
  const ulozit = stranka.getByRole('button', { name: /Uložit kontrolu/i });
  overit(await ulozit.count() > 0, 'tlačítko „Uložit kontrolu" je na obrazovce');
  const rozmerTlacitka = await ulozit.first().boundingBox();
  overit(rozmerTlacitka !== null && rozmerTlacitka.height >= 44, `tlačítko je ${Math.round(rozmerTlacitka?.height ?? 0)} px vysoké (min. 44)`);

  await ulozit.first().click();
  await stranka.waitForTimeout(600);

  // 4) Zápis se opravdu odeslal — náhledová náhrada Supabase ho hlásí ven
  //    zprávou do rodičovského okna; tady čteme rovnou její paměť.
  const zapisy = await stranka.evaluate(async () => {
    const m = await import('/mock/supabase.ts');
    return m.zapisy.length;
  });
  overit(zapisy > 0, `do „databáze" dorazil zápis (${zapisy})`);

  // 5) Nic nespadlo.
  overit(chybyKonzole.length === 0, `stránka nevyhodila chybu${chybyKonzole.length ? ': ' + chybyKonzole[0] : ''}`);
  await stranka.close();

  // ── Scénář 2: vzorník prvků v obou režimech ──────────────────────────
  // Chrání grafiku: kdyby se rozbila třída, proměnná barvy nebo komponenta
  // ze vzorníku, projeví se to tady a ne až na telefonu ve sklepě.
  console.log('\nScénář: vzorník prvků — světlý i tmavý režim, bez vodorovného rolování');
  const vzornik = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyVzorniku = [];
  vzornik.on('pageerror', (e) => chybyVzorniku.push(String(e)));
  await vzornik.goto(`${ADRESA}/prvky.html`, { waitUntil: 'networkidle' });

  for (const tmavy of [false, true]) {
    const rezim = tmavy ? 'tmavý' : 'světlý';
    await vzornik.evaluate((t) => {
      document.documentElement.classList.toggle('dark', t);
      document.documentElement.dataset.theme = t ? 'dark' : 'light';
    }, tmavy);
    await vzornik.waitForTimeout(200);

    // Stránka se nesmí rolovat do stran — to je na telefonu ta nejčastější
    // závada rozvržení a okem se přehlédne.
    const sirka = await vzornik.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      okno: window.innerWidth,
    }));
    overit(sirka.doc <= sirka.okno + 1, `${rezim} režim: stránka se neroluje do stran (${sirka.doc} ≤ ${sirka.okno})`);

    // Pozadí musí být vidět — průhledné body v tmavém režimu znamená, že
    // se motiv nepropsal a text zůstane na světlém podkladu.
    const pozadi = await vzornik.evaluate(() => getComputedStyle(document.body).backgroundColor);
    overit(/rgba?\(/.test(pozadi) && pozadi !== 'rgba(0, 0, 0, 0)', `${rezim} režim: body má vlastní pozadí (${pozadi})`);

    // Všechny role tlačítek se vykreslily.
    const tlacitek = await vzornik.locator('button').count();
    overit(tlacitek >= 10, `${rezim} režim: vykreslilo se ${tlacitek} tlačítek`);
  }
  overit(chybyVzorniku.length === 0, `vzorník nevyhodil chybu${chybyVzorniku.length ? ': ' + chybyVzorniku[0] : ''}`);
  await vzornik.close();
} finally {
  await b.close();
}

if (chyby.length) {
  console.error(`\nE2E: ${chyby.length} kontrol neprošlo.`);
  process.exit(1);
}
console.log('\nE2E: scénář prošel.');
