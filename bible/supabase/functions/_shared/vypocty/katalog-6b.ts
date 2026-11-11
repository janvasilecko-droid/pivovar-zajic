// 🧮 Katalog výpočtů bible — etapa 6b: chlazení a výměníky, voda a pH,
// hydraulika a čerpadla, CIP, energie, ekonomika, scezování, kvašení, dokvašení.
// ---------------------------------------------------------------------------
// Stejná pravidla jako 6a (katalog.ts): každý výpočet ukáže vstupy, vzorec,
// mezikroky, předpoklady, rozsah platnosti, nejistotu a zdroj; vstup mimo rozsah
// odmítne. Kde vzorec potřebuje materiálovou hodnotu, kterou nejde poctivě
// odvodit (měrné teplo mladiny, součinitel prostupu tepla, sazba daně), zadává
// ji člověk — s výchozí hodnotou a nápovědou, ne potichu natvrdo.
// Testy: vypocty-6b.test.ts, hodnoty přepočtené nezávisle (Python).
import { MimoRozsah, vel, type Definice } from './zaklad.ts';
import { G_NA_OBJEM_CO2, HUSTOTA_VODY_20, hustotaZPlato, objemyCo2 } from './fyzika.ts';

/** Měrná tepelná kapacita vody (kJ/(kg·K)), průměr pro 0–100 °C. */
export const CP_VODY = 4.186;
/** Výparné teplo vody při 100 °C (kJ/kg). */
export const VYPARNE_TEPLO = 2257;
/** Tíhové zrychlení (m/s²). */
export const G = 9.80665;

const cesky = (n: number, mist = 1) => String(Math.round(n * 10 ** mist) / 10 ** mist).replace('.', ',');

/** Hmotnost kapaliny (kg) z objemu v hl a extraktu v °P (hustota při 20 °C). */
function hmotnost(hl: number, p: number): { kg: number; hustota: number } {
  const hustota = hustotaZPlato(p) * HUSTOTA_VODY_20;
  return { kg: hl * 100 * hustota, hustota };
}

// --- G: Chlazení mladiny a výměníky ------------------------------------------

const chlazeniDef: Definice = {
  id: 'chlazeni_mladiny',
  nazev: 'Chlazení mladiny: teplo a chladicí voda',
  popis: 'Kolik tepla odvést, jaký výkon chlazení a kolik chladicí vody spotřebuje zchlazení mladiny.',
  oblast: 'G',
  hledat: 'chlazení mladiny výměník',
  vstupy: [
    { id: 'v', nazev: 'Objem mladiny (při 20 °C)', jednotka: 'hl', min: 0.1, max: 2000, vychozi: 10, krok: 0.1 },
    { id: 'p', nazev: 'Extrakt mladiny', jednotka: '°P', min: 0, max: 30, vychozi: 12, krok: 0.1 },
    { id: 't1', nazev: 'Teplota mladiny před chlazením', jednotka: '°C', min: 20, max: 100, vychozi: 95, krok: 1 },
    { id: 't2', nazev: 'Teplota mladiny po chlazení', jednotka: '°C', min: 0, max: 40, vychozi: 8, krok: 0.5 },
    { id: 'cm', nazev: 'Měrné teplo mladiny', jednotka: 'kJ/(kg·K)', min: 3.5, max: 4.2, vychozi: 3.9, krok: 0.01, napoveda: 'Voda 4,19; mladina 12 °P zhruba 3,9; čím víc extraktu, tím méně.' },
    { id: 'tv1', nazev: 'Chladicí voda na vstupu', jednotka: '°C', min: 0, max: 30, vychozi: 2, krok: 0.5 },
    { id: 'tv2', nazev: 'Chladicí voda na výstupu', jednotka: '°C', min: 5, max: 99, vychozi: 80, krok: 1 },
    { id: 'min', nazev: 'Doba chlazení', jednotka: 'min', min: 5, max: 600, vychozi: 60, krok: 5 },
  ],
  spocitej: ({ v, p, t1, t2, cm, tv1, tv2, min }) => {
    if (t2 >= t1) throw new MimoRozsah('Teplota po chlazení musí být nižší než před chlazením.');
    if (tv2 <= tv1) throw new MimoRozsah('Chladicí voda se musí ohřát — výstupní teplota musí být vyšší než vstupní.');
    if (tv1 >= t2) throw new MimoRozsah('Chladicí voda na vstupu musí být studenější než mladina po chlazení — jinak ji na tu teplotu nezchladí.');
    if (tv2 >= t1) throw new MimoRozsah('Chladicí voda nemůže odcházet teplejší, než přitéká mladina.');
    const { kg, hustota } = hmotnost(v, p);
    const q = kg * cm * (t1 - t2);
    const sekund = min * 60;
    const voda = q / (CP_VODY * (tv2 - tv1));
    return {
      vstupy: [vel('Objem mladiny', v, 'hl', 1), vel('Extrakt', p, '°P', 1), vel('Mladina', t1, '°C', 0), vel('Po chlazení', t2, '°C', 1),
        vel('Měrné teplo mladiny', cm, 'kJ/(kg·K)', 2), vel('Voda na vstupu', tv1, '°C', 1), vel('Voda na výstupu', tv2, '°C', 0), vel('Doba chlazení', min, 'min', 0)],
      vzorec: [
        'm = V · ρ; ρ = SG(°P) · 0,9982 kg/L',
        'Q = m · c(mladiny) · (T před − T po)',
        'výkon = Q / doba; voda = Q / (4,186 · (T vody ven − T vody dovnitř))',
      ],
      mezikroky: [vel('Hustota mladiny', hustota, 'kg/L', 4), vel('Hmotnost mladiny', kg, 'kg', 0), vel('Teplo k odvedení', q / 1000, 'MJ', 1),
        vel('Průtok mladiny', v * 100 / (min / 60), 'L/h', 0)],
      vysledky: [vel('Teplo k odvedení', q / 3600, 'kWh', 1), vel('Průměrný výkon chlazení', q / sekund, 'kW', 1),
        vel('Chladicí voda', voda, 'L', 0), vel('Průtok chladicí vody', voda / (min / 60), 'L/h', 0)],
      predpoklady: ['Ztráty tepla do okolí se nepočítají — skutečná spotřeba vody bývá o pár procent vyšší.', 'Hustota chladicí vody 1 kg/L; měrné teplo mladiny je zadané (závisí na extraktu).', 'Objem mladiny je studený (20 °C).'],
      rozsah: 'Mladina 20–100 °C → 0–40 °C, chladicí voda 0–30 °C na vstupu, výstup nad vstupem a pod teplotou mladiny',
      nejistota: 'Měrné teplo mladiny ±3 %; výsledek tím řádově ±3–5 %.',
      zdroj: 'Kalorimetrická rovnice (bilance tepla Q = m·c·ΔT); měrné teplo vody 4,186 kJ/(kg·K).',
    };
  },
};

