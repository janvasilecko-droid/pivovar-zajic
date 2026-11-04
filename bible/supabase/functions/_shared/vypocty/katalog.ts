// 🧮 Katalog výpočtů bible (etapa 6a). Vzorce a jejich původ jsou u každého
// výpočtu; testy (vypocty.test.ts) stojí na příkladech přepočtených nezávisle.
// „Najít v knihách" (pole `hledat`) ukáže, kde je vzorec v nahraných knihách —
// stránky se nevymýšlejí (zásada 1).
import { MimoRozsah, vel, type Definice, type Hodnoty, type Radky, type Velicina } from './zaklad.ts';

// --- Hustota a extrakt -------------------------------------------------------

/** °P z relativní hustoty 20/20 °C — kubická aproximace tabulek extraktu. */
export function platoZHustoty(sg: number): number {
  return -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
}

/** Relativní hustota 20/20 °C z °P — přesná inverze téhož polynomu (zpět vyjde stejné °P). */
export function hustotaZPlato(p: number): number {
  let dole = 0.95;
  let nahore = 1.25;
  for (let i = 0; i < 100; i += 1) {
    const stred = (dole + nahore) / 2;
    if (platoZHustoty(stred) < p) dole = stred;
    else nahore = stred;
  }
  return (dole + nahore) / 2;
}

/** Hustota vody při 20 °C (kg/L). */
export const HUSTOTA_VODY_20 = 0.9982;
/** Relativní hustota etanolu 20/20 °C (ABW → ABV). */
export const HUSTOTA_ETANOLU_REL = 0.7907;
/** Hmotnost 1 objemu CO₂ v litru (g/L, CO₂ při 0 °C a 101,325 kPa). */
export const G_NA_OBJEM_CO2 = 1.976;

const ZDROJ_TABULKY = 'Tabulky extraktu (Plato), kubická aproximace polynomem SG → °P; obrácený výpočet je přesná inverze téhož polynomu.';

const hustotaZPlatoDef: Definice = {
  id: 'hustota_z_plato',
  nazev: 'Stupňovitost → relativní hustota',
  popis: 'Z extraktu v °P relativní hustotu (SG 20/20 °C) a hmotnost extraktu v hektolitru.',
  oblast: 'N',
  hledat: 'Plato hustota',
  vstupy: [{ id: 'p', nazev: 'Extrakt', jednotka: '°P', min: -2, max: 35, vychozi: 12, krok: 0.1 }],
  spocitej: ({ p }) => {
    const sg = hustotaZPlato(p);
    return {
      vstupy: [vel('Extrakt', p, '°P', 2)],
      vzorec: ['°P = −616,868 + 1111,14·SG − 630,272·SG² + 135,997·SG³', 'SG = inverze vzorce (půlením intervalu)', 'extrakt v 1 hl = 100 L · SG · 0,9982 kg/L · °P / 100'],
      mezikroky: [],
      vysledky: [vel('Relativní hustota (SG 20/20 °C)', sg, '', 5), vel('Extrakt v 1 hl', 100 * sg * HUSTOTA_VODY_20 * p / 100, 'kg', 3)],
      predpoklady: ['Měřeno při 20 °C (hustoměr nebo denzitometr kalibrovaný na 20 °C).', '°P = % hmotnostní extraktu (sacharózový ekvivalent).'],
      rozsah: '−2 až 35 °P',
      nejistota: 'Aproximace tabulek extraktu — odchylka řádově ±0,02 °P (±0,0001 SG).',
      zdroj: ZDROJ_TABULKY,
    };
  },
};

