import { oznam } from '../lib/toast';
// PWA & Browser Mobile Push Notifications & Web Audio Chime for New Orders

/**
 * Konfigurace AudioSession pro mobilní Safari a Chrome, aby zvuky aplikace
 * (upozornění, alarmy, časovače) nepřerušovaly hudbu běžící na pozadí (Spotify, Apple Music, YouTube Music).
 */
export function setupAudioSessionForBackgroundMusic() {
  if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
    try {
      (navigator as any).audioSession.type = 'ambient';
    } catch {}
  }
}

// Spustit ihned při načtení modulu
setupAudioSessionForBackgroundMusic();

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    oznam('Tento prohlížeč nebo zařízení nepodporuje systémové notifikace.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Test chime & notification
      playOrderChime();
      new Notification('🔔 Upozornění na objednávky aktivováno!', {
        body: 'Při příchodu nové objednávky piva Zajíc budete upozorněni zvukovým signálem a notifikací na displeji.',
        icon: '/favicon.ico',
        tag: 'test-notification',
      });
      return true;
    } else {
      oznam('Povolení notifikací bylo zamítnuto. Upozornění můžete povolit v nastavení prohlížeče.');
      return false;
    }
  } catch (err) {
    console.error('Chyba při žádosti o notifikace:', err);
    return false;
  }
}

// ---- Globální Web Audio odemčení a podpora pro mobilní prohlížeče ----
let globalAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    try {
      globalAudioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }
  if (globalAudioCtx.state === 'suspended') {
    void globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

/** Odemkne Web Audio na první dotek/klik uživatele na obrazovku. */
export function unlockAudioContext() {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
  const handleUnlock = () => {
    unlockAudioContext();
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleUnlock, { passive: true }));
}

// Audio chime using Web Audio API (Synthesized ascending 3-note chime: C5 -> E5 -> G5)
export function playOrderChime() {
  try {
    const audioContext = getSharedAudioContext();
    if (!audioContext) return;
    const now = audioContext.currentTime;

    // Frequencies: C5 = 523.25Hz, E5 = 659.25Hz, G5 = 783.99Hz, C6 = 1046.50Hz
    const freqs = [523.25, 659.25, 783.99, 1046.50];

    freqs.forEach((freq, idx) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.01, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.3, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.38);
    });
  } catch (e) {
    console.warn('Web Audio Playback muted or unavailable:', e);
  }
}

// Alarm pro vypršelý časovač/stočení sudu — výrazný stoupající i klesající signál
// jako průmyslový pivovarský časovač (dobře slyšitelný i v hlučném provozu varny).
export function playAlarmSound() {
  try {
    const audioContext = getSharedAudioContext();
    if (!audioContext) return;
    const now = audioContext.currentTime;

    const beeps = [
      { t: 0, f: 1046.50 },     // C6
      { t: 0.10, f: 1318.51 },  // E6
      { t: 0.20, f: 1567.98 },  // G6
      { t: 0.35, f: 2093.00 },  // C7
      { t: 0.55, f: 1046.50 },
      { t: 0.65, f: 1318.51 },
      { t: 0.75, f: 1567.98 },
      { t: 0.90, f: 2093.00 },
      { t: 1.15, f: 2093.00 },  // Dlouhé závěrečné pípnutí
    ];

    beeps.forEach(({ t: offset, f: freq }, idx) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = idx % 2 === 0 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + (idx === beeps.length - 1 ? 0.25 : 0.08));
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now + offset);
      osc.stop(now + offset + (idx === beeps.length - 1 ? 0.28 : 0.09));
    });
  } catch (e) {
    console.warn('Web Audio Playback muted or unavailable:', e);
  }
}

export interface TimerAlertSettings {
  sound: boolean;
  vibrate: boolean;
  screenNotif: boolean;
}

const TIMER_ALERT_SETTINGS_KEY = 'timers_alert_settings_v1';
const DEFAULT_TIMER_ALERT_SETTINGS: TimerAlertSettings = {
  sound: true,
  vibrate: true,
  screenNotif: true,
};

export function getTimerAlertSettings(): TimerAlertSettings {
  try {
    const raw = localStorage.getItem(TIMER_ALERT_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_TIMER_ALERT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_TIMER_ALERT_SETTINGS;
}

export function saveTimerAlertSettings(settings: TimerAlertSettings) {
  try {
    localStorage.setItem(TIMER_ALERT_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('timers_alert_settings_changed', { detail: settings }));
  } catch {}
}

/** Obecné upozornění "časovač vypršel" — zvuk + vibrace + systémová notifikace + vizuální modal popup */
export function notifyTimerDone(title: string, body: string) {
  const settings = getTimerAlertSettings();

  // 1. Zvuk
  if (settings.sound) {
    playAlarmSound();
  }

  // 2. Vibrace na telefonu
  if (settings.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      // Výrazná sekvence vibrací
      navigator.vibrate([400, 150, 400, 150, 600, 200, 800, 200, 1200]);
    } catch {}
  }

  // 3. Systémová push notifikace na displej
  if (settings.screenNotif && isNotificationSupported() && Notification.permission === 'granted') {
    try {
      new Notification(`⏰ ${title}`, { body, icon: '/favicon.ico', tag: 'timer-done', requireInteraction: true });
    } catch {}
  }

  // 4. In-app vizuální okno přes celou obrazovku
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('timer-done-alert', { detail: { title, body } }));
  }

  oznam(`⏰ ${title}: ${body}`);
}

export interface NotificationSettings {
  /** 0 = nikdy (ručně), jiné = auto-skrýt po X sekundách */
  autoHideSeconds: 0 | 5 | 10 | 30 | 60;
  /** Zda systémová push notifikace vyžaduje kliknutí (requireInteraction) */
  requireInteraction: boolean;
  /** Zda se má zobrazit in-app banner */
  showInAppBanner: boolean;
  /** Zda se mají přehrávat zvukové notifikace */
  playSound: boolean;
}

