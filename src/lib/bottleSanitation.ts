// Sanitární deník lahví — denní záznam sanitace stáčecí linky lahví.
// Každý den stáčení se zapíše: 🧼 louh (proplach stáčecích cest louhem),
// 💧 proplach čistou vodou, 🛢️ celá cesta včetně vzduchové na louhu s opláchem,
// 🧹 úklid prostor stáčení.
// Záznamy se ukládají do tabulky bottle_sanitation_logs (Supabase) a pro
// offline/fallback i do localStorage. Po dokončení checklistu „Konec stáčení"
// nebo „Měsíční údržba" se do deníku automaticky zapíše/aktualizuje daný den.

import { supabase } from './supabase';

export type BottleSanField = 'louh' | 'proplach_vodou' | 'cela_cesta_na_louhu' | 'prostory';

export type BottleSanitationEntry = {
  id: string;
  sanitation_date: string; // YYYY-MM-DD — jeden den = jeden záznam
  sanitation_time?: string | null; // HH:MM
  louh: boolean;
  proplach_vodou: boolean;
  cela_cesta_na_louhu: boolean;
  prostory: boolean;
  
  // Extended HACCP checklist fields
  eq_pegas: boolean;
  eq_hoses: boolean;
  eq_coupler: boolean;
  eq_co2: boolean;
  reason: string | null; // 'pred_stacenim' | 'po_staceni' | 'pravidelna'
  chemical_name: string | null;
  chemical_concentration: string | null;
  chemical_temperature: string | null;
  chemical_contact_time: string | null;
  proc_rinse_water: boolean;
  proc_circulation: boolean;
  proc_rinse_co2: boolean;
  proc_disassembly: boolean;
  ctrl_visual: boolean;
  ctrl_co2_pressure: boolean;
  ctrl_tightness: boolean;
  ctrl_valve: boolean;
  mismatch_note: string | null;
  mismatch_action: string | null;
  approved_by: string | null;

  performed_by: string | null;
  note: string | null;
  created_at: string;
  source?: 'manual' | 'checklist' | null;
  // Časy jednotlivých kroků: klíč = pole deníku (louh, proplach_vodou,
  // cela_cesta_na_louhu, prostory, proc_rinse_water, …), hodnota = HH:MM.
  step_times: Record<string, string>;
};

// Pole `icon` bylo zrušeno: drželo emoji, které se nikde nevykreslovalo.
// Kdyby u kroků měla být ikona, patří sem LucideIcon jako u ostatních
// číselníků (viz METHOD_BADGES v SanitationLogScreen), ne text.
export const BOTTLE_SAN_FIELDS: { id: BottleSanField; label: string; hint?: string }[] = [
  { id: 'louh', label: 'Louh NaOH — proplach stáčecích cest louhem', hint: 'každý den stáčení' },
  { id: 'proplach_vodou', label: 'Proplach čistou vodou', hint: 'pivní cesty, stáčečky, hadice' },
  { id: 'cela_cesta_na_louhu', label: 'Celá cesta včetně vzduchové na louhu s opláchem', hint: 'pokud se dělá louhování (nechat do dalšího stáčení na louhu)' },
  { id: 'prostory', label: 'Úklid prostor stáčení', hint: 'podlahy, stoly, stěny, odkládací plochy' },
];

export const BOTTLE_SAN_STORAGE_KEY = 'bottle_sanitation_logs';

const isRemoteId = (id: string) => id.includes('-');

export function newBottleSanEntry(dateStr: string, performedBy?: string | null): BottleSanitationEntry {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    id: String(Date.now()),
    sanitation_date: dateStr,
    sanitation_time: timeStr,
    louh: false,
    proplach_vodou: false,
    cela_cesta_na_louhu: false,
    prostory: false,
    
    eq_pegas: false,
    eq_hoses: false,
    eq_coupler: false,
    eq_co2: false,
    reason: 'pravidelna',
    chemical_name: '',
    chemical_concentration: '',
    chemical_temperature: '',
    chemical_contact_time: '',
    proc_rinse_water: false,
    proc_circulation: false,
    proc_rinse_co2: false,
    proc_disassembly: false,
    ctrl_visual: false,
    ctrl_co2_pressure: false,
    ctrl_tightness: false,
    ctrl_valve: false,
    mismatch_note: '',
    mismatch_action: '',
    approved_by: '',

    performed_by: performedBy || null,
    note: null,
    created_at: now.toISOString(),
    source: 'manual',
    step_times: {},
  };
}

