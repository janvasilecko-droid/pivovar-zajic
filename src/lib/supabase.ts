import { createClient } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const serviceKey = (import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string) || anonKey;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
});

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

/**
 * Subscribe to realtime changes on one or more tables and trigger a reload.
 * Returns nothing; calls `onChange` (debounced via microtask) whenever any
 * of the tables receives an INSERT/UPDATE/DELETE.
 *
 * Usage:  useRealtime(['bottling','fasovani'], load);
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let pending = false;
    const trigger = () => {
      if (pending) return;
      pending = true;
      Promise.resolve().then(() => { pending = false; ref.current(); });
    };
    const channels = tables.map((t) =>
      supabase
        .channel(`rt-${t}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t }, trigger)
        .subscribe()
    );
    window.addEventListener('pivovar:online-refetch', trigger);
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
      window.removeEventListener('pivovar:online-refetch', trigger);
    };
  }, [tables.join(',')]);
}

export type Beer = {
  id: string; name: string; short_name: string | null; degree: string | null; color: string | null;
  beer_color: string | null;
  price_per_liter: number | null;
  is_active: boolean; sort_order: number; created_at: string;
};

export const BEER_COLOR_PRESETS = [
  '#FEF3C7', '#FDE68A', '#FCD34D', '#F59E0B',
  '#FED7AA', '#FCA5A5', '#F87171', '#EF4444',
  '#DCFCE7', '#86EFAC', '#4ADE80', '#22C55E',
  '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6',
  '#E0E7FF', '#C4B5FD', '#A78BFA', '#8B5CF6',
  '#FCE7F3', '#F9A8D4', '#F472B6', '#EC4899',
  '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1',
  '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6',
  '#FECACA', '#FCA5A5', '#F87171', '#DC2626',
  '#44403B', '#1E293B', '#0F172A', '#F3F4F6',
];

export function beerBg(beer: { beer_color?: string | null } | null | undefined): string {
  return beer?.beer_color ?? '#F3F4F6';
}
export function beerText(beer: { beer_color?: string | null } | null | undefined): string {
  const c = beer?.beer_color;
  if (!c) return 'text-primary-900';
  const hex = c.replace('#', '');
  if (hex.length !== 6) return 'text-primary-900';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.55 ? 'text-white' : 'text-primary-900';
}
export function beerBorder(beer: { beer_color?: string | null } | null | undefined): string {
  return beer?.beer_color ?? '#E5E7EB';
}

/**
 * Vrátí zkratku piva (short_name), pokud existuje, jinak celý název.
 * Použít všude v UI, kde se zobrazuje název piva.
 */
export function beerName(beer: { short_name?: string | null; name?: string | null } | null | undefined): string {
  if (!beer) return '—';
  return beer.short_name || beer.name || '—';
}

export function formatPackageLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/(\d+(?:[.,]\d+)?)(\s*)([lL])\b/gi, '$1 L');
}

export function pkgBg(pkg: { volume_l?: number | null; kind?: string | null; label?: string | null } | null | undefined): string {
  if (!pkg) return '#F3F4F6';
  const vol = Number(pkg.volume_l ?? 0);
  const label = (pkg.label ?? '').toLowerCase();
  const isKeg = pkg.kind === 'keg' || label.includes('keg') || label.includes('sud');

  if (isKeg) {
    if (vol >= 45) return '#1E3A8A'; // KEG 50L - tmavě modrá
    if (vol >= 28) return '#D97706'; // KEG 30L - jantarově oranžová
    if (vol >= 18) return '#0D9488'; // KEG 20L - tyrkysová
    if (vol >= 14) return '#7C3AED'; // KEG 15L - fialová
    if (vol >= 8)  return '#E11D48'; // KEG 10L - tmavě růžová
    return '#475569';
  } else {
    // Lahve / PET / Sklo
    if (vol >= 1.4) return '#9333EA'; // Lahve 1.5L - purpurová
    if (vol >= 0.9) return '#059669'; // Lahve 1L - smaragdově zelená
    if (vol >= 0.7) return '#CA8A04'; // Lahve 0.75L - zlatá
    if (vol >= 0.45) return '#0284C7'; // Lahve 0.5L - modrá
    if (vol >= 0.3) return '#F43F5E'; // Lahve 0.33L - růžová
    return '#64748B';
  }
}

