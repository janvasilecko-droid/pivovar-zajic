export type Theme = 'light' | 'dark' | 'system';

const KEY = 'pivovar_theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {}
  return 'system';
}

/** Chce systém tmavý režim? */
function systemChceTmu(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Dřív tu byl tmavý režim natvrdo zakázaný, protože vycházel tmavý text na
  // tmavém pozadí. Příčina nebyla v barvách, ale v nastavení Tailwindu: běžel
  // ve výchozím režimu 'media', takže se dark: varianty spouštěly podle
  // TELEFONU bez ohledu na volbu v aplikaci. Od přepnutí na darkMode: 'class'
  // rozhoduje tahle funkce a barvy jsou přemapované v index.css.
  const tmavy = theme === 'dark' || (theme === 'system' && systemChceTmu());
  root.classList.toggle('dark', tmavy);
  root.dataset.theme = tmavy ? 'dark' : 'light';
}

/** Když je zvolené „podle systému", reaguj na jeho přepnutí za běhu. */
function sledujSystem() {
  try {
    const dotaz = window.matchMedia('(prefers-color-scheme: dark)');
    const reakce = () => { if (getTheme() === 'system') applyTheme('system'); };
    dotaz.addEventListener('change', reakce);
  } catch {}
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
  sledujSystem();
  if (theme === 'system' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (getTheme() === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if ((mq as any).addListener) (mq as any).addListener(handler);
  }
}
