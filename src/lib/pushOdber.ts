/**
 * 🔔 Upozornění na telefon, i když appka neběží.
 *
 * Dosavadní upozornění (`notifications.ts`) fungují jen tehdy, když je
 * aplikace otevřená — což u „přišla objednávka na WhatsApp" nebo „výčep
 * je po termínu" znamená, že se o tom dozví jen ten, kdo se právě koukal.
 *
 * Skutečný push znamená tři věci: odběr zařízení (tenhle modul), obsluhu
 * v service workeru (`public/sw.js`) a odesílání ze serveru (edge funkce
 * `posli-push`). Bez serverového klíče (VAPID) nefunguje ani jedno, a
 * appka to musí ŘÍCT — mlčící vypnutý zvonek vypadá jako rozbitá funkce.
 *
 * V tomhle modulu je počítání a stav; práce s prohlížečem je až v
 * `prihlasPush`/`odhlasPush`.
 */
import { supabase } from './supabase';

/** Veřejný VAPID klíč. Prázdný = push není nastavený. */
export const VAPID_KLIC: string = (import.meta.env?.VITE_VAPID_PUBLIC_KEY as string) ?? '';

export type StavPushu = {
  /** Věta pro člověka — proč to jde nebo nejde zapnout. */
  popis: string;
  muzeZapnout: boolean;
  muzeVypnout: boolean;
};

/**
 * Převod VAPID klíče z base64url do bajtů. `applicationServerKey` bere
 * jen bajty; base64 string prohlížeč odmítne s nicneříkající chybou.
 */
export function klicNaBajty(base64Url: string): Uint8Array<ArrayBuffer> {
  const doplnek = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + doplnek).replace(/-/g, '+').replace(/_/g, '/');
  const surove = atob(base64);
  const bajty = new Uint8Array(new ArrayBuffer(surove.length));
  for (let i = 0; i < surove.length; i += 1) bajty[i] = surove.charCodeAt(i);
  return bajty;
}

/**
 * Co může člověk v nastavení udělat. Každý stav má vlastní větu —
 * „zapnout nelze" bez důvodu vede k tomu, že to zkusí desetkrát.
 */
export function stavPushu(vstup: {
  podporovano: boolean;
  povoleni: NotificationPermission | 'unsupported';
  klicNastaven: boolean;
  prihlasen: boolean;
}): StavPushu {
  if (!vstup.podporovano) {
    return {
      popis: 'Tenhle prohlížeč push upozornění neumí. Na Androidu funguje v Chrome a v appce přidané na plochu.',
      muzeZapnout: false, muzeVypnout: false,
    };
  }
  if (!vstup.klicNastaven) {
    return {
      popis: 'Push zatím není nastavený na serveru (chybí VAPID klíč) — viz docs/push-upozorneni-navod.md.',
      muzeZapnout: false, muzeVypnout: false,
    };
  }
  if (vstup.povoleni === 'denied') {
    return {
      popis: 'Upozornění jsou pro tuhle appku v telefonu zakázaná. Povolit se dají jen v nastavení prohlížeče.',
      muzeZapnout: false, muzeVypnout: vstup.prihlasen,
    };
  }
  if (vstup.prihlasen) {
    return { popis: 'Zapnuto — upozornění dojdou i se zavřenou aplikací.', muzeZapnout: false, muzeVypnout: true };
  }
  return { popis: 'Vypnuto. Po zapnutí se telefon zeptá na povolení upozornění.', muzeZapnout: true, muzeVypnout: false };
}

/** Krátký popis zařízení, ať je v seznamu odběrů poznat, který telefon to je. */
export function popisZarizeni(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  const system = ua.includes('android') ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') ? 'iPhone/iPad'
      : ua.includes('windows') ? 'Windows'
        : ua.includes('mac') ? 'Mac'
          : 'neznámé zařízení';
  const prohlizec = ua.includes('edg/') ? 'Edge'
    : ua.includes('chrome') ? 'Chrome'
      : ua.includes('firefox') ? 'Firefox'
        : ua.includes('safari') ? 'Safari'
          : 'prohlížeč';
  return `${system} · ${prohlizec}`;
}

export function jePushPodporovan(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Je tohle zařízení přihlášené k pushi? */
export async function jePrihlasen(): Promise<boolean> {
  if (!jePushPodporovan()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Přihlásí zařízení. Vrací text chyby pro člověka, nebo null při úspěchu.
 */
export async function prihlasPush(): Promise<string | null> {
  if (!jePushPodporovan()) return 'Tenhle prohlížeč push upozornění neumí.';
  if (!VAPID_KLIC) return 'Push není nastavený na serveru (chybí VAPID klíč).';

  const povoleni = await Notification.requestPermission();
  if (povoleni !== 'granted') return 'Bez povolení upozornění to nejde zapnout.';

  try {
    const reg = await navigator.serviceWorker.ready;
    const odber = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: klicNaBajty(VAPID_KLIC),
    });
    const json = odber.toJSON();
    const { error } = await supabase.from('push_odbery').upsert({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      zarizeni: popisZarizeni(navigator.userAgent),
      posledni_chyba: null,
    }, { onConflict: 'endpoint' });
    if (error) {
      // Odběr v prohlížeči bez záznamu v databázi je odběr, na který
      // nikdo nikdy nic nepošle — tak se zruší.
      await odber.unsubscribe().catch(() => {});
      return error.code === '42P01'
        ? 'Evidence odběrů ještě není v databázi — je potřeba pustit migraci 20261228030000_push_odbery.sql.'
        : `Přihlášení se nepodařilo uložit: ${error.message}`;
    }
    return null;
  } catch (e) {
    return `Přihlášení k upozorněním selhalo: ${(e as Error).message}`;
  }
}

/** Odhlásí zařízení. Vrací text chyby, nebo null. */
export async function odhlasPush(): Promise<string | null> {
  if (!jePushPodporovan()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const odber = await reg?.pushManager.getSubscription();
    if (!odber) return null;
    const endpoint = odber.endpoint;
    await odber.unsubscribe();
    await supabase.from('push_odbery').delete().eq('endpoint', endpoint);
    return null;
  } catch (e) {
    return `Odhlášení selhalo: ${(e as Error).message}`;
  }
}
