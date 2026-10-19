import { useState } from 'react';
import { RefreshCw, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { nactiUcty, odeberUcet, pridejUcet, prepniNaUcet } from '../lib/prepinaniUctu';
import { chyba, uspech } from '../lib/toast';

// Přepínání účtů v jedné aplikaci (jen správce) — viz lib/prepinaniUctu.ts.
export function PrepinacUctu() {
  const { user } = useAuth();
  const [stav, setStav] = useState(nactiUcty);
  const [pridavam, setPridavam] = useState(false);
  const [email, setEmail] = useState('');
  const [heslo, setHeslo] = useState('');
  const [pracuji, setPracuji] = useState(false);
  const obnov = () => setStav(nactiUcty());
  const ucty = Object.entries(stav.ucty);

  async function pridat(e: React.FormEvent) {
    e.preventDefault();
    setPracuji(true);
    const r = await pridejUcet(email, heslo);
    setPracuji(false);
    if (r.error) { chyba(r.error); return; }
    uspech(`Účet ${email.trim()} je v přepínači.`);
    setEmail(''); setHeslo(''); setPridavam(false); obnov();
  }

  async function prepnout(id: string) {
    setPracuji(true);
    const r = await prepniNaUcet(id);
    if (r.error) { setPracuji(false); chyba(r.error); obnov(); return; }
    window.location.reload();
  }

  return (
    <div className="card p-6">
      <h2 className="font-display font-bold text-lg flex items-center gap-2"><Users size={18} /> Přepínání účtů</h2>
      <p className="text-sm text-neutral-600 mt-2">
        Přidej si druhý účet (třeba běžného uživatele) a přepínej mezi účty jedním klepnutím, bez odhlašování. Heslo se neukládá, jen si aplikace pamatuje přihlášení v tomhle zařízení. Zpátky na správce se vrátíš červeným pruhem nahoře.
      </p>
      <ul className="mt-3 space-y-2">
        {ucty.map(([id, u]) => (
          <li key={id} className="flex items-center gap-2 rounded border border-neutral-200 bg-white p-2">
            <span className="min-w-0 flex-1 text-sm font-bold text-neutral-900 truncate">
              {u.email}
              {id === user?.id && <span className="ml-2 text-udaj font-black text-emerald-700">právě přihlášen</span>}
              {id === stav.domaci && <span className="ml-2 text-udaj font-black text-amber-800">správce</span>}
            </span>
            {id !== user?.id && (
              <button type="button" className="btn-primary !rounded text-xs font-black flex items-center gap-1" disabled={pracuji} onClick={() => prepnout(id)}>
                <RefreshCw size={12} /> Přepnout
              </button>
            )}
            {id !== user?.id && (
              <button type="button" className="btn-ghost !rounded text-xs" aria-label={`Odebrat ${u.email} z přepínače`} onClick={() => { odeberUcet(id); obnov(); }}>
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {pridavam ? (
        <form onSubmit={pridat} className="mt-3 space-y-2">
          <input className="input w-full text-sm font-bold" type="email" required placeholder="E-mail druhého účtu" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <input className="input w-full text-sm font-bold" type="password" required placeholder="Heslo druhého účtu" value={heslo} onChange={(e) => setHeslo(e.target.value)} autoComplete="new-password" />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary !rounded text-sm font-black" disabled={pracuji}>{pracuji ? 'Ověřuji…' : 'Přidat účet'}</button>
            <button type="button" className="btn-ghost !rounded text-sm font-black" onClick={() => setPridavam(false)}>Zrušit</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-ghost !rounded mt-3 text-sm font-black flex items-center gap-1.5" onClick={() => setPridavam(true)}>
          <UserPlus size={14} /> Přidat účet do přepínače
        </button>
      )}
    </div>
  );
}
