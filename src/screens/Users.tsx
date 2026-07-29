import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import { createFullBackup, downloadBackupJSON, downloadGoogleSheetsExcelBackup } from '../lib/backup';
import { Download, Shield, History, Table } from 'lucide-react';
import { UserPermissionsModal } from '../components/UserPermissionsModal';
import { AuditLogViewer } from '../components/AuditLogViewer';

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
  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase().trim() === 'vasilecko@seznam.cz';

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
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

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
            <button className="btn-primary text-xs font-black shadow-md" onClick={() => { setEditing(null); setShowForm(true); }}>+ Přidat uživatele</button>
          </div>

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
        : { email, display_name: name || undefined, is_admin: isAdmin }),
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
          : <p className="text-xs text-neutral-500">Heslo se nastaví automaticky na <span className="font-mono font-semibold">zajic</span>. Uživatel se přihlásí emailem a tímto heslem.</p>}
        
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
