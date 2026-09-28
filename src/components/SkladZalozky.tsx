// 📦 Záložky Skladu — Stav · Pohyby · Inventura · Sklo a etikety.
// ---------------------------------------------------------------------------
// Zadání 28. 9. 2026: „ať je tam klidně míň funkcí, ale víc funkčních" —
// Sklad, Pohyby a Inventura byly tři samostatné dlaždice na tutéž věc.
// Teď se k nim jde z jedné dlaždice Sklad a přepíná se nahoře záložkami.
// Každá záložka je dál vlastní stránka (Page), takže tlačítko Zpět vrací
// předchozí záložku a staré dlaždice/odkazy fungují jako dřív.
import { BarChart3, ClipboardCheck, ListOrdered, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/config';
import { canUserView, getUserPermissions, PAGE_TO_MODULE } from '../lib/permissions';
import type { Page } from './Layout';

export type SkladZalozka = 'dashboard' | 'stock_pohyby' | 'inventory' | 'sklo_promo';

const ZALOZKY: { id: SkladZalozka; label: string; Ikona: typeof BarChart3 }[] = [
  { id: 'dashboard', label: 'Stav skladu', Ikona: BarChart3 },
  { id: 'stock_pohyby', label: 'Pohyby', Ikona: ListOrdered },
  { id: 'inventory', label: 'Inventura', Ikona: ClipboardCheck },
  { id: 'sklo_promo', label: 'Sklo, Etikety, Podtáčky', Ikona: Sparkles },
];

export function SkladZalozky({ aktivni, setPage }: { aktivni: SkladZalozka; setPage?: (p: Page) => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const prava = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);
  const smi = (id: SkladZalozka) => {
    if (isAdmin) return true;
    const modul = PAGE_TO_MODULE[id];
    return !modul || canUserView(profile?.role, user?.id, modul, prava);
  };

  return (
    <div className="sticky top-0 z-20 bg-neutral-100 pt-1 pb-2 mb-4 flex items-center gap-2 overflow-x-auto scrollbar-thin -mx-1 px-1">
      {ZALOZKY.filter((z) => z.id === aktivni || smi(z.id)).map(({ id, label, Ikona }) => (
        <button
          key={id}
          type="button"
          onClick={() => setPage?.(id)}
          aria-pressed={aktivni === id}
          className={`btn-zalozka ${aktivni === id ? 'btn-zalozka-aktivni' : ''}`}
        >
          <Ikona size={16} />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      ))}
    </div>
  );
}
