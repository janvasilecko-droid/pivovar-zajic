/**
 * 📲 Jak a na čem se aplikace právě používá — pro Audit → Verze aplikace a pro podporu.
 *
 * Proč to je: šéfovi se na starším Androidu aplikace z odkazu v e-mailu v prohlížeči spustila, ale z ikony na
 * ploše ne (25. 11. 2026), a z přehledu verzí nešlo poznat, jak ji lidé vlastně otevírají. Dosavadní zápis
 * „Android (Capacitor)“ nic neříkal: `window.Capacitor` existuje v KAŽDÉM prohlížeči, protože ho vytvoří už
 * samotný import `@capacitor/core` (App.tsx) — tak vypadal i telefon, který aplikaci jen otevřel v Chromu.
 * Tady se o APK rozhoduje podle `Capacitor.isNativePlatform()`.
 *
 * Stejná pravidla (v tomhle pořadí: APK → ikona → vložený prohlížeč → prohlížeč) má stránka Instalace
 * (public/instalace.html — samostatný ES5 soubor bez importů); shodu hlídá src/lib/zarizeni.test.ts.
 *
 * Nic se tu nezjišťuje navíc k tomu, co se už zapisovalo (platforma, prohlížeč) — přibyla jen verze Androidu
 * a Chromu, způsob spuštění a model telefonu, ať je vidět, že jde o starý přístroj.
 */

export type ZpusobSpusteni = 'apk' | 'ikona' | 'vlozeny' | 'prohlizec';

/** Jak se způsob spuštění píše v přehledu. */
export const POPIS_ZPUSOBU: Record<ZpusobSpusteni, string> = {
  apk: 'Aplikace (APK)',
  ikona: 'Ikona na ploše',
  vlozeny: 'Vložený prohlížeč',
  prohlizec: 'Prohlížeč',
};

export interface CapacitorLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export interface VstupZarizeni {
  /** `navigator.userAgent` */
  ua: string;
  /** `window.Capacitor` — existuje i v prohlížeči, rozhoduje až `isNativePlatform()`. */
  capacitor?: CapacitorLike | null;
  /** Spuštěno z ikony: display-mode standalone / minimal-ui, nebo `navigator.standalone` (iOS). */
  naploche?: boolean;
  /** `navigator.maxTouchPoints` — iPad se v řetězci prohlížeče tváří jako Mac. */
  maxTouchPoints?: number;
  /** Skutečná verze systému z `userAgentData` (u Chromu 110+ ji řetězec prohlížeče skrývá). */
  platformVersion?: string | null;
  /** Model telefonu z `userAgentData` (u Chromu 110+ ho řetězec prohlížeče skrývá). */
  model?: string | null;
}

/** Nejdelší popis, který se zapíše (sloupec je text bez omezení; krátký se líp čte). */
const NEJDELSI = 120;

/** Spuštěno jako skutečná aplikace (APK)? Rozhoduje funkce Capacitoru, ne pouhá existence objektu. */
export function jeApk(capacitor: CapacitorLike | null | undefined): boolean {
  try {
    return !!(capacitor && (
      (typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform())
      || (typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() === 'android')
    ));
  } catch {
    return false;
  }
}

function jeIos(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** Prohlížeč uvnitř jiné aplikace (e-mail, Messenger…): WebView („; wv)“) a známé aplikace; na iPhonu chybí „Safari/“. */
function jeVlozeny(ua: string, ios: boolean): boolean {
  return /; wv\)/.test(ua)
    || /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|GSA\//.test(ua)
    || (ios && !/Safari\//.test(ua));
}

export function zpusobSpusteni(v: VstupZarizeni): ZpusobSpusteni {
  if (jeApk(v.capacitor)) return 'apk';
  if (v.naploche) return 'ikona';
  if (jeVlozeny(v.ua, jeIos(v.ua, v.maxTouchPoints))) return 'vlozeny';
  return 'prohlizec';
}

/** Chrome od verze 110 píše vždy „Android 10; K“ — skutečnou verzi a model prozradí jen `userAgentData`. */
export function jeVerzeSkryta(ua: string): boolean {
  const m = /Chrom(?:e|ium)\/(\d+)/.exec(ua);
  return !!m && parseInt(m[1], 10) >= 110 && /Android 10; K/.test(ua);
}

/** „8.1.0“ → „8.1“, „13.0.0“ → „13“, „7.0“ → „7“. */
function zkratVerzi(verze: string): string {
  const [hlavni, vedlejsi] = verze.split('.');
  return vedlejsi && vedlejsi !== '0' ? `${hlavni}.${vedlejsi}` : hlavni;
}

