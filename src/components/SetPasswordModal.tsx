import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export function SetPasswordModal() {
  const { user, profile, reloadProfile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // Zobrazit modal pouze pokud je uživatel přihlášený, ale nemá nastavené heslo
  if (!user || !profile || profile.password_set !== false) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (password.length < 6) {
      setErr('Heslo musí mít alespoň 6 znaků.');
      return;
    }

    if (password !== confirmPassword) {
      setErr('Hesla se neshodují.');
      return;
    }

    setBusy(true);

    try {
      // 1. Aktualizovat heslo v Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) {
        setErr(authError.message);
        setBusy(false);
        return;
      }

      // 2. Aktualizovat flag v tabulce profiles
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ password_set: true })
        .eq('id', user.id);

      if (dbError) {
        setErr(dbError.message);
        setBusy(false);
        return;
      }

      setSuccess(true);
      
      // Krátká prodleva pro zobrazení úspěchu a obnovení profilu
      setTimeout(async () => {
        await reloadProfile();
        setBusy(false);
      }, 1500);

    } catch (e: any) {
      setErr(e.message || 'Nastala neočekávaná chyba.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
      <div className="bg-white rounded max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-amber-500 relative overflow-hidden">
        {/* Decorative Top Accent Line */}
        <div className="h-3 w-full absolute top-0 left-0 right-0 bg-amber-500" />

        <div className="flex items-start gap-4 pt-2">
          <div className="w-14 h-14 rounded flex items-center justify-center text-white shrink-0 shadow-lg bg-amber-500">
            <Lock size={30} />
          </div>

          <div className="flex-1">
            <div className="text-xs font-black uppercase tracking-widest text-amber-700">
              První přihlášení
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              Založte si své heslo
            </h2>
            <p className="text-xs font-bold text-neutral-500 mt-1">
              Přihlásil(a) jste se výchozím heslem vytvořeným správcem. Pro příští přihlášení si prosím vytvořte své heslo.
            </p>
          </div>
        </div>

        {success ? (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-5 text-center space-y-2">
            <div className="flex justify-center text-emerald-600">
              <CheckCircle2 size={44} className="animate-bounce" />
            </div>
            <h3 className="font-display font-black text-emerald-950 text-base">Heslo úspěšně uloženo!</h3>
            <p className="text-xs font-bold text-emerald-800">Ukládám nastavení a otevírám aplikaci...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1.5">
                Nové heslo
              </label>
              <input
                className="w-full px-4 py-3 text-sm font-bold text-neutral-900 bg-neutral-50 border-2 border-neutral-200 rounded focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all placeholder:text-neutral-400"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Alespoň 6 znaků"
                disabled={busy}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-neutral-700 uppercase tracking-wider mb-1.5">
                Potvrzení hesla
              </label>
              <input
                className="w-full px-4 py-3 text-sm font-bold text-neutral-900 bg-neutral-50 border-2 border-neutral-200 rounded focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all placeholder:text-neutral-400"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Zadejte heslo znovu"
                disabled={busy}
              />
            </div>

            {err && (
              <div className="text-xs font-bold text-rose-950 bg-rose-50 border border-rose-300 rounded px-4 py-3 flex items-start gap-2 animate-shake">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 text-sm font-black tracking-wide text-neutral-950 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] transition-all duration-200 shadow-md shadow-amber-500/20 rounded flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer border border-amber-400"
              disabled={busy}
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                  <span>Ukládám…</span>
                </span>
              ) : (
                <span>Uložit heslo a pokračovat</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
