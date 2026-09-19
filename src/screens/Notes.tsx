// 📝 Poznámky — a upozornění k nim.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „celý ty upozornění předělej do poznámek, ať můžu
// přidat čas a datum upozornění, přesně jak fungujou upomínky — akorát je můžu
// mít i na tom listě, a pak dlaždici upomínky smaž."
//
// Upozornění bývala vlastní obrazovka (RemindersScreen) s vlastním formulářem,
// kde se název a text psal ZNOVU, i když totéž už stálo v poznámce. Dvě místa
// na jednu věc: poznámka zapadla, protože ji nikomu nic nepřipomnělo, a
// upozornění bylo bez souvislosti, protože se k němu poznámka nedostala.
//
// Teď je poznámka jediné místo. Text se píše jednou, upozornění je jen jeho
// nastavení (kdy, komu, kde) a visí u poznámky, ke které patří. Starší
// upozornění, která vznikla ještě na té zrušené obrazovce, se ukazují dole
// pod čarou, aby se neztratila.
import { useState, useEffect, useMemo } from 'react';
import { supabase, Note, useRealtime } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import {
  Bell, BellRing, Check, Monitor, NotebookPen, PenLine, Pencil, Plus, StickyNote, Trash2, X,
} from 'lucide-react';
import { chyba, oznam, potvrd } from '../lib/toast';
import {
  ReminderItem, acknowledgeReminder, createReminder, deleteReminder, fetchReminders,
} from '../lib/reminders';
import { isNotificationSupported, requestNotificationPermission } from '../lib/notifications';
import { getAdminEmail } from '../lib/config';
import UpozorneniForm from '../components/UpozorneniForm';
import UpozorneniPruh from '../components/UpozorneniPruh';
import {
  NastaveniUpozorneni, kdyCesky, nazevUpozorneni, prijemciZNastaveni, terminZNastaveni,
  upozorneniKPoznamce, vychoziNastaveni,
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
  const currentUser = user?.email || getAdminEmail();

  // 🔔 Upozornění
  const [upozorneni, setUpozorneni] = useState<ReminderItem[]>([]);
  const [chciUpozorneni, setChciUpozorneni] = useState(false);
  const [nastaveni, setNastaveni] = useState<NastaveniUpozorneni>(() => vychoziNastaveni());
  /** Pro kterou už napsanou poznámku je právě otevřené nastavení upozornění. */
  const [nastavujiProId, setNastavujiProId] = useState<string | null>(null);
  const [nastaveniProPoznamku, setNastaveniProPoznamku] = useState<NastaveniUpozorneni>(() => vychoziNastaveni());

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

  // Rychlé dohledání „má tahle poznámka upozornění?" — bez mapy by se při
  // každém překreslení procházel celý seznam pro každou poznámku zvlášť.
  const upozorneniPodlePoznamky = useMemo(() => {
    const m = new Map<string, ReminderItem>();
    for (const n of notes) {
      const u = upozorneniKPoznamce(n, upozorneni);
      if (u) m.set(n.id, u);
    }
    return m;
  }, [notes, upozorneni]);

  // Upozornění, která k žádné poznámce nepatří — typicky ta starší, co vznikla
  // ještě na zrušené obrazovce. Bez tohohle seznamu by po zrušení dlaždice
  // zmizela z aplikace úplně, i když pořád platí.
  const upozorneniBezPoznamky = useMemo(() => {
    const zabrane = new Set([...upozorneniPodlePoznamky.values()].map((u) => u.id));
    return upozorneni.filter((u) => !zabrane.has(u.id) && !u.is_completed);
  }, [upozorneni, upozorneniPodlePoznamky]);

  /**
   * Založí upozornění k textu poznámky. Vrací chybu jako text, ne výjimku —
   * formulář ji ukáže, místo aby uložení tiše propadlo.
   */
  async function zalozUpozorneni(
    poznamka: { title: string | null; body: string },
    n: NastaveniUpozorneni,
  ): Promise<string | null> {
    const nazev = nazevUpozorneni(poznamka);
    if (!nazev) return 'Napište nejdřív poznámku — z čeho jinak upozornění udělat.';
    const prijemci = prijemciZNastaveni(n);
    if ('chyba' in prijemci) return prijemci.chyba;

    // Bez svolení prohlížeče by push nikam nedorazil a nikdo by se to nedozvěděl.
    if ((n.zobrazeni === 'desktop_push' || n.zobrazeni === 'both') && isNotificationSupported()
        && Notification.permission !== 'granted') {
      await requestNotificationPermission();
    }

    await createReminder({
      title: nazev,
      note: poznamka.body,
      date_time: terminZNastaveni(n),
      target_role: prijemci.target_role,
      target_emails: prijemci.target_emails,
      display_mode: n.zobrazeni,
      created_by: currentUser,
    });
    await nactiUpozorneni();
    return null;
  }

  async function add() {
    if (!title.trim() && !body.trim()) return;
    setSaving(true);
    try {
      const novaPoznamka = { title: title.trim() || null, body: body.trim() };
      // Upozornění se zakládá až po poznámce: když uložení poznámky selhalo,
      // nesmí zbýt upozornění na text, který nikde není.
      await supabase.from('notes').insert({
        ...novaPoznamka,
        color,
        created_by: currentUser || null,
      });
      if (chciUpozorneni) {
        const potiz = await zalozUpozorneni(novaPoznamka, nastaveni);
        if (potiz) chyba(potiz);
        else oznam('Poznámka uložená, upozornění nastavené.');
      }
      setTitle('');
      setBody('');
      setColor('primary');
      setChciUpozorneni(false);
      setNastaveni(vychoziNastaveni());
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

  async function zrusUpozorneni(id: string) {
    const u = upozorneni.find((x) => x.id === id);
    if (!u) return;
    if (!(await potvrd(`Zrušit upozornění na ${kdyCesky(u.date_time)}? Poznámka zůstane.`))) return;
    await deleteReminder(id);
    await nactiUpozorneni();
  }

  async function odkliknout(id: string) {
    await acknowledgeReminder(id, currentUser);
    await nactiUpozorneni();
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEditTitle(n.title || '');
    setEditBody(n.body || '');
  }

  async function saveEdit(id: string) {
    const novy = { title: editTitle.trim() || null, body: editBody.trim() };
    // Upozornění se páruje podle názvu a textu (viz lib/upozorneniPoznamky.ts),
    // takže ho při úpravě poznámky přepisujeme též — jinak by se vazba rozpadla
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
   * Ctrl/Cmd+Enter uloží, Esc zruší — v textovém poli samém. Zadání z 19. 9.
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
        <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
          <StickyNote size={18} className="text-amber-500" />
          <span><NotebookPen className="ikona-text" /> Poznámky ({notes.length})</span>
        </h3>
        {isNotificationSupported() && Notification.permission !== 'granted' && (
          <button onClick={() => requestNotificationPermission()} className="btn-ghost btn-sm">
            <Monitor size={14} /> Povolit upozornění na ploše
          </button>
        )}
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
            ať formulář nevypadá složitěji, než je. */}
        <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 space-y-2.5">
          <label className="flex items-center gap-2 text-xs font-black text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={chciUpozorneni}
              onChange={(e) => setChciUpozorneni(e.target.checked)}
              className="w-5 h-5 accent-amber-500"
            />
            <Bell size={14} className="text-amber-500" />
            Upozornit na ni
          </label>
          {chciUpozorneni && <UpozorneniForm hodnota={nastaveni} zmen={setNastaveni} />}
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
            <Plus size={16} /> {chciUpozorneni ? 'Přidat s upozorněním' : 'Přidat poznámku'}
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
                        {!maUpozorneni && (
                          <button
                            onClick={() => {
                              setNastavujiProId(nastavujiProId === n.id ? null : n.id);
                              setNastaveniProPoznamku(vychoziNastaveni());
                            }}
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

                    {/* Upozornění, které u téhle poznámky visí. */}
                    {maUpozorneni && (
                      <div className="mt-2">
                        <UpozorneniPruh
                          upozorneni={maUpozorneni}
                          jaEmail={currentUser}
                          odkliknout={odkliknout}
                          smazat={zrusUpozorneni}
                        />
                      </div>
                    )}

                    {/* Nastavení upozornění u už napsané poznámky. */}
                    {nastavujiProId === n.id && !maUpozorneni && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2.5 space-y-2.5">
                        <UpozorneniForm hodnota={nastaveniProPoznamku} zmen={setNastaveniProPoznamku} />
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const potiz = await zalozUpozorneni(n, nastaveniProPoznamku);
                              if (potiz) chyba(potiz);
                              else setNastavujiProId(null);
                            }}
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
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Starší upozornění, která k žádné poznámce nepatří — vznikla ještě na
          zrušené obrazovce „Upozornění". Bez tohohle seznamu by po zrušení
          dlaždice zmizela z aplikace úplně, i když pořád platí. */}
      {upozorneniBezPoznamky.length > 0 && (
        <div className="pt-4 border-t border-neutral-200 space-y-2.5">
          <h4 className="font-display font-black text-sm text-neutral-900 flex items-center gap-2">
            <Bell size={16} className="text-amber-500" />
            Upozornění bez poznámky ({upozorneniBezPoznamky.length})
          </h4>
          {upozorneniBezPoznamky.map((u) => (
            <UpozorneniPruh
              key={u.id}
              upozorneni={u}
              jaEmail={currentUser}
              odkliknout={odkliknout}
              smazat={zrusUpozorneni}
              samostatne
            />
          ))}
        </div>
      )}
    </div>
  );
}
