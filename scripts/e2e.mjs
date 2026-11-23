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
/**
 * Počká, až se plynulé rolování (scrollIntoView s behavior: 'smooth') zastaví, a vrátí polohu prvku
 * od horního okraje okna. Pevné čekání by na pomalejším počítači (CI) měřilo uprostřed skoku.
 */
async function polohaPoRolovani(locator) {
  let predchozi = null;
  let stejnych = 0;
  for (let i = 0; i < 50 && stejnych < 3; i++) {
    const top = await locator.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    stejnych = top === predchozi ? stejnych + 1 : 0;
    predchozi = top;
    await locator.page().waitForTimeout(100);
  }
  return predchozi;
}

/**
 * Okno „Nová objednávka" se od 23. 11. 2026 otevírá po krocích; jak ho člověk zvolil, si pamatuje
 * zařízení (lib/objednavkaPruvodce.ts → KLIC_REZIMU_PRUVODCE). Scénáře jedné stránky si ji proto
 * předem přišpendlí; scénář po krocích nechává výchozí volbu.
 */
const KLIC_REZIMU_PRUVODCE = 'objednavky_pruvodce_rezim_v1';
async function pripnoutRezim(page, rezim) {
  await page.addInitScript(([klic, hodnota]) => window.localStorage.setItem(klic, JSON.stringify(hodnota)), [KLIC_REZIMU_PRUVODCE, rezim]);
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
  // Nová objednávka na JEDNÉ stránce na telefonu (19. 11. 2026: „tady ať je vše
  // na jedné stránce vidět a na konci ať je i možnost odeslat na WhatsApp"):
  // odběratel a den, pivo a souhrn pod sebou, dole pořád „Uložit objednávku"
  // a pod ním „Uložit a odeslat na WhatsApp". Okno samo neukládá — náhled vypíše
  // koncept, který by dostala obrazovka Objednávky. Chrání to, co jednotkové
  // testy nevidí: že se stránka dá proklikat skutečným CSS, že se nerozjede do
  // stran, že tlačítka uložení zůstávají vidět a že žádný cíl pro prst není
  // menší než 44 px.
  console.log('\nScénář: nová objednávka — průvodce, jedna stránka na telefonu');
  const pruvodce = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyPruvodce = [];
  pruvodce.on('pageerror', (e) => chybyPruvodce.push(String(e)));
  await pripnoutRezim(pruvodce, 'stranka');
  await pruvodce.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });

  /** Rozložení okna: nic se nerozjíždí do stran a každý cíl pro prst má aspoň 44 px. */
  const kontrolaRozlozeniNa = async (strana, kde) => {
    const r = await strana.evaluate(() => {
      const male = [];
      for (const el of document.querySelectorAll('button, input:not([type=checkbox]), select, [role=radio]')) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        if (box.height < 43.5) male.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} ${Math.round(box.height)} px`);
      }
      // Celá stránka je v rolovací ploše okna: do stran se nesmí rozjet ani ta.
      const plocha = document.querySelector('main');
      return { doc: document.documentElement.scrollWidth, okno: window.innerWidth, male, plocha: plocha ? plocha.scrollWidth - plocha.clientWidth : 0 };
    });
    overit(r.doc <= r.okno + 1, `${kde}: stránka se neroluje do stran (${r.doc} ≤ ${r.okno})`);
    overit(r.plocha <= 1, `${kde}: ani rolovací plocha okna se nerozjíždí do stran (přesah ${r.plocha} px)`);
    overit(r.male.length === 0, `${kde}: každý cíl pro prst má aspoň 44 px${r.male.length ? ` — malé: ${r.male.join(', ')}` : ''}`);
  };
  const kontrolaRozlozeni = (kde) => kontrolaRozlozeniNa(pruvodce, kde);

  const tlUlozit = pruvodce.getByRole('button', { name: 'Uložit objednávku', exact: true });
  const tlWhatsapp = pruvodce.getByRole('button', { name: 'Uložit a odeslat na WhatsApp', exact: true });
  const hlaseniUlozeni = pruvodce.getByTestId('pruvodce-hlaseni');
  // Tlačítka uložení jsou celá v okně, pod sebou, a nikdy nescrollují pryč.
  const kontrolaTlacitekUlozeni = async (kde) => {
    const horni = await tlUlozit.boundingBox();
    const dolni = await tlWhatsapp.boundingBox();
    const vyska = pruvodce.viewportSize()?.height ?? 844;
    overit(
      horni !== null && dolni !== null && horni.y >= 0 && horni.y + horni.height <= dolni.y + 1 && dolni.y + dolni.height <= vyska + 0.5,
      `${kde}: dole v okně jsou pod sebou „Uložit objednávku" a „Uložit a odeslat na WhatsApp"`,
    );
  };

  for (const nadpis of ['Pro koho?', 'Kdy se veze?', 'Které pivo?', 'Souhrn objednávky']) {
    overit(await pruvodce.getByRole('heading', { name: nadpis }).count() === 1, `na stránce je „${nadpis}" (nic se nepřepíná po krocích)`);
  }
  overit(await pruvodce.getByRole('button', { name: /^(Dál|Souhrn)/ }).count() === 0, 'žádné tlačítko „Dál" ani „Souhrn"');
  await kontrolaRozlozeni('prázdná stránka');
  await kontrolaTlacitekUlozeni('prázdná stránka');
  overit(await tlUlozit.isDisabled() && await tlWhatsapp.isDisabled(), 'bez odběratele jsou obě tlačítka uložení zamčená');
  overit((await hlaseniUlozeni.textContent())?.includes('Vyber odběratele') === true, 'prázdná stránka říká „Vyber odběratele."');
  await pruvodce.getByRole('button', { name: /^Radek/ }).click();
  overit((await hlaseniUlozeni.textContent())?.includes('kam se veze') === true, 'odběratel s víc místy: hláška chce vybrat místo');
  // „Sklad" a „Drobák" patří pod Radka: hledání najde Radka a předvybere místo.
  const odberatele = pruvodce.getByRole('group', { name: 'Odběratelé' });
  await pruvodce.getByLabel('Hledat odběratele').fill('sklad');
  overit(await odberatele.getByRole('button', { name: /^Sklad/ }).count() === 0, 'starý odběratel „Sklad" se v nabídce neukazuje');
  const radekPodleMista = odberatele.getByRole('button', { name: /^Radek/ });
  overit((await radekPodleMista.textContent())?.includes('místo: Sklad') === true, '„sklad" najde Radka s místem Sklad');
  await radekPodleMista.click();
  overit(await pruvodce.getByRole('button', { name: 'Sklad', exact: true }).getAttribute('aria-pressed') === 'true', 'místo Sklad je předvybrané');
  overit((await hlaseniUlozeni.textContent())?.includes('Přidej aspoň jedno pivo') === true, 'po výběru místa chybí už jen pivo');
  overit(await tlUlozit.isDisabled(), 'bez piva je uložení zamčené');

  await kontrolaRozlozeni('odběratel vybraný');
  await pruvodce.getByRole('button', { name: /^12° Světlá/ }).click();
  await pruvodce.getByRole('textbox', { name: 'Kolik kusů?' }).fill('2');
  await kontrolaRozlozeni('panel obalu a počtu');
  await pruvodce.getByRole('button', { name: /^Hotovo/ }).click();
  overit(await pruvodce.getByRole('button', { name: /^12° Světlá.*2×50/ }).count() > 0, 'dlaždice piva ukazuje rozepsané „2×50"');
  overit(await tlUlozit.isEnabled() && await tlWhatsapp.isEnabled(), 'odběratel, místo i pivo jsou — obě tlačítka uložení jsou odemčená');

  await pruvodce.getByRole('heading', { name: 'Souhrn objednávky' }).scrollIntoViewIfNeeded();
  await kontrolaRozlozeni('souhrn');
  await kontrolaTlacitekUlozeni('souhrn');
  overit(await pruvodce.getByText('2× 50 l').count() > 0, 'souhrn ukazuje „2× 50 l"');
  // Tužka u „Kdy" přeroluje stránku ke dnům závozu (nic se nepřepíná, nic se nezahodí).
  await pruvodce.getByRole('button', { name: 'Změnit den závozu' }).click();
  const hornyKdy = await polohaPoRolovani(pruvodce.getByRole('heading', { name: 'Kdy se veze?' }));
  overit(hornyKdy >= 0 && hornyKdy < 300, `tužka u dne závozu přerolovala ke dnům (${hornyKdy} px od horního okraje)`);
  await pruvodce.getByRole('heading', { name: 'Souhrn objednávky' }).scrollIntoViewIfNeeded();
  // Půjčení výčepu: nenápadné pole, které otevře okno rezervace (v náhledu ho nahrazuje hotová rezervace).
  const vycep = pruvodce.getByTestId('pruvodce-vycep');
  const poleVycep = pruvodce.getByRole('checkbox', { name: 'Půjčení výčepu' });
  const vyskaVycepu = await vycep.locator('label').evaluate((el) => el.getBoundingClientRect().height);
  overit(vyskaVycepu >= 43.5, `pole „Půjčení výčepu" má aspoň 44 px (${Math.round(vyskaVycepu)} px)`);
  overit(!(await poleVycep.isChecked()), 'výčep je ze začátku odškrtnutý');
  await poleVycep.click();
  await vycep.getByText(/^Rezervováno: Výčep 2 · \d{1,2}\. \d{1,2}\.$/).waitFor();
  overit(await poleVycep.isChecked(), 'po zaškrtnutí je výčep rezervovaný');
  await kontrolaRozlozeni('souhrn s výčepem');
  await poleVycep.click();
  await vycep.getByText(/^Půjčení výčepu$/).waitFor();
  overit(JSON.parse((await pruvodce.getByTestId('zruseno').textContent()) ?? '[]').join() === 'rez-nahled', 'odškrtnutí zrušilo rezervaci');
  await poleVycep.click();
  await vycep.getByText(/^Rezervováno: /).waitFor();

  await tlUlozit.click();
  // Po uložení se okno samo zavře — žádná potvrzovací stránka (19. 11.: „tohle se nemusí zobrazovat“),
  // jen krátké potvrzení nahoře.
  const otevritZnovu = pruvodce.getByRole('button', { name: 'Otevřít průvodce' });
  await otevritZnovu.waitFor();
  overit(await pruvodce.getByRole('dialog', { name: 'Nová objednávka' }).count() === 0, 'po uložení se okno průvodce samo zavřelo');
  overit(await pruvodce.getByText('Zadat další objednávku').count() === 0, 'žádná potvrzovací stránka s „Zadat další objednávku“');
  overit(await pruvodce.getByText(/Objednávka uložena: Radek · Sklad/).count() > 0, 'naskočilo krátké potvrzení „Objednávka uložena: Radek · Sklad …“');
  let ulozeno = JSON.parse((await pruvodce.getByTestId('ulozeno').textContent()) ?? '[]');
  overit(
    ulozeno.length === 1 && ulozeno[0].placeId === 'p-radek' && ulozeno[0].mistoZavozu === 'sklad'
      && ulozeno[0].radky.length === 1 && ulozeno[0].radky[0].qty === 2,
    'uložila se jedna objednávka: Radek, místo Sklad, 2× sud 50 l',
  );
  overit(ulozeno[0].vycep === true && ulozeno[0].vycepRezervace?.id === 'rez-nahled', 'objednávka nese rezervaci výčepu');
  overit(ulozeno[0].odeslatNaWhatsApp === false, '„Uložit objednávku" WhatsApp neotevírá');

  // Druhá objednávka: „Uložit a odeslat na WhatsApp" uloží stejně, jen s příznakem odeslání.
  await otevritZnovu.click();
  await pruvodce.getByRole('button', { name: /^Žižkov/ }).click();
  await pruvodce.getByRole('button', { name: /^Jantar/ }).click();
  await pruvodce.getByRole('textbox', { name: 'Kolik kusů?' }).fill('1');
  await pruvodce.getByRole('button', { name: /^Hotovo/ }).click();
  await tlWhatsapp.click();
  await otevritZnovu.waitFor();
  ulozeno = JSON.parse((await pruvodce.getByTestId('ulozeno').textContent()) ?? '[]');
  overit(
    ulozeno.length === 2 && ulozeno[1].placeName === 'Žižkov' && ulozeno[1].radky.length === 1 && ulozeno[1].odeslatNaWhatsApp === true,
    '„Uložit a odeslat na WhatsApp" uložilo druhou objednávku (Žižkov) s příznakem odeslání',
  );
  overit(chybyPruvodce.length === 0, `průvodce nevyhodil chybu${chybyPruvodce.length ? ': ' + chybyPruvodce[0] : ''}`);
  await pruvodce.close();

  // Lišta písmen A–Ž pod dlaždicemi (jako ve starém výběru odběratele, 18. 11. 2026):
  // klepnutí rozbalí seznam po písmenech a skočí na něj, výběr seznam zase sbalí.
  console.log('\nScénář: nová objednávka — lišta písmen pod dlaždicemi odběratelů');
  const abeceda = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyAbeceda = [];
  abeceda.on('pageerror', (e) => chybyAbeceda.push(String(e)));
  await pripnoutRezim(abeceda, 'stranka');
  await abeceda.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });
  const kontrolaAbecedy = async (kde) => {
    const r = await abeceda.evaluate(() => {
      const male = [];
      for (const el of document.querySelectorAll('button, input:not([type=checkbox])')) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (box.height < 43.5) male.push(`${(el.textContent || '').trim().slice(0, 20)} ${Math.round(box.height)} px`);
      }
      return { doc: document.documentElement.scrollWidth, okno: window.innerWidth, male };
    });
    overit(r.doc <= r.okno + 1, `${kde}: stránka se neroluje do stran (${r.doc} ≤ ${r.okno})`);
    overit(r.male.length === 0, `${kde}: každý cíl pro prst má aspoň 44 px${r.male.length ? ` — malé: ${r.male.join(', ')}` : ''}`);
  };

  // Lupa je v řádku vedle pole, ne přes ně (na telefonu majitele ležela přes „Hledat").
  const vstupHledani = await abeceda.getByLabel('Hledat odběratele').boundingBox();
  const lupaHledani = await abeceda.locator('#pruvodce-hledani').locator('xpath=preceding-sibling::*[local-name()="svg"]').boundingBox();
  overit(vstupHledani !== null && lupaHledani !== null && lupaHledani.x + lupaHledani.width <= vstupHledani.x + 0.5, 'lupa nepřekrývá pole pro hledání');

  const lista = abeceda.getByRole('navigation', { name: 'Přeskočit na písmeno' });
  overit(await lista.isVisible(), 'pod dlaždicemi je lišta písmen');
  const pismena = await lista.getByRole('button').allInnerTexts();
  overit(pismena.join(' ') === '# A B Č D CH J L M R S Ž', `lišta má českou abecedu: # A B Č D CH J L M R S Ž (je: ${pismena.join(' ')})`);
  await kontrolaAbecedy('lišta písmen');
  await lista.getByRole('button', { name: 'CH', exact: true }).click();
  const nadpisCh = abeceda.getByRole('heading', { name: 'CH', exact: true });
  await nadpisCh.waitFor();
  const horni = await polohaPoRolovani(nadpisCh);
  overit(horni >= 0 && horni < 400, `po klepnutí na CH se skočilo na jeho nadpis (${horni} px od horního okraje)`);
  await kontrolaAbecedy('rozbalený seznam po písmenech');
  // Nejčastější odběratelé zůstávají nahoře i při rozbalené abecedě (majitel 18. 11.).
  const nejcastejsiNahore = await abeceda.evaluate(() => {
    const dlazdice = document.querySelector('[role=group][aria-label="Odběratelé"]');
    const nadpis = [...document.querySelectorAll('h3')].find((h) => h.textContent?.trim() === 'CH');
    return !!dlazdice && !!nadpis && dlazdice.querySelectorAll('button').length === 10
      && !!(dlazdice.compareDocumentPosition(nadpis) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  overit(nejcastejsiNahore, 'nahoře zůstává 10 nejčastějších odběratelů i při rozbalené abecedě (majitel 23. 11.: „nejčastějších 10")');
  await abeceda.getByRole('button', { name: /^Chlapy z Toužimi/ }).click();
  await abeceda.waitForTimeout(200);
  overit(await abeceda.getByRole('heading', { name: 'CH', exact: true }).count() === 0, 'po výběru se seznam sbalí');
  overit(await abeceda.getByRole('button', { name: /^Chlapy z Toužimi/ }).getAttribute('aria-pressed') === 'true', 'vybraný odběratel je navrchu');
  overit((await abeceda.getByTestId('pruvodce-hlaseni').textContent())?.includes('Přidej aspoň jedno pivo') === true, 'po výběru z abecedy chybí už jen pivo (hláška nad tlačítky uložení)');
  overit(chybyAbeceda.length === 0, `lišta písmen nevyhodila chybu${chybyAbeceda.length ? ': ' + chybyAbeceda[0] : ''}`);
  await abeceda.close();

  // Na počítači jsou všechny tři části vedle sebe a obě tlačítka uložení jsou v souhrnu.
  const pocitac = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const chybyPocitac = [];
  pocitac.on('pageerror', (e) => chybyPocitac.push(String(e)));
  await pripnoutRezim(pocitac, 'stranka');
  await pocitac.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });
  await pocitac.getByRole('region', { name: 'Souhrn objednávky' }).waitFor();
  overit(await pocitac.getByRole('region', { name: 'Pro koho a na kdy' }).isVisible(), 'počítač: vidět odběratele a den');
  overit(await pocitac.getByRole('region', { name: 'Pivo, obal a počet' }).isVisible(), 'počítač: vidět piva');
  overit(await pocitac.getByRole('region', { name: 'Souhrn objednávky' }).isVisible(), 'počítač: vidět souhrn');
  const souhrnPc = pocitac.getByRole('region', { name: 'Souhrn objednávky' });
  overit(await souhrnPc.getByRole('button', { name: 'Uložit objednávku', exact: true }).isVisible(), 'počítač: v souhrnu je „Uložit objednávku"');
  overit(await souhrnPc.getByRole('button', { name: 'Uložit a odeslat na WhatsApp', exact: true }).isVisible(), 'počítač: pod ním je „Uložit a odeslat na WhatsApp"');
  const sirkaPc = await pocitac.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
  overit(sirkaPc.doc <= sirkaPc.okno + 1, `počítač: stránka se neroluje do stran (${sirkaPc.doc} ≤ ${sirkaPc.okno})`);
  overit(chybyPocitac.length === 0, `průvodce na počítači nevyhodil chybu${chybyPocitac.length ? ': ' + chybyPocitac[0] : ''}`);
  await pocitac.close();

  // ── Scénář 3b: průvodce PO KROCÍCH (výchozí způsob od 23. 11. 2026) ───
  // Majitel: „otevře se strana s odběrateli, dlaždice jak jsou včetně A–Ž, nejčastějších 10;
  // když vyberu odběratele, vyberu den závozu, datum, poznámku; další je záložka piva;
  // pak můžu potvrdit nebo zahodit … dej možnost kliknout po pořadě, stejně jako se dělá
  // inventura položka po položce." Bez zapamatované volby se okno otevře po krocích; tenhle
  // scénář ho proklikne skutečným CSS na telefonu: lišta kroků, Dál / Zpět dole pořád
  // v okně, nic se nerozjíždí do stran a žádný cíl pro prst není menší než 44 px.
  console.log('\nScénář: nová objednávka — průvodce po krocích na telefonu (výchozí)');
  const kroky = await b.newPage({ viewport: { width: 390, height: 844 } });
  const chybyKroky = [];
  kroky.on('pageerror', (e) => chybyKroky.push(String(e)));
  await kroky.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });

  const NADPISY_KROKU = ['Pro koho?', 'Kdy se veze?', 'Které pivo?', 'Souhrn objednávky'];
  /** Na stránce je vidět jen jeden krok (nic se neskládá pod sebe). */
  const jenNadpis = async (kde, nadpis) => {
    const pocty = {};
    for (const n of NADPISY_KROKU) pocty[n] = await kroky.getByRole('heading', { name: n }).count();
    const ok = Object.entries(pocty).every(([n, p]) => p === (n === nadpis ? 1 : 0));
    overit(ok, `${kde}: vidět je jen „${nadpis}"${ok ? '' : ` — ${JSON.stringify(pocty)}`}`);
  };
  const krokNyni = () => kroky.locator('[aria-current="step"]').getAttribute('aria-label');
  const celeVOkne = async (locator, kde) => {
    const box = await locator.boundingBox();
    overit(box !== null && box.y >= 0 && box.y + box.height <= 844.5, `${kde}: je celé v okně (dole ${Math.round((box?.y ?? 0) + (box?.height ?? 0))} ≤ 844)`);
  };
  const tlDal = kroky.getByRole('button', { name: /^Dál/ });
  const tlZpet = kroky.getByRole('button', { name: /^Zpět/ });
  const tlUlozitKroky = kroky.getByRole('button', { name: 'Uložit objednávku', exact: true });
  const tlWhatsappKroky = kroky.getByRole('button', { name: 'Uložit a odeslat na WhatsApp', exact: true });
  const otevritKroky = kroky.getByRole('button', { name: 'Otevřít průvodce' });

  // 1. krok: jen odběratelé.
  await jenNadpis('1. krok', 'Pro koho?');
  overit(await krokNyni() === 'Krok 1 ze 4: Odběratel', 'lišta kroků: jsme na 1. ze 4 kroků (Odběratel)');
  overit(await kroky.getByRole('group', { name: 'Odběratelé' }).getByRole('button').count() === 10, 'nahoře je 10 nejčastějších odběratelů');
  overit(await kroky.getByRole('navigation', { name: 'Přeskočit na písmeno' }).isVisible(), 'pod dlaždicemi je pořád lišta písmen A–Ž');
  overit(await tlDal.isDisabled(), 'bez odběratele je „Dál" zamčené');
  overit(await kroky.getByRole('button', { name: /^Krok 3 ze 4/ }).isDisabled(), 'v liště se na 3. krok přeskočit nedá, dokud není odběratel');
  overit(await kroky.getByRole('button', { name: /^Zrušit/ }).isVisible() && await tlZpet.count() === 0, 'na prvním kroku je místo „Zpět" tlačítko „Zrušit"');
  await celeVOkne(tlDal, '1. krok: „Dál"');
  await kontrolaRozlozeniNa(kroky, '1. krok');

  // Odběratel s jedním místem pošle okno dál hned po klepnutí.
  await kroky.getByRole('button', { name: /^Žižkov/ }).click();
  await kroky.getByRole('heading', { name: 'Kdy se veze?' }).waitFor();
  await jenNadpis('2. krok', 'Kdy se veze?');
  overit(await krokNyni() === 'Krok 2 ze 4: Kdy', 'po klepnutí na Žižkov okno samo přešlo na 2. krok (Kdy)');
  overit((await kroky.getByTestId('pruvodce-kontext').textContent())?.startsWith('Žižkov') === true, 'nad krokem je vidět odběratel („Žižkov · …")');
  // Den, datum a poznámka jsou na jedné stránce.
  const dnyKroku = kroky.getByRole('group', { name: 'Kdy se veze?' }).getByRole('button');
  const prvniDen = dnyKroku.nth(0);
  const [zkratkaDne, kratceDne] = (await prvniDen.innerText()).split('\n');
  await prvniDen.click();
  overit(await prvniDen.getAttribute('aria-pressed') === 'true', 'den závozu jde vybrat klepnutím');
  overit((await kroky.getByTestId('pruvodce-kontext').textContent())?.includes(`${zkratkaDne} ${kratceDne.split(' · ')[0]}`) === true, 'vybraný den je vidět nad krokem');
  // Neděle na konci měsíce: první nabízený den je už v dalším měsíci a okno chce potvrzení (jinak se nepokračuje).
  const dalsiMesicKroky = kroky.getByRole('checkbox', { name: /Potvrzuji, že závoz/ });
  if (await dalsiMesicKroky.count() > 0) await dalsiMesicKroky.check();
  overit(await kroky.getByLabel('Jiné datum závozu (i zpětně)').isVisible(), 'je tu i pole pro jiné datum');
  await kroky.getByLabel('Poznámka').fill('zavolat před závozem');
  await celeVOkne(tlDal, '2. krok: „Dál"');
  await kontrolaRozlozeniNa(kroky, '2. krok');
  await tlDal.click();

  // 3. krok: piva.
  await kroky.getByRole('heading', { name: 'Které pivo?' }).waitFor();
  await jenNadpis('3. krok', 'Které pivo?');
  overit(await tlDal.isDisabled(), 'bez piva je „Dál" zamčené');
  overit((await kroky.getByTestId('pruvodce-hlaseni').textContent())?.includes('Přidej aspoň jedno pivo') === true, 'u „Dál" stojí „Přidej aspoň jedno pivo."');
  await kontrolaRozlozeniNa(kroky, '3. krok');
  await kroky.getByRole('button', { name: /^12° Světlá/ }).click();
  await kroky.getByRole('textbox', { name: 'Kolik kusů?' }).fill('2');
  await kroky.getByRole('button', { name: /^Hotovo/ }).click();
  overit(await kroky.getByRole('button', { name: /^12° Světlá.*2×50/ }).count() > 0, 'dlaždice piva ukazuje rozepsané „2×50"');
  overit(await tlDal.isEnabled(), 's pivem je „Dál" odemčené');
  await celeVOkne(tlDal, '3. krok: „Dál"');
  await tlDal.click();

  // 4. krok: souhrn — uložit, nebo zahodit.
  await kroky.getByRole('heading', { name: 'Souhrn objednávky' }).waitFor();
  await jenNadpis('4. krok', 'Souhrn objednávky');
  overit(await kroky.getByText('2× 50 l').count() > 0, 'souhrn ukazuje „2× 50 l"');
  overit((await kroky.getByTestId('souhrn-poznamka').textContent())?.includes('zavolat před závozem') === true, 'souhrn ukazuje poznámku z kroku „kdy"');
  overit(await kroky.getByLabel('Poznámka', { exact: true }).count() === 0, 'v souhrnu už není druhé pole pro poznámku');
  const horniUlozeni = await tlUlozitKroky.boundingBox();
  const dolniUlozeni = await tlWhatsappKroky.boundingBox();
  overit(
    horniUlozeni !== null && dolniUlozeni !== null && horniUlozeni.y >= 0 && horniUlozeni.y + horniUlozeni.height <= dolniUlozeni.y + 1 && dolniUlozeni.y + dolniUlozeni.height <= 844.5,
    '4. krok: dole v okně jsou pod sebou „Uložit objednávku" a „Uložit a odeslat na WhatsApp"',
  );
  await celeVOkne(tlZpet, '4. krok: „Zpět"');
  await celeVOkne(kroky.getByRole('button', { name: /^Zahodit/ }), '4. krok: „Zahodit"');
  overit(await tlDal.count() === 0, 'v souhrnu už není „Dál"');
  await kontrolaRozlozeniNa(kroky, '4. krok');

  // Zpět a lišta: rozepsané zůstává.
  await tlZpet.click();
  await kroky.getByRole('heading', { name: 'Které pivo?' }).waitFor();
  overit(await krokNyni() === 'Krok 3 ze 4: Piva', 'Zpět vrátilo na 3. krok');
  overit(await kroky.getByRole('button', { name: /^12° Světlá.*2×50/ }).count() > 0, 'rozepsané pivo zůstalo (2×50)');
  await kroky.getByRole('button', { name: /^Krok 2 ze 4/ }).click();
  await kroky.getByRole('heading', { name: 'Kdy se veze?' }).waitFor();
  overit(await kroky.getByLabel('Poznámka').inputValue() === 'zavolat před závozem', 'v liště jde skočit na hotový krok a poznámka je tam');
  await kroky.getByRole('button', { name: /^Krok 4 ze 4/ }).click();
  await kroky.getByRole('heading', { name: 'Souhrn objednávky' }).waitFor();
  overit(await krokNyni() === 'Krok 4 ze 4: Souhrn', 'v liště jde skočit rovnou na souhrn (všechny kroky před ním jsou hotové)');

  await tlUlozitKroky.click();
  await otevritKroky.waitFor();
  overit(await kroky.getByRole('dialog', { name: 'Nová objednávka' }).count() === 0, 'po uložení se okno samo zavřelo');
  overit(await kroky.getByText(/Objednávka uložena: Žižkov/).count() > 0, 'naskočilo krátké potvrzení „Objednávka uložena: Žižkov …“');
  let ulozenoKroky = JSON.parse((await kroky.getByTestId('ulozeno').textContent()) ?? '[]');
  overit(
    ulozenoKroky.length === 1 && ulozenoKroky[0].placeId === 'p-zizkov' && ulozenoKroky[0].poznamka === 'zavolat před závozem'
      && ulozenoKroky[0].radky.length === 1 && ulozenoKroky[0].radky[0].qty === 2 && ulozenoKroky[0].odeslatNaWhatsApp === false,
    'uložila se jedna objednávka: Žižkov, 2× sud 50 l, s poznámkou',
  );

  // Zahodit: okno se zeptá a po potvrzení nic neuloží.
  await otevritKroky.click();
  await kroky.getByRole('button', { name: /^Žižkov/ }).click();
  await tlDal.click();
  await kroky.getByRole('button', { name: /^Jantar/ }).click();
  await kroky.getByRole('textbox', { name: 'Kolik kusů?' }).fill('1');
  await kroky.getByRole('button', { name: /^Hotovo/ }).click();
  await tlDal.click();
  await kroky.getByRole('button', { name: /^Zahodit/ }).click();
  const potvrzeni = kroky.locator('[role=dialog]', { hasText: 'Zahodit rozepsanou objednávku?' });
  await potvrzeni.waitFor();
  await potvrzeni.getByRole('button', { name: 'Zahodit', exact: true }).click();
  await otevritKroky.waitFor();
  ulozenoKroky = JSON.parse((await kroky.getByTestId('ulozeno').textContent()) ?? '[]');
  overit(ulozenoKroky.length === 1, '„Zahodit" po potvrzení okno zavřelo a nic dalšího neuložilo');

  // Přepínač „Jedna stránka" / „Po krocích": volba se pamatuje v zařízení.
  await otevritKroky.click();
  await kroky.getByTestId('pruvodce-rezim').click();
  await kroky.getByRole('button', { name: 'Po krocích', exact: true }).waitFor();
  const pocetyJedna = await Promise.all(NADPISY_KROKU.map((n) => kroky.getByRole('heading', { name: n }).count()));
  overit(pocetyJedna.every((p) => p === 1), 'po „Jedna stránka" leží všechny čtyři části pod sebou');
  await kroky.reload({ waitUntil: 'networkidle' });
  await kroky.getByRole('button', { name: 'Po krocích', exact: true }).waitFor();
  overit((await Promise.all(NADPISY_KROKU.map((n) => kroky.getByRole('heading', { name: n }).count()))).every((p) => p === 1), 'po obnovení stránky se okno otevře na jedné stránce (volba se zapamatovala)');
  await kroky.getByTestId('pruvodce-rezim').click();
  await kroky.getByRole('button', { name: 'Jedna stránka', exact: true }).waitFor();
  await jenNadpis('po návratu na kroky', 'Pro koho?');
  overit(chybyKroky.length === 0, `průvodce po krocích nevyhodil chybu${chybyKroky.length ? ': ' + chybyKroky[0] : ''}`);
  await kroky.close();

  // Na počítači je po krocích jeden sloupec uprostřed a tlačítka uložení jsou v souhrnu jen jednou (v patičce).
  console.log('\nScénář: nová objednávka — průvodce po krocích na počítači');
  const krokyPc = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const chybyKrokyPc = [];
  krokyPc.on('pageerror', (e) => chybyKrokyPc.push(String(e)));
  await krokyPc.goto(`${ADRESA}/pruvodce.html`, { waitUntil: 'networkidle' });
  await krokyPc.getByRole('heading', { name: 'Pro koho?' }).waitFor();
  overit(await krokyPc.getByRole('navigation', { name: 'Kroky objednávky' }).isVisible(), 'počítač: nahoře je lišta kroků');
  overit(await krokyPc.getByRole('region', { name: 'Souhrn objednávky' }).count() === 0, 'počítač: po krocích nejsou tři sloupce vedle sebe');
  await krokyPc.getByRole('button', { name: /^Žižkov/ }).click();
  await krokyPc.getByRole('button', { name: /^Dál/ }).click();
  await krokyPc.getByRole('button', { name: /^Jantar/ }).click();
  await krokyPc.getByRole('textbox', { name: 'Kolik kusů?' }).fill('1');
  await krokyPc.getByRole('button', { name: /^Hotovo/ }).click();
  await krokyPc.getByRole('button', { name: /^Dál/ }).click();
  await krokyPc.getByRole('heading', { name: 'Souhrn objednávky' }).waitFor();
  overit(await krokyPc.getByRole('button', { name: 'Uložit objednávku', exact: true }).count() === 1, 'počítač: „Uložit objednávku" je v souhrnu jen jednou');
  overit(await krokyPc.getByRole('button', { name: 'Uložit a odeslat na WhatsApp', exact: true }).count() === 1, 'počítač: „Uložit a odeslat na WhatsApp" je v souhrnu jen jednou');
  const sirkaKrokyPc = await krokyPc.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
  overit(sirkaKrokyPc.doc <= sirkaKrokyPc.okno + 1, `počítač: stránka se neroluje do stran (${sirkaKrokyPc.doc} ≤ ${sirkaKrokyPc.okno})`);
  overit(chybyKrokyPc.length === 0, `průvodce po krocích na počítači nevyhodil chybu${chybyKrokyPc.length ? ': ' + chybyKrokyPc[0] : ''}`);
  await krokyPc.close();

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
