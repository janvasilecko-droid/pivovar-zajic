import { useState, useEffect, useMemo } from 'react';
import { ReminderItem, ReminderTarget, ReminderDisplayMode, fetchReminders, createReminder, deleteReminder, acknowledgeReminder, isReminderForUser, normalizeTargetEmails } from '../lib/reminders';
import { isNotificationSupported, requestNotificationPermission, playOrderChime } from '../lib/notifications';
import { Bell, Plus, Trash2, CheckCircle2, Clock, User, Shield, PhoneCall, Monitor, Lock, AlertCircle, Filter, Calendar, Send, Users as UsersIcon } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { getAdminEmail, DEFAULT_ROLE } from '../lib/config';
import { supabase } from '../lib/supabase';
import { chyba, oznam, potvrd } from '../lib/toast';

type UserDirectoryEntry = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
};

type RecipientMode = 'all' | 'role' | 'users' | 'custom';

export default function RemindersScreen() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  // Default to today + 1 hour formatted for datetime-local
  const [dateTime, setDateTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
    return d.toISOString().slice(0, 16);
  });
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('all');
  const [targetRole, setTargetRole] = useState<ReminderTarget>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]); // e-maily příjemců
  const [customEmails, setCustomEmails] = useState('');
  const [userDirectory, setUserDirectory] = useState<UserDirectoryEntry[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [sendNow, setSendNow] = useState(false);
  const [displayMode, setDisplayMode] = useState<ReminderDisplayMode>('both');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'my' | 'pending'>('pending');

  const currentUserEmail = user?.email || getAdminEmail();
  const currentUserRole = user?.role || DEFAULT_ROLE;

  // Načtení adresáře uživatelů (pro výběr konkrétních příjemců)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDirectoryLoading(true);
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/directory`;
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}` } });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) {
            const list = ((j.users ?? []) as UserDirectoryEntry[]).filter((u) => u.email);
            setUserDirectory(list.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email)));
          }
        }
      } catch {
        // adresář není dostupný → zůstane prázdný, uživatel může zadat e-maily ručně
      }
      if (!cancelled) setDirectoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleUser(email: string) {
    setSelectedUsers((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  }

  async function loadData() {
    setLoading(true);
    const data = await fetchReminders();
    setReminders(data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      oznam('Zadejte název zprávy / upomínky.');
      return;
    }
    if (!sendNow && !dateTime) {
      oznam('Zadejte datum a čas, nebo zvolte „Odeslat ihned".');
      return;
    }

    // Stanovení příjemců podle zvoleného režimu
    let finalTargetRole = 'all';
    let finalTargetEmails: string[] = [];
    if (recipientMode === 'role') {
      finalTargetRole = targetRole;
    } else if (recipientMode === 'users') {
      if (selectedUsers.length === 0) {
        oznam('Vyberte alespoň jednoho uživatele.');
        return;
      }
      finalTargetRole = 'custom';
      finalTargetEmails = selectedUsers;
    } else if (recipientMode === 'custom') {
      const parsed = normalizeTargetEmails(customEmails);
      if (parsed.length === 0) {
        oznam('Zadejte alespoň jeden e-mail.');
        return;
      }
      finalTargetRole = 'custom';
      finalTargetEmails = parsed;
    }

    setSaving(true);
    try {
      // Check browser notification permission if desktop push requested
      if (displayMode === 'desktop_push' || displayMode === 'both') {
        if (isNotificationSupported() && Notification.permission !== 'granted') {
          await requestNotificationPermission();
        }
      }

      await createReminder({
        title: title.trim(),
        note: note.trim() || undefined,
        date_time: sendNow ? new Date().toISOString() : dateTime,
        target_role: finalTargetRole,
        target_emails: finalTargetEmails,
        display_mode: displayMode,
        created_by: currentUserEmail,
      });

      setTitle('');
      setNote('');
      setSelectedUsers([]);
      setCustomEmails('');
      setSendNow(false);
      await loadData();
      oznam('✅ Zpráva / upomínka byla úspěšně odeslána!');
    } catch (e: any) {
      chyba('Chyba při vytváření upomínky: ' + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await potvrd('Smazat tuto upomínku?'))) return;
    await deleteReminder(id);
    await loadData();
  }

  async function handleAck(id: string) {
    await acknowledgeReminder(id, currentUserEmail);
    await loadData();
  }

  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (filter === 'pending') {
        const acked = (r.acknowledged_by || []).includes(currentUserEmail);
        return !acked && isReminderForUser(r, currentUserEmail, currentUserRole);
      }
      if (filter === 'my') {
        return isReminderForUser(r, currentUserEmail, currentUserRole);
      }
      return true;
    });
  }, [reminders, filter, currentUserEmail, currentUserRole]);

  function formatRecipients(r: ReminderItem): string {
    if (r.target_emails && r.target_emails.length > 0) {
      const shown = r.target_emails.slice(0, 2).join(', ');
      const count = r.target_emails.length;
      return count > 2 ? `${count} uživatelů (${shown}…)` : `${count} uživatelů (${shown})`;
    }
    if (r.target_role === 'all') return 'Všichni';
    return r.target_role;
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Bell size={18} />
            <span>Chytré plánování & Notifikace</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>🔔 Upozornění — posílejte zprávy kolegům</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Napište zprávu nebo upomínku a vyberte příjemce — všechny, roli nebo konkrétní uživatele. Odešlete ihned nebo naplánujte na termín. Uživatelé dostanou push notifikaci a/nebo okno k potvrzení.
          </p>
        </div>

        <button
          onClick={() => requestNotificationPermission()}
          className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-2"
        >
          <Monitor size={16} /> Povolit Notifikace na Ploše
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulář Nová Upomínka */}
        <div className="card p-5 sm:p-6 bg-white border border-amber-200 rounded shadow-sm space-y-4 lg:col-span-1">
          <div className="border-b border-amber-100 pb-3">
            <h3 className="font-display font-black text-base sm:text-lg text-neutral-900 flex items-center gap-2">
              <Plus size={20} className="text-amber-500" />
              <span>Odeslat zprávu / upomínku</span>
            </h3>
          </div>

          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Název upomínky / Zpráva *</label>
              <input
                type="text"
                required
                placeholder="Např. Sanace CCT tanku #3 / Koupit zátky"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input font-bold text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Podrobnější poznámka (volitelné)</label>
              <textarea
                rows={2}
                placeholder="Doplňující pokyny pro kolegy nebo sebe..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Kdy se má zpráva doručit?</label>
              <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer mb-2 ${
                sendNow ? 'bg-emerald-100/70 border-emerald-400 font-bold' : 'bg-neutral-50 border-neutral-200'
              }`}>
                <input
                  type="checkbox"
                  checked={sendNow}
                  onChange={(e) => setSendNow(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-black text-neutral-900">📤 Odeslat ihned</div>
                  <div className="text-[11px] text-neutral-500">Upozornění se vybraným uživatelům zobrazí okamžitě (do ~12 sekund), bez čekání na termín.</div>
                </div>
              </label>
              {!sendNow && (
                <input
                  type="datetime-local"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="input font-mono font-bold text-xs"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Komu zprávu / upomínku poslat? *</label>
              <div className="space-y-1.5">
                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  recipientMode === 'all' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="recipient"
                    value="all"
                    checked={recipientMode === 'all'}
                    onChange={() => setRecipientMode('all')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">👥 Všichni uživatelé pivovaru</div>
                    <div className="text-[11px] text-neutral-500">Zobrazí se každému, kdo používá aplikaci.</div>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  recipientMode === 'role' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="recipient"
                    value="role"
                    checked={recipientMode === 'role'}
                    onChange={() => setRecipientMode('role')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">🎯 Podle role / pracovní pozice</div>
                    <div className="text-[11px] text-neutral-500">Např. pouze sládek, výroba, obchod…</div>
                  </div>
                </label>
                {recipientMode === 'role' && (
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as ReminderTarget)}
                    className="input font-bold text-xs mt-1"
                  >
                    <option value="admin">👑 Pouze Administrátoři</option>
                    <option value="sef">👔 Pouze Šéf a vedení</option>
                    <option value="sladek">🍺 Pouze Sládek</option>
                    <option value="vyroba">🏭 Výroba a sklep</option>
                    <option value="obchod">💼 Obchod a rozvoz</option>
                  </select>
                )}

                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  recipientMode === 'users' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="recipient"
                    value="users"
                    checked={recipientMode === 'users'}
                    onChange={() => setRecipientMode('users')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">👤 Konkrétní uživatelé</div>
                    <div className="text-[11px] text-neutral-500">Vyberte jednoho nebo více kolegů ze seznamu.</div>
                  </div>
                </label>
                {recipientMode === 'users' && (
                  <div className="mt-1 space-y-2">
                    {directoryLoading ? (
                      <div className="text-[11px] font-bold text-neutral-500">Načítám seznam uživatelů…</div>
                    ) : userDirectory.length === 0 ? (
                      <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        Seznam uživatelů není dostupný — použijte „Vlastní e-maily" a napište e-maily kolegů ručně.
                      </div>
                    ) : (
                      <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded p-2 space-y-1 bg-white">
                        {userDirectory.map((u) => {
                          const checked = selectedUsers.includes(u.email);
                          return (
                            <label
                              key={u.id}
                              className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition ${
                                checked ? 'bg-amber-100 border border-amber-300' : 'hover:bg-neutral-50 border border-transparent'
                              }`}
                            >
                              <input type="checkbox" checked={checked} onChange={() => toggleUser(u.email)} />
                              <UsersIcon size={14} className="text-neutral-400 shrink-0" />
                              <span className="font-black text-neutral-800">{u.display_name || u.email.split('@')[0]}</span>
                              <span className="text-neutral-400 truncate">{u.email}</span>
                              <span className="ml-auto text-[10px] font-bold uppercase text-neutral-400 shrink-0">{u.role}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {selectedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUsers.map((em) => (
                          <span key={em} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 border border-amber-300 text-[11px] font-bold text-neutral-800">
                            {em}
                            <button type="button" onClick={() => toggleUser(em)} className="text-amber-700 hover:text-rose-600 font-black" aria-label={`Odebrat ${em}`}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  recipientMode === 'custom' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="recipient"
                    value="custom"
                    checked={recipientMode === 'custom'}
                    onChange={() => setRecipientMode('custom')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">✉️ Vlastní e-maily</div>
                    <div className="text-[11px] text-neutral-500">Napište e-maily příjemců ručně (více oddělte čárkou).</div>
                  </div>
                </label>
                {recipientMode === 'custom' && (
                  <input
                    type="text"
                    required
                    placeholder="napriklad@seznam.cz, kolega@firma.cz"
                    value={customEmails}
                    onChange={(e) => setCustomEmails(e.target.value)}
                    className="input font-bold text-xs mt-1"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 mb-1">Způsob zobrazení (Kde se zobrazí) *</label>
              <div className="space-y-2">
                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  displayMode === 'both' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="displayMode"
                    value="both"
                    checked={displayMode === 'both'}
                    onChange={() => setDisplayMode('both')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">🔔 Obojí (Vyskočí po přihlášení + Push na ploše)</div>
                    <div className="text-[11px] text-neutral-500">Nejjistější kombinace. Uživatel musí v aplikaci odkliknout, že o upomínce ví.</div>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  displayMode === 'login_modal' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="displayMode"
                    value="login_modal"
                    checked={displayMode === 'login_modal'}
                    onChange={() => setDisplayMode('login_modal')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">🔒 Po přihlášení do aplikace (Modální okno)</div>
                    <div className="text-[11px] text-neutral-500">Po přihlášení vyskočí oknu, které musí daný člověk odkliknout.</div>
                  </div>
                </label>

                <label className={`flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
                  displayMode === 'desktop_push' ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <input
                    type="radio"
                    name="displayMode"
                    value="desktop_push"
                    checked={displayMode === 'desktop_push'}
                    onChange={() => setDisplayMode('desktop_push')}
                    className="mt-0.5"
                  />
                  <div className="text-xs">
                    <div className="font-black text-neutral-900">📲 Na ploše telefonu / počítače (Push alert)</div>
                    <div className="text-[11px] text-neutral-500">Systémové upozornění na displeji telefonu nebo monitoru PC.</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2"
              >
                <Send size={16} /> Odeslat zprávu / upomínku
              </button>
            </div>
          </form>
        </div>

        {/* Seznam Upomínek */}
        <div className="card p-5 sm:p-6 bg-white border border-neutral-200 rounded shadow-sm space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
            <div>
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span>Přehled naplánovaných upomínek ({filteredReminders.length})</span>
              </h3>
            </div>

            <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded text-xs font-bold">
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1 rounded transition ${
                  filter === 'pending' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Ke schválení pro mě
              </button>
              <button
                onClick={() => setFilter('my')}
                className={`px-3 py-1 rounded transition ${
                  filter === 'my' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Moje upomínky
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded transition ${
                  filter === 'all' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Všechny
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : filteredReminders.length === 0 ? (
            <EmptyState text="Zatím žádné aktivní upomínky v tomto zobrazení." icon="🔔" />
          ) : (
            <div className="space-y-3">
              {filteredReminders.map((r) => {
                const isAcked = (r.acknowledged_by || []).includes(currentUserEmail);
                const isDue = new Date(r.date_time).getTime() <= Date.now();

                return (
                  <div
                    key={r.id}
                    className={`p-4 rounded border transition-all space-y-2 ${
                      isAcked
                        ? 'bg-neutral-50/80 border-neutral-200 opacity-75'
                        : isDue
                        ? 'bg-amber-50/80 border-amber-300 shadow-sm'
                        : 'bg-white border-neutral-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            r.display_mode === 'desktop_push'
                              ? 'bg-blue-100 text-blue-900 border border-blue-200'
                              : r.display_mode === 'login_modal'
                              ? 'bg-amber-100 text-amber-950 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          }`}>
                            {r.display_mode === 'desktop_push' ? '📲 Push' : r.display_mode === 'login_modal' ? '🔒 Okno po přihlášení' : '🔔 Okno + Push'}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-500">
                            Cíl: <strong className="text-neutral-800">{formatRecipients(r)}</strong>
                          </span>
                        </div>
                        <h4 className="font-display font-black text-base text-neutral-950 mt-1">
                          {r.title}
                        </h4>
                        {r.note && (
                          <p className="text-xs text-neutral-600 font-medium mt-0.5">{r.note}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isAcked && (
                          <button
                            onClick={() => handleAck(r.id)}
                            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-2xs flex items-center gap-1"
                          >
                            <CheckCircle2 size={14} /> Odkliknout
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition"
                          title="Smazat upomínku"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-500 font-bold">
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-amber-600" />
                        {new Date(r.date_time).toLocaleString('cs-CZ')}
                      </span>
                      <span>Zadal: {r.created_by}</span>
                      {r.acknowledged_by?.length ? (
                        <span className="text-emerald-700 font-black">
                          Odkliklo: {r.acknowledged_by.length} uživatelů
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
