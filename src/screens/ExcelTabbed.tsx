import { useState, useEffect } from 'react';
import ExportExcelScreen from './ExportExcelScreen';
import ImportExcelScreen from './ImportExcelScreen';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

interface ExcelTabbedProps {
  initialTab?: 'export_excel' | 'import_excel';
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: 'export_excel' | 'import_excel' })[] = [
  { id: 'export_excel', label: 'Export', icon: FileSpreadsheet, color: '#40c057' },
  { id: 'import_excel', label: 'Import', icon: Upload, color: '#4dabf7' },
];

export default function ExcelTabbed({ initialTab = 'export_excel', setPage }: ExcelTabbedProps) {
  const [activeTab, setActiveTab] = useState<'export_excel' | 'import_excel'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: 'export_excel' | 'import_excel') {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as 'export_excel' | 'import_excel')} />

      <div className="transition-all duration-200">
        {activeTab === 'export_excel' && <ExportExcelScreen />}
        {activeTab === 'import_excel' && <ImportExcelScreen />}
      </div>
    </div>
  );
}
