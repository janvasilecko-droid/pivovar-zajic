import { useEffect, useState } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { EmptyState, Spinner, useConfirm } from '../components/ui';
import { UntappdAiAnalyzer } from '../components/UntappdAiAnalyzer';
import { Sparkles, MessageSquare } from 'lucide-react';

type Category = 'bug' | 'feature' | 'question' | 'other';
type Status = 'open' | 'in_progress' | 'done' | 'rejected';

type FeedbackNote = {
  id: string;
  author_id: string;
  author_name: string | null;
  category: Category;
  title: string;
  body: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
};

const CATEGORY_META: Record<Category, { label: string; icon: string; chip: string }> = {
  bug: { label: 'Chyba', icon: '🐛', chip: 'bg-danger-100 text-danger-700' },
  feature: { label: 'Nápad na vylepšení', icon: '💡', chip: 'bg-warning-100 text-warning-700' },
  question: { label: 'Otázka', icon: '❓', chip: 'bg-primary-100 text-primary-700' },
  other: { label: 'Jiné', icon: '📝', chip: 'bg-neutral-100 text-neutral-700' },
};

const STATUS_META: Record<Status, { label: string; chip: string }> = {
  open: { label: 'Nové', chip: 'bg-primary-100 text-primary-700' },
  in_progress: { label: 'V řešení', chip: 'bg-warning-100 text-warning-700' },
  done: { label: 'Hotovo', chip: 'bg-success-100 text-success-700' },
  rejected: { label: 'Zamítnuto', chip: 'bg-neutral-200 text-neutral-600' },
};

const STATUS_ORDER: Status[] = ['open', 'in_progress', 'done', 'rejected'];

