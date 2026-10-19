import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { jePrepnutyUcet, nactiUcty, prepniNaUcet } from '../lib/prepinaniUctu';
import { chyba } from '../lib/toast';

// Červený pruh nahoře, když je aplikace přepnutá na jiný účet než správcovský:
// ukáže, pod kým jsi, a jedním klepnutím vrátí zpět (i když ten účet nemá Nastavení).
export function ZpetNaSpravce() {
  const { user, profile } = useAuth();
  const [pracuji, setPracuji] = useState(false);
  if (!jePrepnutyUcet(user?.id)) return null;
  const stav = nactiUcty();
  const domaci = stav.domaci ? stav.ucty[stav.domaci] : null;
  if (!domaci || !stav.domaci) return null;
  const domaciId = stav.domaci;

  async function zpet() {
    setPracuji(true);
    const r = await prepniNaUcet(domaciId);
    if (r.error) { setPracuji(false); chyba(r.error); return; }
    window.location.reload();
  }

  return (
    <div role="note" className="fixed top-0 left-0 right-0 z-nadmodal flex items-center justify-center gap-2 bg-rose-700 text-white text-udaj font-black px-3 py-1 shadow-md">
      <span className="truncate">Účet: {user?.email} · {profile?.role === 'admin' ? 'admin' : 'běžný uživatel'}</span>
      <button type="button" className="underline underline-offset-2 font-black shrink-0" disabled={pracuji} onClick={zpet}>
        Zpět na správce ({domaci.email})
      </button>
    </div>
  );
}
