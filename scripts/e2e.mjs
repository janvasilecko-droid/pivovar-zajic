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
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Náhledový server má kořen `nahled/` a složku `public/` nezná: na `/fonts/…`
// odpoví stránkou HTML, takže by se text vykreslil NÁHRADNÍM písmem — a to je
// jiné (v CI širší) než písmo appky. Šířku textu proto měří jen scénáře, které
// si skutečná písma dodají ze `public/fonts` tímhle párem pomocníků.
const SLOZKA_PISEM = fileURLToPath(new URL('../public/fonts/', import.meta.url));
async function dodejPisma(page) {
  await page.route('**/fonts/*.woff2', (route) => route.fulfill({
    path: `${SLOZKA_PISEM}${basename(new URL(route.request().url()).pathname)}`,
    contentType: 'font/woff2',
  }));
}
/** Počká na písmo appky (včetně českých znaků) a řekne, jestli se opravdu načetlo. */
async function pockejNaPisma(page) {
  return page.evaluate(async () => {
    await document.fonts.load('700 11px "Plus Jakarta Sans"', 'vysanitovaný uzavřený ěščřž');
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes('Plus Jakarta Sans') && f.status === 'loaded');
  });
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

  // ── Scénář 3: průvodce zadáním objednávky ────────────────────────────
  // Nová objednávka krok za krokem na telefonu: odběratel → pivo → souhrn →
  // uložení. Okno samo neukládá — náhled vypíše koncept, který by dostala
  // obrazovka Objednávky. Chrání to, co jednotkové testy nevidí: že se dá
  // proklikat skutečným CSS, že se žádný krok nerozjede do stran a že žádný
  // cíl pro prst není menší než 44 px.
  console.log('\nScénář: nová objednávka — průvodce, tři kroky na telefonu');
  const pruvodce = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyPruvodce = [];
  pruvodce.on('pageerror', (e) => chybyPruvodce.push(String(e)));
  await pruvodce.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });

  const kontrolaRozlozeni = async (kde) => {
    const r = await pruvodce.evaluate(() => {
      const male = [];
      for (const el of document.querySelectorAll('button, input:not([type=checkbox]), select, [role=radio]')) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        if (box.height < 43.5) male.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} ${Math.round(box.height)} px`);
      }
      return { doc: document.documentElement.scrollWidth, okno: window.innerWidth, male };
    });
    overit(r.doc <= r.okno + 1, `${kde}: stránka se neroluje do stran (${r.doc} ≤ ${r.okno})`);
    overit(r.male.length === 0, `${kde}: každý cíl pro prst má aspoň 44 px${r.male.length ? ` — malé: ${r.male.join(', ')}` : ''}`);
  };

  await kontrolaRozlozeni('krok 1 (odběratel)');
  const dal = pruvodce.getByRole('button', { name: /Dál — vybrat pivo/ });
  overit(await dal.isDisabled(), 'bez odběratele je „Dál" zamčené');
  await pruvodce.getByRole('button', { name: /^Radek/ }).click();
  overit(await dal.isDisabled(), 'odběratel s víc místy: „Dál" čeká, až se vybere místo');
  // „Sklad" a „Drobák" patří pod Radka: hledání najde Radka a předvybere místo.
  const odberatele = pruvodce.getByRole('group', { name: 'Odběratelé' });
  await pruvodce.getByLabel('Hledat odběratele').fill('sklad');
  overit(await odberatele.getByRole('button', { name: /^Sklad/ }).count() === 0, 'starý odběratel „Sklad" se v nabídce neukazuje');
  const radekPodleMista = odberatele.getByRole('button', { name: /^Radek/ });
  overit((await radekPodleMista.textContent())?.includes('místo: Sklad') === true, '„sklad" najde Radka s místem Sklad');
  await radekPodleMista.click();
  overit(await pruvodce.getByRole('button', { name: 'Sklad', exact: true }).getAttribute('aria-pressed') === 'true', 'místo Sklad je předvybrané');
  overit(await dal.isEnabled(), 'po výběru místa je „Dál" odemčené');
  await dal.click();

  await pruvodce.getByRole('heading', { name: 'Které pivo?' }).waitFor();
  await kontrolaRozlozeni('krok 2 (pivo)');
  await pruvodce.getByRole('button', { name: /12° Světlá/ }).click();
  await pruvodce.getByRole('textbox', { name: 'Kolik kusů?' }).fill('2');
  await kontrolaRozlozeni('panel obalu a počtu');
  await pruvodce.getByRole('button', { name: /^Hotovo/ }).click();
  overit(await pruvodce.getByRole('button', { name: /12° Světlá.*2×50/ }).count() > 0, 'dlaždice piva ukazuje rozepsané „2×50"');

  await pruvodce.getByRole('button', { name: /^Souhrn/ }).click();
  await pruvodce.getByRole('heading', { name: 'Souhrn objednávky' }).waitFor();
  await kontrolaRozlozeni('krok 3 (souhrn)');
  overit(await pruvodce.getByText('2× 50 l').count() > 0, 'souhrn ukazuje „2× 50 l"');
  // Půjčení výčepu: nenápadné pole, které otevře okno rezervace (v náhledu ho nahrazuje hotová rezervace).
  const vycep = pruvodce.getByTestId('pruvodce-vycep');
  const poleVycep = pruvodce.getByRole('checkbox', { name: 'Půjčení výčepu' });
  const vyskaVycepu = await vycep.locator('label').evaluate((el) => el.getBoundingClientRect().height);
  overit(vyskaVycepu >= 43.5, `pole „Půjčení výčepu" má aspoň 44 px (${Math.round(vyskaVycepu)} px)`);
  overit(!(await poleVycep.isChecked()), 'výčep je ze začátku odškrtnutý');
  await poleVycep.click();
  await vycep.getByText(/^Rezervováno: Výčep 2 · \d{1,2}\. \d{1,2}\.$/).waitFor();
  overit(await poleVycep.isChecked(), 'po zaškrtnutí je výčep rezervovaný');
  await kontrolaRozlozeni('krok 3 (souhrn s výčepem)');
  await poleVycep.click();
  await vycep.getByText(/^Půjčení výčepu$/).waitFor();
  overit(JSON.parse((await pruvodce.getByTestId('zruseno').textContent()) ?? '[]').join() === 'rez-nahled', 'odškrtnutí zrušilo rezervaci');
  await poleVycep.click();
  await vycep.getByText(/^Rezervováno: /).waitFor();
  await pruvodce.getByRole('button', { name: /Uložit objednávku/ }).click();
  await pruvodce.getByText('Objednávka uložena').waitFor();
  const ulozeno = JSON.parse((await pruvodce.getByTestId('ulozeno').textContent()) ?? '[]');
  overit(
    ulozeno.length === 1 && ulozeno[0].placeId === 'p-radek' && ulozeno[0].mistoZavozu === 'sklad'
      && ulozeno[0].radky.length === 1 && ulozeno[0].radky[0].qty === 2,
    'uložila se jedna objednávka: Radek, místo Sklad, 2× sud 50 l',
  );
  overit(ulozeno[0].vycep === true && ulozeno[0].vycepRezervace?.id === 'rez-nahled', 'objednávka nese rezervaci výčepu');
  overit(chybyPruvodce.length === 0, `průvodce nevyhodil chybu${chybyPruvodce.length ? ': ' + chybyPruvodce[0] : ''}`);
  await pruvodce.close();

  // Na počítači jsou všechny tři kroky vedle sebe.
  const pocitac = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const chybyPocitac = [];
  pocitac.on('pageerror', (e) => chybyPocitac.push(String(e)));
  await pocitac.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });
  await pocitac.getByRole('region', { name: 'Souhrn objednávky' }).waitFor();
  overit(await pocitac.getByRole('region', { name: 'Pro koho a na kdy' }).isVisible(), 'počítač: vidět odběratele a den');
  overit(await pocitac.getByRole('region', { name: 'Pivo, obal a počet' }).isVisible(), 'počítač: vidět piva');
  overit(await pocitac.getByRole('region', { name: 'Souhrn objednávky' }).isVisible(), 'počítač: vidět souhrn');
  const sirkaPc = await pocitac.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
  overit(sirkaPc.doc <= sirkaPc.okno + 1, `počítač: stránka se neroluje do stran (${sirkaPc.doc} ≤ ${sirkaPc.okno})`);
  overit(chybyPocitac.length === 0, `průvodce na počítači nevyhodil chybu${chybyPocitac.length ? ': ' + chybyPocitac[0] : ''}`);
  await pocitac.close();

  // ── Scénář 4: štítky fáze tanku na ploše ─────────────────────────────
  // 18. 11. 2026: „vysanitovaný" se na telefonu ořízl na „vysanitovan…". Šířku
  // písma jednotkový test nevidí, proto se tu měří skutečné CSS na nejužších
  // běžných telefonech (360 a 390 px) — a se SKUTEČNÝM písmem appky (viz
  // dodejPisma): s náhradním písmem to v CI dopadlo jinak než v provozu.
  console.log('\nScénář: plocha — štítky fáze tanku se vejdou na telefon');
  for (const sirka of [360, 390]) {
    const tanky = await b.newPage({ viewport: { width: sirka, height: 600 } });
    const chybyTanky = [];
    tanky.on('pageerror', (e) => chybyTanky.push(String(e)));
    await dodejPisma(tanky);
    await tanky.goto(`${ADRESA}/tanky.html`, { waitUntil: 'networkidle' });
    await tanky.locator('[data-faze-tanku]').first().waitFor();
    overit(await pockejNaPisma(tanky), `${sirka} px: načetlo se písmo appky (Plus Jakarta Sans)`);
    const orizle = await tanky.evaluate(() => [...document.querySelectorAll('[data-faze-tanku]')]
      .filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent));
    overit(orizle.length === 0, `${sirka} px: štítky fáze tanku se vejdou celé${orizle.length ? ` — oříznuté: ${[...new Set(orizle)].join(', ')}` : ''}`);
    const sirkaStranky = await tanky.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
    overit(sirkaStranky.doc <= sirkaStranky.okno + 1, `${sirka} px: tanky se nerolují do stran (${sirkaStranky.doc} ≤ ${sirkaStranky.okno})`);
    overit(chybyTanky.length === 0, `${sirka} px: tanky nevyhodily chybu${chybyTanky.length ? ': ' + chybyTanky[0] : ''}`);
    await tanky.close();
  }
} finally {
  await b.close();
}

if (chyby.length) {
  console.error(`\nE2E: ${chyby.length} kontrol neprošlo.`);
  process.exit(1);
}
console.log('\nE2E: scénář prošel.');
