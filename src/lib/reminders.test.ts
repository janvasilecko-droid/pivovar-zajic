import { describe, it, expect } from 'vitest';
import { isReminderForUser, normalizeTargetEmails, type ReminderItem } from './reminders';

function makeReminder(overrides: Partial<ReminderItem>): ReminderItem {
  return {
    id: 'r1',
    title: 'Test',
    date_time: '2026-08-15T10:00',
    target_role: 'all',
    display_mode: 'both',
    created_by: 'sender@brewery.cz',
    created_at: '2026-08-15T09:00',
    acknowledged_by: [],
    ...overrides,
  };
}

describe('normalizeTargetEmails', () => {
  it('převede e-maily na malá písmena a odstraní mezery', () => {
    expect(normalizeTargetEmails(['  A@B.CZ ', 'kolega@Firma.cz'])).toEqual(['a@b.cz', 'kolega@firma.cz']);
  });

  it('zvládne řetězec oddělený čárkou / středníkem / mezerami', () => {
    expect(normalizeTargetEmails('A@B.cz; kolega@firma.cz, treti@x.cz')).toEqual([
      'a@b.cz',
      'kolega@firma.cz',
      'treti@x.cz',
    ]);
  });

  it('vrátí prázdné pole pro undefined / null / prázdný řetězec', () => {
    expect(normalizeTargetEmails(undefined)).toEqual([]);
    expect(normalizeTargetEmails(null)).toEqual([]);
    expect(normalizeTargetEmails('')).toEqual([]);
  });
});

describe('isReminderForUser s target_emails', () => {
  it('zobrazí upomínku jen vybraným uživatelům', () => {
    const r = makeReminder({ target_role: 'custom', target_emails: ['a@brew.cz', 'b@brew.cz'] });
    expect(isReminderForUser(r, 'a@brew.cz', 'user')).toBe(true);
    expect(isReminderForUser(r, 'b@brew.cz', 'user')).toBe(true);
    expect(isReminderForUser(r, 'c@brew.cz', 'admin')).toBe(false);
  });

  it('role uživatele se nebere v úvahu, když jsou cílem konkrétní e-maily', () => {
    const r = makeReminder({ target_role: 'custom', target_emails: ['a@brew.cz'] });
    expect(isReminderForUser(r, 'admin@brew.cz', 'admin')).toBe(false);
  });

  it('ignoruje velká/malá písmena e-mailu příjemce', () => {
    const r = makeReminder({ target_role: 'custom', target_emails: ['a@brew.cz'] });
    expect(isReminderForUser(r, 'A@BREW.cz', 'user')).toBe(true);
  });
});

describe('isReminderForUser bez target_emails (staré chování)', () => {
  it('všichni → true pro každého', () => {
    expect(isReminderForUser(makeReminder({ target_role: 'all' }), 'x@brew.cz', 'user')).toBe(true);
  });

  it('role sládek → jen sládek', () => {
    expect(isReminderForUser(makeReminder({ target_role: 'sladek' }), 'a@brew.cz', 'sladek')).toBe(true);
    expect(isReminderForUser(makeReminder({ target_role: 'sladek' }), 'a@brew.cz', 'user')).toBe(false);
  });

  it('konkrétní e-mail v target_role (legacy) → shoda bez ohledu na velikost', () => {
    const r = makeReminder({ target_role: 'kolega@brew.cz' });
    expect(isReminderForUser(r, 'KOLEGA@brew.cz', 'user')).toBe(true);
    expect(isReminderForUser(r, 'jiny@brew.cz', 'user')).toBe(false);
  });

  it('role mapping zůstává (admin → sef, vyroba → sladek, obchod → jen obchod)', () => {
    expect(isReminderForUser(makeReminder({ target_role: 'admin' }), 'a@brew.cz', 'sef')).toBe(true);
    expect(isReminderForUser(makeReminder({ target_role: 'vyroba' }), 'a@brew.cz', 'sladek')).toBe(true);
    expect(isReminderForUser(makeReminder({ target_role: 'obchod' }), 'a@brew.cz', 'user')).toBe(false);
  });
});
