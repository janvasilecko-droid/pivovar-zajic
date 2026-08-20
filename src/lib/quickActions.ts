/**
 * Uživatelské rychlé akce — tlačítka nahoře v headeru.
 * Každý uživatel si může navolit až 8 vlastních rychlých voleb.
 */

const STORAGE_KEY_PREFIX = 'user_quick_actions_';

export type QuickAction = {
  pageId: string;
  label: string;
  icon: string; // emoji nebo textová ikona
};

export const DEFAULT_ACTIONS: QuickAction[] = [
  { pageId: 'orders', label: 'Objednávky', icon: '📝' },
  { pageId: 'fasovani', label: 'Personál', icon: '📦' },
  { pageId: 'kegging', label: 'KEG', icon: '🛢️' },
  { pageId: 'bottling', label: 'Lahve', icon: '🍾' },
];

export function getQuickActions(userId: string): QuickAction[] {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as QuickAction[];
      if (Array.isArray(parsed) && parsed.length <= 8) return parsed;
    }
  } catch {}
  return DEFAULT_ACTIONS;
}

export function saveQuickActions(userId: string, actions: QuickAction[]): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(actions.slice(0, 8)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pivovar:quick-actions-updated'));
    }
  } catch {}
}
