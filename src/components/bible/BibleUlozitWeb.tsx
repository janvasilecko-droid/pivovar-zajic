// 🌐 „Uložit do bible" u zdrojů z internetu v odpovědi AI sládka.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: chatbot „může sbírat věci i z internetu". Odpověď, která
// čerpala z webu (web_search v chatu, nebo odkaz v odpovědi z aplikace Claude),
// ukáže zdroje zvlášť od knih; člověk s právem přispěvatele je jedním klepnutím
// uloží do Správy znalostí → Rešerše z internetu. Vždy jako neověřené (důvěra 5);
// ověří je správce. AI sládek je neukládá sám: text cizí stránky by mu mohl
// podstrčit pokyn a do bible smí zapisovat jen člověk (R27, R28).
import { useCallback, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Check, Loader2 } from 'lucide-react';
import type { ZdrojOdpovedi } from '../../lib/bibleChatApi';
import { ulozWebZdroj } from '../../lib/bibleWebApi';
import { webZdrojeOdpovedi, webZdrojZOdpovedi } from '../../lib/bibleWebZOdpovedi';
import { nazevStavuWebu } from '../../../bible/supabase/functions/_shared/web-popisy.ts';

export type StavUlozeni =
  | { stav: 'uklada' }
  | { stav: 'ulozeno' }
  | { stav: 'uz'; overeni: string }
  | { stav: 'chyba'; zprava: string };

export type UkladaniWebu = {
  /** Zdroje, které jde uložit: web s platnou adresou, každá adresa jednou. */
  zdroje: ZdrojOdpovedi[];
  /** Stav podle čísla citace. */
  stavy: Readonly<Record<number, StavUlozeni | undefined>>;
  uloz: (z: ZdrojOdpovedi) => Promise<void>;
  ulozVse: () => Promise<void>;
  /** Kolik zdrojů ještě není v bibli (hromadné tlačítko). */
  zbyva: number;
  /** Právě se něco ukládá. */
  uklada: boolean;
};

/** Ukládání webových zdrojů jedné odpovědi (`text` = text odpovědi, z něj se bere shrnutí). */
export function useUkladaniWebu(citace: readonly ZdrojOdpovedi[], text: string): UkladaniWebu {
  const zdroje = useMemo(() => webZdrojeOdpovedi(citace), [citace]);
  const [stavy, setStavy] = useState<Record<number, StavUlozeni | undefined>>({});
  // Dvojí klepnutí, než se vykreslí „Ukládám…", nesmí poslat zdroj dvakrát.
  const bezi = useRef(new Set<number>());
  const hotove = useRef(new Set<number>());

  const uloz = useCallback(async (z: ZdrojOdpovedi) => {
    if (bezi.current.has(z.n) || hotove.current.has(z.n)) return;
    const nastav = (s: StavUlozeni) => setStavy((p) => ({ ...p, [z.n]: s }));
    const vstup = webZdrojZOdpovedi(z, text);
    if (!vstup) {
      nastav({ stav: 'chyba', zprava: 'Adresa zdroje není platná — uložit ho nejde.' });
      return;
    }
    bezi.current.add(z.n);
    nastav({ stav: 'uklada' });
    try {
      const r = await ulozWebZdroj(null, vstup);
      if (r.stav === 'ok') {
        hotove.current.add(z.n);
        nastav(r.data.novy ? { stav: 'ulozeno' } : { stav: 'uz', overeni: nazevStavuWebu(r.data.stav ?? 'neovereno') });
      } else {
        nastav({ stav: 'chyba', zprava: r.zprava });
      }
    } catch {
      nastav({ stav: 'chyba', zprava: 'Uložení se nepovedlo (spojení). Zkus to znovu.' });
    } finally {
      bezi.current.delete(z.n);
    }
  }, [text]);

  const ulozVse = useCallback(async () => {
    for (const z of zdroje) await uloz(z);
  }, [zdroje, uloz]);

  const zbyva = zdroje.filter((z) => stavy[z.n]?.stav !== 'ulozeno' && stavy[z.n]?.stav !== 'uz').length;
  const uklada = zdroje.some((z) => stavy[z.n]?.stav === 'uklada');
  return { zdroje, stavy, uloz, ulozVse, zbyva, uklada };
}

/** Pod webovým zdrojem v seznamu Zdroje: tlačítko, průběh, výsledek nebo chyba. */
export function RadekUlozeniWebu({ z, stav, uloz }: { z: ZdrojOdpovedi; stav?: StavUlozeni; uloz: () => void }) {
  if (stav?.stav === 'ulozeno') {
    return (
      <p role="status" className="flex items-start gap-1.5 px-2 pb-1.5 text-xs font-bold text-emerald-300">
        <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Uloženo do bible jako neověřený zdroj — správce ho ověří ve Správě znalostí.</span>
      </p>
    );
  }
  if (stav?.stav === 'uz') {
    return (
      <p role="status" className="flex items-start gap-1.5 px-2 pb-1.5 text-xs font-bold text-neutral-200">
        <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Už v bibli je ({stav.overeni}).</span>
      </p>
    );
  }
  const uklada = stav?.stav === 'uklada';
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5">
      <button type="button" className="btn-tmave text-sm" disabled={uklada} onClick={uloz}>
        {uklada ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <BookmarkPlus size={16} aria-hidden="true" />}
        {uklada ? 'Ukládám…' : 'Uložit do bible'}
        <span className="sr-only"> (zdroj {z.n})</span>
      </button>
      {stav?.stav === 'chyba' && <span role="alert" className="text-xs font-bold text-rose-300">{stav.zprava}</span>}
    </div>
  );
}

/** Nad seznamem Zdroje: vysvětlení a hromadné uložení (dokud zbývají aspoň dva zdroje z webu; jeden má vlastní tlačítko). */
export function HlavickaUlozeniWebu({ ukladani }: { ukladani: UkladaniWebu }) {
  if (ukladani.zdroje.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 text-xs text-neutral-300">
        Zdroje z internetu jde uložit do bible: uloží se jako neověřené a správce je ověří ve Správě znalostí → Rešerše z internetu.
      </p>
      {ukladani.zbyva >= 2 && (
        <button type="button" className="btn-tmave text-sm" disabled={ukladani.uklada} onClick={() => void ukladani.ulozVse()}>
          <BookmarkPlus size={16} aria-hidden="true" /> Uložit všechny zdroje z internetu ({ukladani.zbyva})
        </button>
      )}
    </div>
  );
}