export async function loadBottleSanitation(): Promise<BottleSanitationEntry[]> {
  let dbEntries: BottleSanitationEntry[] = [];
  try {
    const { data } = await supabase
      .from('bottle_sanitation_logs')
      .select('*')
      .order('sanitation_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) dbEntries = data as BottleSanitationEntry[];
  } catch {}

  let local: BottleSanitationEntry[] = [];
  try {
    const raw = localStorage.getItem(BOTTLE_SAN_STORAGE_KEY);
    if (raw) local = JSON.parse(raw);
  } catch {}

  const combined = [...local, ...dbEntries];
  const unique = new Map<string, BottleSanitationEntry>();
  combined.forEach((e) => {
    const key = e.id || `${e.sanitation_date}-${e.created_at}`;
    if (!unique.has(key)) unique.set(key, e);
  });
  return Array.from(unique.values()).sort((a, b) => {
    return new Date(b.created_at || b.sanitation_date).getTime() - new Date(a.created_at || a.sanitation_date).getTime();
  });
}

// Zápis/aktualizace záznamu. Vrací true, pokud se uložil do Supabase.
export async function saveBottleSanEntry(entry: BottleSanitationEntry): Promise<boolean> {
  const payload = {
    sanitation_date: entry.sanitation_date,
    sanitation_time: entry.sanitation_time || null,
    louh: entry.louh,
    proplach_vodou: entry.proplach_vodou,
    cela_cesta_na_louhu: entry.cela_cesta_na_louhu,
    prostory: entry.prostory,
    
    eq_pegas: entry.eq_pegas || false,
    eq_hoses: entry.eq_hoses || false,
    eq_coupler: entry.eq_coupler || false,
    eq_co2: entry.eq_co2 || false,
    reason: entry.reason || null,
    chemical_name: entry.chemical_name || null,
    chemical_concentration: entry.chemical_concentration || null,
    chemical_temperature: entry.chemical_temperature || null,
    chemical_contact_time: entry.chemical_contact_time || null,
    proc_rinse_water: entry.proc_rinse_water || false,
    proc_circulation: entry.proc_circulation || false,
    proc_rinse_co2: entry.proc_rinse_co2 || false,
    proc_disassembly: entry.proc_disassembly || false,
    ctrl_visual: entry.ctrl_visual || false,
    ctrl_co2_pressure: entry.ctrl_co2_pressure || false,
    ctrl_tightness: entry.ctrl_tightness || false,
    ctrl_valve: entry.ctrl_valve || false,
    mismatch_note: entry.mismatch_note || null,
    mismatch_action: entry.mismatch_action || null,
    approved_by: entry.approved_by || null,

    performed_by: entry.performed_by,
    note: entry.note,
    source: entry.source || 'manual',
    created_at: entry.created_at,
    step_times: entry.step_times || {},
  };
  try {
    if (isRemoteId(entry.id)) {
      const { error } = await supabase.from('bottle_sanitation_logs').update(payload).eq('id', entry.id);
      if (!error) return true;
    } else {
      const { data } = await supabase.from('bottle_sanitation_logs').insert([payload]).select();
      if (data && data[0]) {
        entry.id = data[0].id; // lokální ID nahradíme skutečným z databáze
        return true;
      }
    }
  } catch {}

  // Fallback do localStorage
  const raw = localStorage.getItem(BOTTLE_SAN_STORAGE_KEY);
  let arr: BottleSanitationEntry[] = [];
  try {
    if (raw) arr = JSON.parse(raw);
  } catch {}
  const idx = arr.findIndex((x) => x.id === entry.id);
  if (idx >= 0) arr[idx] = entry;
  else arr.push(entry);
  localStorage.setItem(BOTTLE_SAN_STORAGE_KEY, JSON.stringify(arr));
  return false;
}

export async function removeBottleSanEntry(id: string): Promise<void> {
  try {
    if (isRemoteId(id)) {
      await supabase.from('bottle_sanitation_logs').delete().eq('id', id);
    }
  } catch {}
  const raw = localStorage.getItem(BOTTLE_SAN_STORAGE_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      localStorage.setItem(
        BOTTLE_SAN_STORAGE_KEY,
        JSON.stringify(arr.filter((x: BottleSanitationEntry) => x.id !== id))
      );
    } catch {}
  }
}

