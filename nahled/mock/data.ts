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

export const POPIS = { DNES, PONDELI };