const vymenikDef: Definice = {
  id: 'vymenik_plocha',
  nazev: 'Plocha výměníku (protiproud)',
  popis: 'Potřebná teplosměnná plocha deskového výměníku ze středního logaritmického teplotního rozdílu.',
  oblast: 'G',
  hledat: 'deskový výměník plocha prostup tepla',
  vstupy: [
    { id: 'w', nazev: 'Výkon (předané teplo)', jednotka: 'kW', min: 0.1, max: 10000, vychozi: 50, krok: 0.5 },
    { id: 'th1', nazev: 'Teplá strana — vstup', jednotka: '°C', min: 0, max: 150, vychozi: 95, krok: 1 },
    { id: 'th2', nazev: 'Teplá strana — výstup', jednotka: '°C', min: -10, max: 150, vychozi: 10, krok: 0.5 },
    { id: 'tc1', nazev: 'Studená strana — vstup', jednotka: '°C', min: -10, max: 150, vychozi: 2, krok: 0.5 },
    { id: 'tc2', nazev: 'Studená strana — výstup', jednotka: '°C', min: -10, max: 150, vychozi: 80, krok: 1 },
    { id: 'u', nazev: 'Součinitel prostupu tepla U', jednotka: 'W/(m²·K)', min: 100, max: 10000, vychozi: 2500, krok: 50, napoveda: 'Deskový výměník mladina–voda běžně 2000–4000; podle výrobce desek.' },
  ],
  spocitej: ({ w, th1, th2, tc1, tc2, u }) => {
    if (th2 >= th1) throw new MimoRozsah('Teplá strana se musí ochlazovat (výstup nižší než vstup).');
    if (tc2 <= tc1) throw new MimoRozsah('Studená strana se musí ohřívat (výstup vyšší než vstup).');
    const d1 = th1 - tc2;
    const d2 = th2 - tc1;
    if (d1 <= 0 || d2 <= 0) throw new MimoRozsah('Teploty se kříží — v protiproudu musí být teplá strana na obou koncích teplejší než studená.');
    const lmtd = Math.abs(d1 - d2) < 1e-9 ? d1 : (d1 - d2) / Math.log(d1 / d2);
    const plocha = (w * 1000) / (u * lmtd);
    return {
      vstupy: [vel('Výkon', w, 'kW', 1), vel('Teplá vstup', th1, '°C', 1), vel('Teplá výstup', th2, '°C', 1), vel('Studená vstup', tc1, '°C', 1),
        vel('Studená výstup', tc2, '°C', 1), vel('U', u, 'W/(m²·K)', 0)],
      vzorec: ['ΔT₁ = T teplá vstup − T studená výstup; ΔT₂ = T teplá výstup − T studená vstup', 'ΔT_ln = (ΔT₁ − ΔT₂) / ln(ΔT₁ / ΔT₂)', 'A = výkon / (U · ΔT_ln)'],
      mezikroky: [vel('ΔT₁ (teplý konec)', d1, 'K', 1), vel('ΔT₂ (studený konec)', d2, 'K', 1), vel('Střední logaritmický rozdíl', lmtd, 'K', 2)],
      vysledky: [vel('Potřebná plocha', plocha, 'm²', 2)],
      predpoklady: ['Čistý protiproud (deskový výměník tak pracuje).', 'U je zadané — závisí na deskách, rychlostech a zanesení.', 'Bez rezervy na zanesení; výrobci běžně přidávají 10–25 %.'],
      rozsah: 'Teploty −10 až 150 °C bez křížení, U 100–10 000 W/(m²·K)',
      nejistota: 'Určuje ji hlavně U (±20–30 %) — plocha je orientační, rozhoduje výpočet výrobce.',
      zdroj: 'Rovnice výměníku Q = U·A·ΔT_ln se středním logaritmickým teplotním rozdílem pro protiproud.',
    };
  },
};

// --- B: Voda a pH --------------------------------------------------------------

/** 1 °dH = 10 mg CaO/L = 0,17832 mmol/L → 7,147 mg Ca/L, 4,334 mg Mg/L; 1 mmol/L alkality = 2,8 °dH. */
const MG_CA_NA_DH = 7.147;
const MG_MG_NA_DH = 4.334;
const DH_NA_MMOL_ALK = 2.8;

const zbytkovaAlkalitaDef: Definice = {
  id: 'zbytkova_alkalita',
  nazev: 'Zbytková alkalita vody (Kolbach)',
  popis: 'Z rozboru vody zbytková alkalita — jak voda táhne pH rmutu nahoru (kladná) nebo dolů (záporná).',
  oblast: 'B',
  hledat: 'zbytková alkalita Kolbach',
  vstupy: [
    { id: 'alk', nazev: 'Alkalita (KNK 4,5)', jednotka: 'mmol/L', min: 0, max: 15, vychozi: 2.5, krok: 0.05, napoveda: 'Z rozboru vody: kyselinová neutralizační kapacita do pH 4,5 (m-hodnota).' },
    { id: 'ca', nazev: 'Vápník Ca²⁺', jednotka: 'mg/L', min: 0, max: 500, vychozi: 60, krok: 1 },
    { id: 'mg', nazev: 'Hořčík Mg²⁺', jednotka: 'mg/L', min: 0, max: 200, vychozi: 15, krok: 1 },
  ],
  spocitej: ({ alk, ca, mg }) => {
    const kh = alk * DH_NA_MMOL_ALK;
    const cah = ca / MG_CA_NA_DH;
    const mgh = mg / MG_MG_NA_DH;
    const ra = kh - (cah / 3.5 + mgh / 7);
    return {
      vstupy: [vel('Alkalita', alk, 'mmol/L', 2), vel('Vápník', ca, 'mg/L', 0), vel('Hořčík', mg, 'mg/L', 0)],
      vzorec: ['uhličitanová tvrdost KH (°dH) = alkalita (mmol/L) · 2,8', 'CaH = Ca / 7,147; MgH = Mg / 4,334 (°dH)', 'RA = KH − (CaH / 3,5 + MgH / 7)'],
      mezikroky: [vel('Alkalita (uhličitanová tvrdost)', kh, '°dH', 2), vel('Vápníková tvrdost', cah, '°dH', 2), vel('Hořčíková tvrdost', mgh, '°dH', 2)],
      vysledky: [vel('Zbytková alkalita', ra, '°dH', 2), vel('Zbytková alkalita', ra / DH_NA_MMOL_ALK, 'mmol/L', 2), vel('Celková tvrdost', cah + mgh, '°dH', 2)],
      predpoklady: ['Rozbor vody je aktuální a hodnoty jsou v mg/L iontu (ne jako CaCO₃).', 'RA ukazuje směr a sílu vlivu vody, pH rmutu ale určuje hlavně slad.'],
      rozsah: 'Alkalita 0–15 mmol/L, Ca 0–500 mg/L, Mg 0–200 mg/L',
      nejistota: 'Podle přesnosti rozboru vody, řádově ±0,3 °dH.',
      zdroj: 'P. Kolbach (1953): zbytková alkalita RA = KH − (CaH/3,5 + MgH/7) ve °dH; 1 °dH = 10 mg CaO/L.',
    };
  },
};

