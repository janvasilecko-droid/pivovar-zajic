// 🚧 Dlaždice Pivovarské bible, která ještě nefunguje — řekne poctivě, ve
// které etapě přijde a co v ní bude (docs/pivovarska-bible/ETAPY.md).
// Zadání, bod 6 knihovny: nic nesmí předstírat, že funguje.
import type { BibleDlazdice } from '../../screens/BibleScreen';

export function BiblePripravujeme({ dlazdice, jdiDoKnihovny }: { dlazdice: BibleDlazdice; jdiDoKnihovny: () => void }) {
  const Ikona = dlazdice.ikona;
  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 sm:p-5 space-y-3 max-w-2xl">
      <div className="flex items-center gap-3">
        <Ikona size={28} className="text-amber-400 shrink-0" />
        <div>
          <div className="text-[11px] font-black uppercase tracking-wide text-amber-300">Připravujeme · etapa {dlazdice.etapa}</div>
          <div className="text-base font-black">{dlazdice.nazev}</div>
        </div>
      </div>
      {dlazdice.bude && <p className="text-sm text-neutral-200 leading-relaxed">{dlazdice.bude}</p>}
      <p className="text-sm text-neutral-300 leading-relaxed">
        AI zatím z knih neodpovídá: kniha se nejdřív musí nahrát a zpracovat (strany, kapitoly, tabulky, vzorce). Nahrávat jde už teď.
      </p>
      <button type="button" className="btn-amber" onClick={jdiDoKnihovny}>Otevřít Knihovnu dokumentů</button>
    </div>
  );
}
