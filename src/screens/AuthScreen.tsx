import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { AlertTriangle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getAdminEmail } from '../lib/config';
import { chybaZNavratu, GOOGLE_PRIHLASENI_ZAPNUTO, prihlasitPresGoogle } from '../lib/googlePrihlaseni';
import { NENI_OVERENY, odkazOdeslanNa, poslatOdkazProHeslo } from '../lib/odkazEmailem';
import { JE_DRUHA_APLIKACE } from '../lib/profilAplikace';

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // „Zapomněl(a) jsem heslo / první přihlášení“: místo hesla pošleme odkaz do e-mailu.
  const [zapomenute, setZapomenute] = useState<null | 'zapomenute' | 'novy'>(null);
  const [odeslano, setOdeslano] = useState<string | null>(null);

  // Návrat z Google s chybou (třeba neschválený e-mail) — řekneme proč.
  useEffect(() => {
    const e = chybaZNavratu(window.location);
    if (e) setErr(e);
  }, []);

  const googleKlik = async () => {
    setErr(null);
    setBusy(true);
    const res = await prihlasitPresGoogle();
    // Při úspěchu stránka odchází na Google; busy se vrací jen při chybě.
    if (res.error) { setErr(res.error); setBusy(false); }
  };

  const poslatOdkaz = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    setOdeslano(null);
    const res = await poslatOdkazProHeslo(email);
    setBusy(false);
    if (res.stav === 'odeslano') setOdeslano(res.email);
    else if (res.stav === 'neschvaleny') setErr(NENI_OVERENY);
    else setErr(res.zprava);
  };

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
            
            {/* Logo. Soubor má bílé pozadí napečené v obrázku (průhledný kanál
                sice má, ale nevyužitý), takže na tmavém podkladu vždycky
                vznikne bílý obdélník. Místo boje s tím je z něj udělaný
                záměrný bílý štítek se zaoblením — vypadá stejně v obou
                režimech. Poměr stran 546×280 se drží; dřív se obrázek cpal
                do čtverce, takže kolem něj zbývalo prázdné místo. */}
            <div className="flex flex-col items-center mb-6 text-center">
              {/* bg-[#fff], ne bg-white: `white` je od zavedení proměnných
                  barva povrchu a v tmavém režimu ztmavne — tady je ale
                  potřeba doopravdy bílá, aby na ni bílé pozadí loga sedlo. */}
              {/* Bílá podložka zmizela s ní: logo je teď vektor s průhledným
                  pozadím (public/logo-zajic.svg z firemního PDF), takže sedí
                  přímo na krémový podklad a nemá kolem sebe rámeček. */}
              <img
                src="/logo-zajic.svg"
                alt="Kynšperský pivovar"
                className="mb-4 h-24 sm:h-28 w-auto object-contain"
              />

              {JE_DRUHA_APLIKACE && (
                <div role="note" className="mb-2 px-3 py-1 rounded-full bg-rose-700 text-white text-udaj font-black">
                  Zajíc 2 — druhá aplikace, přihlášení zvlášť
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-amber-950 flex items-center gap-2">
                Pivovar Zajíc
              </h1>
              <p className="text-xs font-black text-amber-700 mt-1 uppercase tracking-widest flex items-center gap-1.5 justify-center">
                <ShieldCheck size={14} className="text-amber-600" />
                <span>Kynšperk nad Ohří — Výrobní systém</span>
              </p>
            </div>

            {zapomenute ? (
              <form onSubmit={poslatOdkaz} className="space-y-5">
                <h2 className="text-lg font-display font-black text-amber-950">
                  {zapomenute === 'novy' ? 'Nový uživatel' : 'Zapomněl(a) jsem heslo'}
                </h2>
                <p className="text-sm font-bold text-neutral-700 leading-relaxed">
                  {zapomenute === 'novy'
                    ? 'Napiš e-mail, který ti správce schválil. Pošleme na něj odkaz — po klepnutí se ti rovnou otevře aplikace a nastavíš si své heslo.'
                    : 'Napiš svůj e-mail. Ověříme, že je schválený, a pošleme na něj odkaz — po klepnutí se ti otevře aplikace a nastavíš si nové heslo.'}
                </p>
                <div>
                  <label className="block text-xs font-black text-amber-900 uppercase tracking-wider mb-2">Přihlašovací e-mail</label>
                  <input
                    className="w-full px-4 py-3.5 text-sm font-bold text-neutral-900 bg-amber-50/50 border-2 border-amber-200 rounded-2xl focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 transition-all placeholder:text-neutral-400 shadow-2xs"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setOdeslano(null); setErr(null); }}
                    placeholder={getAdminEmail()}
                    autoComplete="username"
                  />
                </div>
                {err && (
                  <div className="text-xs font-bold text-rose-950 bg-rose-50 border border-rose-300 rounded-2xl px-4 py-3 flex items-start gap-2.5 animate-shake">
                    <span className="text-base leading-none"><AlertTriangle className="ikona-text" /></span>
                    <span>{err}</span>
                  </div>
                )}
                {odeslano && (
                  <div className="text-xs font-bold text-emerald-950 bg-emerald-50 border border-emerald-300 rounded-2xl px-4 py-3" role="status">{odkazOdeslanNa(odeslano)}</div>
                )}
                <button type="submit" className="btn-primary !rounded-2xl w-full !py-3.5 text-sm font-black" disabled={busy}>
                  {busy ? 'Posílám…' : odeslano ? 'Poslat znovu' : 'Poslat odkaz do e-mailu'}
                </button>
                <button type="button" className="btn-ghost !rounded-2xl w-full !py-3 text-sm font-black" onClick={() => { setZapomenute(null); setErr(null); setOdeslano(null); }}>
                  Zpět na přihlášení
                </button>
              </form>
            ) : (
              <>
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
                    className="absolute right-3.5 text-neutral-400 hover:text-amber-700 transition-colors p-1 rounded-lg tap"
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
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button type="button" className="btn-ghost !rounded-2xl !py-3 text-sm font-black" onClick={() => { setZapomenute('zapomenute'); setErr(null); }}>
                    Zapomněl(a) jsem heslo
                  </button>
                  <button type="button" className="btn-ghost !rounded-2xl !py-3 text-sm font-black" onClick={() => { setZapomenute('novy'); setErr(null); }}>
                    Nový uživatel
                  </button>
                </div>

            {GOOGLE_PRIHLASENI_ZAPNUTO && (
              <>
            <div className="mt-4 flex items-center gap-3 text-udaj font-bold text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" /> nebo <span className="h-px flex-1 bg-neutral-200" />
            </div>
            <button
              type="button"
              onClick={googleKlik}
              disabled={busy}
              className="btn-ghost !rounded-2xl w-full !py-3.5 mt-3 text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              <span>Přihlásit přes Google</span>
            </button>
            <p className="mt-2 text-udaj text-neutral-500 font-medium text-center">Funguje jen s e-mailem, který správce schválil.</p>
              </>
            )}
              </>
            )}


            <div className="mt-6 pt-5 border-t border-amber-100 text-center">
              <p className="text-udaj text-neutral-500 font-bold">
                Pivovarský systém Minipivovar Zajíc • Kynšperk nad Ohří
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
