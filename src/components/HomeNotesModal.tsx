import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Plus, Check, Trash2, StickyNote, CheckSquare, Sparkles, LayoutGrid, AlertTriangle } from 'lucide-react';
import { getHomeNotes, addHomeNote, toggleHomeNote, toggleHomeNoteImportant, deleteHomeNote, clearCompletedNotes, HOME_NOTES_CHANGED_EVENT, type HomeNote } from '../lib/homeNotes';
import { useAuth } from '../lib/auth';
import { getHomeLayout, saveHomeLayout, addTile } from '../lib/homeLayout';
import { NAV, EXTRA_NAV } from './Layout';

export function HomeNotesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, profile, patchProfile } = useAuth();
  const [notes, setNotes] = useState<HomeNote[]>(() => getHomeNotes());
  const [newText, setNewText] = useState('');
  const [selectedColor, setSelectedColor] = useState<HomeNote['color']>('yellow');
  const [showCompleted, setShowCompleted] = useState(true);
  const [pinToHome, setPinToHome] = useState(true);

  useEffect(() => {
    const handleUpdate = () => setNotes(getHomeNotes());
    window.addEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    addHomeNote(newText, undefined, selectedColor);
    setNewText('');

    if (pinToHome) {
      const allNavIds = [...NAV.map((n) => n.id), ...EXTRA_NAV.map((n) => n.id)];
      const layout = getHomeLayout(profile?.home_layout, allNavIds, []);
      const isPinned = layout.pages.some((page) => page.includes('notes'));
      if (!isPinned) {
        const nextLayout = addTile(layout, 'notes', 0);
        patchProfile({ home_layout: nextLayout as any });
        if (user?.id) void saveHomeLayout(user.id, nextLayout);
      }
    }
  }

  // Důležité poznámky první, ať na ně člověk hned narazí, ne až dole v seznamu.
  const activeNotes = notes.filter((n) => !n.completed).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
  const completedNotes = notes.filter((n) => n.completed);

  const COLOR_STYLES: Record<NonNullable<HomeNote['color']>, { bg: string; border: string; text: string; badge: string }> = {
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-950', badge: 'bg-amber-400' },
    blue: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-950', badge: 'bg-sky-400' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-950', badge: 'bg-emerald-400' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-950', badge: 'bg-rose-400' },
    amber: { bg: 'bg-primary-50', border: 'border-primary-200', text: 'text-primary-950', badge: 'bg-primary-400' },
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Rychlé poznámky & Nástěnka">
      <div className="space-y-4">
        {/* Formular pro pridani nove poznamky */}
        <form onSubmit={handleAdd} className="space-y-2 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <textarea
            rows={2}
            className="w-full text-sm font-medium border border-neutral-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Napište novou poznámku či vzkaz..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd(e);
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              {(['yellow', 'blue', 'green', 'rose', 'amber'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${COLOR_STYLES[c].badge} ${selectedColor === c ? 'scale-125 ring-2 ring-neutral-800' : 'opacity-70 hover:opacity-100'}`}
                />
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinToHome}
                onChange={(e) => setPinToHome(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <LayoutGrid size={13} className="text-neutral-500" />
              <span>Umístit dlaždici na plochu</span>
            </label>
            <button
              type="submit"
              disabled={!newText.trim()}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition ml-auto"
            >
              <Plus size={15} /> Přidat poznámku
            </button>
          </div>
        </form>

        {/* Seznam aktivnich poznamek */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {activeNotes.length === 0 && completedNotes.length === 0 ? (
            <div className="text-center py-6 text-neutral-400 text-sm">
              <StickyNote size={32} className="mx-auto mb-2 opacity-40 text-neutral-500" />
              Žádné zapsané poznámky. Přidejte první vzkaz výše.
            </div>
          ) : (
            <>
              {activeNotes.map((note) => {
                const style = COLOR_STYLES[note.color || 'yellow'];
                return (
                  <div
                    key={note.id}
                    className={`flex items-start justify-between gap-3 p-3 rounded-xl border shadow-xs transition ${
                      note.important ? 'bg-rose-50 border-rose-300 text-rose-950' : `${style.bg} ${style.border} ${style.text}`
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleHomeNote(note.id)}
                      className="mt-0.5 w-5 h-5 rounded-md border-2 border-neutral-400/80 bg-white/90 grid place-items-center shrink-0 hover:border-amber-600 transition"
                      title="Označit jako hotové / odškrtnout"
                    >
                      {note.completed && <Check size={14} className="text-emerald-700 font-bold" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold whitespace-pre-wrap leading-snug">{note.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleHomeNoteImportant(note.id)}
                      className={`p-1 shrink-0 transition rounded ${note.important ? 'text-rose-600' : 'text-neutral-300 hover:text-rose-500'}`}
                      title={note.important ? 'Zrušit důležitost' : 'Označit jako důležité'}
                    >
                      <AlertTriangle size={16} className={note.important ? 'fill-rose-200' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteHomeNote(note.id)}
                      className="text-neutral-400 hover:text-rose-600 p-1 shrink-0 transition"
                      title="Smazat poznámku"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}

              {completedNotes.length > 0 && (
                <div className="pt-3 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="text-xs font-bold uppercase tracking-wide text-neutral-500 hover:text-neutral-800"
                    >
                      Hotové poznámky ({completedNotes.length})
                    </button>
                    <button
                      type="button"
                      onClick={clearCompletedNotes}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Vyčistit hotové
                    </button>
                  </div>

                  {showCompleted && (
                    <div className="space-y-1.5 opacity-75">
                      {completedNotes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 text-sm"
                        >
                          <button
                            type="button"
                            onClick={() => toggleHomeNote(note.id)}
                            className="w-5 h-5 rounded-md bg-emerald-600 text-white grid place-items-center shrink-0"
                            title="Vrátit mezi aktivní"
                          >
                            <Check size={14} />
                          </button>
                          <span className="flex-1 line-through truncate">{note.text}</span>
                          <button
                            type="button"
                            onClick={() => deleteHomeNote(note.id)}
                            className="text-neutral-400 hover:text-rose-600 p-1 shrink-0"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
