import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, MessageCircle, Scale, ShieldCheck, History as HistoryIcon, Stethoscope, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isAdminEmail } from '../lib/config';
import { Beer, Package, supabase } from '../lib/supabase';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import HloubkovyAuditPanel from '../components/HloubkovyAuditPanel';
import { businessDateISO } from '../lib/businessDate';

const OrderAuditModal = lazy(() => import('../components/OrderAuditModal').then((m) => ({ default: m.OrderAuditModal })));
const WhatsAppAuditModal = lazy(() => import('../components/WhatsAppAuditModal').then((m) => ({ default: m.WhatsAppAuditModal })));
const AdminDiagnostika = lazy(() => import('../components/AdminDiagnostika'));
const AuditLogViewer = lazy(() => import('../components/AuditLogViewer').then((m) => ({ default: m.AuditLogViewer })));

/**
 * Dlaždice „Audit" — všechny audity a kontroly na jednom místě.
 *
 * Nic se tu nepočítá nově: každá karta jen otevírá kontrolu, která žije
 * i na svém původním místě (Inventura, Objednávky, Nastavení, Uživatelé),
 * aby staré cesty dál fungovaly. Inventura vs. Sklad je pevně svázaná se
 * stavem obrazovky Inventura, proto se na ni jen přechází.
 */
export default function AuditScreen({ setPage }: { setPage?: (p: any, sec?: string, sub?: string) => void } = {}) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const [otevreno, setOtevreno] = useState<'objednavky' | 'whatsapp' | null>(null);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);

  useEffect(() => {
    if (otevreno !== 'objednavky' || beers.length) return;
    void Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]).then(([b, p]) => {
      setBeers((b.data ?? []) as Beer[]);
      setPackages((p.data ?? []) as Package[]);
    });
  }, [otevreno, beers.length]);

  const tydenOd = weekRange(isoWeekKey(businessDateISO())).start.toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-emerald-600" aria-hidden />
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Audit</h1>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Všechny kontroly dat na jednom místě. Začni hloubkovým auditem — ukáže, co nesedí, a odkáže na podrobnou kontrolu.
      </p>

      <Karta ikona={ShieldCheck} nazev="Hloubkový audit" popis="Sklad, objednávky, závozy, odpočty i správnost načtení WhatsApp objednávek za zvolené období.">
        <HloubkovyAuditPanel />
      </Karta>

      <div className="grid gap-3 sm:grid-cols-3">
        <Karta ikona={ClipboardList} nazev="Audit objednávek" popis="Zdvojené položky a objednávky, nezpracované zprávy, nesoulad s WhatsAppem.">
          <button type="button" className="btn-primary w-full min-h-[44px]" onClick={() => setOtevreno('objednavky')}>
            Otevřít
          </button>
        </Karta>
        <Karta ikona={MessageCircle} nazev="Příjem WhatsAppu" popis="Které zprávy dorazily, co se z nich načetlo a co zůstalo viset.">
          <button type="button" className="btn-primary w-full min-h-[44px]" onClick={() => setOtevreno('whatsapp')}>
            Otevřít
          </button>
        </Karta>
        <Karta ikona={Scale} nazev="Inventura vs. Sklad" popis="Porovnání napočítané inventury s evidovaným stavem skladu.">
          <button type="button" className="btn-primary w-full min-h-[44px]" onClick={() => setPage?.('inventory', undefined, 'audit')}>
            Přejít do Inventury
          </button>
        </Karta>
      </div>

      {isAdmin && (
        <Suspense fallback={<p className="text-sm text-neutral-500 dark:text-neutral-400">Načítám…</p>}>
          <Karta ikona={Stethoscope} nazev="Diagnostika" popis="Stav databáze, migrací, záloh a napojených služeb (jen admin).">
            <AdminDiagnostika />
          </Karta>
          <Karta ikona={HistoryIcon} nazev="Historie změn" popis="Kdo co kdy změnil (jen admin).">
            <AuditLogViewer />
          </Karta>
        </Suspense>
      )}

      <Suspense fallback={null}>
        {otevreno === 'objednavky' && (
          <OrderAuditModal
            isOpen
            onClose={() => setOtevreno(null)}
            beers={beers}
            packages={packages}
            selectedWeekKey={tydenOd}
            onOpenOrder={() => setPage?.('orders')}
            onProcessWhatsApp={() => setPage?.('orders')}
          />
        )}
        {otevreno === 'whatsapp' && (
          <WhatsAppAuditModal isOpen onClose={() => setOtevreno(null)} onOpenMessage={() => setPage?.('orders')} />
        )}
      </Suspense>
    </div>
  );
}

function Karta({ ikona: Ikona, nazev, popis, children }: { ikona: LucideIcon; nazev: string; popis: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Ikona className="w-5 h-5 mt-0.5 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden />
        <div>
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">{nazev}</h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">{popis}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
