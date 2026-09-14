// Vymyšlená data pivovaru pro náhled. Žádná produkční čísla — jména piv a
// obalů jsou skutečná, množství jsou naskládaná tak, aby byly vidět všechny
// stavy, které panel umí: sedící řádek, přebytek, manko, položka bez pohybu
// i položka v mínusu.
//
// Data se počítají OD DNEŠKA, ne od pevných datumů: náhled se otevírá i za
// měsíc a týden, který panel nabídne, musí mít co ukázat. Jinak by stránka
// jednou provždy hlásila „za tenhle týden není co počítat".
import { businessDateISO } from '../../src/lib/businessDate';
import { pondeliTydne, posunDnu } from '../../src/lib/tydenniInventura';

const DNES = businessDateISO();
const PONDELI = pondeliTydne(DNES);

/** Den v kontrolovaném týdnu — 0 = pondělí. Nikdy ne po dnešku. */
const den = (n: number) => {
  const d = posunDnu(PONDELI, n);
  return d > DNES ? DNES : d;
};
/** První den měsíce, do kterého spadá pondělí — sem patří počáteční stav. */
const PRVNI_V_MESICI = PONDELI.slice(0, 8) + '01';
/** Minulý týden — pohyby před obdobím, ať se počátek opravdu dopočítává. */
const MINULY = (n: number) => posunDnu(PONDELI, n - 7);

export const beers = [
  { id: 'b-12sv', name: '12° Světlý ležák', sort_order: 1 },
  { id: 'b-12tm', name: '12° Tmavý ležák', sort_order: 2 },
  { id: 'b-11sv', name: '11° Světlá', sort_order: 3 },
  { id: 'b-10de', name: '10° Desítka', sort_order: 4 },
  { id: 'b-08os', name: 'Osma', sort_order: 5 },
  { id: 'b-summ', name: 'Summer Ale', sort_order: 6 },
];

