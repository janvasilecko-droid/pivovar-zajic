import { Bot } from 'lucide-react';
import { adresaSladek } from '../lib/profilAplikace';
import { chyba as toastChyba, uspech } from '../lib/toast';

/**
 * Odkaz na samostatnou aplikaci AI sládek (R39, adresa /sladek/): otevřít a zkopírovat. Plná karta s postupem
 * instalace je v Nastavení, kompaktní řádek nad chatem v Pivovarské bibli. Ukazovat ji smí jen tomu, kdo má
 * přístup do bible (samotná aplikace by ostatním stejně řekla, že přístup nemají).
 */
export function SladekAplikaceKarta({ kompaktni = false }: { kompaktni?: boolean }) {
  const adresa = adresaSladek();

  async function zkopiruj() {
    try {
      await navigator.clipboard.writeText(adresa);
      uspech('Odkaz na AI sládka je zkopírovaný.');
    } catch {
      toastChyba(`Odkaz se nepodařilo zkopírovat — je to ${adresa}`);
    }
  }

  const tlacitka = (
    <div className="flex flex-wrap gap-2">
      <a className="btn-primary !rounded text-sm font-black" href={adresa} target="_blank" rel="noreferrer">Otevřít AI sládka</a>
      <button type="button" className="btn-ghost !rounded text-sm font-black" onClick={() => { void zkopiruj(); }}>Zkopírovat odkaz</button>
    </div>
  );

  if (kompaktni) {
    return (
      <section aria-label="AI sládek jako samostatná aplikace" className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <p className="text-sm text-neutral-300">
          AI sládek jako samostatná aplikace s vlastní ikonou na ploše — otevře se rovnou na chat (přihlásíš se v ní zvlášť).
        </p>
        {tlacitka}
      </section>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="font-display font-bold text-lg flex items-center gap-2"><Bot size={18} /> AI sládek — samostatná aplikace</h2>
      <p className="text-sm text-neutral-600 mt-2">
        AI sládek může mít na ploše vlastní ikonu a otevřít se rovnou na chat, bez zbytku aplikace pivovaru. Má stejné knihy a data
        jako Pivovarská bible. Přihlašuje se zvlášť (stejným účtem jako tady).
      </p>
      <ol className="text-sm text-neutral-700 mt-2 space-y-1 list-decimal pl-5">
        <li>Klepni na „Otevřít AI sládka“ (otevře se v prohlížeči) a přihlas se.</li>
        <li>V prohlížeči zvol „Přidat na plochu“ / „Nainstalovat aplikaci“. Ikona je zajíc s pivem a žlutou bublinou chatu.</li>
      </ol>
      <div className="mt-3">{tlacitka}</div>
    </div>
  );
}
