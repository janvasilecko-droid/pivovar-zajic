import { useEffect, useState, useRef } from 'react';
import { Search, ArrowRight, CornerDownLeft, Sparkles, Building, Beer as BeerIcon, MapPin, Calendar, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Page } from './Layout';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPage: (page: Page) => void;
}

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  category: 'Sekce v aplikaci' | 'Odběratel / Hospoda' | 'Druh piva';
  icon: any;
  action: () => void;
};

export function QuickSearchModal({ isOpen, onClose, onSelectPage }: QuickSearchModalProps) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [beers, setBeers] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      loadSearchData();
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  async function loadSearchData() {
    try {
      const [{ data: pData }, { data: bData }] = await Promise.all([
        supabase.from('places').select('id, name, city').order('name'),
        supabase.from('beers').select('id, name, category').order('name'),
      ]);
      setPlaces(pData || []);
      setBeers(bData || []);
    } catch {
      // ignore
    }
  }

  // Predefined System Pages
  const pagesList: { id: Page; title: string; subtitle: string; icon: any }[] = [
    { id: 'dashboard', title: 'Sklad a Přehled zásoby', subtitle: 'Stav piv v KEG sudech a lahvích', icon: Building },
    { id: 'kegging_entry', title: 'KEG Stáčení (Zápis)', subtitle: 'Záznam stočeného piva z tanků do sudů', icon: FileText },
    { id: 'kegging_overview', title: 'KEG Přehled stočených šarží', subtitle: 'Historie stočených KEG sudů podle šarží', icon: FileText },
    { id: 'bottling_entry', title: 'Lahve Stáčení (Zápis)', subtitle: 'Stáčení lahví 0.33L - 1.5L', icon: FileText },
    { id: 'bottling_overview', title: 'Lahve Přehled', subtitle: 'Přehled stočených lahvových šarží', icon: FileText },
    { id: 'orders_entry', title: 'Zadávání Objednávek', icon: FileText, subtitle: 'Příjem objednávek hospod a prodejen' },
    { id: 'orders', title: 'Přehled Objednávek a Týdnů', icon: Calendar, subtitle: 'Souhrn týdenních objednávek pivovaru' },
    { id: 'zavoz', title: 'Závoz a Trasy řidičů', icon: MapPin, subtitle: 'Plánování závozu a rozvozu piva' },
    { id: 'prodejna', title: 'Prodejna pivovaru', icon: Building, subtitle: 'Zápis prodeje na prodejně' },
    { id: 'sklo_promo', title: 'Sklo, Podtácky, Etikety a Lahve', icon: Sparkles, subtitle: 'Evidence pivního skla a obalů' },
    { id: 'vycepy', title: 'Výčepy a Rezervace', icon: Sparkles, subtitle: 'Sanitace výčepů a rezervace zařízení' },
    { id: 'exkurze', title: 'Exkurze pivovaru', icon: Building, subtitle: 'Rezervace prohlídek pivovaru' },
    { id: 'kniha_jizd', title: 'Kniha jízd vozidel', icon: MapPin, subtitle: 'Daňová evidence služebních cest' },
    { id: 'varni_listy', title: 'Varní listy', icon: FileText, subtitle: 'Receptury a zápis vaření šarží' },
  ];

  const filteredPages: SearchItem[] = pagesList
    .filter(
      (p) =>
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        p.subtitle.toLowerCase().includes(query.toLowerCase())
    )
    .map((p) => ({
      id: `page-${p.id}`,
      title: p.title,
      subtitle: p.subtitle,
      category: 'Sekce v aplikaci',
      icon: p.icon,
      action: () => {
        onSelectPage(p.id);
        onClose();
      },
    }));

  const filteredPlaces: SearchItem[] = places
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.city && p.city.toLowerCase().includes(query.toLowerCase()))
    )
    .map((p) => ({
      id: `place-${p.id}`,
      title: p.name,
      subtitle: p.city ? `Město: ${p.city}` : 'Odběratel / Hospoda',
      category: 'Odběratel / Hospoda',
      icon: MapPin,
      action: () => {
        onSelectPage('places');
        onClose();
      },
    }));

  const filteredBeers: SearchItem[] = beers
    .filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    .map((b) => ({
      id: `beer-${b.id}`,
      title: b.name,
      subtitle: b.category ? `Kategorie: ${b.category}` : 'Pivo pivovaru Zajíc',
      category: 'Druh piva',
      icon: BeerIcon,
      action: () => {
        onSelectPage('beers');
        onClose();
      },
    }));

  const allItems: SearchItem[] = [...filteredPages, ...filteredPlaces, ...filteredBeers];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-[9999] flex items-start justify-center pt-16 sm:pt-24 p-4 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-amber-200 overflow-hidden flex flex-col max-h-[80vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Input Header */}
        <div className="p-4 border-b border-amber-100 flex items-center gap-3 bg-amber-50/50">
          <Search size={22} className="text-amber-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rychlé hledání sekce, hospody, piva... (např. 'Závoz', '11°', 'Kynšperk')"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-base font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden"
          />
          <kbd className="hidden sm:inline-block px-2 py-1 text-[10px] font-mono font-black text-amber-900 bg-amber-200/80 rounded-lg border border-amber-300 shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 font-bold text-sm">
              Žádné výsledky pro &quot;{query}&quot;
            </div>
          ) : (
            allItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full text-left p-3 rounded-2xl flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-neutral-950 shadow-md ring-1 ring-amber-400 scale-[1.01]'
                      : 'hover:bg-amber-50 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-amber-600 text-neutral-950' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="font-display font-black text-sm">{item.title}</div>
                      <div
                        className={`text-xs ${
                          isSelected ? 'text-neutral-900 font-bold' : 'text-neutral-500 font-medium'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                        isSelected
                          ? 'bg-amber-600 text-neutral-950 border-amber-700'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                      }`}
                    >
                      {item.category}
                    </span>
                    <ArrowRight size={16} className={isSelected ? 'text-neutral-950' : 'text-neutral-400'} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer Keyboard Guide */}
        <div className="p-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500 font-bold px-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-xs text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-xs text-[10px]">↓</kbd>{' '}
              Navigace
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-xs text-[10px]">↵</kbd>{' '}
              Otevřít
            </span>
          </div>
          <span className="text-[11px] text-amber-700 font-extrabold">Pivovar Zajíc QuickSearch</span>
        </div>
      </div>
    </div>
  );
}
