import { useEffect, useRef } from 'react';
import {
  getKegTimerState, markKegTimerNotified,
  getCountdowns, saveCountdowns, countdownRemainingMs,
  COUNTDOWN_CHANGED_EVENT,
} from '../lib/stopwatchTimers';
import { notifyTimerDone } from '../lib/notifications';

const POLL_MS = 1000;

export function KegTimerNotificationManager() {
  const checkingRef = useRef(false);

  useEffect(() => {
    function check() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        // Stočení sudu — upozorni jednou, jakmile uplyne odhadovaná doba.
        const keg = getKegTimerState();
        if (keg.active && keg.active.estimateMs !== null && !keg.active.notifiedAt) {
          const targetAt = keg.active.startedAt + keg.active.estimateMs;
          if (Date.now() >= targetAt) {
            notifyTimerDone('🍺 Sud by měl být stočený', 'Uplynula odhadovaná doba stáčení podle historie.');
            markKegTimerNotified();
          }
        }

        // Časovač — upozorni na každý odpočet, co doběhl a ještě nebyl ohlášený.
        const countdowns = getCountdowns();
        let changed = false;
        const next = countdowns.map((t) => {
          if (t.targetAt === null || t.notifiedAt) return t;
          if (countdownRemainingMs(t) > 0) return t;
          notifyTimerDone('Časovač vypršel', t.label || 'Odpočet doběhl.');
          changed = true;
          return { ...t, notifiedAt: Date.now() };
        });
        if (changed) saveCountdowns(next);
      } finally {
        checkingRef.current = false;
      }
    }

    check();
    const interval = setInterval(check, POLL_MS);
    window.addEventListener(COUNTDOWN_CHANGED_EVENT, check);
    return () => {
      clearInterval(interval);
      window.removeEventListener(COUNTDOWN_CHANGED_EVENT, check);
    };
  }, []);

  return null;
}
