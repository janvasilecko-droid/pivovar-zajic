// 📥 Načíst z Excelu — jedno místo pro všechny excelové sešity, do kterých
// kolega zapisuje mimo appku (evidence HP Kynšperk na Google Disku, viz
// StáčeníLahví). Karty odpovídají souborům v té složce; každá dostane
// vlastní import, jakmile appka pozná přesný tvar sešitu (zatím jen jeden).
//
// Nic se tu nedomýšlí: dokud appka tvar souboru nezná, karta řekne, co
// pro import ještě potřebuje, místo aby tvářila funkčnost, která není.
import { lazy, Suspense, useEffect, useState } from 'react';
import { FileSpreadsheet, Upload, type LucideIcon } from 'lucide-react';
import { HlavickaStranky } from '../components/HlavickaStranky';
import { Beer, Package, supabase } from '../lib/supabase';
import { oznam } from '../lib/toast';

const ImportStaceniLahviExcel = lazy(() => import('../components/ImportStaceniLahviExcel'));

type SouborExcelu = {
  id: string;
  nazev: string;
  popis: string;
  pripraveno: boolean;
};

/** Soubory ve sdílené složce „Evidence HP Kynšperk" — kolega do nich píše mimo appku. */
const SOUBORY: SouborExcelu[] = [
  { id: 'stac_lahve', nazev: 'Stáčení lahví', popis: 'Kolik sudů se spotřebovalo a kolik lahví se z nich stočilo.', pripraveno: true },
  { id: 'stac_keg', nazev: 'Stáčení KEG', popis: 'Stáčení piva ze sklepa do sudů.', pripraveno: false },
  { id: 'fasovani', nazev: 'Fasování', popis: 'Výdej ze skladu — prodejna a personál.', pripraveno: false },
  { id: 'inventura', nazev: 'Inventura', popis: 'Měsíční inventurní zápisy.', pripraveno: false },
  { id: 'odber_personal', nazev: 'Odběr personál', popis: 'Co si vzal personál mimo prodejnu.', pripraveno: false },
  { id: 'rezani', nazev: 'Řezání', popis: 'Míchání/řezání šarží piva.', pripraveno: false },
  { id: 'vydej_obj', nazev: 'Výdej objednávek', popis: 'Výdej zboží podle objednávek odběratelů.', pripraveno: false },
  { id: 'vzorky_promo', nazev: 'Vzorky a promo', popis: 'Vzorky a promo výdej.', pripraveno: false },
];

function Karta({ ikona: Ikona, soubor, onOtevrit }: { ikona: LucideIcon; soubor: SouborExcelu; onOtevrit: () => void }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Ikona className="w-5 h-5 mt-0.5 text-neutral-500 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-neutral-900">{soubor.nazev}</h2>
            {!soubor.pripraveno && (
              <span className="text-udaj font-black uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Zatím nepřipraveno
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-600">{soubor.popis}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOtevrit}
        className={soubor.pripraveno ? 'btn-primary w-full min-h-[44px]' : 'btn-ghost w-full min-h-[44px]'}
      >
        {soubor.pripraveno ? 'Nahrát soubor' : 'Zatím nepřipraveno'}
      </button>
    </section>
  );
}

export default function ImportExcelScreen() {
  const [otevrenoStaceniLahvi, setOtevrenoStaceniLahvi] = useState(false);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);

  useEffect(() => {
    if (!otevrenoStaceniLahvi || beers.length) return;
    void Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]).then(([b, p]) => {
      setBeers((b.data ?? []) as Beer[]);
      setPackages((p.data ?? []) as Package[]);
    });
  }, [otevrenoStaceniLahvi, beers.length]);

  function otevri(soubor: SouborExcelu) {
    if (!soubor.pripraveno) {
      oznam(`„${soubor.nazev}" appka zatím neumí — pošli ukázku téhle tabulky (pár řádků se záhlavím) a doplním import, přesně jako u Stáčení lahví.`);
      return;
    }
    if (soubor.id === 'stac_lahve') setOtevrenoStaceniLahvi(true);
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4">
      <HlavickaStranky
        titul="Načíst z Excelu"
        ikona={Upload}
        podtitul="Excelové sešity, do kterých kolega zapisuje mimo appku — appka je umí nahrát a zapsat, každý svým vlastním importem."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {SOUBORY.map((s) => (
          <Karta key={s.id} ikona={FileSpreadsheet} soubor={s} onOtevrit={() => otevri(s)} />
        ))}
      </div>

      <Suspense fallback={null}>
        {otevrenoStaceniLahvi && (
          <ImportStaceniLahviExcel
            open={otevrenoStaceniLahvi}
            onClose={() => setOtevrenoStaceniLahvi(false)}
            beers={beers}
            packages={packages}
            onImported={() => {}}
          />
        )}
      </Suspense>
    </div>
  );
}