export function pkgText(pkg: { volume_l?: number | null; kind?: string | null; label?: string | null } | null | undefined): string {
  const c = pkgBg(pkg);
  if (c === '#F3F4F6' || c === '#E5E7EB') return 'text-neutral-900';
  return 'text-white';
}

export type Package = {
  id: string; code: string; kind: 'keg' | 'bottle'; volume_l: number;
  label: string; sort_order: number;
};
export type Place = {
  id: string; name: string; note: string | null; created_at: string;
  address: string | null; phone: string | null; opening_hours: string | null;
  contact_name?: string | null; email?: string | null;
  delivery_group?: string | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  role: 'admin' | 'user';
  receive_vehicle_alerts?: boolean | null;
  created_at: string;
};

export type Vehicle = {
  id: string;
  name: string;
  spz: string | null;
  stk_valid_until: string | null;
  highway_toll_valid_until: string | null;
  note: string | null;
  created_at?: string;
};

export type EntryRow = {
  id: string; entry_date: string;
  beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null;
  quantity: number; note: string | null; created_at: string;
  who?: string | null; reason?: string | null;
  source_volume_l?: number | null;
  tank_id?: string | null;
  cellar_tank_id?: string | null;
  loss_l?: number | null;
  kegs_used?: number | null;
  kegs_used_package_id?: string | null;
};


export type KeggingTank = {
  id: string;
  label: string | null;
  beer_id: string | null;
  beer_name: string | null;
  started_at: string;
  closed_at: string | null;
  note: string | null;
  created_at: string;
};

export type ParserAlias = {
  id: string;
  alias_text: string;
  beer_id: string | null;
  package_id: string | null;
  hit_count: number;
  created_at: string;
  updated_at: string;
};

export type AkceItem = {
  id: string;
  akce_id: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity_taken: number;
  quantity_returned: number;
  /** Jednotné množství: kladné = vráceno/přifasováno zpět do skladu, záporné = odvezeno/odečteno ze skladu */
  quantity: number;
  created_at: string;
};

export type Akce = {
  id: string;
  entry_date: string;
  name: string;
  who: string | null;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity_taken: number;
  quantity_returned: number;
  /** Kolik se na akci celkem vydělalo (Kč) */
  revenue: number;
  note: string | null;
  created_at: string;
  items?: AkceItem[];
};

export type CalendarEvent = {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  reminder: boolean;
  reminder_time: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
};

export type PriceListItem = {
  id: string;
  beer_id: string | null;
  package_id: string | null;
  price_per_unit: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CellarTank = {
  id: string;
  label: string;
  capacity_l: number;
  current_beer_id: string | null;
  current_beer_name: string | null;
  current_volume_l: number;
  status: 'empty' | 'filling' | 'active' | 'emptying' | 'cleaning' | 'sanitizing' | 'rinsing';
  note: string | null;
  kegging_date: string | null;
  beer_type: string | null;
  started_at: string | null;
  initial_volume_l: number | null;
  // Aktivní stáčecí zdroj — ze kterého tanku se právě odečítá stáčení
  kegging_active?: boolean | null;
  kegging_started_at?: string | null;
  kegging_ended_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CellarTransfer = {
  id: string;
  transfer_date: string;
  from_tank_id: string | null;
  to_tank_id: string | null;
  beer_id: string | null;
  beer_name: string | null;
  volume_l: number;
  loss_l: number;
  note: string | null;
  created_at: string;
};

export type CellarTankCycle = {
  id: string;
  tank_id: string | null;
  tank_label: string | null;
  beer_id: string | null;
  beer_name: string | null;
  initial_volume_l: number;
  kegged_volume_l: number;
  keg_count: number;
  loss_l: number;
  loss_pct: number;
  started_at: string | null;
  ended_at: string;
  duration_hours: number | null;
  note: string | null;
  created_at: string;
};


export type SanitationLog = {
  id: string;
  sanitation_date: string;
  sanitation_time?: string | null;
  tank_id: string | null;
  tank_label: string;
  method: 'kyselina_dusicna' | 'louh' | 'oplach_vodou' | 'persteril' | 'kombinovana';
  method_label: string;
  chemical_name: string | null;
  concentration_pct: number | null;
  temperature_c: number | null;
  duration_minutes: number | null;
  performed_by: string | null;
  note: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_by: string | null;
  changed_at: string;
};
