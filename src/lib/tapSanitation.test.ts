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
  autoLogTapSanitationFromChecklist,
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

describe('autoLogTapSanitationFromChecklist (zápis po dokončení checklistu)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('nový záznam: splněné kroky, source=checklist, poznámka', async () => {
    await autoLogTapSanitationFromChecklist({
      tapId: 'tap-1',
      tapName: 'Výčep 1',
      dateStr: '2026-08-11',
      performedBy: 'Sládek',
      reason: 'mesicni',
      checkedSteps: [
        { id: 'step_1', text: 'Oplach vodou (studená voda, 30–60 sekund)', completedAt: '06:10' },
        { id: 'step_2', text: 'Sanitace louhem 2% NaOH (působení 10–15 min)', completedAt: '06:20' },
      ],
    });

    const raw = localStorage.getItem(TAP_SAN_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const entries = JSON.parse(raw!) as TapSanitationEntry[];
    expect(entries).toHaveLength(1);

    const e = entries[0];
    expect(e.tap_id).toBe('tap-1');
    expect(e.source).toBe('checklist');
    expect(e.reason).toBe('mesicni');
    expect(e.performed_by).toBe('Sládek');
    expect(e.note).toContain('Auto-zápis z checklistu');
    // Časy kroků se doplní z textů
    expect(e.water_rinse_time).toBe('06:10');
    expect(e.louh_sanitation_time).toBe('06:20');
    // Odsouhlasené kroky mají completed + completedAt
    const s1 = e.steps.find((s) => s.id === 'step_1');
    expect(s1?.completed).toBe(true);
    expect(s1?.completedAt).toBe('06:10');
  });

  it('doplní existující záznam (OR) — nesmaže dřívější kroky', async () => {
    // Vytvoříme první záznam ručně v localStorage (offline fallback).
    const first = newTapSanEntry('tap-1', 'Výčep 1', '2026-08-11', 'Sládek');
    first.steps[0].completed = true;
    first.steps[0].completedAt = '06:10';
    first.steps[1].completed = true;
    first.steps[1].completedAt = '06:20';
    first.water_rinse_time = '06:10';
    first.louh_sanitation_time = '06:20';
    localStorage.setItem(TAP_SAN_STORAGE_KEY, JSON.stringify([first]));

    // Druhý zápis z checklistu — oprava, další kroky
    await autoLogTapSanitationFromChecklist({
      tapId: 'tap-1',
      tapName: 'Výčep 1',
      dateStr: '2026-08-11',
      reason: 'oprava',
      checkedSteps: [
        { id: 'step_4', text: 'Rozebrání kohoutu a vyčištění kartáčem', completedAt: '07:05' },
      ],
    });

    const raw = localStorage.getItem(TAP_SAN_STORAGE_KEY);
    const entries = JSON.parse(raw!) as TapSanitationEntry[];
    expect(entries).toHaveLength(1); // OR — sloučeno do jednoho záznamu

    const e = entries[0];
    expect(e.steps[0].completed).toBe(true); // krok 1 zůstal
    expect(e.steps[0].completedAt).toBe('06:10');
    const s4 = e.steps.find((s) => s.id === 'step_4');
    expect(s4?.completed).toBe(true);
    expect(s4?.completedAt).toBe('07:05');
    expect(e.disassembly_time).toBe('07:05');
    expect(e.reason).toBe('oprava');
  });

  it('prázdný checklist nebo chybějící datum → nic se neuloží', async () => {
    await autoLogTapSanitationFromChecklist({
      tapId: 'tap-1',
      tapName: 'Výčep 1',
      dateStr: '2026-08-11',
      checkedSteps: [],
    });
    expect(localStorage.getItem(TAP_SAN_STORAGE_KEY)).toBeNull();

    await autoLogTapSanitationFromChecklist({
      tapId: 'tap-1',
      tapName: 'Výčep 1',
      dateStr: '',
      checkedSteps: [{ id: 'step_1', text: 'Oplach vodou' }],
    });
    expect(localStorage.getItem(TAP_SAN_STORAGE_KEY)).toBeNull();
  });
});
