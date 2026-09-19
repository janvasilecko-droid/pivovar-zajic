import { useState, useEffect, useMemo } from 'react';
import { supabase, Note, useRealtime } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { Bell, BellOff, BellRing, Check, NotebookPen, PenLine, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { potvrd } from '../lib/toast';
import { ReminderItem, createReminder, deleteReminder, fetchReminders } from '../lib/reminders';
import {
  RYCHLE_TERMINY, RychlyTermin, kdyCesky, nazevUpozorneni, proVstupDatumCas,
  terminKdy, upozorneniKPoznamce,
} from '../lib/upozorneniPoznamky';

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

  // 🔔 Upozornění k poznamkám. Poznamka a připomínka byly dvě oddělené
  // obrazovky — kdo chtěl, aby mu appka o poznámce dala vědět, musel ji celou
  // znovu opsat do Připomínek. Teď to jde rovnou odsud.
  const [upozorneni, setUpozorneni] = useState<ReminderItem[]>([]);
  // Pro kterou poznámku je právě otevřený výběr termínu ('nova' = formulář nahoře).
  const [nastavujiProId, setNastavujiProId] = useState<string | null>(null);
  const [kdy, setKdy] = useState(() => terminKdy('zitra-rano'));
  const [pridavamUpozorneni, setPridavamUpozorneni] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }
  async function nactiUpozorneni() {
    setUpozorneni(await fetchReminders());
  }
  useEffect(() => { load(); nactiUpozorneni(); }, []);
  // Jeden odběr na obě tabulky, ne dva: obrazovka je malá a useRealtime si
  // dávku stejně slučuje (viz komentář u useRealtime v lib/supabase.ts).
  useRealtime(['notes', 'reminders'], () => { load(); nactiUpozorneni(); });

  // Rychlé dohledání „má tahle poznámka upozornění?" — bez mapy by se při každém
  // překreslení procházel celý seznam připomínek pro každou poznámku zvlášť.
  const upozorneniPodlePoznamky = useMemo(() => {
    const m = new Map<string, ReminderItem>();
    for (const n of notes) {
      const u = upozorneniKPoznamce(n, upozorneni);
      if (u) m.set(n.id, u);
    }
    return m;
  }, [notes, upozorneni]);

  /** Založí připomínku k textu poznámky. Vrací false, když není z čeho udělat název. */
  async function zalozUpozorneni(poznamka: { title: string | null; body: string }, termin: string) {
    const nazev = nazevUpozorneni(poznamka);
    if (!nazev) return false;
    await createReminder({
      title: nazev,
      note: poznamka.body,
      date_time: termin,
      target_role: 'all',
      target_emails: [],
      display_mode: 'both',
      created_by: currentUser || 'Poznámky',
    });
    await nactiUpozorneni();
    return true;
  }

  async function add() {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      const novaPoznamka = { title: title.trim() || null, body: body.trim() };
      await supabase.from('notes').insert({
        ...novaPoznamka,
        color,
        created_by: currentUser || null,
      });
      // Upozornění se zakládá až po poznámce: když uložení poznámky selhalo,
      // nesmí zbýt připomínka na text, který nikde není.
      if (pridavamUpozorneni) await zalozUpozorneni(novaPoznamka, kdy);
      setTitle('');
      setBody('');
      setColor('primary');
      setPridavamUpozorneni(false);
      setKdy(terminKdy('zitra-rano'));
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!(await potvrd('Smazat tuto poznámku?'))) return;
    // Upozornění na smazanou poznámku by vyskočilo na text, který už nikde není.
    const u = upozorneniPodlePoznamky.get(id);
    await supabase.from('notes').delete().eq('id', id);
    if (u) { await deleteReminder(u.id); await nactiUpozorneni(); }
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  /** Odebrat upozornění u poznámky (poznámka zůstává). */
  async function zrusUpozorneni(poznamkaId: string) {
    const u = upozorneniPodlePoznamky.get(poznamkaId);
    if (!u) return;
    if (!(await potvrd(`Zrušit upozornění na ${kdyCesky(u.date_time)}? Poznámka zůstane.`))) return;
    await deleteReminder(u.id);
    await nactiUpozorneni();
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditTitle(n.title || '');
    setEditBody(n.body || '');
  }

  async function saveEdit(id: string) {
    const novy = { title: editTitle.trim() || null, body: editBody.trim() };
    // Připomínka se páruje podle názvu a textu (viz lib/upozorneniPoznamky.ts),
    // takže ji při úpravě poznámky přepisujeme též — jinak by se vazba rozpadla
    // a u poznámky by odznáček zmizel, i když upozornění dál platí.
    const u = upozorneniPodlePoznamky.get(id);
    await supabase
      .from('notes')
      .update({ ...novy, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (u) {
      const nazev = nazevUpozorneni(novy);
      if (nazev) {
        await supabase.from('reminders').update({ title: nazev, note: novy.body }).eq('id', u.id);
        await nactiUpozorneni();
      }
    }
    setEditingId(null);
    await load();
  }

  /**
   * Ctrl/Cmd+Enter uloží, Esc zruší — v textovém poli samé. Zadání z 19. 9.
   * 2026: „a jednodušeji to ukládat." Trefit myší malé tlačítko pod textem je
   * na telefonu v provozu (v ruce, v rukavicích) to nejhorší místo.
   */
  function klavesyUlozeni(ulozit: () => void, zrusit?: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ulozit(); }
      else if (e.key === 'Escape' && zrusit) { e.preventDefault(); zrusit(); }
    };
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
          <StickyNote size={18} className="text-amber-500" />
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
          onKeyDown={klavesyUlozeni(add)}
          className="input text-xs"
        />

        {/* 🔔 Upozornění k téhle poznámce — nepovinné, schované pod přepínačem,
            ať form nevypadá složitěji, než je. */}
        <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 space-y-2">
          <label className="flex items-center gap-2 text-xs font-black text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={pridavamUpozorneni}
              onChange={(e) => setPridavamUpozorneni(e.target.checked)}
              className="w-4 h-4"
            />
            <Bell size={14} className="text-amber-500" />
            Upozornit mě na ni
          </label>
          {pridavamUpozorneni && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {RYCHLE_TERMINY.map((t) => (
                  <button
                    key={t.klic}
                    type="button"
                    onClick={() => setKdy(terminKdy(t.klic as RychlyTermin))}
                    className={`btn-sm ${kdy === terminKdy(t.klic as RychlyTermin) ? 'btn-amber' : 'btn-ghost'}`}
                  >
                    {t.popis}
                  </button>
                ))}
              </div>
              <input
                type="datetime-local"
                value={kdy}
                min={proVstupDatumCas(new Date())}
                onChange={(e) => setKdy(e.target.value)}
                className="input text-xs"
                aria-label="Kdy upozornit"
              />
            </div>
          )}
        </div>

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
            className="btn-amber btn-sm flex-1"
          >
            <Plus size={16} /> {pridavamUpozorneni ? 'Přidat s upozorněním' : 'Přidat poznámku'}
          </button>
        </div>
        <p className="text-udaj font-bold text-neutral-400">
          Uloží i <kbd>Ctrl</kbd>+<kbd>Enter</kbd> přímo v textu.
        </p>
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
            const maUpozorneni = upozorneniPodlePoznamky.get(n.id) ?? null;
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
                      onKeyDown={klavesyUlozeni(() => saveEdit(n.id), () => setEditingId(null))}
                    />
                    <textarea
                      className="input text-xs"
                      rows={3}
                      placeholder="Text poznámky"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      onKeyDown={klavesyUlozeni(() => saveEdit(n.id), () => setEditingId(null))}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(n.id)} className="btn-emerald btn-sm">
                        <Check size={14} /> Uložit
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn-secondary btn-sm">
                        <X size={14} /> Zrušit
                      </button>
                    </div>
                    <p className="text-udaj font-bold text-neutral-400">
                      <kbd>Ctrl</kbd>+<kbd>Enter</kbd> uloží, <kbd>Esc</kbd> zruší.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {n.title && <div className="lze-vybrat font-black text-sm text-neutral-900 mb-0.5">{n.title}</div>}
                        <p className="lze-vybrat text-xs text-neutral-700 font-medium whitespace-pre-wrap leading-relaxed">{n.body}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {maUpozorneni ? (
                          <button
                            onClick={() => zrusUpozorneni(n.id)}
                            className="p-1.5 rounded hover:bg-rose-100 text-amber-600 transition tap"
                            title={`Upozornění ${kdyCesky(maUpozorneni.date_time)} — kliknutím zrušíte`}
                            aria-label="Zrušit upozornění"
                          >
                            <BellOff size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setNastavujiProId(nastavujiProId === n.id ? null : n.id); setKdy(terminKdy('zitra-rano')); }}
                            className="p-1.5 rounded hover:bg-amber-100 text-neutral-400 hover:text-amber-600 transition tap"
                            title="Přidat upozornění" aria-label="Přidat upozornění"
                          >
                            <Bell size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(n)}
                          className="p-1.5 rounded hover:bg-amber-100 text-amber-600 transition tap"
                          title="Upravit poznámku" aria-label="Upravit poznámku"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => del(n.id)}
                          className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition tap"
                          title="Smazat poznámku" aria-label="Smazat poznámku"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Výběr termínu u existující poznámky — rozbalí se pod zvonečkem. */}
                    {nastavujiProId === n.id && !maUpozorneni && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2.5 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {RYCHLE_TERMINY.map((t) => (
                            <button
                              key={t.klic}
                              type="button"
                              onClick={() => setKdy(terminKdy(t.klic as RychlyTermin))}
                              className={`btn-sm ${kdy === terminKdy(t.klic as RychlyTermin) ? 'btn-amber' : 'btn-ghost'}`}
                            >
                              {t.popis}
                            </button>
                          ))}
                        </div>
                        <input
                          type="datetime-local"
                          value={kdy}
                          min={proVstupDatumCas(new Date())}
                          onChange={(e) => setKdy(e.target.value)}
                          className="input text-xs"
                          aria-label="Kdy upozornit"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={async () => { await zalozUpozorneni(n, kdy); setNastavujiProId(null); }}
                            className="btn-amber btn-sm"
                          >
                            <BellRing size={14} /> Upozornit
                          </button>
                          <button onClick={() => setNastavujiProId(null)} className="btn-secondary btn-sm">
                            <X size={14} /> Zrušit
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 mt-2 text-udaj font-bold text-neutral-400 flex-wrap">
                      <span>{n.created_by || '—'}</span>
                      <span>•</span>
                      <span>{formatDate(n.created_at)}</span>
                      {maUpozorneni && (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <span>•</span>
                          <BellRing size={12} />
                          {kdyCesky(maUpozorneni.date_time)}
                        </span>
                      )}
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

