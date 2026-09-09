import { Beer as BeerIcon, Factory, FolderOpen, Lightbulb, Settings } from 'lucide-react';

// 📖 Návod k použití & přehled funkcí — JEDEN zdroj pro dvě místa.
//
// Dřív žil tenhle text jen v Nastavení, takže se k němu šlo dostat jediným
// způsobem: dojít do Nastavení a rozbalit ho. Kdo potřeboval poradit rovnou
// u dané obrazovky, musel odejít pryč a pak se zase vracet. Teď je to
// samostatná komponenta — Nastavení ji ukazuje jako dřív (rozbalovací blok)
// a horní lišta (Layout.tsx) ji nabízí odkudkoli přes „?" vedle Hledat.
export function NavodPouziti() {
  return (
    <div className="space-y-6 text-sm text-neutral-700 leading-relaxed">
      <div>
        <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
          <span><Factory className="ikona-text" /></span> Výroba
        </h3>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>KEG:</strong> Zápis stočených sudů. Stabilní řazení podle data stáčení a času vytvoření.</li>
          <li><strong>Lahve (Stáčení):</strong> Zápis stočených lahví, bilance zásob piva a přehled <em>Potřeby stočit</em> (sklad vs. objednávky). Obsahuje také záložku <strong>Sklo, Etikety, Podtácky</strong> pro správu obalového materiálu.</li>
          <li><strong>Objednávky:</strong> Evidence objednávek s možností nahrávání hlasem, kopírování textu z WhatsApp či importu z Excelu. Nyní obsahuje záložku <strong>Výčepy (Zápůjčky)</strong> pro zapůjčenou techniku.</li>
          <li><strong>Fasování, Prodejna, Odpis:</strong> Záznamy prodejů na prodejně, fasování piva pro akce a zápisy poškozeného či prošlého piva k odpisu.</li>
        </ul>
      </div>

      <div>
        <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
          <span><BeerIcon className="ikona-text" /></span> Pivovar
        </h3>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Sklad:</strong> Rychlý přehled aktuálních disponibilních zásob sudů, lahví a reklamních předmětů.</li>
          <li><strong>Sklep:</strong> Evidence ležáckých tanků, průběhu kvašení, vaření piva a kompletní varné listy.</li>
          <li><strong>Inventura:</strong> Měsíční uzávěrka skladu. Na začátku měsíce je prázdná, zadává se na konci měsíce. Tlačítkem <em>Schválit & převést</em> se stavy uzamknou a přenesou do počátečního stavu dalšího měsíce.</li>
          <li><strong>Sanitace:</strong> Sjednocené místo pro čistotu pivovaru. Obsahuje <em>Sanitační deník</em> pro zápis čištění, <em>Sanitační postupy & Řád</em> (HACCP) a <em>Check-listy & Návody</em> k obsluze strojů.</li>
        </ul>
      </div>

      <div>
        <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
          <span><Settings className="ikona-text" /></span> Nástroje
        </h3>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Kalkulačky:</strong> Rychlé výpočty koncentrací, alkoholu, ředění mladiny a obsahu cukru.</li>
          <li><strong>Plánování:</strong> Sjednocený plánovací panel zobrazující na jedné obrazovce interaktivní <strong>Kalendář</strong>, <strong>Úkoly/Upomínky</strong> a <strong>Poznámkový blok</strong>.</li>
        </ul>
      </div>

      <div>
        <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
          <FolderOpen className="ikona-text" /> Číselníky (Depozitář)
        </h3>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Depozitář:</strong> Správa <em>Odběratelů</em>, <em>Piv</em>, <em>Obalů</em> a hlavního <em>Ceníku</em> na jednom místě pod záložkami.</li>
          <li><strong>Auta:</strong> Vozový park s platnostmi STK a dálničních známek, sloučený s přehlednou <strong>Knihou jízd</strong>.</li>
        </ul>
      </div>

      <div className="bg-amber-100/50 p-3.5 rounded border border-amber-200 text-xs text-amber-900 font-bold">
        <Lightbulb className="ikona-text" /> Tento návod budeme průběžně doplňovat a aktualizovat s každou novou funkcí, kterou do aplikace Zajíc přidáme.
      </div>
    </div>
  );
}