const platoZHustotyDef: Definice = {
  id: 'plato_z_hustoty',
  nazev: 'Relativní hustota → stupňovitost',
  popis: 'Z naměřené relativní hustoty (SG 20/20 °C) extrakt v °P.',
  oblast: 'N',
  hledat: 'Plato hustota',
  vstupy: [{ id: 'sg', nazev: 'Relativní hustota', jednotka: 'SG', min: 0.99, max: 1.15, vychozi: 1.048, krok: 0.001 }],
  spocitej: ({ sg }) => ({
    vstupy: [vel('Relativní hustota', sg, 'SG', 4)],
    vzorec: ['°P = −616,868 + 1111,14·SG − 630,272·SG² + 135,997·SG³'],
    mezikroky: [],
    vysledky: [vel('Extrakt', platoZHustoty(sg), '°P', 2)],
    predpoklady: ['Měřeno při 20 °C.', 'U piva s alkoholem vyjde zdánlivý extrakt (alkohol hustotu snižuje).'],
    rozsah: 'SG 0,990 až 1,150',
    nejistota: 'Aproximace tabulek extraktu — odchylka řádově ±0,02 °P.',
    zdroj: ZDROJ_TABULKY,
  }),
};

// --- Alkohol a prokvašení (Balling) --------------------------------------------

const alkoholDef: Definice = {
  id: 'alkohol',
  nazev: 'Alkohol a prokvašení (Balling)',
  popis: 'Z původního a zdánlivého extraktu skutečný extrakt, alkohol (% hm. i obj.) a prokvašení.',
  oblast: 'H',
  hledat: 'Balling skutečný extrakt alkohol',
  vstupy: [
    { id: 'oe', nazev: 'Původní extrakt (stupňovitost mladiny)', jednotka: '°P', min: 2, max: 30, vychozi: 12, krok: 0.1 },
    { id: 'ae', nazev: 'Zdánlivý extrakt piva', jednotka: '°P', min: -2, max: 25, vychozi: 3, krok: 0.1 },
  ],
  spocitej: ({ oe, ae }) => {
    if (ae >= oe) throw new MimoRozsah('Zdánlivý extrakt piva musí být menší než původní extrakt mladiny.');
    const re = 0.1808 * oe + 0.8192 * ae;
    const abw = (oe - re) / (2.0665 - 0.010665 * oe);
    const sgPiva = hustotaZPlato(ae);
    const abv = abw * sgPiva / HUSTOTA_ETANOLU_REL;
    return {
      vstupy: [vel('Původní extrakt', oe, '°P', 2), vel('Zdánlivý extrakt', ae, '°P', 2)],
      vzorec: [
        'skutečný extrakt SE = 0,1808·PE + 0,8192·ZE',
        'alkohol % hm. = (PE − SE) / (2,0665 − 0,010665·PE)',
        'alkohol % obj. = % hm. · SG piva / 0,7907',
        'zdánlivé prokvašení = (PE − ZE) / PE · 100; skutečné = (PE − SE) / PE · 100',
      ],
      mezikroky: [vel('Skutečný extrakt (SE)', re, '°P', 2), vel('Relativní hustota piva', sgPiva, 'SG', 5)],
      vysledky: [
        vel('Alkohol', abv, '% obj.', 2),
        vel('Alkohol', abw, '% hm.', 2),
        vel('Zdánlivé prokvašení', (oe - ae) / oe * 100, '%', 1),
        vel('Skutečné prokvašení', (oe - re) / oe * 100, '%', 1),
      ],
      predpoklady: ['Extrakty měřené při 20 °C.', 'Pivo bez CO₂ (odplyněné).', 'Hustota piva se bere ze zdánlivého extraktu.'],
      rozsah: 'Původní extrakt 2–30 °P, zdánlivý −2–25 °P a menší než původní',
      nejistota: 'Ballingovy vzorce jsou empirické; u běžných piv odchylka od destilace řádově ±0,1 % obj.',
      zdroj: 'C. J. N. Balling (1865) — vzorce pro skutečný extrakt a alkohol z původního a zdánlivého extraktu.',
    };
  },
};

// --- Ředění mladiny / piva -------------------------------------------------------

