import { supabase } from './supabase';
import { zalogujANahlas } from './chybyHlaseni';

export type KegSanitationEntry = {
  id: string;
  sanitation_date: string; // YYYY-MM-DD
  sanitation_time: string | null; // HH:MM
  performed_by: string | null;
  approved_by: string | null;
  reason: string | null; // 'pred_stacenim' | 'po_staceni' | 'mesicni'
  
  // Checklist před stáčením (Before)
  proc_rinse_naoh_2_20: boolean;
  proc_rinse_persteril_02_10: boolean;
  proc_rinse_water_before: boolean;
  proc_scrub_valves_naoh_2_15: boolean;
  proc_spray_valves_persteril_02_10: boolean;
  proc_rinse_water_after_valves: boolean;
  
  // Checklist po stáčení (After)
  proc_end_rinse_lines_water: boolean;
  proc_end_rinse_valves_water: boolean;
  proc_end_rinse_couplers_water: boolean;
  proc_end_rinse_floors_cellar: boolean;
  proc_end_rinse_floors_walls_bottlers: boolean;
  proc_end_coupler_heads_persteril_bucket: boolean;
  
  // Měsíční sanitace (Monthly)
  proc_month_disassemble_couplers: boolean;
  proc_month_clean_brush_24h: boolean;
  proc_month_rinse_water: boolean;
  proc_month_visual_clean: boolean;

  note: string | null;
  source?: 'manual' | 'checklist' | null;
  created_at: string;
  // Časy jednotlivých kroků: klíč = pole deníku (proc_rinse_naoh_2_20,
  // proc_end_rinse_lines_water, …), hodnota = HH:MM.
  step_times: Record<string, string>;
};

export const KEG_SAN_STORAGE_KEY = 'keg_sanitation_logs';

const isRemoteId = (id: string) => id.includes('-');

export function newKegSanEntry(dateStr: string, performedBy?: string | null): KegSanitationEntry {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    id: String(Date.now()),
    sanitation_date: dateStr,
    sanitation_time: timeStr,
    performed_by: performedBy || null,
    approved_by: '',
    reason: 'pred_stacenim',
    
    // Checklist před stáčením
    proc_rinse_naoh_2_20: false,
    proc_rinse_persteril_02_10: false,
    proc_rinse_water_before: false,
    proc_scrub_valves_naoh_2_15: false,
    proc_spray_valves_persteril_02_10: false,
    proc_rinse_water_after_valves: false,
    
    // Checklist po stáčení
    proc_end_rinse_lines_water: false,
    proc_end_rinse_valves_water: false,
    proc_end_rinse_couplers_water: false,
    proc_end_rinse_floors_cellar: false,
    proc_end_rinse_floors_walls_bottlers: false,
    proc_end_coupler_heads_persteril_bucket: false,
    
    // Měsíční sanitace
    proc_month_disassemble_couplers: false,
    proc_month_clean_brush_24h: false,
    proc_month_rinse_water: false,
    proc_month_visual_clean: false,

    note: null,
    source: 'manual',
    created_at: now.toISOString(),
    step_times: {},
  };
}

