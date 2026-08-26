import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { AlertTriangle, ArrowRight, Beer, Beer as BeerIcon, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getAdminEmail } from '../lib/config';

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (res.error) setErr(res.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-amber-100/90 via-amber-50/80 to-white relative overflow-hidden font-sans select-none">
      {/* Dynamic Background Mesh & Glowing Warm Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-400/20 blur-[100px] animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-amber-500/15 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-amber-300/10 blur-[150px]" />
        {/* Subtle dot grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.05]" 
          style={{ backgroundImage: `radial-gradient(#d97706 1.5px, transparent 1.5px)`, backgroundSize: '32px 32px' }} 
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card wrapper */}
        <div className="relative group">
          <div className="absolute -inset-1 rounded-[2.5rem] bg-gradient-to-r from-amber-400/30 via-amber-300/20 to-amber-500/30 blur-xl opacity-80 group-hover:opacity-100 transition duration-1000" />
          
          <div className="relative card p-7 sm:p-10 backdrop-blur-2xl bg-white/95 border border-amber-200/90 shadow-2xl rounded-[2.2rem] text-neutral-900">
            
            {/* Header / Logo Badge (Transparent Background Logo without gold frame) */}
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="relative mb-3">
                <div className="w-28 h-28 sm:w-36 sm:h-36 flex items-center justify-center">
                  <img src="/logo.png" alt="Pivovar Zajíc" className="w-full h-full object-contain filter drop-shadow-lg" />
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-amber-950 flex items-center gap-2">
                Pivovar Zajíc
              </h1>
              <p className="text-xs font-black text-amber-700 mt-1 uppercase tracking-widest flex items-center gap-1.5 justify-center">
                <ShieldCheck size={14} className="text-amber-600" />
                <span>Kynšperk nad Ohří — Výrobní systém</span>
              </p>
            </div>

            {/* Form */}
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-xs font-black text-amber-900 uppercase tracking-wider mb-2">
                  Přihlašovací e-mail
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 text-amber-600 pointer-events-none" size={18} />
                  <input
                    className="w-full pl-11 pr-4 py-3.5 text-sm font-bold text-neutral-900 bg-amber-50/50 border-2 border-amber-200 rounded-2xl focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all placeholder:text-neutral-400 shadow-2xs"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={getAdminEmail()}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-amber-900 uppercase tracking-wider mb-2">
                  Heslo
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 text-amber-600 pointer-events-none" size={18} />
                  <input
                    className="w-full pl-11 pr-12 py-3.5 text-sm font-bold text-neutral-900 bg-amber-50/50 border-2 border-amber-200 rounded-2xl focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all placeholder:text-neutral-400 shadow-2xs"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-neutral-400 hover:text-amber-700 transition-colors p-1 rounded-lg"
                    title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {err && (
                <div className="text-xs font-bold text-rose-950 bg-rose-50 border border-rose-300 rounded-2xl px-4 py-3 flex items-start gap-2.5 animate-shake">
                  <span className="text-base leading-none"><AlertTriangle className="ikona-text" /></span>
                  <span>{err}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-4 text-sm font-black tracking-wide text-neutral-950 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] transition-all duration-200 shadow-lg shadow-amber-500/25 rounded-2xl flex items-center justify-center gap-2 group disabled:opacity-50 cursor-pointer border border-amber-400"
                disabled={busy}
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                    <span>Pracuji…</span>
                  </span>
                ) : (
                  <>
                    <span>Vstoupit do pivovaru</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 rounded-2xl bg-amber-50/80 border border-amber-200 px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                <BeerIcon className="ikona-text" /> Nový uživatel? Účet a dočasné heslo vám založí administrátor — zeptejte se ho.
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-amber-100 text-center">
              <p className="text-[11px] text-neutral-500 font-bold">
                Pivovarský systém Minipivovar Zajíc • Kynšperk nad Ohří
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