const redeniDef: Definice = {
  id: 'redeni',
  nazev: 'Ředění na cílovou stupňovitost',
  popis: 'Kolik vody přidat, aby mladina (pivo) měla cílový extrakt — hmotnostní bilance.',
  oblast: 'D',
  hledat: 'ředění mladiny stupňovitost',
  vstupy: [
    { id: 'v1', nazev: 'Objem', jednotka: 'hl', min: 0.01, max: 2000, vychozi: 10, krok: 0.1, napoveda: 'Při 20 °C' },
    { id: 'p1', nazev: 'Současný extrakt', jednotka: '°P', min: 1, max: 35, vychozi: 13, krok: 0.1 },
    { id: 'p2', nazev: 'Cílový extrakt', jednotka: '°P', min: 0.5, max: 35, vychozi: 12, krok: 0.1 },
  ],
  spocitej: ({ v1, p1, p2 }) => {
    if (p2 >= p1) throw new MimoRozsah('Cílový extrakt musí být nižší než současný (ředí se vodou).');
    const sg1 = hustotaZPlato(p1);
    const sg2 = hustotaZPlato(p2);
    const m1 = v1 * 100 * sg1 * HUSTOTA_VODY_20;
    const mVody = m1 * (p1 / p2 - 1);
    const vVody = mVody / HUSTOTA_VODY_20;
    const v2 = (m1 + mVody) / (sg2 * HUSTOTA_VODY_20);
    return {
      vstupy: [vel('Objem', v1, 'hl', 2), vel('Současný extrakt', p1, '°P', 2), vel('Cílový extrakt', p2, '°P', 2)],
      vzorec: [
        'hmotnost m₁ = V₁ · SG₁ · 0,9982 kg/L',
        'extrakt se nemění: m₁ · P₁ = (m₁ + m_vody) · P₂ → m_vody = m₁ · (P₁/P₂ − 1)',
        'výsledný objem V₂ = (m₁ + m_vody) / (SG₂ · 0,9982)',
      ],
      mezikroky: [vel('SG současné', sg1, '', 5), vel('SG cílové', sg2, '', 5), vel('Hmotnost', m1, 'kg', 1), vel('Extrakt', m1 * p1 / 100, 'kg', 2)],
      vysledky: [vel('Přidat vody', vVody, 'L', 1), vel('Výsledný objem', v2, 'L', 1)],
      predpoklady: ['Objemy při 20 °C, voda 20 °C (0,9982 kg/L).', 'Smršťování při mísení se zanedbává.', 'Ředící voda bez extraktu.'],
      rozsah: 'Objem 0,01–2000 hl, extrakt 0,5–35 °P, cíl nižší než současný',
      nejistota: 'Podle přesnosti měření extraktu (±0,1 °P ≈ ±0,8 % vody na každý °P rozdílu).',
      zdroj: 'Hmotnostní bilance extraktu (°P = % hm.); hustota z tabulek extraktu (Plato).',
    };
  },
};

// --- Varní výtěžek -------------------------------------------------------------------

const vytezekDef: Definice = {
  id: 'varni_vytezek',
  nazev: 'Varní výtěžek',
  popis: 'Kolik procent sypání přešlo do mladiny jako extrakt.',
  oblast: 'E',
  hledat: 'varní výtěžek',
  vstupy: [
    { id: 'v', nazev: 'Objem horké mladiny (vyrážecí)', jednotka: 'hl', min: 0.01, max: 2000, vychozi: 10, krok: 0.1 },
    { id: 'e', nazev: 'Extrakt mladiny', jednotka: '°P', min: 1, max: 35, vychozi: 12, krok: 0.1 },
    { id: 's', nazev: 'Sypání (slad a suroviny)', jednotka: 'kg', min: 0.1, max: 200000, vychozi: 180, krok: 1 },
    { id: 'k', nazev: 'Korekce objemu', jednotka: '', min: 0.9, max: 1, vychozi: 0.96, krok: 0.01, napoveda: '0,96 pro horkou mladinu, 1,00 pro objem změřený při 20 °C' },
  ],
  spocitej: ({ v, e, s, k }) => {
    const d = hustotaZPlato(e);
    const extrakt = v * 100 * k * d * e / 100;
    return {
      vstupy: [vel('Objem horké mladiny', v, 'hl', 2), vel('Extrakt mladiny', e, '°P', 2), vel('Sypání', s, 'kg', 1), vel('Korekce objemu', k, '', 2)],
      vzorec: ['extrakt v mladině = V(L) · korekce · SG · °P / 100', 'varní výtěžek = extrakt v mladině / sypání · 100'],
      mezikroky: [vel('Relativní hustota mladiny', d, 'SG', 5)],
      vysledky: [vel('Varní výtěžek', extrakt / s * 100, '%', 1), vel('Extrakt v mladině', extrakt, 'kg', 1)],
      predpoklady: [
        'Korekce 0,96 přepočítává horký objem (≈ 100 °C) na objem při 20 °C a zohledňuje zhruba i chmelové mláto.',
        'SG a hmotnost extraktu se berou při 20 °C (hustota se násobí bez korekce na vodu, jak je v pivovarské praxi zvykem).',
      ],
      rozsah: 'Objem 0,01–2000 hl, extrakt 1–35 °P, sypání 0,1–200 000 kg',
      nejistota: 'Hlavně měření objemu horké mladiny (±1 % objemu = ±1 % výtěžku).',
      zdroj: 'Vzorec varního výtěžku pivovarské praxe (objem vyrážecí mladiny × 0,96 × SG × extrakt / sypání).',
    };
  },
};