export const packages = [
  { id: 'p-keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 1 },
  { id: 'p-keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 2 },
  { id: 'p-keg20', label: 'KEG 20l', kind: 'keg', volume_l: 20, sort_order: 3 },
  { id: 'p-lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5, sort_order: 4 },
  { id: 'p-lah033', label: 'Lahev 0,33l', kind: 'bottle', volume_l: 0.33, sort_order: 5 },
  { id: 'p-pet15', label: 'PET 1,5l', kind: 'pet', volume_l: 1.5, sort_order: 6 },
];

/** Počáteční stav k prvnímu dni měsíce — základ, od kterého kniha počítá. */
export const inventory = [
  { beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 18, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 240, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-12tm', package_id: 'p-keg50', quantity: 6, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-11sv', package_id: 'p-keg30', quantity: 11, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-10de', package_id: 'p-keg50', quantity: 9, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-10de', package_id: 'p-lah05', quantity: 96, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-08os', package_id: 'p-keg30', quantity: 4, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-summ', package_id: 'p-keg20', quantity: 3, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
  { beer_id: 'b-summ', package_id: 'p-lah033', quantity: 60, entry_date: PRVNI_V_MESICI, note: 'Počáteční stav' },
];

/** Stáčení do sudů. Část ještě před kontrolovaným týdnem. */
export const kegging = [
  { beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 12, entry_date: MINULY(2), note: null, cellar_tank_id: 't-1' },
  { beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 8, entry_date: den(1), note: null, cellar_tank_id: 't-1' },
  { beer_id: 'b-11sv', package_id: 'p-keg30', quantity: 10, entry_date: den(2), note: null, cellar_tank_id: 't-3' },
  { beer_id: 'b-10de', package_id: 'p-keg50', quantity: 6, entry_date: den(1), note: null, cellar_tank_id: 't-4' },
  { beer_id: 'b-summ', package_id: 'p-keg20', quantity: 4, entry_date: den(0), note: null, cellar_tank_id: 't-5' },
];

/** Stáčení do lahví. `kegs_used` = sudy spotřebované jako zdroj. */
export const bottling = [
  {
    beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 180, entry_date: den(1),
    kegs_used: 2, kegs_used_package_id: 'p-keg50', source_volume_l: null,
    note: null, created_at: den(1) + 'T08:10:00Z',
  },
  {
    beer_id: 'b-10de', package_id: 'p-lah05', quantity: 120, entry_date: den(2),
    kegs_used: 1, kegs_used_package_id: 'p-keg50', source_volume_l: null,
    note: null, created_at: den(2) + 'T09:25:00Z',
  },
  {
    beer_id: 'b-summ', package_id: 'p-lah033', quantity: 90, entry_date: MINULY(4),
    kegs_used: 1, kegs_used_package_id: 'p-keg20', source_volume_l: null,
    note: null, created_at: MINULY(4) + 'T10:00:00Z',
  },
];

export const fasovani = [
  { beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 12, entry_date: den(1) },
  { beer_id: 'b-10de', package_id: 'p-keg50', quantity: 1, entry_date: den(2) },
];

export const fasovani_private = [
  { beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 6, entry_date: den(2) },
];

export const writeoffs = [
  { beer_id: 'b-summ', package_id: 'p-lah033', quantity: 4, entry_date: den(1) },
];

/** Zavezeno na objednávky — hlavní odliv. */
export const zavoz_deductions = [
  { deduct_date: den(1), beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 9 },
  { deduct_date: den(2), beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 7 },
  { deduct_date: den(2), beer_id: 'b-11sv', package_id: 'p-keg30', quantity: 8 },
  { deduct_date: den(1), beer_id: 'b-12tm', package_id: 'p-keg50', quantity: 4 },
  { deduct_date: den(2), beer_id: 'b-08os', package_id: 'p-keg30', quantity: 6 },
  { deduct_date: den(1), beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 60 },
  { deduct_date: den(2), beer_id: 'b-summ', package_id: 'p-lah033', quantity: 24 },
];

export const inventory_adjustments: any[] = [];
export const akce: any[] = [];
export const keg_prefuk = [
  {
    entry_date: den(2), beer_id: 'b-11sv',
    from_package_id: 'p-keg30', from_count: 2, to_package_id: 'p-keg20', to_count: 3,
  },
];

/** Sklep — přebytek sudů se z nich odečítá při „Zapsat do stáčení". */
export const cellar_tanks = [
  { id: 't-1', label: 'Tank 1', current_beer_id: 'b-12sv', current_volume_l: 1900, status: 'full', started_at: MINULY(1), kegging_active: true },
  { id: 't-2', label: 'Tank 2', current_beer_id: 'b-12sv', current_volume_l: 2400, status: 'full', started_at: MINULY(3), kegging_active: false },
  { id: 't-3', label: 'Spilka 1', current_beer_id: 'b-11sv', current_volume_l: 800, status: 'full', started_at: MINULY(2), kegging_active: true },
  { id: 't-4', label: 'Tank 6', current_beer_id: 'b-10de', current_volume_l: 1500, status: 'full', started_at: MINULY(2), kegging_active: true },
  { id: 't-5', label: 'Tank 4', current_beer_id: 'b-summ', current_volume_l: 260, status: 'full', started_at: MINULY(5), kegging_active: true },
];

/** Rozdělaná kontrola — ať je při otevření vidět i stav „už se počítalo". */
export const tydenni_inventura = [
  { tyden_od: PONDELI, beer_id: 'b-12tm', package_id: 'p-keg50', napocitano: 2, ocekavano: 2, rozdil: 0, vyreseno: null },
];

/** Ukončené cykly tanků — pro přehled ztrát (Sklep → Ztráty při stáčení). */
const cyklus = (id: string, tank: string, pivo: string, pocatek: number, ztrata: number, konec: string) => ({
  id, tank_id: `t-${tank}`, tank_label: `Tank ${tank}`,
  beer_id: pivo, beer_name: beers.find((b) => b.id === pivo)?.name ?? null,
  initial_volume_l: pocatek, kegged_volume_l: pocatek - ztrata, keg_count: Math.round((pocatek - ztrata) / 50),
  loss_l: ztrata, loss_pct: Math.round((ztrata / pocatek) * 1000) / 10,
  started_at: posunDnu(konec, -30), ended_at: `${konec}T12:00:00Z`, duration_hours: 720, note: null, created_at: `${konec}T12:00:00Z`,
});
export const cellar_tank_cycles = [
  cyklus('c1', '1', 'b-12sv', 2500, 45, posunDnu(DNES, -150)),
  cyklus('c2', '1', 'b-12sv', 2500, 50, posunDnu(DNES, -110)),
  cyklus('c3', '1', 'b-12sv', 2500, 60, posunDnu(DNES, -70)),
  cyklus('c4', '1', 'b-12sv', 2500, 110, posunDnu(DNES, -40)),
  cyklus('c5', '1', 'b-12sv', 2500, 130, posunDnu(DNES, -10)),
  cyklus('c6', '6', 'b-10de', 1500, 20, posunDnu(DNES, -90)),
  cyklus('c7', '6', 'b-10de', 1500, 25, posunDnu(DNES, -20)),
  cyklus('c8', '4', 'b-summ', 800, 12, posunDnu(DNES, -30)),
];

/** Várky ve sklepě s průběhem kvašení (Sklep → Várky & kvašení). */
export const cellar_batches = [
  {
    id: 'v-1', batch_number: '2026/31', beer_id: 'b-12sv', beer_name: '12° Světlý ležák', tank_id: 't-1', tank_label: 'Tank 1',
    volume_hl: 25, og: 12.1, fg: 3.2, started_at: `${posunDnu(DNES, -45)}T06:00:00Z`, finished_at: `${posunDnu(DNES, -10)}T06:00:00Z`,
    note: null, kvasnice_generace: 3, kvasnice_z_varky: null, created_at: `${posunDnu(DNES, -45)}T06:00:00Z`,
  },
  {
    id: 'v-2', batch_number: '2026/36', beer_id: 'b-11sv', beer_name: '11° Světlá', tank_id: 't-3', tank_label: 'Spilka 1',
    volume_hl: 8, og: 11.2, fg: null, started_at: `${posunDnu(DNES, -6)}T06:00:00Z`, finished_at: null,
    note: 'Kvasnice sklizené z várky 2026/31.', kvasnice_generace: 4, kvasnice_z_varky: 'v-1', created_at: `${posunDnu(DNES, -6)}T06:00:00Z`,
  },
];

const mereni = (id: string, batch: string, dniZpet: number, hodina: number, plato: number | null, teplota: number | null) => ({
  id, batch_id: batch, measured_at: `${posunDnu(DNES, -dniZpet)}T${String(hodina).padStart(2, '0')}:00:00Z`,
  stupnovitost: plato, teplota_c: teplota, poznamka: null, zapsal: 'Náhled',
});
export const cellar_batch_mereni = [
  mereni('m1', 'v-2', 6, 7, 11.2, 8.0),
  mereni('m2', 'v-2', 5, 7, 10.6, 8.5),
  mereni('m3', 'v-2', 4, 7, 9.1, 9.0),
  mereni('m4', 'v-2', 3, 18, 7.4, 9.2),
  mereni('m5', 'v-2', 1, 7, 5.9, 8.8),
];

export const POPIS = { DNES, PONDELI };

// Objednávky tohoto týdne — okno „Co stočit" na úvodní stránce. Dny se
// počítají od pondělí, ne od dneška, ať je vidět den, týden i „bez termínu".
const denTydne = (n: number) => posunDnu(PONDELI, n);
export const orders = [
  { id: 'o-1', order_date: denTydne(0), delivery_date: denTydne(0), delivery_day: 'po', place_name: 'Hospoda U Zajíce', status: 'nova', is_delivered: false },
  { id: 'o-2', order_date: denTydne(0), delivery_date: denTydne(1), delivery_day: 'ut', place_name: 'Restaurace Na Mlýně', status: 'nova', is_delivered: false },
  { id: 'o-3', order_date: denTydne(0), delivery_date: denTydne(3), delivery_day: 'ct', place_name: 'Pivnice Sokolovna', status: 'nova', is_delivered: false },
  { id: 'o-4', order_date: denTydne(0), delivery_date: null, delivery_day: null, place_name: 'Kiosek u koupaliště', status: 'nova', is_delivered: false },
];
export const order_items = [
  { id: 'oi-1', order_id: 'o-1', beer_id: 'b-12sv', package_id: 'p-keg50', quantity: 30 },
  { id: 'oi-2', order_id: 'o-1', beer_id: 'b-12tm', package_id: 'p-keg30', quantity: 4 },
  { id: 'oi-3', order_id: 'o-1', beer_id: 'b-12sv', package_id: 'p-lah05', quantity: 40 },
  { id: 'oi-4', order_id: 'o-2', beer_id: 'b-11sv', package_id: 'p-keg30', quantity: 6 },
  { id: 'oi-5', order_id: 'o-2', beer_id: 'b-10de', package_id: 'p-keg20', quantity: 5 },
  { id: 'oi-6', order_id: 'o-3', beer_id: 'b-12tm', package_id: 'p-lah033', quantity: 60 },
  { id: 'oi-7', order_id: 'o-4', beer_id: 'b-12sv', package_id: 'p-keg30', quantity: 2 },
];
export const kegging_plan_checks: any[] = [];