export async function loadKegSanitation(): Promise<KegSanitationEntry[]> {
  let dbEntries: KegSanitationEntry[] = [];
  try {
    const { data } = await supabase
      .from('keg_sanitation_logs')
      .select('*')
      .order('sanitation_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) dbEntries = data as KegSanitationEntry[];
  } catch (err) {
    zalogujANahlas('Error fetching keg sanitation logs', err);
  }

  let local: KegSanitationEntry[] = [];
  try {
    const raw = localStorage.getItem(KEG_SAN_STORAGE_KEY);
    if (raw) local = JSON.parse(raw);
  } catch {}

  const combined = [...local, ...dbEntries];
  const unique = new Map<string, KegSanitationEntry>();
  combined.forEach((e) => {
    const key = e.id || `${e.sanitation_date}-${e.created_at}`;
    if (!unique.has(key)) unique.set(key, e);
  });
  return Array.from(unique.values()).sort((a, b) => {
    return new Date(b.created_at || b.sanitation_date).getTime() - new Date(a.created_at || a.sanitation_date).getTime();
  });
}

export async function saveKegSanEntry(entry: KegSanitationEntry): Promise<boolean> {
  const payload = {
    sanitation_date: entry.sanitation_date,
    sanitation_time: entry.sanitation_time || null,
    performed_by: entry.performed_by,
    approved_by: entry.approved_by || null,
    reason: entry.reason || null,
    
    proc_rinse_naoh_2_20: entry.proc_rinse_naoh_2_20,
    proc_rinse_persteril_02_10: entry.proc_rinse_persteril_02_10,
    proc_rinse_water_before: entry.proc_rinse_water_before,
    proc_scrub_valves_naoh_2_15: entry.proc_scrub_valves_naoh_2_15,
    proc_spray_valves_persteril_02_10: entry.proc_spray_valves_persteril_02_10,
    proc_rinse_water_after_valves: entry.proc_rinse_water_after_valves,
    
    proc_end_rinse_lines_water: entry.proc_end_rinse_lines_water,
    proc_end_rinse_valves_water: entry.proc_end_rinse_valves_water,
    proc_end_rinse_couplers_water: entry.proc_end_rinse_couplers_water,
    proc_end_rinse_floors_cellar: entry.proc_end_rinse_floors_cellar,
    proc_end_rinse_floors_walls_bottlers: entry.proc_end_rinse_floors_walls_bottlers,
    proc_end_coupler_heads_persteril_bucket: entry.proc_end_coupler_heads_persteril_bucket,
    
    proc_month_disassemble_couplers: entry.proc_month_disassemble_couplers,
    proc_month_clean_brush_24h: entry.proc_month_clean_brush_24h,
    proc_month_rinse_water: entry.proc_month_rinse_water,
    proc_month_visual_clean: entry.proc_month_visual_clean,

    note: entry.note,
    source: entry.source || 'manual',
    created_at: entry.created_at,
    step_times: entry.step_times || {},
  };

  try {
    if (isRemoteId(entry.id)) {
      const { error } = await supabase.from('keg_sanitation_logs').update(payload).eq('id', entry.id);
      if (!error) return true;
    } else {
      const { data } = await supabase.from('keg_sanitation_logs').insert([payload]).select();
      if (data && data[0]) {
        entry.id = data[0].id;
        return true;
      }
    }
  } catch {}

  const raw = localStorage.getItem(KEG_SAN_STORAGE_KEY);
  let arr: KegSanitationEntry[] = [];
  try {
    if (raw) arr = JSON.parse(raw);
  } catch {}
  const idx = arr.findIndex((x) => x.id === entry.id);
  if (idx >= 0) arr[idx] = entry;
  else arr.push(entry);
  localStorage.setItem(KEG_SAN_STORAGE_KEY, JSON.stringify(arr));
  return false;
}

export async function removeKegSanEntry(id: string): Promise<void> {
  try {
    if (isRemoteId(id)) {
      await supabase.from('keg_sanitation_logs').delete().eq('id', id);
    }
  } catch {}
  const raw = localStorage.getItem(KEG_SAN_STORAGE_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      localStorage.setItem(
        KEG_SAN_STORAGE_KEY,
        JSON.stringify(arr.filter((x: KegSanitationEntry) => x.id !== id))
      );
    } catch {}
  }
}

export function isLastWeekOfMonth(date: Date = new Date()): boolean {
  const nextWeek = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
  return nextWeek.getMonth() !== date.getMonth();
}

