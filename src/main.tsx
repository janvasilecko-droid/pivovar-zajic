import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ToastHost from './components/ToastHost';
import './index.css';
import { AuthProvider } from './lib/auth';
import { initDensity } from './lib/density';
import { initTheme } from './lib/theme';
import { reportAppVersion } from './lib/appVersionTracker';
import { checkVersion, forceRefresh, startVersionCheck } from './lib/versionCheck';
import { renderFatalError } from './lib/safeDom';


initDensity();

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
        <div style={{ padding: 24, fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', color: '#900', background: '#fef2f2', minHeight: '100vh' }}>
          <h1 style={{ color: '#991b1b', fontSize: 22, fontWeight: 'bold' }}>Chyba při načítání aplikace</h1>
          <p style={{ fontSize: 14, color: '#7f1d1d', margin: '8px 0 16px 0' }}>Zachyceno v paměti React rozhraní. Stiskněte tlačítko pro pokračování nebo vyčištění paměti.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
              onClick={() => this.setState({ error: null })}
            >
              ▶ Obnovit zobrazení
            </button>
            <button
              style={{ padding: '10px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
              onClick={() => { void forceRefresh(); }}
            >
              🔄 Vyčistit mezipaměť a znovu načíst
            </button>
          </div>
          <pre style={{ fontFamily: 'monospace', fontSize: 12, padding: 12, background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, overflowX: 'auto' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
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
      console.log('📱 Service worker hlásí novou verzi — kontroluji dostupnou verzi');
      void checkVersion();
    }
  });
}


try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <DebugErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DebugErrorBoundary>,
  );
} catch (err: any) {
  const el = document.getElementById('root');
  if (el) renderFatalError(el, 'Chyba při renderu', err?.stack || err, true);
  console.error('Render error:', err);
}

// Service worker (offline/PWA) funguje jen na http(s), ne přes file://
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
