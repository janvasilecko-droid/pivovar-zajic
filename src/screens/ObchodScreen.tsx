// 🏪 Obchod — všechno kolem prodejny pod jednou dlaždicí.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: „přidej dlaždici obchod — vyjíždí se tam uzávěrky, ať
// to appka přečte z fotky a odečítá to ze skladu; volba zadat uzávěrku denní,
// týdenní, měsíční; inventura na konci měsíce, statistiky prodeje, fasování
// piv, hlídání skladových zásob" a „prodejna fasuje piva ze skladu pivovaru
// do vlastního skladu, kde nejsou jen piva, a z vlastního skladu prodává."
//
//   Sklad       co je v obchodě, co dochází (hlídání zásob), příjem zboží
//   Uzávěrky    uzávěrka z pokladny z fotky (denní / týdenní / měsíční)
//   Fasování    fasování do obchodu ze skladu pivovaru (už existující formulář)
//   Inventura   napočítaný stav, na konci měsíce
//   Statistika  tržba a prodej po pivech
//
// Počítání je v lib/obchod*.ts; stav skladu obchodu se nikde neukládá.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardCheck, PackageCheck, Receipt, Warehouse } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';
import { EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { businessDateISO } from '../lib/businessDate';
import { useObchod } from '../lib/obchodData';
import { spoctiUpozorneni } from '../lib/obchodUpozorneni';
import ProdejnaScreen from './ProdejnaScreen';
import { ObchodPrehled } from '../components/obchod/ObchodPrehled';
import { ObchodUzaverky } from '../components/obchod/ObchodUzaverky';
import { ObchodInventura } from '../components/obchod/ObchodInventura';
import { ObchodStatistika } from '../components/obchod/ObchodStatistika';

export type ObchodTab = 'prehled' | 'uzaverky' | 'fasovani' | 'inventura' | 'statistika';

const TABY: ObchodTab[] = ['prehled', 'uzaverky', 'fasovani', 'inventura', 'statistika'];
export const jeObchodTab = (t: string | undefined): t is ObchodTab => !!t && (TABY as string[]).includes(t);

export default function ObchodScreen({ setPage, pageSubTab }: {
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}) {
  const { profile, user } = useAuth();
  const zapsal = profile?.display_name ?? user?.email ?? null;
  const data = useObchod();
  const [tab, setTab] = useState<ObchodTab>(jeObchodTab(pageSubTab) ? pageSubTab : 'prehled');

  useEffect(() => {
    if (jeObchodTab(pageSubTab)) setTab(pageSubTab);
  }, [pageSubTab]);

  function vyber(t: ObchodTab) {
    setTab(t);
    // Do historie stránek, ať Zpět vrátí předchozí záložku (jako u ostatních záložkových obrazovek).
    setPage?.('obchod', undefined, t);
  }

  const dnes = businessDateISO();
  const upozorneni = useMemo(() => (data.chyba ? null : spoctiUpozorneni(data.vstup, data.zavreno, dnes)), [data.chyba, data.vstup, data.zavreno, dnes]);
  const pocetUpozorneni = upozorneni ? upozorneni.zasoby + upozorneni.fasovaniBezZbozi + upozorneni.mezery : 0;
  const chybiInventura = upozorneni?.inventura ?? false;

  const taby: (TabBarItem & { id: ObchodTab })[] = [
    { id: 'prehled', label: 'Sklad', icon: Warehouse, color: '#e8590c', badge: pocetUpozorneni > 0 ? pocetUpozorneni : undefined },
    { id: 'uzaverky', label: 'Uzávěrky', icon: Receipt, color: '#1c7ed6' },
    { id: 'fasovani', label: 'Fasování', icon: PackageCheck, color: '#0ca678' },
    { id: 'inventura', label: 'Inventura', icon: ClipboardCheck, color: '#7048e8', badge: chybiInventura ? '!' : undefined },
    { id: 'statistika', label: 'Statistika', icon: BarChart3, color: '#d6336c' },
  ];

  // Fasování používá jen existující tabulky — funguje i před migrací obchodu.
  const potrebujeTabulky = tab !== 'fasovani';

  return (
    <div className="space-y-4">
      <TabBar items={taby} activeId={tab} onSelect={(id) => vyber(id as ObchodTab)} />

      {potrebujeTabulky && data.chybiTabulky && (
        <div role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-2 text-amber-950">
          <div className="text-sm font-black">Obchod potřebuje nové tabulky v databázi.</div>
          <div className="text-xs font-semibold">
            Spusť migraci <strong>20261231270000_obchod</strong>: v appce Audit → Databázové migrace (tlačítko níže), pak tu stránku obnov.
            Fasování do obchodu funguje i bez ní.
          </div>
          {setPage && (
            <button type="button" className="btn-primary !rounded min-h-[48px]" onClick={() => setPage('audit')}>
              Otevřít Audit → Databázové migrace
            </button>
          )}
        </div>
      )}

      {potrebujeTabulky && !data.chybiTabulky && !data.chyba && !data.nacitam && data.chybiOdpisAZavreno && (
        <div role="note" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2 text-amber-950">
          <div className="text-sm font-black">Chybí druhá migrace obchodu.</div>
          <div className="text-xs font-semibold">
            Odpis zboží a označení „zavřeno" (u hlídání mezer v uzávěrkách) potřebují migraci <strong>20261231280000_obchod_odpis_zavreno</strong>.
            Zbytek Obchodu funguje i bez ní.
          </div>
          {setPage && (
            <button type="button" className="btn-primary !rounded min-h-[48px]" onClick={() => setPage('audit')}>
              Otevřít Audit → Databázové migrace
            </button>
          )}
        </div>
      )}

      {potrebujeTabulky && !data.chybiTabulky && data.chyba && (
        <EmptyState varianta="chyba" text={`Obchod se nepodařilo načíst: ${data.chyba}`} akce={{ popis: 'Zkusit znovu', onClick: data.znovu }} />
      )}

      {potrebujeTabulky && data.nacitam && !data.chyba && <Spinner />}

      {potrebujeTabulky && !data.nacitam && !data.chyba && (
        <>
          {tab === 'prehled' && <ObchodPrehled data={data} zapsal={zapsal} jdiNa={vyber} />}
          {tab === 'uzaverky' && <ObchodUzaverky data={data} zapsal={zapsal} />}
          {tab === 'inventura' && <ObchodInventura data={data} zapsal={zapsal} />}
          {tab === 'statistika' && <ObchodStatistika data={data} />}
        </>
      )}

      {tab === 'fasovani' && (
        <div className="space-y-3">
          <div role="note" className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-950">
            Fasování do obchodu odečte pivo ze skladu pivovaru a přidá ho do skladu obchodu. Zboží musí v obchodě existovat (vzniká z první uzávěrky nebo ve Skladu → Přidat zboží).
          </div>
          <ProdejnaScreen setPage={setPage} />
        </div>
      )}
    </div>
  );
}