const KYSELINY: { nazev: string; mmolNaMl: number }[] = [
  // ρ · w · 1000 / M: mléčná 80 % (1,20 g/mL, 90,08 g/mol), fosforečná 75 % (1,579; 97,995) a 85 % (1,685)
  { nazev: 'Kyselina mléčná 80 %', mmolNaMl: (1.20 * 0.80 * 1000) / 90.08 },
  { nazev: 'Kyselina fosforečná 75 %', mmolNaMl: (1.579 * 0.75 * 1000) / 97.995 },
  { nazev: 'Kyselina fosforečná 85 %', mmolNaMl: (1.685 * 0.85 * 1000) / 97.995 },
];

const kyselinaDef: Definice = {
  id: 'kyselina_alkalita',
  nazev: 'Kyselina na snížení alkality vody',
  popis: 'Kolik kyseliny mléčné nebo fosforečné přidat, aby alkalita vody (typicky vyslazovací) klesla na cíl.',
  oblast: 'B',
  hledat: 'alkalita okyselení vody kyselina mléčná',
  vstupy: [
    { id: 'v', nazev: 'Objem vody', jednotka: 'L', min: 1, max: 200000, vychozi: 500, krok: 1 },
    { id: 'a1', nazev: 'Alkalita před úpravou', jednotka: 'mmol/L', min: 0, max: 15, vychozi: 3, krok: 0.05 },
    { id: 'a2', nazev: 'Cílová alkalita', jednotka: 'mmol/L', min: 0, max: 15, vychozi: 0.5, krok: 0.05 },
  ],
  spocitej: ({ v, a1, a2 }) => {
    if (a2 >= a1) throw new MimoRozsah('Cílová alkalita musí být nižší než současná.');
    const h = (a1 - a2) * v;
    return {
      vstupy: [vel('Objem vody', v, 'L', 0), vel('Alkalita před', a1, 'mmol/L', 2), vel('Cílová alkalita', a2, 'mmol/L', 2)],
      vzorec: ['H⁺ (mmol) = (alkalita před − cíl) · objem; HCO₃⁻ + H⁺ → CO₂ + H₂O', 'objem kyseliny (mL) = H⁺ / (ρ · w · 1000 / M)'],
      mezikroky: [vel('Potřeba H⁺', h, 'mmol', 0), ...KYSELINY.map((k) => vel(`${k.nazev}: obsah`, k.mmolNaMl, 'mmol/mL', 2))],
      vysledky: KYSELINY.map((k) => vel(k.nazev, h / k.mmolNaMl, 'mL', 0)),
      predpoklady: ['Kyselina mléčná je jednosytná; u fosforečné se při pH vody nad 4,5 počítá jen první proton.', 'Koncentrace a hustota podle obvyklého obchodního zboží — u jiné koncentrace přepočti.', 'Vzniklý CO₂ má z vody uniknout (zamíchat, nechat odvětrat).'],
      rozsah: 'Alkalita 0–15 mmol/L, cíl pod současnou hodnotou',
      nejistota: 'Podle skutečné koncentrace kyseliny a přesnosti rozboru, řádově ±5–10 %. Po úpravě změř alkalitu nebo pH.',
      zdroj: 'Neutralizace hydrogenuhličitanu (1 mmol/L alkality = 1 mmol/L H⁺); hustoty a koncentrace obchodních kyselin.',
    };
  },
};

// --- P: Potrubí a čerpadla --------------------------------------------------------

const potrubiDef: Definice = {
  id: 'potrubi_tlakova_ztrata',
  nazev: 'Rychlost a tlaková ztráta v potrubí',
  popis: 'Rychlost proudění, Reynoldsovo číslo a tlaková ztráta třením v rovném potrubí (s armaturami jako ekvivalentní délka).',
  oblast: 'P',
  hledat: 'tlaková ztráta potrubí rychlost proudění',
  vstupy: [
    { id: 'q', nazev: 'Průtok', jednotka: 'm³/h', min: 0.01, max: 1000, vychozi: 5, krok: 0.1 },
    { id: 'd', nazev: 'Vnitřní průměr potrubí', jednotka: 'mm', min: 5, max: 500, vychozi: 40, krok: 0.5 },
    { id: 'l', nazev: 'Délka (vč. ekvivalentní délky armatur)', jednotka: 'm', min: 0.1, max: 5000, vychozi: 30, krok: 0.5 },
    { id: 'rho', nazev: 'Hustota kapaliny', jednotka: 'kg/m³', min: 800, max: 1300, vychozi: 1040, krok: 1 },
    { id: 'mu', nazev: 'Dynamická viskozita', jednotka: 'mPa·s', min: 0.2, max: 100, vychozi: 1.5, krok: 0.1, napoveda: 'Voda 20 °C ≈ 1,0; studené pivo ≈ 1,5–2; horká mladina ≈ 0,5.' },
    { id: 'eps', nazev: 'Drsnost stěny', jednotka: 'mm', min: 0.0005, max: 3, vychozi: 0.015, krok: 0.001, napoveda: 'Nerezové potrubí ≈ 0,015; hadice ≈ 0,01; litina ≈ 0,25.' },
  ],
  spocitej: ({ q, d, l, rho, mu, eps }) => {
    const D = d / 1000;
    const prurez = Math.PI * D * D / 4;
    const v = q / 3600 / prurez;
    const re = rho * v * D / (mu / 1000);
    const relDrsnost = eps / d;
    let f: number;
    let rezim: string;
    if (re < 2300) {
      f = 64 / re;
      rezim = 'laminární (λ = 64 / Re)';
    } else if (re < 4000) {
      throw new MimoRozsah(`Reynoldsovo číslo ${cesky(re, 0)} je v přechodové oblasti (2300–4000) — tam tlakovou ztrátu spolehlivě spočítat nejde. Změň průměr nebo průtok.`);
    } else {
      if (relDrsnost > 0.01) throw new MimoRozsah('Poměr drsnosti a průměru je nad 0,01 — mimo rozsah vzorce Swamee–Jain.');
      f = 0.25 / Math.log10(relDrsnost / 3.7 + 5.74 / re ** 0.9) ** 2;
      rezim = 'turbulentní (Swamee–Jain)';
    }
    const dp = f * (l / D) * rho * v * v / 2;
    return {
      vstupy: [vel('Průtok', q, 'm³/h', 2), vel('Průměr', d, 'mm', 1), vel('Délka', l, 'm', 1), vel('Hustota', rho, 'kg/m³', 0),
        vel('Viskozita', mu, 'mPa·s', 2), vel('Drsnost', eps, 'mm', 3)],
      vzorec: [
        'v = Q / (π · D² / 4); Re = ρ · v · D / μ',
        'λ = 64 / Re (Re < 2300); λ = 0,25 / [log₁₀(ε/(3,7·D) + 5,74/Re^0,9)]² (Re ≥ 4000)',
        'Δp = λ · (L / D) · ρ · v² / 2; ztrátová výška h = Δp / (ρ · g)',
      ],
      mezikroky: [vel('Reynoldsovo číslo', re, '', 0), vel('Součinitel tření λ', f, '', 4)],
      vysledky: [vel('Rychlost proudění', v, 'm/s', 2), vel('Tlaková ztráta', dp / 1e5, 'bar', 3), vel('Tlaková ztráta', dp / 1000, 'kPa', 1),
        vel('Ztrátová výška', dp / (rho * G), 'm', 2)],
      predpoklady: [`Proudění ${rezim}.`, 'Plně zaplněné kruhové potrubí, ustálené proudění, newtonská kapalina.', 'Armatury a kolena jsou započtené v délce jako ekvivalentní délka; výškový rozdíl se nepočítá.'],
      rozsah: 'Re < 2300 nebo Re ≥ 4000; ε/D ≤ 0,01; průtok 0,01–1000 m³/h, průměr 5–500 mm',
      nejistota: 'Swamee–Jain se od Colebrookovy rovnice liší do ±1–2 %; větší nejistotu dává odhad drsnosti a armatur (±10–20 %).',
      zdroj: 'Darcy–Weisbachova rovnice; součinitel tření Swamee & Jain (1976), aproximace Colebrookovy rovnice; laminárně Hagen–Poiseuille (64/Re).',
    };
  },
};

