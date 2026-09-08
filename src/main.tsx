import { RefreshCw } from 'lucide-react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ToastHost from './components/ToastHost';
import './index.css';
import { AuthProvider } from './lib/auth';
import { initDensity } from './lib/density';
import { initEfekty } from './lib/efekty';
import { initTheme } from './lib/theme';
import { reportAppVersion } from './lib/appVersionTracker';
import { checkVersion, forceRefresh, startVersionCheck } from './lib/versionCheck';
import { renderFatalError } from './lib/safeDom';
import { nahlasChybu, zapniHlaseniChyb, zalogujANahlas } from './lib/chybyHlaseni';
import { zapniFrontuTanku } from './lib/tankFrontaBeh';
import { zapniPosunNadKlavesnici } from './lib/nadKlavesnici';


initDensity();
// Méně efektů (rozostření a blikání) — nastavuje se dřív, než se cokoli
// vykreslí, jinak by se sklo na okamžik ukázalo a zase zmizelo.
initEfekty();

// Neodchycené chyby a promisy se zapisují do tabulky app_errors (viz
// lib/chybyHlaseni.ts). Dřív o nich nevěděl nikdo — rozbitá obrazovka se
// poznala telefonátem. Hlášení nikdy nic neshodí a když tabulka ještě
// neexistuje (migrace se pouští ručně), tiše se přestane zkoušet.
zapniHlaseniChyb();

// Nedokončené odečty objemu z tanků se zkusí znovu při startu a po návratu
// sítě (viz lib/tankFronta.ts). Opakování je bezpečné díky klíči
// idempotence — relativní odečet by se jinak mohl provést dvakrát.
zapniFrontuTanku();

// Klávesnice na telefonu překryje spodní polovinu displeje a políčko, do
// kterého se píše, pod ní často zůstane schované (viz lib/nadKlavesnici.ts).
zapniPosunNadKlavesnici();

class DebugErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('DEBUG ErrorBoundary caught:', error, info);
    // Bílá obrazovka je ta nejdražší chyba — uživatel nemůže pokračovat.
    // Zapíše se s verzí aplikace a obrazovkou, ať se pozná, jestli ji
    // přivezlo poslední nasazení.
    nahlasChybu('boundary', error);
    // Auto-recovery pro stale chunk errory (po deployi)
    const msg = String(error?.message || error || '');
    if (msg.includes('dynamically imported module') || msg.includes('Failed to fetch')) {
      const reloadKey = '__chunk_reload';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        console.warn('[auto-recovery] Stale chunk in ErrorBoundary, reloading…');
        void forceRefresh();
        return;
      }
      sessionStorage.removeItem(reloadKey);
    }
  }
  componentDidMount() {
    window.addEventListener('popstate', this.handleReset);
  }
  componentWillUnmount() {
    window.removeEventListener('popstate', this.handleReset);
  }
  handleReset = () => {
    if (this.state.error) this.setState({ error: null });
  };
  render() {
    if (this.state.error) {
      return (
        /* Obrazovka, kterou uvidí obsluha ve sklepě, ne vývojář.
           Dřív začínala větou „Zachyceno v paměti React rozhraní" a hned
           pod ní byl technický výpis a červené tlačítko „Vyčistit
           mezipaměť" — návod k panice u něčeho, co skoro vždycky spraví
           jedno klepnutí. Napřed je proto jediná srozumitelná akce,
           technické podrobnosti se rozbalí, jen když je někdo chce. */
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1c1917', background: '#fffbeb', minHeight: '100vh' }}>
          <h1 style={{ color: '#1c1917', fontSize: 22, fontWeight: 800, margin: 0 }}>Obrazovku se nepodařilo zobrazit</h1>
          <p style={{ fontSize: 15, color: '#44403c', margin: '8px 0 20px 0', maxWidth: 460, lineHeight: 1.5 }}>
            Data jsou v pořádku, nic se neztratilo. Zkuste to prosím znovu — většinou to stačí.
          </p>
          <button
            style={{ padding: '14px 22px', minHeight: 48, background: '#047857', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            Zkusit znovu
          </button>

          <details style={{ marginTop: 28, maxWidth: 720 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#78716c' }}>
              Když to nepomůže — podrobnosti a úplné načtení
            </summary>
            <div style={{ marginTop: 12 }}>
              <button
                style={{ padding: '10px 18px', minHeight: 44, background: '#b45309', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                onClick={() => { void forceRefresh(); }}
              >
                <RefreshCw className="ikona-text" /> Načíst aplikaci úplně znovu
              </button>
              <pre style={{ fontFamily: 'monospace', fontSize: 12, padding: 12, marginTop: 12, background: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {String(this.state.error?.stack || this.state.error)}
              </pre>
            </div>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

// Zachytí i chyby mimo React (globální/unhandled), aby se nic neztratilo tiše.
window.addEventListener('error', (e) => {
  const el = document.getElementById('root');
  if (el) renderFatalError(el, 'Globální chyba', e.error?.stack || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  // Automatická oprava: po novém deployi se změní chunk hashe a prohlížeč
  // s cachem se pokusí načíst starý soubor → „Failed to fetch dynamically
  // imported module". Jednou automaticky reloadneme; při opakovaném selhání
  // zobrazíme chybu uživateli (aby nevznikla nekonečná smyčka).
  const msg = String(e.reason?.message || e.reason || '');
  if (msg.includes('dynamically imported module') || msg.includes('Failed to fetch')) {
    const reloadKey = '__chunk_reload';
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      console.warn('[auto-recovery] Stale chunk detected, reloading…');
      void forceRefresh();
      return;
    }
    // Druhý pokus selhal — propadne do renderFatalError níže
    sessionStorage.removeItem(reloadKey);
  }
  const el = document.getElementById('root');
  if (el) renderFatalError(el, 'Nezachycená chyba (Promise)', e.reason?.stack || e.reason);
});

initTheme();

// Odeslat verzi aplikace při startu (pokud je uživatel přihlášený)
setTimeout(() => reportAppVersion(), 2000);

// Spustit pravidelné kontroly nové verze (každých 5 minut)
startVersionCheck();

// Service worker může pouze vyžádat kontrolu verze. Nikdy odsud stránku
// automaticky neobnovujeme — rozepsaná data smí zahodit jen explicitní kliknutí.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_ACTIVATED' || event.data?.type === 'NEW_VERSION_AVAILABLE') {
      void checkVersion();
    }
  });
}


try {
  // Root si držíme na window: při hot reloadu (vývoj) by se jinak nad stejným
  // elementem zavolal createRoot podruhé a konzole se zaplní chybami
  // removeChild/insertBefore, které s aplikací nemají nic společného.
  const koren = ((window as any).__pivovarRoot ??= ReactDOM.createRoot(document.getElementById('root')!));
  koren.render(
    <DebugErrorBoundary>
      <AuthProvider>
        <App />
        {/* Oznámení a potvrzovací dialogy — jedno místo pro celou aplikaci
            (lib/toast.ts). Musí být namountované, jinak potvrzení spadne
            na prohlížečový confirm a oznámení se ztratí. */}
        <ToastHost />
      </AuthProvider>
    </DebugErrorBoundary>,
  );
} catch (err: any) {
  const el = document.getElementById('root');
  if (el) renderFatalError(el, 'Chyba při renderu', err?.stack || err, true);
  zalogujANahlas('Render error', err);
}

// Service worker (offline/PWA) funguje jen na http(s), ne přes file://
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