// Promítnutí odškrtnutých položek checklistu stáčení lahví do polí deníku.
// „Proplach čistou vodou“ se počítá jen z položek, které vodu výslovně zmiňují
// (v měsíčním checklistu jde o louh nechaný na cestách, ne o oplach vodou).
export function mapChecklistToBottleSan(checkedItems: { id: string; text: string }[]): Record<BottleSanField, boolean> {
  const texts = checkedItems.map((i) => i.text.toLowerCase());
  const has = (re: RegExp) => texts.some((t) => re.test(t));
  return {
    louh: has(/louh/),
    proplach_vodou: has(/(voda|vodou|vody|vodní)/),
    cela_cesta_na_louhu: has(/(cesta|cesty|cestu|vedení|vzduchové)/) && has(/louh/),
    prostory: has(/(prostor|podlah|stěn|stěny|zeď|úklid|uklid|ploch|stol|odkládací)/),
  };
}

// Automatický zápis do deníku lahví po dokončení checklistu
// („Konec stáčení" / „Měsíční údržba"). Pokud pro dané datum už záznam
// existuje, pole se doplní (OR) a poznámka se označí; jinak se vytvoří nový.
export async function autoLogBottleSanitationFromChecklist(opts: {
  dateStr: string;
  checkedItems: { id: string; text: string }[];
  performedBy?: string | null;
}): Promise<void> {
  const { dateStr, checkedItems, performedBy } = opts;
  if (!dateStr || checkedItems.length === 0) return;
  const mapped = mapChecklistToBottleSan(checkedItems);
  const existing = await loadBottleSanitation();
  const found = existing.find((e) => e.sanitation_date === dateStr);

  // Čas zápisu — použije se pro všechny nově odškrtnuté kroky.
  const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  // Která pole se daným zápisem mění (klíč -> nová boolean hodnota).
  const changed: Record<string, boolean> = {
    louh: false,
    proplach_vodou: false,
    cela_cesta_na_louhu: false,
    prostory: false,
  };
  (Object.keys(mapped) as BottleSanField[]).forEach((f) => {
    const newVal = found ? found[f] || mapped[f] : mapped[f];
    changed[f] = newVal;
  });

  if (found) {
    const stepTimes = { ...(found.step_times || {}) };
    (Object.keys(changed)).forEach((f) => {
      if (changed[f]) stepTimes[f] = stepTimes[f] || timeStr;
    });

    await saveBottleSanEntry({
      ...found,
      louh: changed.louh,
      proplach_vodou: changed.proplach_vodou,
      cela_cesta_na_louhu: changed.cela_cesta_na_louhu,
      prostory: changed.prostory,
      step_times: stepTimes,
      performed_by: found.performed_by || performedBy || null,
      note: found.note
        ? found.note.includes('Auto-zápis z checklistu')
          ? found.note
          : found.note + ' | Auto-zápis z checklistu'
        : 'Auto-zápis z checklistu',
      source: 'checklist',
    });
  } else {
    const entry = newBottleSanEntry(dateStr, performedBy || null);
    entry.louh = mapped.louh;
    entry.proplach_vodou = mapped.proplach_vodou;
    entry.cela_cesta_na_louhu = mapped.cela_cesta_na_louhu;
    entry.prostory = mapped.prostory;
    const stepTimes: Record<string, string> = {};
    if (entry.louh) stepTimes.louh = timeStr;
    if (entry.proplach_vodou) stepTimes.proplach_vodou = timeStr;
    if (entry.cela_cesta_na_louhu) stepTimes.cela_cesta_na_louhu = timeStr;
    if (entry.prostory) stepTimes.prostory = timeStr;
    entry.step_times = stepTimes;
    entry.note = 'Auto-zápis z checklistu';
    entry.source = 'checklist';
    await saveBottleSanEntry(entry);
  }
}