// --- Hořkost (Tinseth) -----------------------------------------------------------------

function vyuzitiTinseth(sg: number, minut: number): { bigness: number; var: number } {
  return { bigness: 1.65 * 0.000125 ** (sg - 1), var: (1 - Math.exp(-0.04 * minut)) / 4.15 };
}

const ibuDef: Definice = {
  id: 'ibu_tinseth',
  nazev: 'Hořkost IBU (Tinseth)',
  popis: 'Odhad hořkosti piva z chmelových dávek, doby varu a stupňovitosti mladiny.',
  oblast: 'F',
  hledat: 'hořkost IBU chmelení',
  vstupy: [
    { id: 'v', nazev: 'Objem mladiny (vyrážecí)', jednotka: 'L', min: 1, max: 200000, vychozi: 1000, krok: 1 },
    { id: 'p', nazev: 'Extrakt mladiny při varu', jednotka: '°P', min: 0, max: 30, vychozi: 12, krok: 0.1 },
  ],
  seznam: {
    id: 'davky',
    nazev: 'Chmelové dávky',
    minRadku: 1,
    maxRadku: 8,
    polozky: [
      { id: 'g', nazev: 'Hmotnost chmele', jednotka: 'g', min: 0, max: 200000, vychozi: 2000, krok: 10 },
      { id: 'alfa', nazev: 'Alfa hořké kyseliny', jednotka: '%', min: 0.5, max: 25, vychozi: 4, krok: 0.1 },
      { id: 'min', nazev: 'Doba varu', jednotka: 'min', min: 0, max: 120, vychozi: 70, krok: 5 },
    ],
    vychozi: [{ g: 2000, alfa: 4, min: 70 }],
  },
  spocitej: ({ v, p }, r: Radky) => {
    const sg = hustotaZPlato(p);
    const mezikroky: Velicina[] = [vel('Relativní hustota mladiny', sg, 'SG', 5)];
    let celkem = 0;
    (r.davky ?? []).forEach((d: Hodnoty, i) => {
      const u = vyuzitiTinseth(sg, d.min);
      const mgL = d.alfa / 100 * d.g * 1000 / v;
      const ibu = u.bigness * u.var * mgL;
      celkem += ibu;
      mezikroky.push(vel(`Dávka ${i + 1}: využití`, u.bigness * u.var * 100, '%', 1), vel(`Dávka ${i + 1}: hořkost`, ibu, 'IBU', 1));
    });
    return {
      vstupy: [vel('Objem mladiny', v, 'L', 0), vel('Extrakt mladiny', p, '°P', 2),
        ...(r.davky ?? []).flatMap((d: Hodnoty, i) => [vel(`Dávka ${i + 1}: chmel`, d.g, 'g', 0), vel(`Dávka ${i + 1}: alfa`, d.alfa, '%', 1), vel(`Dávka ${i + 1}: var`, d.min, 'min', 0)])],
      vzorec: [
        'IBU = využití · alfa (mg/L); alfa (mg/L) = alfa % / 100 · g · 1000 / V(L)',
        'využití = 1,65 · 0,000125^(SG − 1) · (1 − e^(−0,04 · min)) / 4,15',
      ],
      mezikroky,
      vysledky: [vel('Hořkost', celkem, 'IBU', 1)],
      predpoklady: ['Pelety i hlávkový chmel stejně (bez přirážky za pelety).', 'Chmel ve vířivé kádi a za studena se nepočítá (doba varu 0 = 0 IBU).'],
      rozsah: 'Doba varu 0–120 min, extrakt mladiny 0–30 °P, alfa 0,5–25 %',
      nejistota: 'Empirický odhad — skutečná hořkost v pivu se liší podle varny, vířivé kádě a kvašení, běžně o ±10–20 %. Rozhoduje laboratoř.',
      zdroj: 'G. Tinseth: vzorec využití chmele (Hop utilization, 1997).',
    };
  },
};

