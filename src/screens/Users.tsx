import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import { createFullBackup, downloadBackupJSON, downloadGoogleSheetsExcelBackup } from '../lib/backup';
import { Download, Shield, History, Table, Mail, Search, Trash2, CheckCircle2 } from 'lucide-react';
import { UserPermissionsModal } from '../components/UserPermissionsModal';
import { AuditLogViewer } from '../components/AuditLogViewer';
import { isAdminEmail } from '../lib/config';

type UserRow = {
  id: string; email: string; display_name: string | null;
  role: 'admin' | 'user'; created_at: string; last_sign_in_at: string | null;
  receive_vehicle_alerts?: boolean | null;
};

export default function Users() {
  const { profile, user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);

  async function handleBackupJSON() {
    setBackingUp(true);
    try {
      const backup = await createFullBackup();
      downloadBackupJSON(backup);
    } catch (e: any) {
      alert(`Chyba zálohování: ${e.message}`);
    } finally {
      setBackingUp(false);
    }
  }

  async function handleBackupGoogleSheets() {
    setBackingUp(true);
    try {
      const backup = await createFullBackup();
      downloadGoogleSheetsExcelBackup(backup);
    } catch (e: any) {
      alert(`Chyba zálohování do Google Tabulek: ${e.message}`);
    } finally {
      setBackingUp(false);
    }
  }

  async function load() {
    setLoading(true); setErr(null);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}` } });
    
    // Načíst doplňková nastavení z tabulky profiles
    const { data: profilesData } = await supabase.from('profiles').select('id, receive_vehicle_alerts, role');
    const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]));

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? `Chyba ${res.status}`);
    } else {
      const j = await res.json();
      const rawUsers = (j.users ?? []) as UserRow[];
      const merged = rawUsers.map((u) => ({
        ...u,
        receive_vehicle_alerts: profileMap.get(u.id)?.receive_vehicle_alerts ?? false,
      }));
      setUsers(merged);
    }
    setLoading(false);
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function del(id: string, email: string) {
    if (!confirm(`Smazat uživatele ${email}?`)) return;
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?id=${id}`;
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(apiUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}` } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? 'Chyba'); return; }
    load();
  }

  const [permissionsUser, setPermissionsUser] = useState<UserRow | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'emails'>('users');

  // Schválené e-maily states
  const [allowedEmails, setAllowedEmails] = useState<{ email: string; status: 'pending' | 'approved'; created_at: string }[]>([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  async function loadAllowedEmails() {
    setLoadingEmails(true);
    setEmailErr(null);
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('*')
      .order('email', { ascending: true });
    if (error) {
      setEmailErr(error.message);
    } else {
      setAllowedEmails(data || []);
    }
    setLoadingEmails(false);
  }

  useEffect(() => {
    if (isAdmin && activeTab === 'emails') {
      loadAllowedEmails();
    }
  }, [isAdmin, activeTab]);

  async function handleAddAllowedEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr(null);
    setEmailMsg(null);
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail) return;

    const { error } = await supabase.from('allowed_emails').insert({ email: cleanEmail, status: 'pending' });
    if (error) {
      setEmailErr(error.message);
    } else {
      setEmailMsg(`E-mail ${cleanEmail} byl přidán a čeká na schválení.`);
      setNewEmail('');
      loadAllowedEmails();
    }
  }

  async function handleDeleteAllowedEmail(email: string) {
    if (!confirm(`Opravdu chcete odebrat schválení pro e-mail ${email}?`)) return;
    setEmailErr(null);
    setEmailMsg(null);
    const { error } = await supabase.from('allowed_emails').delete().eq('email', email);
    if (error) {
      setEmailErr(error.message);
    } else {
      setEmailMsg(`Schválení pro e-mail ${email} bylo odebráno.`);
      loadAllowedEmails();
    }
  }

  async function handleApproveAllowedEmail(email: string) {
    setEmailErr(null);
    setEmailMsg(null);
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/approve`;
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token ?? ''}` },
      body: JSON.stringify({ email }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEmailErr(j.error ?? 'Chyba při schvalování e-mailu.');
      return;
    }
    setEmailMsg(
      j.tempPassword
        ? `E-mail ${email} byl schválen. Dočasné heslo pro první přihlášení: „${j.tempPassword}“ — sděl ho uživateli osobně nebo přes WhatsApp (v aplikaci se znovu nezobrazí).`
        : `E-mail ${email} byl schválen. Účet už existoval, heslo se nemění.`
    );
    loadAllowedEmails();
    load();
  }

  const searchLower = searchEmail.toLowerCase();
  const pendingEmails = allowedEmails.filter(e => e.status === 'pending' && e.email.toLowerCase().includes(searchLower));
  const approvedEmails = allowedEmails.filter(e => e.status === 'approved' && e.email.toLowerCase().includes(searchLower));

  if (!isAdmin) return <div className="card p-6 text-center text-neutral-600">Správa uživatelů je dostupná pouze adminům.</div>;

  return (
    <div className="space-y-6 pb-12">
      {permissionsUser && (
        <UserPermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSaveSuccess={() => { setPermissionsUser(null); load(); }}
        />
      )}

      {/* Navigation tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'users'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Shield size={16} />
          <span>👥 Uživatelé & Práva</span>
        </button>

        <button
          onClick={() => setActiveTab('emails')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'emails'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Mail size={16} />
          <span>📧 Schválené e-maily</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <History size={16} />
          <span>📜 Auditní stopa (History Log)</span>
        </button>
      </div>

      {activeTab === 'audit' && <AuditLogViewer />}

      {activeTab === 'users' && (
        <>
          <div className="flex justify-end gap-2 flex-wrap">
            <button className="btn-amber text-xs font-black shadow-md flex items-center gap-1.5" onClick={handleBackupGoogleSheets} disabled={backingUp}>
              <Table size={16} className="text-emerald-800" />
              <span>{backingUp ? 'Generuji…' : '📊 Týdenní záloha pro Google Tabulky (.xlsx)'}</span>
            </button>
            <button className="btn-ghost !bg-white border-amber-300 text-xs font-black shadow-xs flex items-center gap-1.5" onClick={handleBackupJSON} disabled={backingUp}>
              <Download size={15} />
              <span>{backingUp ? 'Zálohuji…' : '💾 JSON Záloha'}</span>
            </button>
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => setActiveTab('emails')}>➕ Přidat e-mail ke schválení</button>
          </div>
          <p className="text-xs text-neutral-500 font-medium -mt-2 mb-1 text-right">
            Nový přístup: v záložce „📧 E-maily" přidejte e-mail a pak ho schvalte. Uživatel se přihlásí odkazem na e-mail.
          </p>

      {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-xl px-3.5 py-2.5 mb-4 font-bold">{err}</div>}
      {loading ? <Spinner /> : users.length === 0 ? <EmptyState text="Žádní uživatelé." icon="👥" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="card-hover p-5 border border-amber-200/90 rounded-3xl bg-white flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display font-bold text-base text-neutral-900">{u.display_name ?? u.email}</div>
                  <span className={`chip ${u.role === 'admin' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-neutral-100 text-neutral-700'}`}>
                    {u.role === 'admin' ? '👑 Admin' : '👤 Uživatel'}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-1 font-medium">{u.email}</div>

                {/* Upozornění na auta badge */}
                <div className="mt-2.5 flex items-center justify-between gap-1 flex-wrap">
                  {u.role === 'admin' || u.receive_vehicle_alerts ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-200">
                      🚗 Upozornění na auta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-500 font-medium text-[11px]">
                      🚗 Bez upozornění
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-neutral-400 mt-2">
                  Poslední přihlášení: {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('cs-CZ') : '—'}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-neutral-100">
                <button
                  onClick={() => setPermissionsUser(u)}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-xs transition flex items-center justify-center gap-1.5"
                >
                  <Shield size={14} />
                  <span>🔐 Nastavit práva (Vidět / Upravit)</span>
                </button>

                <div className="flex gap-2">
                  <button className="btn-ghost text-xs flex-1 !py-1.5 font-bold" onClick={() => { setEditing(u); setShowForm(true); }}>Upravit</button>
                  <button className="btn-danger text-xs !py-1.5 font-bold" onClick={() => del(u.id, u.email)}>Smazat</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && <UserForm user={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
        </>
      )}

      {activeTab === 'emails' && (
        <div className="space-y-6">
          {/* Add allowed email card */}
          <div className="card p-6 border border-amber-200/90 rounded-3xl bg-white shadow-xs">
            <h3 className="font-display font-black text-base text-neutral-900 mb-2">
              ➕ Přidat e-mail ke schválení
            </h3>
            <p className="text-xs text-neutral-500 font-medium mb-4">
              Uživatel se přihlásí e-mailem a heslem — a to teprve poté, co tento e-mail schválíte níže.
            </p>
            
            <form onSubmit={handleAddAllowedEmail} className="flex gap-3 max-w-lg">
              <input
                className="input flex-1"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jmeno@pivovar.cz"
              />
              <button type="submit" className="btn-primary py-2 px-6 font-black text-xs">
                Přidat e-mail
              </button>
            </form>

            {emailErr && <div className="text-xs font-bold text-rose-900 bg-rose-50 rounded-xl px-4 py-2 mt-4">{emailErr}</div>}
            {emailMsg && <div className="text-xs font-bold text-emerald-900 bg-emerald-50 rounded-xl px-4 py-2 mt-4">{emailMsg}</div>}
          </div>

          {/* Čeká na schválení */}
          <div className="card p-6 border border-amber-200/90 rounded-3xl bg-white shadow-xs space-y-4">
            <h3 className="font-display font-black text-base text-neutral-900">
              ⏳ Čeká na schválení ({pendingEmails.length})
            </h3>

            {loadingEmails ? (
              <Spinner />
            ) : pendingEmails.length === 0 ? (
              <EmptyState text="Žádné e-maily nečekají na schválení." icon="⏳" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-[10px] font-black uppercase tracking-wider border-b border-neutral-100">
                      <th className="p-4">E-mailová adresa</th>
                      <th className="p-4">Datum přidání</th>
                      <th className="p-4 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-700">
                    {pendingEmails.map((e) => (
                      <tr key={e.email} className="hover:bg-amber-50/20 transition-colors">
                        <td className="p-4 font-bold text-neutral-900">{e.email}</td>
                        <td className="p-4 text-neutral-400">
                          {new Date(e.created_at).toLocaleString('cs-CZ')}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleApproveAllowedEmail(e.email)}
                              className="btn-primary !py-1 !px-2.5 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                              title="Schválit přístup"
                            >
                              <CheckCircle2 size={12} />
                              <span>Schválit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteAllowedEmail(e.email)}
                              className="btn-danger !py-1 !px-2.5 text-[10px] font-black flex items-center gap-1 cursor-pointer"
                              title="Odebrat e-mail"
                            >
                              <Trash2 size={12} />
                              <span>Odebrat</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Schválené e-maily */}
          <div className="card p-6 border border-amber-200/90 rounded-3xl bg-white shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="font-display font-black text-base text-neutral-900">
                ✅ Schválené e-maily ({approvedEmails.length})
              </h3>
              
              <div className="relative max-w-xs w-full flex items-center">
                <Search className="absolute left-3 text-neutral-400" size={16} />
                <input
                  className="w-full pl-9 pr-4 py-2 text-xs font-bold text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-hidden focus:bg-white focus:border-amber-500"
                  type="text"
                  placeholder="Hledat e-mail..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                />
              </div>
            </div>

            {loadingEmails ? (
              <Spinner />
            ) : approvedEmails.length === 0 ? (
              <EmptyState text="Žádné schválené e-maily neodpovídají hledání." icon="✅" />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-neutral-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-neutral-500 text-[10px] font-black uppercase tracking-wider border-b border-neutral-100">
                      <th className="p-4">E-mailová adresa</th>
                      <th className="p-4">Datum schválení</th>
                      <th className="p-4 text-right">Akce</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-xs font-medium text-neutral-700">
                    {approvedEmails.map((e) => (
                      <tr key={e.email} className="hover:bg-amber-50/20 transition-colors">
                        <td className="p-4 font-bold text-neutral-900">{e.email}</td>
                        <td className="p-4 text-neutral-400">
                          {new Date(e.created_at).toLocaleString('cs-CZ')}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteAllowedEmail(e.email)}
                            className="btn-danger !py-1 !px-2.5 text-[10px] font-black flex items-center gap-1 ml-auto cursor-pointer"
                            title="Odebrat schválení"
                          >
                            <Trash2 size={12} />
                            <span>Odebrat</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(user?.role === 'admin');
  const [receiveVehicleAlerts, setReceiveVehicleAlerts] = useState(user?.receive_vehicle_alerts ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const { data: session } = await supabase.auth.getSession();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
    const res = await fetch(apiUrl, {
      method: user ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token ?? ''}` },
      body: JSON.stringify(user
        ? { id: user.id, password: password || undefined, is_admin: isAdmin, display_name: name || undefined }
        : { email }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? 'Chyba ukládání uživatele');
      setBusy(false);
      return;
    }

    const resJson = await res.json().catch(() => ({}));
    const targetUserId = user ? user.id : resJson.user?.id;

    if (targetUserId) {
      await supabase.from('profiles').upsert({
        id: targetUserId,
        role: isAdmin ? 'admin' : 'user',
        receive_vehicle_alerts: receiveVehicleAlerts,
        display_name: name || undefined,
      });
    }

    setBusy(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={user ? 'Upravit uživatele' : 'Nový uživatel'}>
      <div className="space-y-4">
        <Field label="Email"><input className="input" type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@pivovar.cz" /></Field>
        <Field label="Jméno"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Křestní jméno" /></Field>
        {user
          ? <Field label='Nové heslo (volitelné)'><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 6 znaků" /></Field>
          : <p className="text-xs text-neutral-500">E-mail se přidá do seznamu ke schválení. Po schválení (v záložce „Schválené e-maily“) se účet vytvoří s náhodným dočasným heslem, které se zobrazí adminovi ke sdělení uživateli.</p>}
        
        <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500" />
            <span className="text-sm font-bold text-neutral-900">👑 Admin (má plná práva spravovat uživatele a systém)</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={receiveVehicleAlerts} onChange={(e) => setReceiveVehicleAlerts(e.target.checked)} className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500" />
            <span className="text-sm font-bold text-neutral-900">🚗 Dostávat upozornění na končící STK a dálniční známky</span>
          </label>
        </div>

        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-xl px-3.5 py-2.5 font-bold">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}
