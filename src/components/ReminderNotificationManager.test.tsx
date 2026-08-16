import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { ReminderNotificationManager } from './ReminderNotificationManager';

const mocks = vi.hoisted(() => ({
  fetchReminders: vi.fn(),
  isReminderForUser: vi.fn(() => true),
  playOrderChime: vi.fn(),
  auth: {
    user: { email: 'worker@example.test', role: 'authenticated' },
    profile: { role: 'admin' },
  },
}));

vi.mock('../lib/reminders', () => ({
  fetchReminders: mocks.fetchReminders,
  isReminderForUser: mocks.isReminderForUser,
}));
vi.mock('../lib/notifications', () => ({
  isNotificationSupported: () => false,
  playOrderChime: mocks.playOrderChime,
}));
vi.mock('../lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../lib/config', () => ({ getAdminEmail: () => '', DEFAULT_ROLE: 'vyroba' }));
vi.mock('./MandatoryReminderModal', () => ({
  MandatoryReminderModal: ({ reminder }: { reminder: { title: string } }) => <div>{reminder.title}</div>,
}));

describe('ReminderNotificationManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));
    mocks.fetchReminders.mockReset();
    mocks.isReminderForUser.mockClear();
    mocks.playOrderChime.mockClear();
    mocks.fetchReminders.mockResolvedValue([{
      id: 'reminder-1',
      title: 'Kontrola skladu',
      note: null,
      date_time: '2026-08-16T09:59:00Z',
      is_completed: false,
      acknowledged_by: [],
      display_mode: 'both',
    }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('uses the application profile role and does not repeat an active modal chime', async () => {
    const view = render(<ReminderNotificationManager />);
    await act(async () => { await Promise.resolve(); });

    expect(mocks.isReminderForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reminder-1' }),
      'worker@example.test',
      'admin',
    );
    expect(mocks.playOrderChime).toHaveBeenCalledTimes(2);
    expect(view.getByText('Kontrola skladu')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    expect(mocks.fetchReminders).toHaveBeenCalledTimes(2);
    expect(mocks.playOrderChime).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
