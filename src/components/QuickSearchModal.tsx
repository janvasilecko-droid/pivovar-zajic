// 🔎 Rychlé hledání — jedno pole na obrazovky, odběratele, piva i objednávky.
// ---------------------------------------------------------------------------
// Aplikace má přes čtyřicet míst, kam se dá jít (NAV + EXTRA_NAV v Layout.tsx).
// Hledat je očima v menu je pomalejší než napsat tři písmena.
//
// Dvě věci, na kterých to dřív drhlo:
//  • seznam obrazovek byl vypsaný ručně, takže nové obrazovky v hledání
//    chyběly — teď se bere přímo z NAV/EXTRA_NAV a zastarat nemůže,
//  • hledalo se přesně na znak, takže „kynsperk" nenašlo „Kynšperk" a
//    „11" nenašlo „11°". Teď se porovnává bez diakritiky.
import { useEffect, useState, useRef, useMemo } from 'react';
import { Search, ArrowRight, MapPin, Beer as BeerIcon, ClipboardList } from 'lucide-react';
import { fetchAllRows, supabase } from '../lib/supabase';
import { NAV, EXTRA_NAV, Page } from './Layout';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPage: (page: Page) => void;
}

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  icon: any;
  action: () => void;
};

/** Doplňující popis u obrazovek, kde samotný název nestačí. */
const POPISY: Partial<Record<Page, string>> = {
  dashboard: 'Stav piv v KEG sudech a lahvích',
  orders: 'Zadávání a přehled objednávek hospod a prodejen',
  zavoz: 'Plánování závozu a rozvozu piva',
  orders_zavoz: 'Plánování závozu a rozvozu piva',
  prodejna: 'Zápis prodeje na prodejně',
  sklo_promo: 'Evidence skla, podtáčků, etiket a prázdných lahví',
  vycepy: 'Sanitace výčepů a rezervace zařízení',
  exkurze: 'Rezervace prohlídek pivovaru',
  kniha_jizd: 'Daňová evidence služebních cest',
  vehicles: 'Evidence vozidel, STK a stav tachometru',
  depozitar: 'Odběratelé, piva, obaly a ceník',
  inventory: 'Měsíční inventura a dorovnání',
  bottling_needs: 'Co je potřeba stočit do konce týdne',
  cellar: 'Tanky, ležení a várky',
  kegging: 'Stáčení do sudů',
  bottling: 'Stáčení do lahví a PET',
};

