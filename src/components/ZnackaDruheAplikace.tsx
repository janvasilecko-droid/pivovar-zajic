import { useAuth } from '../lib/auth';

// Štítek „Zajíc 2“ — ať je na první pohled vidět, že jsi v druhé aplikaci
// (zkušební přihlášení), a pod jakým účtem. Nepřekáží klepnutím.
export function ZnackaDruheAplikace() {
  const { user, profile } = useAuth();
  const role = profile?.role === 'admin' ? 'admin' : 'běžný uživatel';
  return (
    <div
      role="note"
      className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 z-nadmodal px-3 py-0.5 rounded-b-lg bg-rose-700 text-white text-udaj font-black shadow-md"
    >
      Zajíc 2 · {user?.email ?? ''} · {role}
    </div>
  );
}