const cerpadloDef: Definice = {
  id: 'cerpadlo_prikon',
  nazev: 'Příkon čerpadla',
  popis: 'Hydraulický výkon a příkon čerpadla z průtoku, dopravní výšky a účinnosti.',
  oblast: 'P',
  hledat: 'čerpadlo příkon dopravní výška',
  vstupy: [
    { id: 'q', nazev: 'Průtok', jednotka: 'm³/h', min: 0.01, max: 1000, vychozi: 5, krok: 0.1 },
    { id: 'h', nazev: 'Dopravní výška', jednotka: 'm', min: 0.1, max: 300, vychozi: 15, krok: 0.5, napoveda: 'Výškový rozdíl + ztrátová výška potrubí (výpočet „Rychlost a tlaková ztráta"); 1 bar ≈ 10 m vody.' },
    { id: 'rho', nazev: 'Hustota kapaliny', jednotka: 'kg/m³', min: 800, max: 1300, vychozi: 1040, krok: 1 },
    { id: 'eta', nazev: 'Účinnost čerpadla', jednotka: '%', min: 10, max: 95, vychozi: 55, krok: 1, napoveda: 'Z charakteristiky čerpadla; malá odstředivá čerpadla 40–65 %.' },
  ],
  spocitej: ({ q, h, rho, eta }) => {
    const ph = rho * G * (q / 3600) * h;
    return {
      vstupy: [vel('Průtok', q, 'm³/h', 2), vel('Dopravní výška', h, 'm', 1), vel('Hustota', rho, 'kg/m³', 0), vel('Účinnost', eta, '%', 0)],
      vzorec: ['P hydraulický = ρ · g · Q · H', 'P příkon = P hydraulický / η'],
      mezikroky: [vel('Hydraulický výkon', ph / 1000, 'kW', 3), vel('Tlak odpovídající výšce', rho * G * h / 1e5, 'bar', 2)],
      vysledky: [vel('Příkon na hřídeli', ph / (eta / 100) / 1000, 'kW', 2)],
      predpoklady: ['Účinnost čerpadla v daném pracovním bodě; účinnost motoru se nepočítá (elektrický příkon je o 10–20 % vyšší).'],
      rozsah: 'Průtok 0,01–1000 m³/h, výška 0,1–300 m, účinnost 10–95 %',
      nejistota: 'Dané hlavně účinností z charakteristiky (±5–10 %).',
      zdroj: 'Výkon čerpadla P = ρ·g·Q·H / η.',
    };
  },
};

// --- L: CIP -------------------------------------------------------------------------

const cipDef: Definice = {
  id: 'cip_roztok',
  nazev: 'CIP: pracovní roztok z koncentrátu',
  popis: 'Kolik koncentrátu (louhu, kyseliny) a vody na pracovní roztok o dané koncentraci.',
  oblast: 'L',
  hledat: 'CIP louh koncentrace roztoku sanitace',
  vstupy: [
    { id: 'v', nazev: 'Objem pracovního roztoku', jednotka: 'L', min: 1, max: 200000, vychozi: 500, krok: 1 },
    { id: 'c', nazev: 'Cílová koncentrace', jednotka: '% hm.', min: 0.05, max: 20, vychozi: 2, krok: 0.05 },
    { id: 'ck', nazev: 'Koncentrace koncentrátu', jednotka: '% hm.', min: 1, max: 100, vychozi: 50, krok: 0.5, napoveda: 'Z technického listu (např. louh NaOH 50 %).' },
    { id: 'rk', nazev: 'Hustota koncentrátu', jednotka: 'kg/L', min: 0.7, max: 2.2, vychozi: 1.52, krok: 0.01, napoveda: 'NaOH 50 % ≈ 1,52; HNO₃ 53 % ≈ 1,33; H₃PO₄ 75 % ≈ 1,58.' },
    { id: 'rr', nazev: 'Hustota pracovního roztoku', jednotka: 'kg/L', min: 0.9, max: 1.3, vychozi: 1.02, krok: 0.005, napoveda: 'Zředěné roztoky kolem 1,00–1,05 (louh 2 % ≈ 1,02).' },
  ],
  spocitej: ({ v, c, ck, rk, rr }) => {
    if (c >= ck) throw new MimoRozsah('Cílová koncentrace musí být nižší než koncentrace koncentrátu.');
    const mRoztoku = v * rr;
    const mCista = mRoztoku * c / 100;
    const mKonc = mCista / (ck / 100);
    return {
      vstupy: [vel('Objem roztoku', v, 'L', 0), vel('Cílová koncentrace', c, '% hm.', 2), vel('Koncentrát', ck, '% hm.', 1),
        vel('Hustota koncentrátu', rk, 'kg/L', 2), vel('Hustota roztoku', rr, 'kg/L', 3)],
      vzorec: ['m roztoku = V · ρ roztoku; m účinné látky = m roztoku · c', 'm koncentrátu = m účinné látky / c koncentrátu; V koncentrátu = m / ρ koncentrátu', 'voda = m roztoku − m koncentrátu'],
      mezikroky: [vel('Hmotnost roztoku', mRoztoku, 'kg', 1), vel('Účinná látka', mCista, 'kg', 2)],
      vysledky: [vel('Koncentrát', mKonc / rk, 'L', 1), vel('Koncentrát', mKonc, 'kg', 2), vel('Voda', mRoztoku - mKonc, 'L', 0)],
      predpoklady: ['Hustota vody 1 kg/L.', 'Koncentrát přilévat do vody, ne vodu do koncentrátu (louh a kyseliny se zahřívají).'],
      rozsah: 'Cíl 0,05–20 % hm., koncentrát 1–100 % hm.',
      nejistota: 'Podle skutečné koncentrace koncentrátu; ověř vodivostí nebo titrací.',
      zdroj: 'Hmotnostní bilance ředění; hustoty z technických listů koncentrátů.',
    };
  },
};

