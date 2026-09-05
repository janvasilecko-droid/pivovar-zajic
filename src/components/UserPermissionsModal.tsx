import { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  UserPermissions,
  MODULE_DEFINITIONS,
  PRESET_ROLES,
  DEFAULT_FULL_PERMISSIONS,
  getUserPermissions,
  saveUserPermissions,
  ModuleKey,
} from '../lib/permissions';
import { CheckCircle2, Lock, Save, Shield, Unlock, X, Zap } from 'lucide-react';

export function UserPermissionsModal({
  user,
  onClose,
  onSaveSuccess,
}: {
  user: { id: string; email: string; display_name: string | null; role: string };
  onClose: () => void;
  onSaveSuccess: () => void;
}) {
  const [permissions, setPermissions] = useState<UserPermissions>(() => getUserPermissions(user.id));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggleView(modId: ModuleKey) {
    setPermissions((prev) => {
      const current = prev[modId] ?? { view: true, edit: true };
      const nextView = !current.view;
      // If view is turned off, edit must also be turned off
      const nextEdit = nextView ? current.edit : false;

      return {
        ...prev,
        [modId]: { view: nextView, edit: nextEdit },
      };
    });
  }

  function toggleEdit(modId: ModuleKey) {
    setPermissions((prev) => {
      const current = prev[modId] ?? { view: true, edit: true };
      const nextEdit = !current.edit;
      // If edit is turned on, view must also be turned on
      const nextView = nextEdit ? true : current.view;

      return {
        ...prev,
        [modId]: { view: nextView, edit: nextEdit },
      };
    });
  }

  function applyPreset(preset: typeof PRESET_ROLES[0]) {
    setPermissions(preset.permissions);
  }

  async function handleSave() {
    setBusy(true);
    setMsg(null);

    // Save to localStorage immediately (funguje okamžitě na tomhle zařízení,
    // i kdyby serverové uložení selhalo).
    saveUserPermissions(user.id, permissions);

    // Serverové uložení MUSÍ jít přes manage-users edge funkci (service-role
    // klient) — přímý update přes běžného klienta blokuje RLS pro cizí řádek
    // (update_own_profile povoluje jen auth.uid() = id), takže by se pro
    // JINÉHO uživatele nic neuložilo. Dřív se tahle chyba tiše polykala a
    // appka hlásila úspěch, i když se práva ve skutečnosti vůbec neomezila.
    try {
      const { data: session } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
      const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: user.id, permissions }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Uložení práv na serveru selhalo.');
      }
    } catch (e: any) {
      setBusy(false);
      setMsg(`Uloženo jen lokálně na tomto zařízení — na server se práva neuložila (${e?.message ?? 'neznámá chyba'}). Zkus to prosím znovu.`);
      return;
    }

    setBusy(false);
    setMsg(`Práva pro uživatele ${user.display_name ?? user.email} byla úspěšně uložena!`);
    setTimeout(() => {
      setMsg(null);
      onSaveSuccess();
      onClose();
    }, 1500);
  }

  return (
    <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal">
      <div className="bg-white rounded max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-md">
              <Lock className="ikona-text" />
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-neutral-950">
                Nastavit oprávnění a přístupy
              </h3>
              <p className="text-xs text-neutral-500 font-bold">
                Uživatel: <strong className="text-neutral-900">{user.display_name ?? user.email}</strong> ({user.email})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 font-black text-xl" title="Zavřít" aria-label="Zavřít"><X size={18} /></button>
        </div>

        {msg && (
          <div className="p-3.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-black flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-700" />
            <span>{msg}</span>
          </div>
        )}

        {/* Quick Role Presets */}
        <div className="p-4 rounded bg-amber-50/80 border border-amber-200 space-y-2">
          <div className="text-xs font-black uppercase text-amber-950 flex items-center gap-1.5">
            <Zap size={16} className="text-amber-600" />
            <span>Rychlé předvolby rolí (1-Click Aplikovat):</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_ROLES.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="p-2.5 rounded bg-white hover:bg-amber-100 text-neutral-900 font-bold text-xs border border-amber-300 transition shadow-2xs text-left"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Granular Permissions Table */}
        <div className="space-y-3">
          <div className="font-black text-xs uppercase text-neutral-700 tracking-wider">
            Podrobná práva na sekce a moduly aplikace:
          </div>

          <div className="space-y-2">
            {MODULE_DEFINITIONS.map((mod) => {
              const access = permissions[mod.id] ?? { view: true, edit: true };

              return (
                <div
                  key={mod.id}
                  className={`p-3.5 rounded border transition-all flex items-center justify-between gap-4 ${
                    access.view
                      ? access.edit
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-amber-50/40 border-amber-200'
                      : 'bg-neutral-50 border-neutral-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500"><mod.icon size={22} /></span>
                    <div>
                      <div className="font-display font-black text-sm text-neutral-900">{mod.label}</div>
                      <div className="text-udaj text-neutral-500 font-medium">{mod.desc}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle View */}
                    <button
                      type="button"
                      onClick={() => toggleView(mod.id)}
                      className={`tap px-3 py-1.5 rounded text-xs font-black border transition flex items-center gap-1 ${
                        access.view
                          ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                          : 'bg-neutral-200 text-neutral-600 border-neutral-300'
                      }`}
                    >
                      {access.view ? <Unlock size={14} /> : <Lock size={14} />}
                      <span>{access.view ? 'Vidět v menu' : 'Skryto'}</span>
                    </button>

                    {/* Toggle Edit */}
                    <button
                      type="button"
                      onClick={() => toggleEdit(mod.id)}
                      disabled={!access.view}
                      className={`tap px-3 py-1.5 rounded text-xs font-black border transition flex items-center gap-1 ${
                        !access.view
                          ? 'opacity-40 cursor-not-allowed bg-neutral-100 text-neutral-600 border-neutral-200'
                          : access.edit
                          ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-2xs'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                      }`}
                    >
                      <span>{access.edit ? 'Může upravovat' : 'Jen čtení'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 flex items-center justify-between border-t border-neutral-100">
          <button
            type="button"
            onClick={() => setPermissions(DEFAULT_FULL_PERMISSIONS)}
            className="px-3.5 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
          >
            Obnovit plná práva
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
            >
              Zrušit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-2"
            >
              <Save size={16} />
              <span>{busy ? 'Ukládám…' : 'Uložit nová práva uživatele'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
