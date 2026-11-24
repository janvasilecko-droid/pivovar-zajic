// 🍺 AI sládek jako samostatná aplikace (R39) — adresa /sladek/.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026 (zadání RAG chatbota): „udělej toho chatbota zvlášť ve vlastní aplikaci
// a pak ho budeme implementovat do pivovarské aplikace, využij vlastnosti a data z pivovarské
// bible“. Tohle je ta samostatná aplikace: celoobrazovkový chat s vlastní ikonou a přihlášením
// (vlastní klíč úložiště, lib/profilAplikace.ts), bez zbytku aplikace pivovaru.
//
// Nic se tu nepíše znovu: chat, hledání v knihách i čtečka stránek jsou stejné komponenty jako
// v Pivovarské bibli v hlavní aplikaci (components/bible/BibleAiSladek.tsx), data jsou táž
// (knihovna, várky, profil pivovaru, zkušenosti), stejné jsou funkce bible-chat a bible-api
// a stejné je i omezení přístupu (lib/bibleOpravneni.ts — bez povolení se nic neukáže).
// Správa knihovny, nahrávání knih a ostatní části bible zůstávají v hlavní aplikaci.
import { Suspense, useEffect, useState } from 'react';
import { ArrowLeft, Bot, Home, Lock, LogOut } from 'lucide-react';
import AuthScreen from './AuthScreen';
import { Spinner } from '../components/ui';
import { BibleAiSladek } from '../components/bible/BibleAiSladek';
import { useAuth } from '../lib/auth';
import { bibleRole } from '../lib/bibleOpravneni';
import { lazyStranka } from '../lib/lazyStranka';

// Čtečka knihy má vlastní líný kus — chat se otevře hned.
const BibleKniha = lazyStranka(() => import('../components/bible/BibleKniha'));

export default function SladekApp() {
  const { session, user, profile, loading, signOut } = useAuth();
  const role = bibleRole(profile?.role, (profile as { permissions?: unknown } | null)?.permissions);
  // Otevřená stránka knihy z citace v odpovědi. Chat zůstává pod ní načtený (jen skrytý),
  // takže se po návratu pokračuje v rozepsané konverzaci.
  const [kniha, setKniha] = useState<{ id: string; list: number } | null>(null);

  // Tlačítko Zpět (telefon, prohlížeč) zavře čtečku a vrátí na chat — nevyskočí z aplikace.
  useEffect(() => {
    const zavri = () => setKniha(null);
    window.addEventListener('popstate', zavri);
    return () => window.removeEventListener('popstate', zavri);
  }, []);

  function otevriKnihu(id: string, list: number) {
    window.history.pushState({ sladekKniha: true }, '');
    setKniha({ id, list });
  }

  function zavriKnihu() {
    if (window.history.state?.sladekKniha) window.history.back();
    else setKniha(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-950 text-neutral-100">
        <div className="flex flex-col items-center gap-3">
          <Bot size={40} className="text-amber-400" aria-hidden="true" />
          <div className="text-lg font-black">AI sládek</div>
          <Spinner />
        </div>
      </div>
    );
  }
  if (!session) return <AuthScreen />;

  return (
    <div className="bible-plocha min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3 pb-2"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        {kniha ? (
          <button type="button" className="btn-tmave w-11 px-0" aria-label="Zpět na chat" onClick={zavriKnihu}>
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-neutral-950" aria-hidden="true">
            <Bot size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">Pivovar Zajíc</div>
          <h1 className="truncate text-lg font-black text-neutral-50">{kniha ? 'Čtení knihy' : 'AI sládek'}</h1>
        </div>
        <a className="btn-tmave w-11 px-0" href="/" aria-label="Otevřít aplikaci Pivovar Zajíc" title="Aplikace Pivovar Zajíc">
          <Home size={20} />
        </a>
        <button
          type="button"
          className="btn-tmave w-11 px-0"
          aria-label={`Odhlásit${user?.email ? ` (${user.email})` : ''}`}
          title={user?.email ?? 'Odhlásit'}
          onClick={() => { void signOut(); }}
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-3 sm:p-5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
        {role === null ? (
          <div role="alert" className="space-y-2 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-neutral-100">
            <div className="flex items-center gap-2 font-black"><Lock size={18} className="text-amber-400" /> K AI sládkovi nemáš přístup.</div>
            <p className="text-sm text-neutral-300">
              Odpovědi vycházejí z knih, které jsou soukromé a chráněné autorským právem. Přístup povoluje admin v aplikaci Pivovar Zajíc:
              Uživatelé → Práva → „Pivovarská bible“.
            </p>
          </div>
        ) : (
          <>
            <div hidden={kniha !== null}>
              <BibleAiSladek otevri={otevriKnihu} role={role} />
            </div>
            {kniha && (
              <Suspense fallback={<div className="text-sm text-neutral-300">Načítám čtečku…</div>}>
                <BibleKniha key={`${kniha.id}:${kniha.list}`} id={kniha.id} pocatecniList={kniha.list} />
              </Suspense>
            )}
          </>
        )}
      </main>
    </div>
  );
}
