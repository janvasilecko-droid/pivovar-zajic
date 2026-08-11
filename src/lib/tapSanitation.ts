// Sanitární deník pro výčepy — detailní záznam sanitace kohoutů a vedení
// Každý krok sanitace se zaznamenává s časem provedení
// Ukládá se do localStorage a případně do Supabase

import { supabase } from './supabase';

export type TapSanitationStep = {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: string | null; // HH:MM
  note?: string | null;
};

export type TapSanitationEntry = {
  id: string;
  tap_id: string;
  tap_name: string;
  sanitation_date: string; // YYYY-MM-DD
  sanitation_time: string; // HH:MM (hlavní čas začátku)
  performed_by: string | null;
  approved_by: string | null;
  reason: 'pred_stacenim' | 'po_staceni' | 'mesicni' | 'oprava';
  
  // Detailní kroky sanitace
  steps: TapSanitationStep[];
  
  // Rychlé parametry
  water_rinse_time?: string | null; // Čas oplachu vodou
  louh_sanitation_time?: string | null; // Čas sanitace louhem
  disassembly_time?: string | null; // Čas rozebrání
  visual_check_time?: string | null; // Čas vizuální kontroly
  
  note: string | null;
  source?: 'manual' | 'checklist' | null;
  created_at: string;
};

export const TAP_SAN_STORAGE_KEY = 'tap_sanitation_logs';

const isRemoteId = (id: string) => id.includes('-');

export function newTapSanEntry(
  tapId: string, 
  tapName: string, 
  dateStr: string, 
  performedBy?: string | null
): TapSanitationEntry {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return {
    id: String(Date.now()),
    tap_id: tapId,
    tap_name: tapName,
    sanitation_date: dateStr,
    sanitation_time: timeStr,
    performed_by: performedBy || null,
    approved_by: '',
    reason: 'pred_stacenim',
    steps: [
      { id: 'step_1', text: 'Oplach vodou', completed: false, completedAt: null },
      { id: 'step_2', text: 'Sanitace louhem (2% NaOH)', completed: false, completedAt: null },
      { id: 'step_3', text: 'Oplach po louhu', completed: false, completedAt: null },
      { id: 'step_4', text: 'Rozebrání a vyčištění', completed: false, completedAt: null },
      { id: 'step_5', text: 'Vizuální kontrola', completed: false, completedAt: null },
      { id: 'step_6', text: 'Složení a kontrola těsnosti', completed: false, completedAt: null },
    ],
    water_rinse_time: null,
    louh_sanitation_time: null,
    disassembly_time: null,
    visual_check_time: null,
    note: null,
    source: 'manual',
    created_at: now.toISOString(),
  };
}