// --- R: Energie ------------------------------------------------------------------------

const ohrevDef: Definice = {
  id: 'ohrev_energie',
  nazev: 'Energie a náklady na ohřev a var',
  popis: 'Energie na ohřev vody, rmutu nebo mladiny (a na odpaření vody při varu) a kolik stojí.',
  oblast: 'R',
  hledat: 'spotřeba energie ohřev varna pára',
  vstupy: [
    { id: 'v', nazev: 'Objem (při 20 °C)', jednotka: 'hl', min: 0.1, max: 2000, vychozi: 10, krok: 0.1 },
    { id: 'p', nazev: 'Extrakt (voda = 0)', jednotka: '°P', min: 0, max: 30, vychozi: 0, krok: 0.1 },
    { id: 'c', nazev: 'Měrné teplo', jednotka: 'kJ/(kg·K)', min: 2.5, max: 4.25, vychozi: 4.19, krok: 0.01, napoveda: 'Voda 4,19; mladina 12 °P ≈ 3,9; rmut ≈ 3,5–3,8.' },
    { id: 't1', nazev: 'Teplota na začátku', jednotka: '°C', min: 0, max: 100, vychozi: 15, krok: 1 },
    { id: 't2', nazev: 'Teplota na konci', jednotka: '°C', min: 0, max: 100, vychozi: 78, krok: 1 },
    { id: 'odpar', nazev: 'Odpařená voda (při varu)', jednotka: 'L', min: 0, max: 200000, vychozi: 0, krok: 1 },
    { id: 'eta', nazev: 'Účinnost ohřevu', jednotka: '%', min: 10, max: 100, vychozi: 80, krok: 1, napoveda: 'Elektrický ohřev ≈ 95; plynový kotel ≈ 80–90; pára s rozvody nižší.' },
    { id: 'cena', nazev: 'Cena energie', jednotka: 'Kč/kWh', min: 0, max: 50, vychozi: 3, krok: 0.1 },
  ],
  spocitej: ({ v, p, c, t1, t2, odpar, eta, cena }) => {
    if (t2 < t1) throw new MimoRozsah('Teplota na konci musí být vyšší nebo stejná jako na začátku (výpočet je pro ohřev).');
    const { kg } = hmotnost(v, p);
    const qOhrev = kg * c * (t2 - t1);
    const qOdpar = odpar * VYPARNE_TEPLO;
    const kwh = (qOhrev + qOdpar) / 3600 / (eta / 100);
    return {
      vstupy: [vel('Objem', v, 'hl', 1), vel('Extrakt', p, '°P', 1), vel('Měrné teplo', c, 'kJ/(kg·K)', 2), vel('Začátek', t1, '°C', 0),
        vel('Konec', t2, '°C', 0), vel('Odpar', odpar, 'L', 0), vel('Účinnost', eta, '%', 0), vel('Cena energie', cena, 'Kč/kWh', 2)],
      vzorec: ['Q ohřev = m · c · (T konec − T začátek); m = V · SG(°P) · 0,9982', 'Q odpar = odpařená voda (kg) · 2257 kJ/kg', 'energie = (Q ohřev + Q odpar) / účinnost; náklady = kWh · cena'],
      mezikroky: [vel('Hmotnost', kg, 'kg', 0), vel('Teplo na ohřev', qOhrev / 3600, 'kWh', 1), vel('Teplo na odpar', qOdpar / 3600, 'kWh', 1)],
      vysledky: [vel('Energie (dodaná)', kwh, 'kWh', 1), vel('Náklady', kwh * cena, 'Kč', 0)],
      predpoklady: ['Ztráty tepla povrchem nádoby jsou v účinnosti.', 'Výparné teplo vody při 100 °C; odpařená voda 1 L = 1 kg.'],
      rozsah: 'Teploty 0–100 °C (ohřev), účinnost 10–100 %',
      nejistota: 'Hlavně podle účinnosti a měrného tepla (±5–10 %).',
      zdroj: 'Kalorimetrická rovnice Q = m·c·ΔT; výparné teplo vody 2257 kJ/kg při 100 °C.',
    };
  },
};

// --- F: Chmelovar ------------------------------------------------------------------------