function platforma(v: VstupZarizeni, ios: boolean): string | null {
  const ua = v.ua;
  if (/Android/.test(ua)) {
    const zUa = /Android (\d+(?:\.\d+)*)/.exec(ua);
    // Zamlžené „10“ se nevydává za skutečnou verzi — radši žádné číslo než špatné.
    const verze = v.platformVersion || (jeVerzeSkryta(ua) ? null : zUa ? zUa[1] : null);
    return verze ? `Android ${zkratVerzi(verze)}` : 'Android';
  }
  if (ios) {
    const m = /OS (\d+)[_.]/.exec(ua);
    return m ? `iOS ${m[1]}` : 'iOS';
  }
  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

function prohlizec(ua: string): string | null {
  const najdi = (re: RegExp) => { const m = re.exec(ua); return m ? m[1] : null; };
  const edge = najdi(/Edg(?:e|A|iOS)?\/(\d+)/);
  if (edge) return `Edge ${edge}`;
  const opera = najdi(/OPR\/(\d+)/);
  if (opera) return `Opera ${opera}`;
  const samsung = najdi(/SamsungBrowser\/(\d+)/);
  if (samsung) return `Samsung Internet ${samsung}`;
  const firefox = najdi(/(?:Firefox|FxiOS)\/(\d+)/);
  if (firefox) return `Firefox ${firefox}`;
  const chrome = najdi(/(?:Chrome|Chromium|CriOS)\/(\d+)/);
  // V APK a vloženém prohlížeči je to „WebView“ — právě jeho verze rozhoduje, jestli aplikace poběží.
  if (chrome) return `${/; wv\)/.test(ua) ? 'WebView' : 'Chrome'} ${chrome}`;
  const safari = najdi(/Version\/(\d+).*Safari\//);
  if (safari) return `Safari ${safari}`;
  return /Safari\//.test(ua) ? 'Safari' : null;
}

function model(v: VstupZarizeni): string | null {
  const hotovy = (v.model || '').trim();
  if (hotovy) return hotovy;
  // Starší telefony model v řetězci prohlížeče mají: „Android 8.1.0; SM-J530F“ / „…; SM-J530F Build/PPR1; wv)“.
  const m = /Android \d+(?:\.\d+)*; ([^;)]+)/.exec(v.ua);
  if (!m) return null;
  const nazev = m[1].replace(/\s+Build\/.*$/, '').trim();
  return !nazev || nazev === 'K' || /^(Mobile|Tablet|wv)$/i.test(nazev) ? null : nazev;
}

/**
 * Popis zařízení do přehledu verzí, např. „Ikona na ploše / Android 8.1 / Chrome 74 / SM-J530F“.
 * Části, které se nepoznaly, se vynechají (nic se nehádá).
 */
export function popisZarizeni(v: VstupZarizeni): string {
  const ios = jeIos(v.ua, v.maxTouchPoints);
  const cast = [
    POPIS_ZPUSOBU[zpusobSpusteni(v)],
    platforma(v, ios),
    prohlizec(v.ua),
    /Android/.test(v.ua) ? model(v) : null,
  ].filter((c): c is string => !!c);
  return cast.join(' / ').slice(0, NEJDELSI);
}

/** Údaje o zařízení, které jsou k dispozici hned (bez ptaní se prohlížeče). */
export function vstupZOkna(w: Window = window): VstupZarizeni {
  const n = w.navigator as Navigator & { standalone?: boolean };
  let naploche = false;
  try {
    naploche = !!(
      (w.matchMedia && (w.matchMedia('(display-mode: standalone)').matches || w.matchMedia('(display-mode: minimal-ui)').matches))
      || n.standalone
    );
  } catch {
    naploche = false;
  }
  return {
    ua: n.userAgent || '',
    capacitor: (w as unknown as { Capacitor?: CapacitorLike }).Capacitor ?? null,
    naploche,
    maxTouchPoints: n.maxTouchPoints || 0,
  };
}

/**
 * Totéž a navíc skutečná verze systému a model, když je řetězec prohlížeče skrývá (Chrome 110+). Dotaz je na
 * stejné stránce bez vyskakovacího okna; s časovým limitem, ať zápis verze nikdy nezdrží.
 */
export async function vstupSDoplnenymiUdaji(w: Window = window, limitMs = 1500): Promise<VstupZarizeni> {
  const v = vstupZOkna(w);
  const d = (w.navigator as Navigator & {
    userAgentData?: { getHighEntropyValues?: (k: string[]) => Promise<{ platformVersion?: string; model?: string }> };
  }).userAgentData;
  if (!jeVerzeSkryta(v.ua) || !d || typeof d.getHighEntropyValues !== 'function') return v;
  let casovac: ReturnType<typeof setTimeout> | undefined;
  try {
    const h = await Promise.race([
      d.getHighEntropyValues(['platformVersion', 'model']),
      new Promise<never>((_, odmitni) => { casovac = setTimeout(() => odmitni(new Error('časový limit')), limitMs); }),
    ]);
    return { ...v, platformVersion: h?.platformVersion || null, model: h?.model || null };
  } catch {
    return v;
  } finally {
    if (casovac !== undefined) clearTimeout(casovac);
  }
}

/** Popis zařízení, na kterém aplikace právě běží — nikdy nespadne (v nejhorším vrátí „Neznámé zařízení“). */
export async function popisTohotoZarizeni(w: Window = window): Promise<string> {
  try {
    return popisZarizeni(await vstupSDoplnenymiUdaji(w)) || 'Neznámé zařízení';
  } catch {
    return 'Neznámé zařízení';
  }
}
