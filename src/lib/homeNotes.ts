// Správce rychlých poznámek na domovské obrazovce (Pivovarská nástěnka).
// Ukládá se lokálně a synchronizuje přes Supabase profiles.home_layout napříč zařízeními.
import { zavibruj } from './haptika';
import { queueHomeLayoutPatch } from './profileSync';

export type HomeNote = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  author?: string;
  color?: 'yellow' | 'blue' | 'green' | 'rose' | 'amber';
  /** Důležitá/naléhavá poznámka — zvýrazní se vykřičníkem a řadí se první. */
  important?: boolean;
};

const STORAGE_KEY = 'pivovar_home_notes_v1';
export const HOME_NOTES_CHANGED_EVENT = 'pivovar_home_notes_changed';

const DEFAULT_NOTES: HomeNote[] = [];

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

export function saveHomeNotes(notes: HomeNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent(HOME_NOTES_CHANGED_EVENT, { detail: notes }));
  } catch (e) {
    console.error('Chyba při ukládání poznámek:', e);
  }
  // Cloud sync — viz lib/profileSync.ts (sériový zápis, slučuje souběžné
  // změny místo dvou zápisů, co si mohly navzájem přepsat čerstvá data).
  queueHomeLayoutPatch({ notes });
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

export function toggleHomeNoteImportant(id: string): boolean {
  const notes = getHomeNotes();
  let nextState = false;
  const updated = notes.map((n) => {
    if (n.id === id) {
      nextState = !n.important;
      return { ...n, important: nextState };
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

// 🔀 Appka mívala DVOJE „Poznámky" — dlaždici na Domů (tenhle systém, se
// zaškrtáváním) a samostatnou stránku v postranním menu/vyhledávání
// (sdílená nástěnka bez zaškrtávání, App.tsx page 'notes'). Aby „Poznámky"
// všude znamenaly totéž, App.tsx teď každý pokus o setPage('notes') přesměruje
// na Domů a rovnou zavolá requestOpenHomeNotes() — HomeScreen si to při mountu
// vyzvedne a otevře tenhle modal. Modulová proměnná + CustomEvent stejně jako
// requestOrdersAutoImport v ordersFilter.ts (Domů se může teprve montovat,
// nebo tam už člověk je).
export const OPEN_HOME_NOTES_EVENT = 'pivovar_open_home_notes';
let pendingOpen = false;

export function requestOpenHomeNotes(): void {
  pendingOpen = true;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_HOME_NOTES_EVENT));
  } catch {}
}

export function consumeOpenHomeNotesRequest(): boolean {
  const req = pendingOpen;
  pendingOpen = false;
  return req;
}