const odparDef: Definice = {
  id: 'chmelovar_odpar',
  nazev: 'Odpar při chmelovaru a stupňovitost mladiny',
  popis: 'Kolik se při varu odpaří a jaká stupňovitost a objem mladiny z toho vyjdou.',
  oblast: 'F',
  hledat: 'chmelovar odpar',
  vstupy: [
    { id: 'v1', nazev: 'Objem sladiny na začátku varu', jednotka: 'hl', min: 0.1, max: 2000, vychozi: 11.5, krok: 0.1 },
    { id: 'p1', nazev: 'Extrakt sladiny', jednotka: '°P', min: 0.5, max: 30, vychozi: 10.5, krok: 0.1 },
    { id: 'min', nazev: 'Doba varu', jednotka: 'min', min: 0, max: 300, vychozi: 90, krok: 5 },
    { id: 'o', nazev: 'Intenzita odparu', jednotka: '%/h', min: 0, max: 20, vychozi: 6, krok: 0.5, napoveda: 'Procento počátečního objemu za hodinu; moderní varny 4–8 %/h.' },
  ],
  spocitej: ({ v1, p1, min, o }) => {
    const podil = o / 100 * min / 60;
    if (podil >= 0.6) throw new MimoRozsah('Odpar přes 60 % objemu — mimo rozsah (zkontroluj intenzitu a dobu varu).');
    const odpar = v1 * podil;
    const v2 = v1 - odpar;
    const extrakt = v1 * 100 * hustotaZPlato(p1) * HUSTOTA_VODY_20 * p1 / 100;
    let dole = p1;
    let nahore = 40;
    for (let i = 0; i < 100; i += 1) {
      const stred = (dole + nahore) / 2;
      if (v2 * 100 * hustotaZPlato(stred) * HUSTOTA_VODY_20 * stred / 100 < extrakt) dole = stred;
      else nahore = stred;
    }
    const p2 = (dole + nahore) / 2;
    if (p2 > 35) throw new MimoRozsah('Výsledná stupňovitost by byla přes 35 °P — mimo rozsah tabulek extraktu.');
    return {
      vstupy: [vel('Sladina', v1, 'hl', 2), vel('Extrakt sladiny', p1, '°P', 2), vel('Doba varu', min, 'min', 0), vel('Intenzita odparu', o, '%/h', 1)],
      vzorec: ['odpar = V₁ · intenzita · doba', 'V₂ = V₁ − odpar', 'extrakt (kg) zůstává: V₁·SG(P₁)·0,9982·P₁ = V₂·SG(P₂)·0,9982·P₂ → P₂ půlením intervalu'],
      mezikroky: [vel('Odpařeno', podil * 100, '% objemu', 1), vel('Extrakt ve sladině', extrakt, 'kg', 2)],
      vysledky: [vel('Objem mladiny po varu', v2, 'hl', 2), vel('Extrakt mladiny', p2, '°P', 2), vel('Odpařená voda', odpar * 100, 'L', 0)],
      predpoklady: ['Objemy při stejné teplotě (obě studené, nebo obě horké).', 'Extrakt se varem neztrácí; chmel a kaly objem nemění.'],
      rozsah: 'Extrakt 0,5–30 °P, odpar do 60 % objemu, výsledek do 35 °P',
      nejistota: 'Hlavně podle intenzity odparu (ověř změřením objemu); bilance extraktu sama ±0,05 °P.',
      zdroj: 'Hmotnostní bilance extraktu; hustota z tabulek extraktu (kubická aproximace).',
    };
  },
};

// --- S: Ekonomika ----------------------------------------------------------------------------

const danDef: Definice = {
  id: 'spotrebni_dan',
  nazev: 'Spotřební daň z piva',
  popis: 'Daň za várku nebo měsíc a na litr podle stupňovitosti a sazby (i snížené pro malé pivovary).',
  oblast: 'S',
  hledat: 'spotřební daň pivo',
  vstupy: [
    { id: 'v', nazev: 'Množství piva', jednotka: 'hl', min: 0.01, max: 1000000, vychozi: 10, krok: 0.01 },
    { id: 'p', nazev: 'Stupňovitost', jednotka: '°P', min: 0.5, max: 35, vychozi: 12, krok: 0.1 },
    { id: 's', nazev: 'Základní sazba', jednotka: 'Kč/hl/°P', min: 0, max: 500, vychozi: 32, krok: 0.1, napoveda: 'Zákon č. 353/2003 Sb., § 82 — ověř platnou sazbu, mění se.' },
    { id: 'sl', nazev: 'Sazba malého pivovaru', jednotka: '% základní', min: 10, max: 100, vychozi: 50, krok: 10, napoveda: 'Malý nezávislý pivovar podle roční výroby: do 10 000 hl 50 %, do 50 000 hl 60 %, do 100 000 hl 70 % …; ostatní 100 %.' },
  ],
  spocitej: ({ v, p, s, sl }) => {
    const cele = Math.floor(p + 1e-9);
    const dan = v * cele * s * sl / 100;
    return {
      vstupy: [vel('Množství', v, 'hl', 2), vel('Stupňovitost', p, '°P', 1), vel('Základní sazba', s, 'Kč/hl/°P', 2), vel('Sazba', sl, '% základní', 0)],
      vzorec: ['daň = hl · celé °P · sazba · (% základní / 100)', 'za každý celý procentní stupeň Plato (desetiny se nepočítají)'],
      mezikroky: [vel('Celé stupně Plato', cele, '°P', 0), vel('Sazba po snížení', s * sl / 100, 'Kč/hl/°P', 2)],
      vysledky: [vel('Daň', dan, 'Kč', 0), vel('Daň na 1 L', dan / (v * 100), 'Kč', 2), vel('Daň na 0,5 L', dan / (v * 200), 'Kč', 2)],
      predpoklady: ['Sazbu i nárok na sníženou sazbu je třeba ověřit v platném znění zákona.', 'Daň se počítá z celých stupňů Plato uvedených v evidenci.'],
      rozsah: 'Stupňovitost 0,5–35 °P',
      nejistota: 'Výpočet je přesný; správnost závisí na zadané sazbě.',
      zdroj: 'Zákon č. 353/2003 Sb., o spotřebních daních, § 82 (sazba za hl a každý celý procentní stupeň Plato; snížené sazby malých nezávislých pivovarů) — sazby zadané ručně.',
    };
  },
};

