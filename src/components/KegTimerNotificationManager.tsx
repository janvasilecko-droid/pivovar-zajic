// Globální hlídač časovačů (TimersScreen.tsx) — mount v App.tsx vedle
// ReminderNotificationManager, stejný vzor (poll + porovnání s Date.now()).
// Funguje napříč celou appkou (i mimo obrazovku Stopky/Časovač/Stočení sudu),
// ať uživatel dostane upozornění, i když mezitím přejde jinam. Žádné UI —
// jen zvuk/vibrace/systémová notifikace (viz notifyTimerDone).
import { useEffect, useRef } from 'react';
import {
  getKegTimerState, markKegTimerNotified,
  getCountdowns, saveCountdowns, countdownRemainingMs,
} from '../lib/stopwatchTimers';
import { notifyTimerDone } from '../lib/notifications';

const POLL_MS = 4000;

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
          notifyTimerDone('⏰ Časovač vypršel', t.label || 'Odpočet doběhl.');
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
    return () => clearInterval(interval);
  }, []);

  return null;
}
