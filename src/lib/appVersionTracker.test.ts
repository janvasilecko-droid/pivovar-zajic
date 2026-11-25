// 📋 Zápis verze aplikace a zařízení (lib/appVersionTracker.ts) — do přehledu verzí jde i způsob spuštění.
// ---------------------------------------------------------------------------
// Dřív se zapisovalo „Android (Capacitor)“ i u telefonu, který aplikaci jen otevřel v Chromu (window.Capacitor
// existuje v každém prohlížeči). Šéfovi se na starším Androidu aplikace z ikony nespustila (25. 11. 2026) a
// z přehledu nešlo poznat, kdo ji jak otevírá. Tahle skutečná cesta zápisu se tu zkouší s atrapou databáze.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const UA_ANDROID8 = 'Mozilla/5.0 (Linux; Android 8.1.0; SM-J530F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.136 Mobile Safari/537.36';
const UA_WEBVIEW = 'Mozilla/5.0 (Linux; Android 9; SM-J530F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36';
const UA_ZAMLZENY = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

type Zapis = { table: string; row: any; opts: any };

let zapisy: Zapis[] = [];
let session: { user: { id: string } } | null = null;
let chybaZapisu: { message: string } | null = null;
const varovani = vi.fn();

/** Čerstvý modul (stav „už zapsáno“ je v proměnné modulu) s atrapou databáze. */
async function nactiTracker() {
  vi.resetModules();
  vi.doMock('./supabase', () => ({
    supabase: {
      auth: { getSession: async () => ({ data: { session } }) },
      from: (table: string) => ({
        upsert: async (row: any, opts: any) => { zapisy.push({ table, row, opts }); return { error: chybaZapisu }; },
      }),
    },
  }));
  vi.doMock('./chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
  return import('./appVersionTracker');
}

function nastavProhlizec(ua: string, extra: { capacitor?: unknown; standalone?: boolean; userAgentData?: unknown } = {}) {
  Object.defineProperty(window.navigator, 'userAgent', { get: () => ua, configurable: true });
  (window as any).Capacitor = extra.capacitor;
  (window as any).matchMedia = (q: string) => ({ matches: !!extra.standalone && /standalone/.test(q) });
  Object.defineProperty(window.navigator, 'userAgentData', { value: extra.userAgentData, configurable: true });
}

beforeEach(() => {
  zapisy = [];
  session = { user: { id: 'u-1' } };
  chybaZapisu = null;
  vi.spyOn(console, 'warn').mockImplementation((...a) => { varovani(...a); });
  nastavProhlizec(UA_ANDROID8, { capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } });
});

afterEach(() => {
  vi.restoreAllMocks();
  varovani.mockReset();
  vi.doUnmock('./supabase');
  vi.doUnmock('./chybyHlaseni');
  vi.doUnmock('./zarizeni');
});

describe('reportAppVersion — zápis verze a zařízení', () => {
  it('nepřihlášený nic nezapíše', async () => {
    session = null;
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy).toEqual([]);
  });

  it('zapíše verzi, uživatele, čas a popis zařízení do user_app_versions (jeden řádek na uživatele)', async () => {
    const { reportAppVersion } = await nactiTracker();
    const { APP_VERSION } = await import('./version');
    await reportAppVersion();
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].table).toBe('user_app_versions');
    expect(zapisy[0].opts).toEqual({ onConflict: 'user_id' });
    expect(zapisy[0].row).toEqual({
      user_id: 'u-1',
      version: APP_VERSION,
      device_info: 'Prohlížeč / Android 8.1 / Chrome 74 / SM-J530F',
      last_seen_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('prohlížeč s Capacitorem z webu už NENÍ „Android (Capacitor)“ (původní chyba)', async () => {
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy[0].row.device_info).not.toMatch(/capacitor/i);
    expect(zapisy[0].row.device_info.startsWith('Prohlížeč')).toBe(true);
  });

  it('z ikony na ploše se zapíše „Ikona na ploše“', async () => {
    nastavProhlizec(UA_ANDROID8, { capacitor: { isNativePlatform: () => false }, standalone: true });
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy[0].row.device_info).toBe('Ikona na ploše / Android 8.1 / Chrome 74 / SM-J530F');
  });

  it('skutečné APK se zapíše jako „Aplikace (APK)“ s verzí WebView', async () => {
    nastavProhlizec(UA_WEBVIEW, { capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, standalone: true });
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy[0].row.device_info).toBe('Aplikace (APK) / Android 9 / WebView 74 / SM-J530F');
  });

  it('Chrome 110+ skrývá systém — skutečná verze a model se doplní z userAgentData', async () => {
    nastavProhlizec(UA_ZAMLZENY, {
      userAgentData: { getHighEntropyValues: async () => ({ platformVersion: '14.0.0', model: 'Pixel 8' }) },
    });
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy[0].row.device_info).toBe('Prohlížeč / Android 14 / Chrome 130 / Pixel 8');
  });

  it('userAgentData, které neodpoví, zápis verze nezdrží ani nezruší (po časovém limitu se píše bez skutečné verze)', async () => {
    nastavProhlizec(UA_ZAMLZENY, { userAgentData: { getHighEntropyValues: () => new Promise(() => {}) } });
    const { reportAppVersion } = await nactiTracker();
    const t0 = Date.now();
    await reportAppVersion();
    // Skutečné časovače: dynamické načtení kousku s popisem zařízení běží přes skutečné čtení souboru, s falešnými
    // časovači by se limit zaregistroval až po jejich „posunu“ a test by visel.
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].row.device_info).toBe('Prohlížeč / Android / Chrome 130');
  }, 10000);

  it('když se popis zařízení nepodaří zjistit (kousek se nenačetl), verze se zapíše a popis v databázi zůstane (sloupec se neposílá)', async () => {
    const { reportAppVersion } = await nactiTracker();
    // Kousek lib/zarizeni se nenačte (bez signálu, nebo po novém nasazení už neexistuje).
    vi.doMock('./zarizeni', () => { throw new Error('Failed to fetch dynamically imported module'); });
    await reportAppVersion();
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].row).toEqual({ user_id: 'u-1', version: expect.any(String), last_seen_at: expect.any(String) });
    expect('device_info' in zapisy[0].row).toBe(false);
  });

  it('podruhé ve stejné relaci se stejná verze znovu nezapisuje', async () => {
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    await reportAppVersion();
    expect(zapisy).toHaveLength(1);
  });

  it('při chybě zápisu se to příště zkusí znovu (nezapamatuje se jako zapsané)', async () => {
    chybaZapisu = { message: 'sit nejde' };
    const { reportAppVersion } = await nactiTracker();
    await reportAppVersion();
    expect(zapisy).toHaveLength(1);
    expect(varovani).toHaveBeenCalled();
    chybaZapisu = null;
    await reportAppVersion();
    expect(zapisy).toHaveLength(2);
    await reportAppVersion();
    expect(zapisy).toHaveLength(2);
  });
});
