import { useState, useEffect } from 'react';
import SanitationLogScreen from './SanitationLogScreen';
import HaccpScreen from './HaccpScreen';
import { ChecklistsScreen } from './BreweryScreens';
import BottleSanitationDiary from '../components/BottleSanitationDiary';
import KegSanitationDiary from '../components/KegSanitationDiary';
import TapSanitationDiary from '../components/TapSanitationDiary';
import { FlaskConical, Shield, CheckSquare, SlidersHorizontal, FileSpreadsheet } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';
import { IkonaSud, IkonaLahev } from '../components/ikony';
import { fetchAllRows } from '../lib/supabase';
import { DENIKY, stahniSanitace } from '../lib/exportSanitaci';
import { oznam } from '../lib/toast';
import { businessDateISO } from '../lib/businessDate';

/** 🧼 Export všech sanitačních deníků za období — pro hygienickou kontrolu. */
function ExportSanitaci() {
  const dnes = businessDateISO();
  const [od, setOd] = useState(() => `${dnes.slice(0, 4)}-01-01`);
  const [doKdy, setDoKdy] = useState(dnes);
  const [bezi, setBezi] = useState(false);

  async function stahni() {
    if (od > doKdy) { oznam('Datum „od" je později než „do".'); return; }
    setBezi(true);
    try {
      const vysledky = await Promise.all(DENIKY.map((d) =>
        fetchAllRows(d.tabulka, '*').gte('sanitation_date', od).lte('sanitation_date', doKdy)));
      const chyba = vysledky.find((v) => v.error)?.error;
      if (chyba) { oznam(`Deníky se nepodařilo načíst: ${chyba.message}`); return; }
      const data = Object.fromEntries(DENIKY.map((d, i) => [d.tabulka, (vysledky[i].data ?? []) as Record<string, unknown>[]]));
      const ok = await stahniSanitace(data, od, doKdy);
      if (!ok) oznam('V tomhle období není v žádném deníku ani jeden záznam.');
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="card p-3 flex flex-wrap items-end gap-2">
      <label className="text-xs font-bold text-neutral-700">
        Od
        <input type="date" className="input block mt-1" value={od} onChange={(e) => setOd(e.target.value)} />
      </label>
      <label className="text-xs font-bold text-neutral-700">
        Do
        <input type="date" className="input block mt-1" value={doKdy} onChange={(e) => setDoKdy(e.target.value)} />
      </label>
      <button type="button" className="btn-emerald" onClick={() => void stahni()} disabled={bezi}>
        <FileSpreadsheet className="ikona-text" /> {bezi ? 'Připravuji…' : 'Stáhnout deníky do Excelu'}
      </button>
      <span className="text-xs text-neutral-500 basis-full">
        Všechny čtyři deníky (tanky, lahve, KEGy, výčepy) v jednom sešitu — pro hygienickou kontrolu.
      </span>
    </div>
  );
}

type SanitaceTab = 'tanks' | 'lahve' | 'kegy' | 'vycepy' | 'haccp' | 'checklists';

const TABS: (TabBarItem & { id: SanitaceTab })[] = [
  { id: 'tanks', label: 'Deník tanků & zařízení', icon: FlaskConical, color: '#4dabf7' },
  { id: 'lahve', label: 'Deník lahví (stáčení)', icon: IkonaLahev, color: '#f5487f' },
  { id: 'kegy', label: 'Deník KEGů (stáčení)', icon: IkonaSud, color: '#ffa94d' },
  { id: 'vycepy', label: 'Deník výčepů', icon: SlidersHorizontal, color: '#7c5cff' },
  { id: 'haccp', label: 'Sanitační postupy & Řád', icon: Shield, color: '#2f9e64' },
  { id: 'checklists', label: 'Check-listy & Návody', icon: CheckSquare, color: '#d4a017' },
];

interface SanitaceTabbedProps {
  initialTab?: 'sanitation_log' | 'haccp' | 'checklists' | 'tanks' | 'lahve' | 'kegy' | 'vycepy';
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}

// Mapování interní záložky → Page (viz App.tsx) — jen ty, co mají vlastní
// routovanou stránku (tanks/haccp/checklists mají historicky jiný Page
// název: 'sanitation_log', ostatní shodné s názvem záložky s prefixem).
const TAB_TO_PAGE: Record<SanitaceTab, string> = {
  tanks: 'sanitation_log',
  haccp: 'haccp',
  checklists: 'checklists',
  lahve: 'sanitace_lahve',
  kegy: 'sanitace_kegy',
  vycepy: 'sanitace_vycepy',
};

export default function SanitaceTabbed({ initialTab = 'sanitation_log', setPage, pageSubTab }: SanitaceTabbedProps) {
  const [activeTab, setActiveTab] = useState<SanitaceTab>(
    initialTab === 'sanitation_log' ? 'tanks' : initialTab as any
  );

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab === 'sanitation_log' ? 'tanks' : initialTab as any);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: SanitaceTab) {
    if (setPage) setPage(TAB_TO_PAGE[tab]);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as SanitaceTab)} />

      {activeTab !== 'haccp' && activeTab !== 'checklists' && <ExportSanitaci />}

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'tanks' && <SanitationLogScreen setPage={setPage} />}
        {activeTab === 'lahve' && <BottleSanitationDiary />}
        {activeTab === 'kegy' && <KegSanitationDiary />}
        {activeTab === 'vycepy' && <TapSanitationDiary />}
        {activeTab === 'haccp' && <HaccpScreen setPage={setPage} initialSubTab={pageSubTab} />}
        {activeTab === 'checklists' && <ChecklistsScreen />}
      </div>
    </div>
  );
}