// --- Barva (Morey) ----------------------------------------------------------------------

const barvaDef: Definice = {
  id: 'barva_morey',
  nazev: 'Barva piva (Morey)',
  popis: 'Odhad barvy piva v EBC z barvy a množství sladů.',
  oblast: 'N',
  hledat: 'barva piva EBC',
  vstupy: [{ id: 'v', nazev: 'Objem mladiny (vyrážecí)', jednotka: 'L', min: 1, max: 200000, vychozi: 1000, krok: 1 }],
  seznam: {
    id: 'slady',
    nazev: 'Slady',
    minRadku: 1,
    maxRadku: 10,
    polozky: [
      { id: 'kg', nazev: 'Hmotnost sladu', jednotka: 'kg', min: 0, max: 100000, vychozi: 180, krok: 1 },
      { id: 'ebc', nazev: 'Barva sladu', jednotka: 'EBC', min: 1, max: 3000, vychozi: 7, krok: 0.5 },
    ],
    vychozi: [{ kg: 180, ebc: 7 }],
  },
  spocitej: ({ v }, r: Radky) => {
    let mcu = 0;
    (r.slady ?? []).forEach((s: Hodnoty) => {
      const lovibond = (s.ebc / 1.97 + 0.76) / 1.3546;
      mcu += s.kg * 2.20462 * lovibond;
    });
    mcu /= v / 3.78541;
    const srm = 1.4922 * mcu ** 0.6859;
    if (srm > 50) throw new MimoRozsah('Moreyho vzorec platí do 50 SRM (≈ 98 EBC). Barvu tmavšího piva urči v laboratoři.');
    return {
      vstupy: [vel('Objem mladiny', v, 'L', 0), ...(r.slady ?? []).flatMap((s: Hodnoty, i) => [vel(`Slad ${i + 1}`, s.kg, 'kg', 1), vel(`Slad ${i + 1}: barva`, s.ebc, 'EBC', 1)])],
      vzorec: [
        '°L sladu = (EBC / 1,97 + 0,76) / 1,3546',
        'MCU = Σ(lb · °L) / gal = Σ(kg · 2,20462 · °L) / (L / 3,78541)',
        'SRM = 1,4922 · MCU^0,6859; EBC = SRM · 1,97',
      ],
      mezikroky: [vel('MCU', mcu, '', 2)],
      vysledky: [vel('Barva piva', srm * 1.97, 'EBC', 1), vel('Barva piva', srm, 'SRM', 1)],
      predpoklady: ['Barva hotového piva po kvašení a filtraci (Morey ji odvodil na hotových pivech).', 'Barva při varu (karamelizace, dekokce) se nepočítá.'],
      rozsah: 'Do 50 SRM (≈ 98 EBC)',
      nejistota: 'Odhad — dekokce, délka varu a filtrace barvu mění, běžně o několik EBC. Rozhoduje laboratoř.',
      zdroj: 'D. Morey: vzorec pro barvu piva ze sladů (Morey equation).',
    };
  },
};

