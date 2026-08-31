import { describe, it, expect, vi, beforeEach } from 'vitest';

// tapSanitation.ts importuje supabase klienta, který v testech není potřeba
// (a bez VITE_* proměnných by spadl). Stub vrací „prázdno" bez chyby, takže
// se čistě otestuje fallback do localStorage (offline režim aplikace).
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => ({ data: null, error: null }),
        }),
        single: async () => ({ data: null, error: null }),
      }),
      update: () => ({
        eq: () => ({
          select: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => ({
        select: async () => ({ data: null, error: null }),
      }),
      delete: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
  },
}));

import {
  newTapSanEntry,
  nowTimeStr,
  DEFAULT_TAP_SANITATION_STEPS,
  TAP_SAN_REASON_LABELS,
  TAP_SAN_STORAGE_KEY,
  type TapSanitationEntry,
} from './tapSanitation';

describe('newTapSanEntry (nový záznam sanitačního deníku výčepu)', () => {
  it('vytvoří záznam se všemi 6 výchozími kroky a aktuálním časem', () => {
    const e = newTapSanEntry('tap-1', 'Výčep 1', '2026-08-11', 'Sládek');
    expect(e.tap_id).toBe('tap-1');
    expect(e.tap_name).toBe('Výčep 1');
    expect(e.sanitation_date).toBe('2026-08-11');
    expect(e.performed_by).toBe('Sládek');
    expect(e.reason).toBe('pred_stacenim');
    expect(e.source).toBe('manual');
    expect(e.steps).toHaveLength(6);
    expect(e.steps.every((s) => s.completed === false)).toBe(true);
    expect(e.steps.every((s) => s.completedAt === null)).toBe(true);
    expect(e.sanitation_time).toMatch(/^\d{2}:\d{2}$/);
    expect(e.created_at).toBeTruthy();
  });

  it('defaultně nedoplňuje jméno provádějící osoby', () => {
    const e = newTapSanEntry('tap-2', 'Výčep 2', '2026-08-11');
    expect(e.performed_by).toBeNull();
  });

  it('DEFAULT_TAP_SANITATION_STEPS obsahuje povinné kroky', () => {
    expect(DEFAULT_TAP_SANITATION_STEPS).toHaveLength(6);
    const texts = DEFAULT_TAP_SANITATION_STEPS.map((s) => s.text.toLowerCase());
    expect(texts.some((t) => t.includes('oplach vodou'))).toBe(true);
    expect(texts.some((t) => t.includes('louh'))).toBe(true);
    expect(texts.some((t) => t.includes('rozebr'))).toBe(true);
    expect(texts.some((t) => t.includes('vizuální'))).toBe(true);
    // ID kroků jsou unikátní
    const ids = DEFAULT_TAP_SANITATION_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TAP_SAN_REASON_LABELS má všechny 4 důvody', () => {
    expect(Object.keys(TAP_SAN_REASON_LABELS).sort()).toEqual([
      'mesicni',
      'oprava',
      'po_staceni',
      'pred_stacenim',
    ]);
    expect(TAP_SAN_REASON_LABELS.pred_stacenim).toContain('Před');
  });

  it('nowTimeStr vrací čas ve formátu HH:MM', () => {
    expect(nowTimeStr()).toMatch(/^\d{2}:\d{2}$/);
  });
});

