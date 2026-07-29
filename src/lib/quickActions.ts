/**
 * Uživatelské rychlé akce — tlačítka nahoře v headeru.
 * Každý uživatel si může navolit až 4 vlastní rychlé volby.
 */

const STORAGE_KEY_PREFIX = 'user_quick_actions_';

export type QuickAction = {
  pageId: string;
  label: string;
  icon: string; // emoji nebo textová ikona
};

const DEFAULT_ACTIONS: QuickAction[] = [
  { pageId: 'orders_entry', label: '+ OBJ', icon: '📝' },
  { pageId: 'fasovani', label: 'Fasování', icon: '📦' },
];

export function getQuickActions(userId: string): QuickAction[] {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as QuickAction[];
      if (Array.isArray(parsed) && parsed.length <= 4) return parsed;
    }
  } catch {}
  return DEFAULT_ACTIONS;
}

export function saveQuickActions(userId: string, actions: QuickAction[]): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(actions.slice(0, 4)));
  } catch {}
}