export async function autoLogKegSanitationFromChecklist(opts: {
  dateStr: string;
  checkedMap: Record<string, boolean>;
  performedBy?: string | null;
  phase: 'start' | 'end' | 'monthly';
}): Promise<void> {
  const { dateStr, checkedMap, performedBy, phase } = opts;
  if (!dateStr) return;

  const existing = await loadKegSanitation();
  const found = existing.find((e) => e.sanitation_date === dateStr);

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const entry: KegSanitationEntry = found
    ? { ...found }
    : {
        ...newKegSanEntry(dateStr, performedBy || null),
        id: String(Date.now()),
        created_at: now.toISOString(),
      };

  entry.sanitation_time = entry.sanitation_time || timeStr;
  entry.performed_by = entry.performed_by || performedBy || null;
  entry.source = 'checklist';

  // Sleduj, které kroky se nově zapisují, abych k nim přiřadil čas provedení.
  const step_times = { ...(entry.step_times || {}) };
  const mark = (key: string, done: boolean) => {
    if (done) {
      step_times[key] = step_times[key] || timeStr;
    }
  };

  if (phase === 'start') {
    entry.reason = 'pred_stacenim';
    // Volba chemie pro proplach cest: NaOH 2% (20 min) NEBO Persteril 0.2% (10 min).
    // Starší checklist bez uložené volby se vyhodnotí jako NaOH (původní chování).
    const storedRinseChoice = checkedMap['keg_start_1_choice'] as unknown as string | undefined;
    const rinseChoice = storedRinseChoice === 'persteril' ? 'persteril' : checkedMap['keg_start_1'] ? 'naoh' : null;
    entry.proc_rinse_naoh_2_20 = rinseChoice === 'naoh';
    entry.proc_rinse_persteril_02_10 = rinseChoice === 'persteril';
    if (rinseChoice === 'naoh') {
      mark('proc_rinse_naoh_2_20', true);
      delete step_times['proc_rinse_persteril_02_10'];
    } else if (rinseChoice === 'persteril') {
      mark('proc_rinse_persteril_02_10', true);
      delete step_times['proc_rinse_naoh_2_20'];
    }
    mark('proc_spray_valves_persteril_02_10', !!checkedMap['keg_start_valves_spray']);
    if (checkedMap['keg_start_valves_spray']) entry.proc_spray_valves_persteril_02_10 = true;
    mark('proc_rinse_water_after_valves', !!checkedMap['keg_start_valves_rinse']);
    if (checkedMap['keg_start_valves_rinse']) entry.proc_rinse_water_after_valves = true;
    mark('proc_rinse_water_before', !!checkedMap['keg_start_bottler_rinse']);
    if (checkedMap['keg_start_bottler_rinse']) entry.proc_rinse_water_before = true;
  } else if (phase === 'end') {
    entry.reason = 'po_staceni';
    mark('proc_end_rinse_lines_water', !!checkedMap['keg_end_1']);
    if (checkedMap['keg_end_1']) entry.proc_end_rinse_lines_water = true;
    mark('proc_end_rinse_valves_water', !!checkedMap['keg_end_2']);
    if (checkedMap['keg_end_2']) entry.proc_end_rinse_valves_water = true;
    mark('proc_end_rinse_couplers_water', !!checkedMap['keg_end_3']);
    if (checkedMap['keg_end_3']) entry.proc_end_rinse_couplers_water = true;
    mark('proc_end_rinse_floors_cellar', !!checkedMap['keg_end_4']);
    if (checkedMap['keg_end_4']) entry.proc_end_rinse_floors_cellar = true;
    mark('proc_end_rinse_floors_walls_bottlers', !!checkedMap['keg_end_5']);
    if (checkedMap['keg_end_5']) entry.proc_end_rinse_floors_walls_bottlers = true;
    mark('proc_end_coupler_heads_persteril_bucket', !!checkedMap['keg_end_6']);
    if (checkedMap['keg_end_6']) entry.proc_end_coupler_heads_persteril_bucket = true;
  } else if (phase === 'monthly') {
    entry.reason = 'mesicni';
    mark('proc_month_disassemble_couplers', !!checkedMap['keg_month_1']);
    if (checkedMap['keg_month_1']) entry.proc_month_disassemble_couplers = true;
    mark('proc_month_clean_brush_24h', !!checkedMap['keg_month_2']);
    if (checkedMap['keg_month_2']) entry.proc_month_clean_brush_24h = true;
    mark('proc_month_rinse_water', !!checkedMap['keg_month_3']);
    if (checkedMap['keg_month_3']) entry.proc_month_rinse_water = true;
    mark('proc_month_visual_clean', !!checkedMap['keg_month_4']);
    if (checkedMap['keg_month_4']) entry.proc_month_visual_clean = true;
  }

  entry.step_times = step_times;

  const prefix = `Auto-zápis z checklistu (${phase === 'start' ? 'příprava' : phase === 'end' ? 'úklid' : 'měsíční'})`;
  if (entry.note) {
    if (!entry.note.includes(prefix)) {
      entry.note = `${entry.note} | ${prefix}`;
    }
  } else {
    entry.note = prefix;
  }

  await saveKegSanEntry(entry);
}
