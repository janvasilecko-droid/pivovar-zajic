// 📚 „Z čeho AI sládek čerpá" — knihy knihovny přímo v chatu.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: chatbot „má i databáze knih Kunze, Košař, možná přibudou
// další". Skládací blok nad otázkou ukáže, které knihy AI sládek opravdu zná
// (zpracované) a které ještě čekají; nahraná kniha, která není zpracovaná, se za
// známou nevydává (zadání, bod 6). Načítá se z knihovny jednou při otevření chatu;
// když se knihovna nenačte (bez migrace, bez sítě), blok se tiše vynechá — chat
// funguje i bez něj.
import { useEffect, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import { nactiDokumenty } from '../../lib/bibleKnihovnaApi';
import { prehledKnih, souhrnKnih, type PrehledKnih } from '../../lib/bibleKnihyChatu';

export function BibleKnihyChatu({ doKnihovny }: {
  /** Otevře Knihovnu dokumentů (nahrání další knihy); chybí = tlačítko se nezobrazí (čtenář nahrávat nesmí). */
  doKnihovny?: () => void;
}) {
  const [knihy, setKnihy] = useState<PrehledKnih | null>(null);
  useEffect(() => {
    void nactiDokumenty().then((r) => {
      if (r.stav === 'ok') setKnihy(prehledKnih(r.dokumenty));
    });
  }, []);

  if (!knihy) return null;
  return (
    <details className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-100" data-testid="knihy-chatu">
      <summary className="tap flex cursor-pointer select-none items-center gap-2 py-1 font-bold">
        <BookOpen size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
        <span>Z čeho AI sládek čerpá: {souhrnKnih(knihy)}</span>
      </summary>
      <div className="mt-2 space-y-3">
        {knihy.zpracovane.length > 0 && (
          <ul className="space-y-1.5" aria-label="Zpracované knihy">
            {knihy.zpracovane.map((k) => (
              <li key={k.id}>
                <span className="font-bold">{k.nazev}</span>
                {k.popis && <span className="block text-xs text-neutral-300">{k.popis}</span>}
              </li>
            ))}
          </ul>
        )}
        {knihy.ostatni.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-black uppercase tracking-wide text-amber-300">Zatím nezpracováno — AI z nich ještě neodpovídá</div>
            <ul className="space-y-1.5" aria-label="Nezpracované knihy">
              {knihy.ostatni.map((k) => (
                <li key={k.id}>
                  <span className="font-bold">{k.nazev}</span>
                  <span className={`block text-xs ${k.stav === 'chyba' ? 'font-bold text-rose-300' : 'text-neutral-300'}`}>{k.stavText}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {doKnihovny && (
          <button type="button" className="btn-tmave text-sm" onClick={doKnihovny}>
            <Plus size={16} aria-hidden="true" /> Přidat další knihu
          </button>
        )}
      </div>
    </details>
  );
}
