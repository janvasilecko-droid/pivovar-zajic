import { useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { odkazAplikace } from '../lib/odkazAplikace';
import { chyba, uspech } from '../lib/toast';

// 📲 Instalace na plochu — postup pro každý telefon/počítač.
// Aplikace je „PWA": nainstaluje se rovnou z prohlížeče, bez obchodu Google
// Play a bez App Store. Společné pro Nastavení a okno z horní lišty.

export function InstalaceKroky({ pripravenaInstalace, naInstalaci }: {
  /** Prohlížeč nabídl přímou instalaci (událost beforeinstallprompt). */
  pripravenaInstalace: boolean;
  naInstalaci: () => void;
}) {
  const [zkopirovano, setZkopirovano] = useState(false);

  async function kopirujOdkaz() {
    try {
      await navigator.clipboard.writeText(odkazAplikace());
      setZkopirovano(true);
      uspech('Odkaz na aplikaci je zkopírovaný.');
    } catch {
      chyba(`Odkaz se nepodařilo zkopírovat — je to ${odkazAplikace()}`);
    }
  }

  return (
    <div className="space-y-3 text-sm text-neutral-700">
      {pripravenaInstalace && (
        <button type="button" onClick={naInstalaci} className="btn-primary !rounded w-full !py-3 text-sm font-black flex items-center justify-center gap-2">
          <Download size={16} /> Nainstalovat aplikaci na plochu
        </button>
      )}
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-1">
        <div className="font-black text-neutral-900">Android (Chrome)</div>
        <p>Klepni na <strong>tři tečky</strong> vpravo nahoře → <strong>Nainstalovat aplikaci</strong> (nebo <strong>Přidat na plochu</strong>).</p>
      </div>
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-1">
        <div className="font-black text-neutral-900">iPhone (jen Safari)</div>
        <p>Klepni na <strong>Sdílet</strong> (čtvereček se šipkou dole) → <strong>Přidat na plochu</strong> → Přidat.</p>
      </div>
      <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-1">
        <div className="font-black text-neutral-900">Počítač (Chrome / Edge)</div>
        <p>V adresním řádku vpravo klepni na ikonku instalace (monitor se šipkou) → <strong>Nainstalovat</strong>.</p>
      </div>
      <p className="text-xs text-neutral-500">
        Nejde o aplikaci z obchodu Google Play — nic se nestahuje z obchodu, ikona se jen přidá na plochu a otevírá se na celou obrazovku.
      </p>
      <button type="button" onClick={kopirujOdkaz} className="btn-ghost !rounded text-xs font-black flex items-center gap-1.5">
        <Copy size={14} /> {zkopirovano ? 'Odkaz zkopírován' : 'Zkopírovat odkaz na aplikaci'}
      </button>
    </div>
  );
}
