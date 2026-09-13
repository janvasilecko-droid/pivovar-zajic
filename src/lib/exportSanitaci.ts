// 🧼 Export sanitačních deníků do Excelu — pro hygienickou kontrolu.
//
// Deníky tanků, lahví, KEGů a výčepů se vedou v aplikaci, ale ven se z nich
// nedalo dostat nic: při kontrole se musel ukazovat telefon, záznam po
// záznamu. Tohle složí jeden sešit, každý deník na vlastní list, za zvolené
// období.
//
// Sloupce se berou z dat (deníky mají desítky zaškrtávaných kroků a přibývají),
// popisky z tabulky níž. Neznámý sloupec dostane svůj technický název — raději
// ošklivý popisek než tiše vynechaný krok.
import { nactiXlsx, xlsx } from './xlsxLazy';

export type DenikSanitace = {
  tabulka: 'sanitation_logs' | 'bottle_sanitation_logs' | 'keg_sanitation_logs' | 'tap_sanitation_logs';
  list: string;
};

export const DENIKY: DenikSanitace[] = [
  { tabulka: 'sanitation_logs', list: 'Tanky a zařízení' },
  { tabulka: 'bottle_sanitation_logs', list: 'Lahve (stáčení)' },
  { tabulka: 'keg_sanitation_logs', list: 'KEGy (stáčení)' },
  { tabulka: 'tap_sanitation_logs', list: 'Výčepy' },
];

/** Technické sloupce, které do protokolu pro kontrolu nepatří. */
const VYNECHAT = new Set(['id', 'source', 'created_at', 'tank_id', 'tap_id', 'method']);

const POPISKY: Record<string, string> = {
  sanitation_date: 'Datum',
  sanitation_time: 'Čas',
  tank_label: 'Tank / zařízení',
  tap_name: 'Výčep',
  method_label: 'Metoda',
  chemical_name: 'Chemikálie',
  concentration_pct: 'Koncentrace %',
  chemical_concentration: 'Koncentrace',
  temperature_c: 'Teplota °C',
  chemical_temperature: 'Teplota',
  duration_minutes: 'Doba (min)',
  chemical_contact_time: 'Doba působení',
  performed_by: 'Provedl',
  approved_by: 'Schválil',
  reason: 'Důvod',
  note: 'Poznámka',
  mismatch_note: 'Neshoda',
  mismatch_action: 'Nápravné opatření',
  louh: 'Louh',
  proplach_vodou: 'Proplach vodou',
  cela_cesta_na_louhu: 'Celá cesta na louhu',
  prostory: 'Prostory',
  steps: 'Kroky',
  step_times: 'Časy kroků',
  water_rinse_time: 'Proplach vodou (čas)',
  louh_sanitation_time: 'Louh (čas)',
  disassembly_time: 'Rozebrání (čas)',
  visual_check_time: 'Vizuální kontrola (čas)',
};

/** Pořadí prvních sloupců; ostatní následují v pořadí, v jakém je vrátila databáze. */
const NA_ZACATEK = ['sanitation_date', 'sanitation_time', 'tank_label', 'tap_name', 'method_label', 'performed_by', 'approved_by'];

export function popisSloupce(sloupec: string): string {
  return POPISKY[sloupec] ?? sloupec.replace(/^(proc|ctrl|eq)_/, '').replace(/_/g, ' ');
}

function hodnota(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ano' : 'ne';
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Z řádků jednoho deníku udělá tabulku (první řádek hlavička). Prázdný deník → null. */
export function tabulkaDeniku(radky: Record<string, unknown>[]): (string | number)[][] | null {
  if (!radky.length) return null;
  const vsechny: string[] = [];
  for (const r of radky) {
    for (const k of Object.keys(r)) if (!VYNECHAT.has(k) && !vsechny.includes(k)) vsechny.push(k);
  }
  const sloupce = [
    ...NA_ZACATEK.filter((k) => vsechny.includes(k)),
    ...vsechny.filter((k) => !NA_ZACATEK.includes(k)),
  ];
  const serazene = [...radky].sort((a, b) =>
    `${a.sanitation_date ?? ''} ${a.sanitation_time ?? ''}`.localeCompare(`${b.sanitation_date ?? ''} ${b.sanitation_time ?? ''}`));
  return [
    sloupce.map(popisSloupce),
    ...serazene.map((r) => sloupce.map((k) => hodnota(r[k]))),
  ];
}

export function nazevSouboruSanitaci(od: string, doKdy: string): string {
  return `Sanitace_pivovar_${od}_az_${doKdy}.xlsx`;
}

/**
 * Postaví sešit a nabídne ho ke stažení. `data` jsou řádky po tabulkách.
 * Vrací false, když v období není ani jeden záznam.
 */
export async function stahniSanitace(
  data: Partial<Record<DenikSanitace['tabulka'], Record<string, unknown>[]>>,
  od: string,
  doKdy: string,
): Promise<boolean> {
  await nactiXlsx();
  const wb = xlsx().utils.book_new();
  let neco = false;
  for (const d of DENIKY) {
    const tab = tabulkaDeniku(data[d.tabulka] ?? []);
    if (!tab) continue;
    const ws = xlsx().utils.aoa_to_sheet(tab);
    ws['!cols'] = tab[0].map((h) => ({ wch: Math.min(40, Math.max(10, String(h).length + 2)) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    xlsx().utils.book_append_sheet(wb, ws, d.list.slice(0, 31));
    neco = true;
  }
  if (!neco) return false;
  xlsx().writeFile(wb, nazevSouboruSanitaci(od, doKdy));
  return true;
}
