import { describe, it, expect, vi, beforeEach } from 'vitest';

const zalogujANahlasMock = vi.hoisted(() => vi.fn());
vi.mock('./chybyHlaseni', () => ({ zalogujANahlas: zalogujANahlasMock }));

const supabaseMock = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => supabaseMock.insert(...args),
      update: (...args: unknown[]) => ({ eq: (...eqArgs: unknown[]) => supabaseMock.update(...args, ...eqArgs) }),
      delete: () => ({ eq: (...eqArgs: unknown[]) => supabaseMock.delete(...eqArgs) }),
    }),
  },
}));

import { isReminderForUser, normalizeTargetEmails, createReminder, acknowledgeReminder, deleteReminder, type ReminderItem } from './reminders';

// Z provozu 16. 9. 2026: skutečné odmítnutí serveru (RLS, špatná data — NE
// výpadek sítě, ten appka sama zařadí do fronty přes offlineFetch) se dřív
// tiše ztratilo. `fetchReminders` navíc při dalším načtení přepíše lokální
// kopii tím, co vrátí server — připomínka pro tým beze stopy zmizela.
// Teď se aspoň zaloguje, ať to jde dohledat v Diagnostice.
describe('tiché selhání zápisu do databáze se loguje (ne ztrácí beze stopy)', () => {
  beforeEach(() => {
    zalogujANahlasMock.mockClear();
    localStorage.clear();
    supabaseMock.insert.mockReset();
    supabaseMock.update.mockReset();
    supabaseMock.delete.mockReset();
  });

  it('createReminder zaloguje skutečné odmítnutí serveru', async () => {
    supabaseMock.insert.mockRejectedValue(new Error('new row violates row-level security policy'));
    await createReminder({ title: 'Test', date_time: '2026-09-20T10:00', target_role: 'all', display_mode: 'both', created_by: 'a@brew.cz' });
    expect(zalogujANahlasMock).toHaveBeenCalledTimes(1);
    expect(zalogujANahlasMock.mock.calls[0][0]).toMatch(/připomínky/i);
  });

  it('createReminder při úspěchu nic neloguje', async () => {
    supabaseMock.insert.mockResolvedValue({ data: null, error: null });
    await createReminder({ title: 'Test', date_time: '2026-09-20T10:00', target_role: 'all', display_mode: 'both', created_by: 'a@brew.cz' });
    expect(zalogujANahlasMock).not.toHaveBeenCalled();
  });

  it('acknowledgeReminder zaloguje skutečné odmítnutí serveru', async () => {
    localStorage.setItem('reminders_list_v1', JSON.stringify([makeReminder({ id: 'r1' })]));
    supabaseMock.update.mockRejectedValue(new Error('permission denied'));
    await acknowledgeReminder('r1', 'a@brew.cz');
    expect(zalogujANahlasMock).toHaveBeenCalledTimes(1);
  });

  it('deleteReminder zaloguje skutečné odmítnutí serveru', async () => {
    supabaseMock.delete.mockRejectedValue(new Error('permission denied'));
    await deleteReminder('r1');
    expect(zalogujANahlasMock).toHaveBeenCalledTimes(1);
  });
});

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