const nakladyDef: Definice = {
  id: 'naklady_varky',
  nazev: 'Náklady na várku a cena za litr',
  popis: 'Součet nákladů várky (suroviny, energie, voda, práce, daň) na hektolitr, litr a půllitr prodejného piva.',
  oblast: 'S',
  hledat: 'náklady výroby piva kalkulace',
  vstupy: [
    { id: 'hl', nazev: 'Prodejné pivo z várky', jednotka: 'hl', min: 0.1, max: 100000, vychozi: 10, krok: 0.1 },
    { id: 'slad', nazev: 'Slad', jednotka: 'kg', min: 0, max: 1000000, vychozi: 200, krok: 1 },
    { id: 'csl', nazev: 'Cena sladu', jednotka: 'Kč/kg', min: 0, max: 1000, vychozi: 16, krok: 0.1 },
    { id: 'chmel', nazev: 'Chmel', jednotka: 'kg', min: 0, max: 100000, vychozi: 2, krok: 0.01 },
    { id: 'cch', nazev: 'Cena chmele', jednotka: 'Kč/kg', min: 0, max: 10000, vychozi: 700, krok: 1 },
    { id: 'kv', nazev: 'Kvasnice', jednotka: 'Kč', min: 0, max: 1000000, vychozi: 800, krok: 1 },
    { id: 'kwh', nazev: 'Energie', jednotka: 'kWh', min: 0, max: 1000000, vychozi: 300, krok: 1 },
    { id: 'ce', nazev: 'Cena energie', jednotka: 'Kč/kWh', min: 0, max: 50, vychozi: 3, krok: 0.1 },
    { id: 'voda', nazev: 'Voda (vč. mytí)', jednotka: 'm³', min: 0, max: 100000, vychozi: 3, krok: 0.1 },
    { id: 'cv', nazev: 'Vodné a stočné', jednotka: 'Kč/m³', min: 0, max: 1000, vychozi: 120, krok: 1 },
    { id: 'hod', nazev: 'Práce', jednotka: 'h', min: 0, max: 10000, vychozi: 10, krok: 0.5 },
    { id: 'ch', nazev: 'Cena práce', jednotka: 'Kč/h', min: 0, max: 10000, vychozi: 350, krok: 10 },
    { id: 'dan', nazev: 'Spotřební daň (z výpočtu daně)', jednotka: 'Kč', min: 0, max: 100000000, vychozi: 1920, krok: 1 },
    { id: 'jine', nazev: 'Ostatní (sanitace, CO₂, rozbory…)', jednotka: 'Kč', min: 0, max: 100000000, vychozi: 500, krok: 1 },
  ],
  spocitej: (x) => {
    const polozky = [
      ['Slad', x.slad * x.csl], ['Chmel', x.chmel * x.cch], ['Kvasnice', x.kv], ['Energie', x.kwh * x.ce],
      ['Voda', x.voda * x.cv], ['Práce', x.hod * x.ch], ['Spotřební daň', x.dan], ['Ostatní', x.jine],
    ] as const;
    const celkem = polozky.reduce((s, [, k]) => s + k, 0);
    return {
      vstupy: [vel('Prodejné pivo', x.hl, 'hl', 1)],
      vzorec: ['náklady = Σ (množství · cena) + kvasnice + daň + ostatní', 'na hl = náklady / prodejné hl; na 0,5 L = na hl / 200'],
      mezikroky: polozky.map(([n, k]) => vel(n, k, 'Kč', 0)),
      vysledky: [vel('Náklady celkem', celkem, 'Kč', 0), vel('Náklady na hl', celkem / x.hl, 'Kč/hl', 0), vel('Náklady na 1 L', celkem / (x.hl * 100), 'Kč', 2),
        vel('Náklady na 0,5 L', celkem / (x.hl * 200), 'Kč', 2)],
      predpoklady: ['Jen přímé náklady várky; obaly, odpisy, nájem a distribuce se nepočítají.', 'Prodejné pivo = po ztrátách (kvašení, filtrace, stáčení).'],
      rozsah: 'Nezáporné částky a množství',
      nejistota: 'Přesný součet zadaných čísel; přesnost určují ceny.',
      zdroj: 'Kalkulace přímých nákladů (součet položek na jednotku výstupu).',
    };
  },
};

// --- E: Scezování -------------------------------------------------------------------------------

const vyslazovaniDef: Definice = {
  id: 'vyslazovaci_voda',
  nazev: 'Vyslazovací voda (bilance vody)',
  popis: 'Kolik vody na vyslazování, aby vyšel cílový objem sladiny před varem.',
  oblast: 'E',
  hledat: 'vyslazování voda mláto',
  vstupy: [
    { id: 'kg', nazev: 'Šrot (slad)', jednotka: 'kg', min: 1, max: 100000, vychozi: 200, krok: 1 },
    { id: 'vr', nazev: 'Voda do rmutu (nálevová)', jednotka: 'L', min: 1, max: 1000000, vychozi: 600, krok: 1 },
    { id: 'vc', nazev: 'Cílový objem sladiny před varem', jednotka: 'L', min: 1, max: 1000000, vychozi: 1150, krok: 1 },
    { id: 'abs', nazev: 'Voda zadržená v mlátě', jednotka: 'L/kg', min: 0.4, max: 1.6, vychozi: 0.9, krok: 0.05, napoveda: 'Běžně 0,8–1,1 L na kg šrotu; ověř změřením u své varny.' },
    { id: 'mrtvy', nazev: 'Mrtvý objem (pod dnem, potrubí)', jednotka: 'L', min: 0, max: 100000, vychozi: 30, krok: 1 },
    { id: 'odpar', nazev: 'Odpar a ztráty při rmutování', jednotka: 'L', min: 0, max: 100000, vychozi: 0, krok: 1, napoveda: 'Při dekokci se odpaří víc — odhadni podle zkušenosti.' },
  ],
  spocitej: ({ kg, vr, vc, abs, mrtvy, odpar }) => {
    const mlato = kg * abs;
    const vysl = vc + mlato + mrtvy + odpar - vr;
    if (vysl <= 0) throw new MimoRozsah('Vody do rmutu je víc, než se vejde do cílové sladiny — vyslazovat netřeba (sniž nálev nebo zvyš cílový objem).');
    return {
      vstupy: [vel('Šrot', kg, 'kg', 0), vel('Voda do rmutu', vr, 'L', 0), vel('Cílová sladina', vc, 'L', 0), vel('Zadrženo v mlátě', abs, 'L/kg', 2),
        vel('Mrtvý objem', mrtvy, 'L', 0), vel('Odpar při rmutování', odpar, 'L', 0)],
      vzorec: ['vyslazovací voda = cílová sladina + voda v mlátě + mrtvý objem + odpar − voda do rmutu', 'voda v mlátě = kg šrotu · zadržená voda'],
      mezikroky: [vel('Voda zadržená v mlátě', mlato, 'L', 0), vel('Voda celkem', vr + vysl, 'L', 0), vel('Poměr nálevu a šrotu', vr / kg, 'L/kg', 2)],
      vysledky: [vel('Vyslazovací voda', vysl, 'L', 0)],
      predpoklady: ['Objemy vody studené (20 °C); sladina se měří ve stejném stavu.', 'Objem extraktu ve sladině se nepočítá zvlášť (bilance vody).'],
      rozsah: 'Zadržená voda 0,4–1,6 L/kg; výsledek musí vyjít kladný',
      nejistota: 'Hlavně podle vody zadržené v mlátě (±0,1 L/kg) a mrtvého objemu.',
      zdroj: 'Bilance vody při scezování (vstup: nálev + vyslazovací voda; výstup: sladina + mláto + mrtvý objem + odpar).',
    };
  },
};

// --- H: Kvašení ------------------------------------------------------------------------------------