/** „Kynšperk" i „kynsperk" musí najít totéž — jinak se hledání nepoužívá. */
function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function QuickSearchModal({ isOpen, onClose, onSelectPage }: QuickSearchModalProps) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [beers, setBeers] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [orders, setOrders] = useState<
    { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[]
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Na telefonu se klávesnice otevře sama — hledání je psaní, ne klikání.
      setTimeout(() => inputRef.current?.focus(), 50);
      loadSearchData();
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  async function loadSearchData() {
    try {
      const [{ data: pData }, { data: bData }, { data: oData }] = await Promise.all([
        supabase.from('places').select('id, name, city').order('name'),
        supabase.from('beers').select('id, name, category').eq('is_active', true).order('name'),
        // Jen posledních 300 — starší objednávka se hledá přes odběratele.
        supabase.from('orders').select('id, place_name, delivery_date, order_date, status')
          .order('order_date', { ascending: false })
          .limit(300),
      ]);
      setPlaces(pData || []);
      setBeers(bData || []);
      setOrders(oData || []);
    } catch {
      // Hledání obrazovek funguje i bez dat — ta se dotahují jen jako bonus.
    }
  }

  // Seznam obrazovek se bere z navigace, ne z ručního výpisu — nová obrazovka
  // se tak v hledání objeví sama.
  const strankyList = useMemo(
    () =>
      [...NAV, ...EXTRA_NAV]
        .filter((n) => n.id !== 'signout')
        .map((n) => ({ id: n.id, title: n.label, subtitle: POPISY[n.id] ?? n.group, icon: n.icon })),
    []
  );

  const dotaz = bezDiakritiky(query.trim());
  const sedi = (...texty: (string | null | undefined)[]) =>
    !dotaz || texty.some((t) => t && bezDiakritiky(t).includes(dotaz));

  const filteredPages: SearchItem[] = strankyList
    .filter((p) => sedi(p.title, p.subtitle))
    .slice(0, 12)
    .map((p) => ({
      id: `page-${p.id}`,
      title: p.title,
      subtitle: p.subtitle,
      category: 'Obrazovka',
      icon: p.icon,
      action: () => { onSelectPage(p.id); onClose(); },
    }));

  // Odběratelé, piva a objednávky se ukazují až od dvou znaků — jinak by
  // prázdné hledání vysypalo stovky řádků a nešlo by v tom nic najít.
  const dostDlouhy = dotaz.length >= 2;

  const filteredPlaces: SearchItem[] = !dostDlouhy ? [] : places
    .filter((p) => sedi(p.name, p.city))
    .slice(0, 8)
    .map((p) => ({
      id: `place-${p.id}`,
      title: p.name,
      subtitle: p.city ? `Město: ${p.city}` : 'Odběratel / hospoda',
      category: 'Odběratel',
      icon: MapPin,
      action: () => { onSelectPage('places'); onClose(); },
    }));

  const filteredBeers: SearchItem[] = !dostDlouhy ? [] : beers
    .filter((b) => sedi(b.name, b.category))
    .slice(0, 8)
    .map((b) => ({
      id: `beer-${b.id}`,
      title: b.name,
      subtitle: b.category ? `Kategorie: ${b.category}` : 'Pivo pivovaru Zajíc',
      category: 'Pivo',
      icon: BeerIcon,
      action: () => { onSelectPage('beers'); onClose(); },
    }));

  const filteredOrders: SearchItem[] = !dostDlouhy ? [] : orders
    .filter((o) => sedi(o.place_name))
    .slice(0, 8)
    .map((o) => {
      const den = o.delivery_date || o.order_date;
      const datum = den ? new Date(den + 'T00:00:00Z').toLocaleDateString('cs-CZ') : '—';
      const stav =
        o.status === 'vyrizeno_zavoz' ? 'zavezeno'
        : o.status === 'storno' ? 'storno'
        : 'nevyřízená';
      return {
        id: `order-${o.id}`,
        title: o.place_name || 'Objednávka bez odběratele',
        subtitle: `Závoz ${datum} · ${stav}`,
        category: 'Objednávka',
        icon: ClipboardList,
        action: () => { onSelectPage('orders'); onClose(); },
      };
    });

  const allItems: SearchItem[] = [...filteredPages, ...filteredPlaces, ...filteredBeers, ...filteredOrders];

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) allItems[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-[9999] flex items-start justify-center pt-3 sm:pt-24 px-0 sm:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full shadow-2xl border border-amber-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[80vh]"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 sm:p-4 border-b border-amber-100 flex items-center gap-3 bg-amber-50/50">
          <Search size={22} className="text-amber-600 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Obrazovka, hospoda, pivo, objednávka…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            className="w-full bg-transparent text-base font-bold text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden min-h-[44px]"
          />
          <button
            type="button"
            onClick={onClose}
            className="sm:hidden shrink-0 min-h-[44px] px-3 rounded-xl text-sm font-black text-amber-800"
          >
            Zavřít
          </button>
          <kbd className="hidden sm:inline-block px-2 py-1 text-[11px] font-mono font-black text-amber-900 bg-amber-200/80 rounded border border-amber-300 shrink-0">
            ESC
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1 scrollbar-thin">
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 font-bold text-sm">
              {dotaz ? `Žádné výsledky pro „${query}"` : 'Začněte psát…'}
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
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between gap-2 transition-all min-h-[56px] ${
                    isSelected
                      ? 'bg-amber-500 text-neutral-950 shadow-md ring-1 ring-amber-400'
                      : 'hover:bg-amber-50 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-amber-500 text-neutral-950' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-black text-sm truncate">{item.title}</div>
                      <div
                        className={`text-xs truncate ${
                          isSelected ? 'text-neutral-900 font-bold' : 'text-neutral-500 font-medium'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`hidden sm:inline text-[11px] font-black uppercase px-2 py-0.5 rounded border ${
                        isSelected
                          ? 'bg-amber-500 text-neutral-950 border-amber-700'
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

        <div className="hidden sm:flex p-3 bg-neutral-50 border-t border-neutral-100 items-center justify-between text-xs text-neutral-500 font-bold px-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-sm text-[11px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-sm text-[11px]">↓</kbd> Navigace
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-neutral-300 rounded-sm text-[11px]">↵</kbd> Otevřít
            </span>
          </div>
          <span className="text-[11px] text-amber-700 font-extrabold">Pivovar Zajíc</span>
        </div>
      </div>
    </div>
  );
}
