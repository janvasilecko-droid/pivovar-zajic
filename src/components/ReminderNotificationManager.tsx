import { useState, useEffect, useRef, useCallback } from 'react';
import { ReminderItem, fetchReminders, isReminderForUser } from '../lib/reminders';
import { isNotificationSupported, playOrderChime } from '../lib/notifications';
import { MandatoryReminderModal } from './MandatoryReminderModal';
import { useAuth } from '../lib/auth';
import { getAdminEmail, DEFAULT_ROLE } from '../lib/config';

export function ReminderNotificationManager() {
  const { user, profile } = useAuth();
  const [activeModalReminder, setActiveModalReminder] = useState<ReminderItem | null>(null);
  const pushedSetRef = useRef<Set<string>>(new Set());
  const activeModalReminderRef = useRef<ReminderItem | null>(null);
  const checkingRef = useRef(false);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUserEmail = user?.email || getAdminEmail();
  const currentUserRole = profile?.role || DEFAULT_ROLE;
  const identityKey = `${currentUserEmail}\u0000${currentUserRole}`;
  const identityRef = useRef(identityKey);
  identityRef.current = identityKey;

  const checkReminders = useCallback(async () => {
    if (!currentUserEmail || checkingRef.current) return;
    checkingRef.current = true;
    const requestedIdentity = identityKey;

    try {
      const reminders = await fetchReminders();
      if (identityRef.current !== requestedIdentity) return;
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
          if ((r.display_mode === 'login_modal' || r.display_mode === 'both') && !activeModalReminderRef.current) {
            activeModalReminderRef.current = r;
            setActiveModalReminder(r);
            playOrderChime();
            break;
          }
        }
      }
    } catch {
      // Síťová chyba se zkusí znovu při dalším intervalu.
    } finally {
      checkingRef.current = false;
    }
  }, [currentUserEmail, currentUserRole, identityKey]);

  useEffect(() => {
    pushedSetRef.current.clear();
    activeModalReminderRef.current = null;
    setActiveModalReminder(null);
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
  }, [identityKey]);

  useEffect(() => {
    void checkReminders();
    const timer = setInterval(() => { void checkReminders(); }, 12000);
    return () => {
      clearInterval(timer);
      if (followUpTimerRef.current) {
        clearTimeout(followUpTimerRef.current);
        followUpTimerRef.current = null;
      }
    };
  }, [checkReminders]);

  if (!activeModalReminder) return null;

  return (
    <MandatoryReminderModal
      reminder={activeModalReminder}
      currentUserEmail={currentUserEmail}
      onDismiss={() => {
        activeModalReminderRef.current = null;
        setActiveModalReminder(null);
        // Check again for next pending reminder
        followUpTimerRef.current = setTimeout(() => { void checkReminders(); }, 500);
      }}
    />
  );
}
