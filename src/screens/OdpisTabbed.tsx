import { useState, useEffect } from 'react';
import ProdejnaScreen from './ProdejnaScreen';
import SkloPromoScreen from './SkloPromoScreen';
import { TrendingDown, Sparkles } from 'lucide-react';

interface OdpisTabbedProps {
  initialTab?: 'odpis' | 'sklo_promo';
  setPage?: (p: any, sec?: string) => void;
}

export default function OdpisTabbed({ initialTab = 'odpis', setPage }: OdpisTabbedProps) {
  const [activeTab, setActiveTab] = useState<'odpis' | 'sklo_promo'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('odpis')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'odpis'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <TrendingDown size={16} />
          <span>Odpis</span>
        </button>

        <button
          onClick={() => setActiveTab('sklo_promo')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sklo_promo'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Sparkles size={16} />
          <span>Sklo, Etikety, Podtáčky</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'odpis' && <ProdejnaScreen setPage={setPage} table="writeoffs" title="Odpis" icon="📉" />}
        {activeTab === 'sklo_promo' && <SkloPromoScreen setPage={setPage} />}
      </div>
    </div>
  );
}