const NOTIF_SETTINGS_KEY = 'notification_settings';

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  autoHideSeconds: 10,
  requireInteraction: true,
  showInAppBanner: true,
  playSound: true,
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const saved = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (saved) return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(saved) };
  } catch {
    // fallback to defaults
  }
  return DEFAULT_NOTIFICATION_SETTINGS;
}

export function saveNotificationSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export interface NewOrderNotifyData {
  id: string;
  place_name?: string | null;
  items_summary?: string | null;
  note?: string | null;
  created_at?: string;
}

export function notifyNewOrder(order: NewOrderNotifyData) {
  const settings = getNotificationSettings();

  // 1. Play chime audio (if enabled)
  if (settings.playSound) {
    playOrderChime();
  }

  // 2. Mobile vibration pattern if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400]);
    } catch {}
  }

  // 3. System Push Notification
  if (isNotificationSupported() && Notification.permission === 'granted') {
    const place = order.place_name || 'Neznámý odběratel';
    const summary = order.items_summary ? ` (${order.items_summary})` : '';
    const noteText = order.note ? `\nPoznámka: ${order.note}` : '';

    try {
      const n = new Notification(`🍺 NOVÁ OBJEDNÁVKA: ${place}`, {
        body: `Přijata nová objednávka piva Zajíc!${summary}${noteText}`,
        icon: '/favicon.ico',
        tag: `order-${order.id}`,
        requireInteraction: settings.requireInteraction,
      });

      n.onclick = () => {
        window.focus();
        window.location.hash = '#orders';
      };

      // Auto-close push notification if not requiring interaction
      if (!settings.requireInteraction && settings.autoHideSeconds > 0) {
        setTimeout(() => { try { n.close(); } catch {} }, settings.autoHideSeconds * 1000);
      }
    } catch (e) {
      console.error('Failed to trigger notification:', e);
    }
  }

  // 4. Dispatch custom DOM event for in-app floating banner popup
  if (typeof window !== 'undefined' && settings.showInAppBanner) {
    window.dispatchEvent(new CustomEvent('new-order-arrived', { detail: { ...order, autoHideSeconds: settings.autoHideSeconds } }));
  }
}

// ---------------------------------------------------------------------------
// Notifikace pro nově přijaté WhatsApp zprávy (objednávky k ověření).
// Používá stejnou infrastrukturu jako notifyNewOrder — zvuk, vibrace,
// systémová notifikace i in-app banner. Layout.tsx ji volá z globálního
// realtime listeneru, takže funguje na VŠECH obrazovkách aplikace.
// ---------------------------------------------------------------------------

export interface WhatsAppMessageNotifyData {
  id: string;
  sender_name: string;
  message_text: string;
  status?: string | null;
  created_at?: string | null;
  /** Počet položek, které AI nepřečetla správně (kontrola čtení) — ⚠ notifikace. */
  readbackUnmatchedCount?: number | null;
}

export function notifyNewWhatsAppMessage(
  message: WhatsAppMessageNotifyData,
  opts?: { banner?: boolean }
) {
  const settings = getNotificationSettings();

  // 1. Audio chime (if enabled)
  if (settings.playSound) {
    playOrderChime();
  }

  // 2. Mobile vibration pattern if supported
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200, 100, 400]);
    } catch {}
  }

  const sender = message.sender_name || 'Neznámý odesílatel';
  const preview = (message.message_text || '').replace(/\s+/g, ' ').trim();
  const bodyText = preview.length > 140 ? preview.slice(0, 140) + '…' : preview;

  // ⚠ Notifikace „pozor na čtení" — když AI nemá jisté přečtení (některé
  // položky se v originálu nenašly). Zřetelně odlišný titulek i text.
  const mismatchCount = Number(message.readbackUnmatchedCount) || 0;
  const hasMismatch = mismatchCount > 0;
  const notifTitle = hasMismatch
    ? `⚠ WHATSAPP — POZOR NA ČTENÍ: ${sender}`
    : `📥 NOVÁ WHATSAPP OBJEDNÁVKA K OVĚŘENÍ: ${sender}`;
  const notifBody = hasMismatch
    ? `AI si u ${mismatchCount} položek není jistá čtením — zkontrolujte před schválením: ${bodyText}`
    : bodyText || 'Přijata nová zpráva z WhatsAppu — zkontrolujte ji v aplikaci.';

  // 3. System Push Notification
  if (isNotificationSupported() && Notification.permission === 'granted') {
    try {
      const n = new Notification(notifTitle, {
        body: notifBody,
        icon: '/favicon.ico',
        tag: `whatsapp-${message.id}`,
        requireInteraction: settings.requireInteraction,
      });

      n.onclick = () => {
        window.focus();
        window.location.hash = '#orders';
        // Layout.tsx poslouchá a přepne na stránku Objednávky (React routing).
        window.dispatchEvent(new CustomEvent('pivovar:go-orders'));
      };

      // Auto-close push notification if not requiring interaction
      if (!settings.requireInteraction && settings.autoHideSeconds > 0) {
        setTimeout(() => { try { n.close(); } catch {} }, settings.autoHideSeconds * 1000);
      }
    } catch (e) {
      console.error('Failed to trigger WhatsApp notification:', e);
    }
  }

  // 4. Dispatch custom DOM event for in-app floating banner popup
  if (opts?.banner !== false && typeof window !== 'undefined' && settings.showInAppBanner) {
    window.dispatchEvent(new CustomEvent('whatsapp-message-arrived', {
      detail: { ...message, autoHideSeconds: settings.autoHideSeconds },
    }));
  }
}
