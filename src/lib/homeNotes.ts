// Správce rychlých poznámek na domovské obrazovce (Pivovarská nástěnka).
// Ukládá se lokálně a vysílá event pro okamžitou reaktivní aktualizaci dlaždice na Domů.
import { zavibruj } from './haptika';

export type HomeNote = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  author?: string;
  color?: 'yellow' | 'blue' | 'green' | 'rose' | 'amber';
};

const STORAGE_KEY = 'pivovar_home_notes_v1';
export const HOME_NOTES_CHANGED_EVENT = 'pivovar_home_notes_changed';

const DEFAULT_NOTES: HomeNote[] = [
  {
    id: 'note-1',
    text: 'Zkontrolovat tlak CO2 a teplotu ve sklepě',
    completed: false,
    createdAt: new Date().toISOString(),
    color: 'yellow',
  },
  {
    id: 'note-2',
    text: 'Příjem sladu a chmele zítra v 10:00',
    completed: false,
    createdAt: new Date().toISOString(),
    color: 'blue',
  },
];

export function getHomeNotes(): HomeNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_NOTES));
      return DEFAULT_NOTES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_NOTES;
  } catch {
    return DEFAULT_NOTES;
  }
}

function saveHomeNotes(notes: HomeNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent(HOME_NOTES_CHANGED_EVENT, { detail: notes }));
  } catch (e) {
    console.error('Chyba při ukládání poznámek:', e);
  }
}

export function addHomeNote(text: string, author?: string, color: HomeNote['color'] = 'yellow'): HomeNote {
  const notes = getHomeNotes();
  const newNote: HomeNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
    author: author?.trim() || undefined,
    color,
  };
  const updated = [newNote, ...notes];
  saveHomeNotes(updated);
  try { zavibruj('klik'); } catch {}
  return newNote;
}

export function toggleHomeNote(id: string): boolean {
  const notes = getHomeNotes();
  let nextState = false;
  const updated = notes.map((n) => {
    if (n.id === id) {
      nextState = !n.completed;
      return { ...n, completed: nextState };
    }
    return n;
  });
  saveHomeNotes(updated);
  try { zavibruj(nextState ? 'odskrtnuto' : 'klik'); } catch {}
  return nextState;
}

export function deleteHomeNote(id: string) {
  const notes = getHomeNotes();
  const updated = notes.filter((n) => n.id !== id);
  saveHomeNotes(updated);
  try { zavibruj('klik'); } catch {}
}

export function clearCompletedNotes() {
  const notes = getHomeNotes();
  const updated = notes.filter((n) => !n.completed);
  saveHomeNotes(updated);
  try { zavibruj('klik'); } catch {}
}