// --- Vystírka ---------------------------------------------------------------------------

const vystirkaDef: Definice = {
  id: 'vystirka_teplota',
  nazev: 'Teplota vody pro vystírku',
  popis: 'Jak teplou vodu použít, aby vystírka měla cílovou teplotu.',
  oblast: 'D',
  hledat: 'vystírání teplota vody',
  vstupy: [
    { id: 'kg', nazev: 'Šrot (slad)', jednotka: 'kg', min: 1, max: 100000, vychozi: 180, krok: 1 },
    { id: 'l', nazev: 'Nálevová voda', jednotka: 'L', min: 1, max: 500000, vychozi: 540, krok: 1 },
    { id: 'ts', nazev: 'Teplota šrotu', jednotka: '°C', min: -10, max: 40, vychozi: 18, krok: 0.5 },
    { id: 'tc', nazev: 'Cílová teplota vystírky', jednotka: '°C', min: 30, max: 80, vychozi: 52, krok: 0.5 },
  ],
  spocitej: ({ kg, l, ts, tc }) => {
    const r = l / kg;
    if (r < 1.5 || r > 6) throw new MimoRozsah(`Poměr vody a šrotu ${String(Math.round(r * 100) / 100).replace('.', ',')} L/kg je mimo rozsah vzorce (1,5–6 L/kg).`);
    const tw = 0.41 / r * (tc - ts) + tc;
    return {
      vstupy: [vel('Šrot', kg, 'kg', 1), vel('Voda', l, 'L', 1), vel('Teplota šrotu', ts, '°C', 1), vel('Cílová teplota', tc, '°C', 1)],
      vzorec: ['poměr r = voda (L) / šrot (kg)', 'T vody = 0,41 / r · (T cílová − T šrotu) + T cílová'],
      mezikroky: [vel('Poměr voda : šrot', r, 'L/kg', 2)],
      vysledky: [vel('Teplota nálevové vody', tw, '°C', 1)],
      predpoklady: ['Měrné teplo šrotu ≈ 0,41 vody (konstanta vzorce pro L/kg).', 'Bez ztrát tepla do nádoby a potrubí — studenou nádobu je třeba předehřát nebo vodu zvýšit podle zkušenosti.'],
      rozsah: 'Poměr 1,5–6 L/kg, cíl 30–80 °C',
      nejistota: 'Podle teploty nádoby a vlhkosti šrotu běžně ±1–2 °C.',
      zdroj: 'J. Palmer: How to Brew — rovnice teploty nálevové vody (metrická konstanta 0,41).',
    };
  },
};

// --- CO₂ ------------------------------------------------------------------------------

/** Objemy CO₂ v rovnováze při teplotě (°C) a přetlaku (bar). */
export function objemyCo2(tC: number, pretlakBar: number): number {
  const psi = pretlakBar * 14.5038;
  const tF = tC * 9 / 5 + 32;
  return (psi + 14.695) * (0.01821 + 0.090115 * Math.exp(-(tF - 32) / 43.11)) - 0.003342;
}

const ZDROJ_CO2 = 'Regresní vzorec rovnovážné rozpustnosti CO₂ v pivu (tabulky Zahm & Nagel), přepočet z psi a °F.';

