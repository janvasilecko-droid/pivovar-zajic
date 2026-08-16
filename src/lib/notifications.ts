// PWA & Browser Mobile Push Notifications & Web Audio Chime for New Orders

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    alert('Tento prohlížeč nebo zařízení nepodporuje systémové notifikace.');
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
      alert('Povolení notifikací bylo zamítnuto. Upozornění můžete povolit v nastavení prohlížeče.');
      return false;
    }
  } catch (err) {
    console.error('Chyba při žádosti o notifikace:', err);
    return false;
  }
}

// Audio chime using Web Audio API (Synthesized ascending 3-note chime: C5 -> E5 -> G5)
export function playOrderChime() {
  let ctx: AudioContext | null = null;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass() as AudioContext;
    ctx = audioContext;
    const now = audioContext.currentTime;

    // Frequencies: C5 = 523.25Hz, E5 = 659.25Hz, G5 = 783.99Hz, C6 = 1046.50Hz
    const freqs = [523.25, 659.25, 783.99, 1046.50];

    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const closeContext = () => {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (!ctx || ctx.state === 'closed') return;
      void ctx.close().catch(() => undefined);
    };

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
      if (idx === freqs.length - 1) osc.onended = closeContext;
    });
    // Fallback pro prohlížeče, které při suspendovaném audio kontextu
    // nevyvolají onended. Každý vytvořený kontext se vždy uzavře.
    closeTimer = setTimeout(closeContext, 1500);
  } catch (e) {
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    console.warn('Web Audio Playback muted or unavailable:', e);
  }
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
