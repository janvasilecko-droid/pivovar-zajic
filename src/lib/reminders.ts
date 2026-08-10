import { supabase } from './supabase';
import { isNotificationSupported, playOrderChime } from './notifications';

export type ReminderDisplayMode = 'desktop_push' | 'login_modal' | 'both';

export type ReminderTarget = 'all' | 'admin' | 'sef' | 'sladek' | 'vyroba' | 'obchod' | string;

export type ReminderItem = {
  id: string;
  title: string;
  note?: string;
  date_time: string; // ISO string: YYYY-MM-DDTHH:mm
  target_role: ReminderTarget; // 'all' | 'admin' | 'sef' | 'sladek' | 'vyroba' | 'obchod' | email
  target_emails?: string[]; // konkrétní e-maily příjemců (prázdné = cílí se podle target_role)
  display_mode: ReminderDisplayMode; // 'desktop_push' | 'login_modal' | 'both'
  created_by: string; // user email / name
  created_at: string;
  acknowledged_by: string[]; // list of user emails who clicked dismiss
  is_completed?: boolean;
};

const STORAGE_KEY = 'reminders_list_v1';

export function getLocalReminders(): ReminderItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveLocalReminders(reminders: ReminderItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {}
}

export async function fetchReminders(): Promise<ReminderItem[]> {
  try {
    const { data, error } = await supabase.from('reminders').select('*').order('date_time', { ascending: true });
    if (error || !data) {
      return getLocalReminders();
    }
    const mapped: ReminderItem[] = data.map((r: any) => ({
      id: r.id,
      title: r.title,
      note: r.note || undefined,
      date_time: r.date_time,
      target_role: r.target_role || 'all',
      target_emails: normalizeTargetEmails(r.target_emails),
      display_mode: r.display_mode || 'both',
      created_by: r.created_by || 'Systém',
      created_at: r.created_at,
      acknowledged_by: Array.isArray(r.acknowledged_by) ? r.acknowledged_by : [],
      is_completed: r.is_completed || false,
    }));
    saveLocalReminders(mapped);
    return mapped;
  } catch {
    return getLocalReminders();
  }
}

export async function createReminder(reminder: Omit<ReminderItem, 'id' | 'created_at' | 'acknowledged_by'>): Promise<ReminderItem> {
  const newR: ReminderItem = {
    ...reminder,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    acknowledged_by: [],
    is_completed: false,
  };

  const local = getLocalReminders();
  saveLocalReminders([newR, ...local]);

  try {
    await supabase.from('reminders').insert({
      id: newR.id,
      title: newR.title,
      note: newR.note,
      date_time: newR.date_time,
      target_role: newR.target_role,
      target_emails: newR.target_emails ?? [],
      display_mode: newR.display_mode,
      created_by: newR.created_by,
      created_at: newR.created_at,
      acknowledged_by: [],
      is_completed: false,
    });
  } catch {}

  return newR;
}

export async function acknowledgeReminder(reminderId: string, userEmail: string): Promise<void> {
  const local = getLocalReminders();
  const updated = local.map((r) => {
    if (r.id === reminderId) {
      const acked = new Set(r.acknowledged_by || []);
      acked.add(userEmail);
      return { ...r, acknowledged_by: Array.from(acked) };
    }
    return r;
  });
  saveLocalReminders(updated);

  try {
    const target = updated.find((r) => r.id === reminderId);
    if (target) {
      await supabase.from('reminders').update({ acknowledged_by: target.acknowledged_by }).eq('id', reminderId);
    }
  } catch {}
}

export async function deleteReminder(reminderId: string): Promise<void> {
  const local = getLocalReminders();
  const next = local.filter((r) => r.id !== reminderId);
  saveLocalReminders(next);

  try {
    await supabase.from('reminders').delete().eq('id', reminderId);
  } catch {}
}

/**
 * Normalizuje target_emails na pole e-mailů (malými písmeny, bez mezer).
 * Přijímá pole z DB i starší záznamy z localStorage (řetězec čárkami oddělený).
 */
export function normalizeTargetEmails(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((e) => String(e).toLowerCase().trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,;\s]+/)
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
}

export function isReminderForUser(reminder: ReminderItem, userEmail: string, userRole: string): boolean {
  const emailNorm = userEmail.toLowerCase().trim();

  // 1) Konkrétní e-maily mají přednost — zobrazí se jen vybraným uživatelům.
  const emails = normalizeTargetEmails(reminder.target_emails);
  if (emails.length > 0) {
    return emails.includes(emailNorm);
  }

  const target = (reminder.target_role || 'all').toLowerCase();
  if (target === 'all') return true;

  const roleNorm = userRole.toLowerCase().trim();

  if (target === emailNorm) return true;
  if (target === roleNorm) return true;

  // Role mappings (e.g. 'admin' matches 'admin' / 'boss' / 'sef')
  if (target === 'admin' && (roleNorm === 'admin' || roleNorm === 'boss' || roleNorm === 'sef')) return true;
  if (target === 'sef' && (roleNorm === 'sef' || roleNorm === 'boss' || roleNorm === 'admin')) return true;
  if (target === 'sladek' && (roleNorm === 'sladek' || roleNorm === 'admin')) return true;
  if (target === 'vyroba' && (roleNorm === 'vyroba' || roleNorm === 'sladek' || roleNorm === 'admin')) return true;
  if (target === 'obchod' && (roleNorm === 'obchod' || roleNorm === 'sef' || roleNorm === 'admin')) return true;

  return false;
}