const zakvaseniDef: Definice = {
  id: 'zakvaseni_davka',
  nazev: 'Dávka kvasnic na zakvašení',
  popis: 'Kolik buněk kvasnic a kolik kvasničné kaše na zakvašení mladiny.',
  oblast: 'H',
  hledat: 'zakvašení dávka kvasnic',
  vstupy: [
    { id: 'v', nazev: 'Objem mladiny', jednotka: 'hl', min: 0.01, max: 5000, vychozi: 10, krok: 0.1 },
    { id: 'p', nazev: 'Extrakt mladiny', jednotka: '°P', min: 1, max: 30, vychozi: 12, krok: 0.1 },
    { id: 'd', nazev: 'Dávka', jednotka: 'mil. buněk/(mL·°P)', min: 0.2, max: 4, vychozi: 1.5, krok: 0.05, napoveda: 'Spodní kvašení obvykle 1,5; svrchní 0,75; silné nebo studené kvašení víc.' },
    { id: 'h', nazev: 'Hustota kvasničné kaše', jednotka: 'mld. buněk/mL', min: 0.05, max: 5, vychozi: 1.5, krok: 0.05, napoveda: 'Změř počítáním v Bürkerově komůrce; hustá sedimentovaná kaše 1–3.' },
    { id: 'vit', nazev: 'Životnost (viabilita)', jednotka: '%', min: 10, max: 100, vychozi: 90, krok: 1, napoveda: 'Barvení methylenovou modří.' },
  ],
  spocitej: ({ v, p, d, h, vit }) => {
    const mld = d * v * p * 100; // d·1e6/mL/°P · v·1e5 mL · p / 1e9
    const ml = mld / (h * vit / 100);
    return {
      vstupy: [vel('Mladina', v, 'hl', 2), vel('Extrakt', p, '°P', 1), vel('Dávka', d, 'mil./(mL·°P)', 2), vel('Hustota kaše', h, 'mld./mL', 2), vel('Viabilita', vit, '%', 0)],
      vzorec: ['buňky = dávka (mil./mL/°P) · objem (mL) · °P', 'kaše (mL) = buňky / (hustota kaše · viabilita)'],
      mezikroky: [vel('Objem mladiny', v * 100 * 1000, 'mL', 0), vel('Dávka v mladině', d * p, 'mil. buněk/mL', 1)],
      vysledky: [vel('Potřeba živých buněk', mld, 'mld.', 0), vel('Kvasničná kaše', ml / 1000, 'L', 2)],
      predpoklady: ['Počítají se jen živé buňky (viabilita).', 'Doporučená dávka je pravidlo z praxe; u kmene se řiď zkušeností a laboratoří.'],
      rozsah: 'Dávka 0,2–4 mil./(mL·°P), extrakt 1–30 °P',
      nejistota: 'Hlavně podle změřené hustoty kaše (počítání ±10–20 %).',
      zdroj: 'Dávka zakvašení v milionech buněk na mL a °P (C. White, J. Zainasheff: Yeast — The Practical Guide to Beer Fermentation, 2010).',
    };
  },
};

// --- K: Stáčení — dokvašení v lahvi -----------------------------------------------------------------

/** g CO₂ na g cukru: sacharóza (C₁₂H₂₂O₁₁ + H₂O → 4 C₂H₅OH + 4 CO₂), glukóza monohydrát (→ 2 CO₂). */
export const CO2_ZE_SACHAROZY = (4 * 44.0095) / 342.2965;
export const CO2_Z_GLUKOZY_MONOHYDRATU = (2 * 44.0095) / 198.1712;

const refermentaceDef: Definice = {
  id: 'refermentace_cukr',
  nazev: 'Cukr na dokvašení v lahvi',
  popis: 'Kolik cukru (sacharózy nebo glukózy) přidat před stáčením, aby pivo v lahvi dosáhlo cílového obsahu CO₂.',
  oblast: 'K',
  hledat: 'refermentace dokvašení v lahvi cukr',
  vstupy: [
    { id: 't', nazev: 'Nejvyšší teplota piva po kvašení', jednotka: '°C', min: 0, max: 30, vychozi: 10, krok: 0.5, napoveda: 'Podle ní zůstal v pivu rozpuštěný CO₂ (bez přetlaku).' },
    { id: 'g', nazev: 'Cílový obsah CO₂', jednotka: 'g/L', min: 3, max: 10, vychozi: 5.5, krok: 0.1 },
    { id: 'v', nazev: 'Objem piva', jednotka: 'L', min: 0.5, max: 100000, vychozi: 100, krok: 0.5 },
  ],
  spocitej: ({ t, g, v }) => {
    const zbytek = objemyCo2(t, 0) * G_NA_OBJEM_CO2;
    const chybi = g - zbytek;
    if (chybi <= 0) throw new MimoRozsah(`Pivo má při ${cesky(t)} °C už ${cesky(zbytek, 2)} g/L CO₂ — cíl je nižší, cukr netřeba.`);
    const sach = chybi / CO2_ZE_SACHAROZY;
    const glu = chybi / CO2_Z_GLUKOZY_MONOHYDRATU;
    return {
      vstupy: [vel('Teplota po kvašení', t, '°C', 1), vel('Cílový CO₂', g, 'g/L', 2), vel('Objem', v, 'L', 1)],
      vzorec: ['zbytkový CO₂ = rovnováha při teplotě a 0 bar přetlaku (Zahm & Nagel)', 'cukr (g/L) = (cíl − zbytkový CO₂) / výtěžek CO₂ z cukru',
        'sacharóza 0,514 g CO₂/g; glukóza monohydrát 0,444 g CO₂/g'],
      mezikroky: [vel('Zbytkový CO₂ v pivu', zbytek, 'g/L', 2), vel('Chybí CO₂', chybi, 'g/L', 2)],
      vysledky: [vel('Sacharóza', sach, 'g/L', 2), vel('Sacharóza celkem', sach * v, 'g', 0), vel('Glukóza (monohydrát)', glu, 'g/L', 2), vel('Glukóza celkem', glu * v, 'g', 0)],
      predpoklady: ['Pivo prokvašené do konce (žádný zbytkový zkvasitelný cukr).', 'Teoretický výtěžek kvašení; skutečně vznikne o pár procent CO₂ méně.', 'Láhve musí vydržet tlak — u vyššího cíle hlídej typ lahve.'],
      rozsah: 'Teplota 0–30 °C, cíl 3–10 g/L',
      nejistota: 'Řádově ±5–10 % (zbytkový extrakt, ztráty CO₂ při stáčení).',
      zdroj: 'Stechiometrie lihového kvašení a rovnovážná rozpustnost CO₂ (regrese tabulek Zahm & Nagel).',
    };
  },
};

/** Výpočty etapy 6b v pořadí Výpočtové laboratoře (za výpočty 6a). */
export const VYPOCTY_6B: readonly Definice[] = [
  chlazeniDef, vymenikDef, zbytkovaAlkalitaDef, kyselinaDef, vyslazovaniDef, odparDef, zakvaseniDef, refermentaceDef,
  potrubiDef, cerpadloDef, cipDef, ohrevDef, danDef, nakladyDef,
];