const co2Def: Definice = {
  id: 'co2_obsah',
  nazev: 'Obsah CO₂ při tlaku a teplotě',
  popis: 'Kolik CO₂ se v pivu ustálí při daném přetlaku v tanku a teplotě.',
  oblast: 'I',
  hledat: 'oxid uhličitý sycení tlak',
  vstupy: [
    { id: 't', nazev: 'Teplota piva', jednotka: '°C', min: -2, max: 25, vychozi: 2, krok: 0.5 },
    { id: 'p', nazev: 'Přetlak v tanku', jednotka: 'bar', min: 0, max: 4, vychozi: 1, krok: 0.05 },
  ],
  spocitej: ({ t, p }) => {
    const obj = objemyCo2(t, p);
    return {
      vstupy: [vel('Teplota', t, '°C', 1), vel('Přetlak', p, 'bar', 2)],
      vzorec: [
        'objemy CO₂ = (psi + 14,695) · (0,01821 + 0,090115 · e^(−(°F − 32) / 43,11)) − 0,003342',
        'psi = bar · 14,5038; °F = °C · 9/5 + 32; g/L = objemy · 1,976',
      ],
      mezikroky: [vel('Objemy CO₂', obj, 'vol', 2)],
      vysledky: [vel('CO₂ v pivu', obj * G_NA_OBJEM_CO2, 'g/L', 2), vel('CO₂', obj, 'objemů', 2)],
      predpoklady: ['Rovnovážný stav — pivo pod tlakem dost dlouho (sycení trvá hodiny až dny).', 'Tlak je přetlak nad atmosférou (manometr).'],
      rozsah: 'Teplota −2 až 25 °C, přetlak 0–4 bar',
      nejistota: 'Regrese tabulek, v rozsahu řádově ±0,05 objemu (±0,1 g/L).',
      zdroj: ZDROJ_CO2,
    };
  },
};

const tlakDef: Definice = {
  id: 'co2_tlak',
  nazev: 'Přetlak pro cílový obsah CO₂',
  popis: 'Jaký přetlak nastavit, aby pivo při dané teplotě mělo cílový obsah CO₂.',
  oblast: 'I',
  hledat: 'oxid uhličitý sycení tlak',
  vstupy: [
    { id: 't', nazev: 'Teplota piva', jednotka: '°C', min: -2, max: 25, vychozi: 4, krok: 0.5 },
    { id: 'g', nazev: 'Cílový obsah CO₂', jednotka: 'g/L', min: 2, max: 10, vychozi: 5, krok: 0.1 },
  ],
  spocitej: ({ t, g }) => {
    const cil = g / G_NA_OBJEM_CO2;
    if (objemyCo2(t, 0) > cil) throw new MimoRozsah('Takové pivo má víc CO₂ už bez přetlaku — cíl je při téhle teplotě příliš nízký.');
    if (objemyCo2(t, 4) < cil) throw new MimoRozsah('Potřebný přetlak by byl přes 4 bar — mimo rozsah vzorce (zvyš cíl rozumně nebo sniž teplotu).');
    let dole = 0;
    let nahore = 4;
    for (let i = 0; i < 100; i += 1) {
      const stred = (dole + nahore) / 2;
      if (objemyCo2(t, stred) < cil) dole = stred;
      else nahore = stred;
    }
    const p = (dole + nahore) / 2;
    return {
      vstupy: [vel('Teplota', t, '°C', 1), vel('Cílový obsah CO₂', g, 'g/L', 2)],
      vzorec: ['cíl v objemech = g/L / 1,976', 'přetlak = inverze vzorce objemů CO₂ (půlením intervalu 0–4 bar)'],
      mezikroky: [vel('Cíl', cil, 'objemů', 2)],
      vysledky: [vel('Přetlak', p, 'bar', 2)],
      predpoklady: ['Rovnovážný stav — pivo pod tlakem dost dlouho.', 'Přetlak nad atmosférou (manometr).'],
      rozsah: 'Teplota −2 až 25 °C, cíl 2–10 g/L, přetlak 0–4 bar',
      nejistota: 'Regrese tabulek, řádově ±0,05 bar.',
      zdroj: ZDROJ_CO2,
    };
  },
};

/** Katalog v pořadí, v jakém ho ukazuje Výpočtová laboratoř. */
export const VYPOCTY: readonly Definice[] = [
  hustotaZPlatoDef, platoZHustotyDef, alkoholDef, redeniDef, vytezekDef, vystirkaDef, ibuDef, barvaDef, co2Def, tlakDef,
];

export function najdiVypocet(id: unknown): Definice | null {
  return typeof id === 'string' ? VYPOCTY.find((d) => d.id === id) ?? null : null;
}
