import { useState, useEffect, useRef } from 'react';
import { ReminderItem, fetchReminders, isReminderForUser } from '../lib/reminders';
import { isNotificationSupported, playOrderChime } from '../lib/notifications';
import { MandatoryReminderModal } from './MandatoryReminderModal';
import { useAuth } from '../lib/auth';

export function ReminderNotificationManager() {
  const { user } = useAuth();
  const [activeModalReminder, setActiveModalReminder] = useState<ReminderItem | null>(null);
  const pushedSetRef = useRef<Set<string>>(new Set());

  const currentUserEmail = user?.email || 'vasilecko@seznam.cz';
  const currentUserRole = user?.role || 'admin';

  async function checkReminders() {
    if (!currentUserEmail) return;

    try {
      const reminders = await fetchReminders();
      const now = new Date().getTime();

      for (const r of reminders) {
        // Skip if already completed or user already acknowledged
        if (r.is_completed) continue;
        const acked = (r.acknowledged_by || []).includes(currentUserEmail);
        if (acked) continue;

        // Check if reminder targets this user
        if (!isReminderForUser(r, currentUserEmail, currentUserRole)) continue;

        // Check if reminder time has arrived
        const rTime = new Date(r.date_time).getTime();
        if (rTime <= now + 60000) { // due within 1 minute or in past
          // 1. Trigger Desktop Push Notification if requested and not yet pushed in this session
          if ((r.display_mode === 'desktop_push' || r.display_mode === 'both') && !pushedSetRef.current.has(r.id)) {
            pushedSetRef.current.add(r.id);
            playOrderChime();
            if (isNotificationSupported() && Notification.permission === 'granted') {
              try {
                new Notification(`🔔 UPOMÍNKA: ${r.title}`, {
                  body: r.note || `Termín: ${new Date(r.date_time).toLocaleString('cs-CZ')}`,
                  icon: '/favicon.ico',
                  tag: `reminder-${r.id}`,
                });
              } catch {}
            }
          }

          // 2. Trigger Login Modal popup if requested and no modal is currently active
          if ((r.display_mode === 'login_modal' || r.display_mode === 'both') && !activeModalReminder) {
            setActiveModalReminder(r);
            playOrderChime();
            break;
          }
        }
      }
    } catch {}
  }

  useEffect(() => {
    checkReminders();
    const timer = setInterval(checkReminders, 12000);
    return () => clearInterval(timer);
  }, [currentUserEmail, currentUserRole]);

  if (!activeModalReminder) return null;

  return (
    <MandatoryReminderModal
      reminder={activeModalReminder}
      currentUserEmail={currentUserEmail}
      onDismiss={() => {
        setActiveModalReminder(null);
        // Check again for next pending reminder
        setTimeout(checkReminders, 500);
      }}
    />
  );
}
