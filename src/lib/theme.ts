export type Theme = 'light' | 'dark' | 'system';

const KEY = 'pivovar_theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  return 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Tmavý režim je v této aplikaci deaktivovaný: tmavé pozadí s tmavým textem
  // je nečitelné (černé písmo). Vždy používáme světlý režim.
  root.classList.remove('dark');
  root.dataset.theme = 'light';
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  applyTheme(theme);
}

export function initTheme() {
  const theme = getTheme();
  applyTheme(theme);
  if (theme === 'system' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (getTheme() === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if ((mq as any).addListener) (mq as any).addListener(handler);
  }
}
