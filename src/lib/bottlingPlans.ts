// ⚗️ Plánování stáčení — „Co je potřeba stočit"
// ---------------------------------------------------------------------------
// Datové typy, API volání a pomocné funkce pro tabulku bottling_plans.
// Úkol zadává admin/sládek/šéf (isBottlingManager), stáčeč vidí úkoly
// zvýrazněné v zápisu stáčení a přepíná je na „hotovo".
import { supabase } from './supabase';
import type { Package } from './supabase';

export type BottlingPlanStatus = 'planned' | 'done' | 'cancelled';

export type BottlingPlan = {
  id: string;
  beer_id: string | null;
  keg_pkg_id: string | null;
  keg_qty: number;
  pkg_id: string | null;
  qty: number;
  pkg2_id: string | null;
  qty2: number;
  pkg3_id: string | null;
  qty3: number;
  planned_date: string; // YYYY-MM-DD
  note: string | null;
  status: BottlingPlanStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BottlingPlanInput = {
  beer_id: string;
  keg_pkg_id: string | null;
  keg_qty: number;
  pkg_id: string | null;
  qty: number;
  pkg2_id: string | null;
  qty2: number;
  pkg3_id: string | null;
  qty3: number;
  planned_date: string;
  note?: string | null;
};

export const BOTTLING_MANAGER_ROLES = ['admin', 'sef', 'sladek', 'boss', 'manager'];

/** Může uživatel zadávat/upravovat/mazat úkoly stáčení? (shodné s permissions.ts) */
export function isBottlingManager(role?: string | null): boolean {
  return BOTTLING_MANAGER_ROLES.includes((role || '').toLowerCase().trim());
}

export async function saveBottlingPlan(input: BottlingPlanInput) {
  const payload: Record<string, any> = { ...input };
  if (!payload.note || !String(payload.note).trim()) payload.note = null;
  return supabase.from('bottling_plans').insert(payload).select().single();
}

export async function updateBottlingPlan(id: string, patch: Partial<BottlingPlanInput>) {
  const payload: Record<string, any> = { ...patch };
  if ('note' in payload && (!payload.note || !String(payload.note).trim())) payload.note = null;
  return supabase.from('bottling_plans').update(payload).eq('id', id);
}

export async function deleteBottlingPlan(id: string) {
  return supabase.from('bottling_plans').delete().eq('id', id);
}

export async function setPlanStatus(id: string, status: BottlingPlanStatus) {
  return supabase.from('bottling_plans').update({ status }).eq('id', id);
}

// ---- Zobrazení úkolu: řádky „obal × počet" ----
export type PlanLine = { label: string; qty: number };

export function planLines(plan: BottlingPlan, packages: Package[], druh: 'vse' | 'lahve' | 'kegy' = 'vse'): PlanLine[] {
  const lines: PlanLine[] = [];
  const add = (pkgId: string | null, qty: number) => {
    if (!pkgId || qty <= 0) return;
    const pkg = packages.find((p) => p.id === pkgId);
    lines.push({ label: pkg?.label || '?', qty });
  };
  // Úkol může nést lahve i sudy najednou. Stáčeč lahví ale nepotřebuje vidět
  // sudovou část a naopak — proto se dá vyfiltrovat podle druhu.
  if (druh !== 'kegy') {
    add(plan.pkg_id, plan.qty);
    add(plan.pkg2_id, plan.qty2);
    add(plan.pkg3_id, plan.qty3);
  }
  if (druh !== 'lahve') add(plan.keg_pkg_id, plan.keg_qty);
  return lines;
}

/** Nese úkol sudovou část? Podle toho se ukáže stáčeči KEGů. */
export function maKegovouCast(plan: BottlingPlan): boolean {
  return !!plan.keg_pkg_id && plan.keg_qty > 0;
}

/** Nese úkol lahvovou část? */
export function maLahvovouCast(plan: BottlingPlan): boolean {
  return (!!plan.pkg_id && plan.qty > 0) || (!!plan.pkg2_id && plan.qty2 > 0) || (!!plan.pkg3_id && plan.qty3 > 0);
}

// ---- Odznáček „nové úkoly" pro stáčeče (localStorage) ----
const SEEN_KEY = 'bottling_plan_seen_at';

export function getPlanSeenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) || 0);
  } catch {
    return 0;
  }
}

export function markPlanSeenAt(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Úkol je „nový", pokud je stále plánovaný a byl vytvořen/změněn po posledním shlédnutí. */
export function isPlanUnseen(plan: BottlingPlan, seenAt: number): boolean {
  if (plan.status !== 'planned') return false;
  if (!seenAt) return true;
  return new Date(plan.updated_at).getTime() > seenAt;
}