export default function Feedback({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [notes, setNotes] = useState<FeedbackNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const { confirm, node: confirmNode } = useConfirm();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('feature');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('feedback_notes')
      .select('*')
      .order('created_at', { ascending: false });
    setNotes((data as FeedbackNote[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['feedback_notes'], load);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (!title.trim()) { setErr('Napiš alespoň předmět.'); return; }
    setSaving(true);
    const { error } = await supabase.from('feedback_notes').insert({
      title: title.trim(),
      body: body.trim() || null,
      category,
      author_name: profile?.display_name ?? user?.email ?? null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setTitle(''); setBody(''); setCategory('feature'); setShowForm(false);
    load();
  }

  async function setStatus(note: FeedbackNote, status: Status) {
    const { error } = await supabase
      .from('feedback_notes')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', note.id);
    if (error) { setErr(error.message); return; }
    load();
  }

  async function del(id: string) {
    if (!(await confirm('Opravdu smazat tuto poznámku?'))) return;
    await supabase.from('feedback_notes').delete().eq('id', id);
    load();
  }

  const [activeTab, setActiveTab] = useState<'notes' | 'untappd'>((initialSubTab as any) || 'notes');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || 'notes');
  }, [initialSubTab]);

  function selectTab(t: 'notes' | 'untappd') {
    if (setPage) setPage('feedback', undefined, t);
    else setActiveTab(t);
  }
  const filtered = filter === 'all' ? notes : notes.filter((n) => n.category === filter);
  const grouped = STATUS_ORDER.map((s) => ({ status: s, items: filtered.filter((n) => n.status === s) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation tabs — přilepené pod záložkami PlanningTabbed nad tím. */}
      <div className="sticky top-[56px] z-10 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2">
        <button
          onClick={() => selectTab('notes')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'notes'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <MessageSquare size={16} />
          <span>💬 Poznámky a nápady</span>
        </button>

        <button
          onClick={() => selectTab('untappd')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'untappd'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Sparkles size={16} />
          <span>⭐ AI Analýza recenzí (Untappd)</span>
        </button>
      </div>

      {activeTab === 'untappd' && <UntappdAiAnalyzer />}

      {activeTab === 'notes' && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <h1 className="text-2xl font-display font-bold text-primary-900">💬 Poznámky a nápady</h1>
              <p className="text-sm text-primary-500 mt-1">Napiš, co by se mělo vylepšit, opravit nebo upravit. Vidí to všichni kolegové.</p>
            </div>
            <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Zavřít' : '+ Napsat poznámku'}
            </button>
          </div>

      {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2 mb-4">{err}</div>}

      {showForm && (
        <form onSubmit={add} className="card p-4 mb-5 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="sm:col-span-2">
              <label className="label">Předmět *</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Chybí tlačítko export v Závozu" maxLength={120} />
            </div>
            <div>
              <label className="label">Kategorie</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                <option value="feature">💡 Nápad na vylepšení</option>
                <option value="bug">🐛 Chyba</option>
                <option value="question">❓ Otázka</option>
                <option value="other">📝 Jiné</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="label">Detail</label>
            <textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Popiš, co přesně by se mělo změnit nebo jak to funguje…" maxLength={1000} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Zrušit</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Ukládám…' : 'Odeslat'}</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`chip transition-colors ${filter === 'all' ? 'bg-primary-900 text-white' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'}`}>Vše ({notes.length})</button>
        {(Object.keys(CATEGORY_META) as Category[]).map((c) => {
          const count = notes.filter((n) => n.category === c).length;
          return (
            <button key={c} onClick={() => setFilter(c)} className={`chip transition-colors ${filter === c ? 'bg-primary-900 text-white' : `${CATEGORY_META[c].chip} hover:opacity-80`}`}>
              {CATEGORY_META[c].icon} {CATEGORY_META[c].label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? <Spinner /> : grouped.length === 0 ? (
        <EmptyState text="Zatím žádné poznámky. Napiš první výše." icon="💬" />
      ) : (
        <div className="space-y-6 animate-fade-in">
          {grouped.map((g) => (
            <div key={g.status}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`chip ${STATUS_META[g.status].chip}`}>{STATUS_META[g.status].label}</span>
                <span className="text-xs text-primary-400">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {g.items.map((n) => {
                  const cat = CATEGORY_META[n.category];
                  const mine = user?.id === n.author_id;
                  return (
                    <div key={n.id} className="card p-4 flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none mt-0.5">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-primary-900 break-words">{n.title}</div>
                          <div className="text-[11px] text-primary-400 mt-0.5">
                            {n.author_name ?? 'neznámý'} · {new Date(n.created_at).toLocaleDateString('cs-CZ')}
                          </div>
                        </div>
                        <span className={`chip text-[10px] ${cat.chip}`}>{cat.label}</span>
                      </div>
                      {n.body && (() => {
                        const match = n.body.match(/\[FOTO\]:(data:image\/[a-zA-Z0-9+.-]+;base64,[a-zA-Z0-9\+\/=]+)/);
                        const cleanBody = match ? n.body.replace(match[0], '').trim() : n.body;
                        return (
                          <>
                            {cleanBody && <p className="text-sm text-primary-700 whitespace-pre-wrap break-words">{cleanBody}</p>}
                            {match && (
                              <div
                                className="mt-2 rounded-lg overflow-hidden border border-neutral-200/80 max-h-48 flex items-center justify-center bg-neutral-50 cursor-pointer hover:opacity-90 transition active:scale-[0.99]"
                                onClick={() => {
                                  const win = window.open();
                                  if (win) {
                                    win.document.write(`<iframe src="${match[1]}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  }
                                }}
                                title="Kliknutím otevřete v plné velikosti"
                              >
                                <img src={match[1]} alt="Příloha" className="object-contain max-h-48 w-full" />
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
                        <select
                          className="input !py-1 !text-xs max-w-[160px]"
                          value={n.status}
                          onChange={(e) => setStatus(n, e.target.value as Status)}
                          disabled={!isAdmin && !mine}
                          title={(!isAdmin && !mine) ? 'Může měnit jen autor nebo admin' : 'Změnit stav'}
                        >
                          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                        </select>
                        {(isAdmin || mine) && (
                          <button className="text-danger-400 hover:text-danger-600 text-sm px-2" title="Smazat" onClick={() => del(n.id)}>×</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
      {confirmNode}
    </div>
  );
}