export function nowTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export async function loadTapSanitation(): Promise<TapSanitationEntry[]> {
  let dbEntries: TapSanitationEntry[] = [];
  try {
    const { data } = await supabase
      .from('tap_sanitation_logs')
      .select('*')
      .order('sanitation_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) dbEntries = data as TapSanitationEntry[];
  } catch (err) {
    console.error('Error fetching tap sanitation logs:', err);
  }

  let local: TapSanitationEntry[] = [];
  try {
    const raw = localStorage.getItem(TAP_SAN_STORAGE_KEY);
    if (raw) local = JSON.parse(raw);
  } catch {}

  const combined = [...local, ...dbEntries];
  const unique = new Map<string, TapSanitationEntry>();
  combined.forEach((e) => {
    const key = e.id || `${e.tap_id}-${e.sanitation_date}-${e.created_at}`;
    if (!unique.has(key)) unique.set(key, e);
  });

  return Array.from(unique.values()).sort((a, b) => {
    const dateCompare = b.sanitation_date.localeCompare(a.sanitation_date);
    if (dateCompare !== 0) return dateCompare;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

export async function saveTapSanEntry(entry: TapSanitationEntry): Promise<boolean> {
  entry.created_at = entry.created_at || new Date().toISOString();

  const payload = {
    tap_id: entry.tap_id,
    tap_name: entry.tap_name || null,
    sanitation_date: entry.sanitation_date,
    sanitation_time: entry.sanitation_time || null,
    performed_by: entry.performed_by || null,
    approved_by: entry.approved_by || null,
    reason: entry.reason || null,
    steps: entry.steps || [],
    water_rinse_time: entry.water_rinse_time || null,
    louh_sanitation_time: entry.louh_sanitation_time || null,
    disassembly_time: entry.disassembly_time || null,
    visual_check_time: entry.visual_check_time || null,
    note: entry.note || null,
    source: entry.source || 'manual',
    created_at: entry.created_at,
  };

  try {
    if (isRemoteId(entry.id)) {
      // Uživatelsky smazané/upravené záznamy se ukládají aktualizací.
      const { data } = await supabase
        .from('tap_sanitation_logs')
        .update(payload)
        .eq('id', entry.id)
        .select()
        .single();
      if (data) {
        entry.id = data.id;
        return true;
      }
    } else {
      // Nový záznam — nech DB vygenerovat uuid.
      const oldId = entry.id; // může být číselné lokální ID
      const { data } = await supabase
        .from('tap_sanitation_logs')
        .insert([payload])
        .select();
      if (data && data[0]) {
        entry.id = data[0].id; // lokální ID nahradíme skutečným z databáze
        // Odstranit případný lokální záznam se starým ID (prevence duplicit)
        if (oldId !== entry.id) {
          const raw0 = localStorage.getItem(TAP_SAN_STORAGE_KEY);
          if (raw0) {
            try {
              const arr0: TapSanitationEntry[] = JSON.parse(raw0);
              localStorage.setItem(
                TAP_SAN_STORAGE_KEY,
                JSON.stringify(arr0.filter((x) => x.id !== oldId))
              );
            } catch {}
          }
        }
        return true;
      }
    }
  } catch (err) {
    console.error('Error saving tap sanitation entry:', err);
  }

  // Fallback do localStorage
  const raw = localStorage.getItem(TAP_SAN_STORAGE_KEY);
  let arr: TapSanitationEntry[] = [];
  try {
    if (raw) arr = JSON.parse(raw);
  } catch {}
  const idx = arr.findIndex((x) => x.id === entry.id);
  if (idx >= 0) arr[idx] = entry;
  else arr.push(entry);
  localStorage.setItem(TAP_SAN_STORAGE_KEY, JSON.stringify(arr));
  return false;
}

export async function removeTapSanEntry(id: string): Promise<void> {
  try {
    if (isRemoteId(id)) {
      await supabase.from('tap_sanitation_logs').delete().eq('id', id);
    }
  } catch {}
  const raw = localStorage.getItem(TAP_SAN_STORAGE_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      localStorage.setItem(
        TAP_SAN_STORAGE_KEY,
        JSON.stringify(arr.filter((x: TapSanitationEntry) => x.id !== id))
      );
    } catch {}
  }
}

// Výchozí kroky sanitace výčepu
export const DEFAULT_TAP_SANITATION_STEPS: { id: string; text: string }[] = [
  { id: 'step_1', text: 'Oplach vodou (studená voda, 30–60 sekund)' },
  { id: 'step_2', text: 'Sanitace louhem 2% NaOH (působení 10–15 min)' },
  { id: 'step_3', text: 'Oplach po louhu (důkladný, odstranění zbytků louhu)' },
  { id: 'step_4', text: 'Rozebrání kohoutu a vyčištění kartáčem' },
  { id: 'step_5', text: 'Vizuální kontrola čistoty a poškození' },
  { id: 'step_6', text: 'Složení kohoutu a kontrola těsnosti' },
];

export const TAP_SAN_REASON_LABELS: Record<string, string> = {
  pred_stacenim: 'Před stáčením',
  po_staceni: 'Po stáčení',
  mesicni: 'Měsíční sanitace',
  oprava: 'Po opravě / poruše',
};

// Automatický zápis do deníku výčepu po dokončení checklistu sanitace výčepu.
// Pokud pro daný výčep a datum už záznam existuje, doplní se (OR).
export async function autoLogTapSanitationFromChecklist(opts: {
  tapId: string;
  tapName: string;
  dateStr: string;
  checkedSteps: { id: string; text: string; completedAt?: string }[];
  performedBy?: string | null;
  reason?: 'pred_stacenim' | 'po_staceni' | 'mesicni' | 'oprava';
}): Promise<void> {
  const { tapId, tapName, dateStr, checkedSteps, performedBy, reason = 'pred_stacenim' } = opts;
  if (!dateStr || checkedSteps.length === 0) return;

  const existing = await loadTapSanitation();
  const found = existing.find((e) => e.tap_id === tapId && e.sanitation_date === dateStr);

  const timeStr = nowTimeStr();
  const entry: TapSanitationEntry = found
    ? { ...found }
    : newTapSanEntry(tapId, tapName, dateStr, performedBy || null);

  entry.sanitation_time = entry.sanitation_time || timeStr;
  entry.performed_by = entry.performed_by || performedBy || null;
  entry.reason = reason;
  entry.source = 'checklist';

  const stepsMap = new Map(entry.steps.map(s => [s.id, s]));
  checkedSteps.forEach((step) => {
    const existingStep = stepsMap.get(step.id);
    if (existingStep) {
      existingStep.completed = true;
      existingStep.completedAt = step.completedAt || timeStr;
    } else {
      entry.steps.push({
        id: step.id,
        text: step.text,
        completed: true,
        completedAt: step.completedAt || timeStr,
      });
    }
  });

  // Doplnit rychlé časy z textů kroků
  const low = checkedSteps.map(s => s.text.toLowerCase());
  const waterIdx = low.findIndex(t => t.includes('oplach vodou') || (t.includes('oplach') && t.includes('vod')));
  const louhIdx = low.findIndex(t => t.includes('louh') || t.includes('naoh'));
  const disasmIdx = low.findIndex(t => t.includes('rozebr'));
  const visualIdx = low.findIndex(t => t.includes('vizu'));

  if (waterIdx >= 0) entry.water_rinse_time = checkedSteps[waterIdx].completedAt || timeStr;
  if (louhIdx >= 0) entry.louh_sanitation_time = checkedSteps[louhIdx].completedAt || timeStr;
  if (disasmIdx >= 0) entry.disassembly_time = checkedSteps[disasmIdx].completedAt || timeStr;
  if (visualIdx >= 0) entry.visual_check_time = checkedSteps[visualIdx].completedAt || timeStr;

  const prefix = 'Auto-zápis z checklistu';
  if (entry.note) {
    if (!entry.note.includes(prefix)) entry.note = `${entry.note} | ${prefix}`;
  } else {
    entry.note = prefix;
  }

  await saveTapSanEntry(entry);
}