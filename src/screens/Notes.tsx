import { useState, useEffect } from 'react';
import { supabase, Note, useRealtime } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Check, NotebookPen, PenLine, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { potvrd } from '../lib/toast';

const NOTE_COLORS: Record<string, string> = {
  primary: 'bg-primary-500',
  accent: 'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
};

export default function Notes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [color, setColor] = useState('primary');
  const [saving, setSaving] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const currentUser = user?.email || '';

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['notes'], load);

  async function add() {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      await supabase.from('notes').insert({
        title: title.trim() || null,
        body: body.trim(),
        color,
        created_by: currentUser || null,
      });
      setTitle('');
      setBody('');
      setColor('primary');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!(await potvrd('Smazat tuto poznámku?'))) return;
    await supabase.from('notes').delete().eq('id', id);
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditTitle(n.title || '');
    setEditBody(n.body || '');
  }

  async function saveEdit(id: string) {
    await supabase
      .from('notes')
      .update({ title: editTitle.trim() || null, body: editBody.trim(), updated_at: new Date().toISOString() })
      .eq('id', id);
    setEditingId(null);
    await load();
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="card p-5 sm:p-6 bg-white border border-neutral-200 rounded shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
        <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
          <StickyNote size={20} className="text-amber-500" />
          <span><NotebookPen className="ikona-text" /> Poznámky ({notes.length})</span>
        </h3>
      </div>

      {/* Add form */}
      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        className="space-y-2.5"
      >
        <input
          type="text"
          placeholder="Název poznámky (nepovinné)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input font-bold text-xs"
        />
        <textarea
          rows={3}
          placeholder="Napište poznámku... (např. „Zítra ráno doveze Pavel nové etikety.“)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="input text-xs"
        />
        <div className="flex items-center gap-2">
          <select value={color} onChange={(e) => setColor(e.target.value)} className="input !w-auto font-bold text-xs">
            <option value="primary">Modrá</option>
            <option value="accent">Oranžová</option>
            <option value="success">Zelená</option>
            <option value="warning">Žlutá</option>
            <option value="danger">Červená</option>
          </select>
          <button
            type="submit"
            disabled={saving || (!title.trim() && !body.trim())}
            className="flex-1 px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} /> Přidat poznámku
          </button>
        </div>
      </form>


      {/* Notes list */}
      {loading ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : notes.length === 0 ? (
        <EmptyState text="Zatím žádné poznámky. Napište první!" icon={PenLine} />
      ) : (
        <div className="space-y-2.5">
          {notes.map((n) => {
            const isEditing = editingId === n.id;
            return (
              <div key={n.id} className="p-3.5 rounded border border-neutral-200 bg-white hover:shadow-sm transition">
                <div className={`h-1 w-full rounded-full mb-2 ${NOTE_COLORS[n.color] ?? NOTE_COLORS.primary}`} />

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      className="input font-bold text-xs"
                      placeholder="Název"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <textarea
                      className="input text-xs"
                      rows={3}
                      placeholder="Text poznámky"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(n.id)}
                        className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center gap-1 transition tap"
                      >
                        <Check size={14} /> Uložit
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black text-xs flex items-center gap-1 transition tap"
                      >
                        <X size={14} /> Zrušit
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {n.title && <div className="lze-vybrat font-black text-sm text-neutral-900 mb-0.5">{n.title}</div>}
                        <p className="lze-vybrat text-xs text-neutral-700 font-medium whitespace-pre-wrap leading-relaxed">{n.body}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(n)}
                          className="p-1.5 rounded hover:bg-amber-100 text-amber-600 transition tap"
                          title="Upravit poznámku"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => del(n.id)}
                          className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition tap"
                          title="Smazat poznámku"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 mt-2 text-[11px] font-bold text-neutral-400">
                      <span>{n.created_by || '—'}</span>
                      <span>•</span>
                      <span>{formatDate(n.created_at)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

