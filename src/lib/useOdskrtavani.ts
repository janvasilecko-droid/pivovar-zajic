/**
 * ✅ Odškrtávání položek na obrazovce: nejdřív se překreslí, pak se ukládá.
 * ---------------------------------------------------------------------------
 * 14. 10. 2026: „nejde mi označovat, že mám připravený lahve". Na mobilních
 * datech v autě klepnutí čekalo na odpověď serveru (až deset vteřin), tak se
 * zdálo, že neprošlo — a klepalo se znovu. Navíc se po každé změně obrazovka
 * přenačítá a přenačtení, které nedostalo odpověď, vrátilo staré odškrtnutí.
 *
 * Tady se klepnutí promítne HNED. Pak se uloží jedním dotazem (odskrtavani.ts).
 * Dokud zápis neskončí, drží se odškrtnutí stranou a přimíchává se do každého
 * čerstvě načteného seznamu (`prekryj`) — přenačtení, které přišlo dřív, než
 * zápis doběhl, ho tak nevrátí. Zpátky se vrací jen když server zápis odmítne;
 * výpadek signálu to není (ten se řeší frontou v telefonu, offline.ts).
 */
import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { chyba } from './toast';
import type { PriznakPolozky } from './polozkyObjednavky';
import {
  nastavPriznakPolozek, ulozPriznakPolozek, ulozPripravenostObjednavek, vPoradi, zmenyPripravenostiObjednavek,
  type CilOdskrtnuti,
} from './odskrtavani';

type Polozka = { id: string; is_prepared?: boolean | null; is_bottled?: boolean | null };
type Objednavka = { id: string; is_prepared?: boolean | null };

export function useOdskrtavani<T extends Polozka, O extends Objednavka>(p: {
  items: Record<string, T[]>;
  setItems: Dispatch<SetStateAction<Record<string, T[]>>>;
  orders: O[];
  setOrders: Dispatch<SetStateAction<O[]>>;
}) {
  const { items, setItems, orders, setOrders } = p;
  const nevyrizene = useRef(new Map<string, { hodnota: boolean; verze: number }>());
  const verze = useRef(0);

  /** Do čerstvě načtených položek přimíchá odškrtnutí, která se ještě nestihla zapsat. */
  const prekryj = useCallback(<X extends T>(mapa: Record<string, X[]>): Record<string, X[]> => {
    if (nevyrizene.current.size === 0) return mapa;
    const vysledek: Record<string, X[]> = {};
    for (const [orderId, seznam] of Object.entries(mapa)) {
      vysledek[orderId] = seznam.map((x) => {
        let y = x;
        for (const klic of ['is_prepared', 'is_bottled'] as const) {
          const n = nevyrizene.current.get(`${klic}:${x.id}`);
          if (n && !!x[klic] !== n.hodnota) y = { ...y, [klic]: n.hodnota };
        }
        return y;
      });
    }
    return vysledek;
  }, []);

  const nastavPriznak = async (cile: CilOdskrtnuti[], klic: PriznakPolozky, hodnota: boolean): Promise<void> => {
    if (cile.length === 0) return;
    const drive = new Map(cile.map((c) => [c.itemId, !!(items[c.orderId] ?? []).find((x) => x.id === c.itemId)?.[klic]]));
    const dalsi = nastavPriznakPolozek(items, cile, klic, hodnota);
    const zmenyObjednavek = klic === 'is_prepared' ? zmenyPripravenostiObjednavek(dalsi, orders, cile.map((c) => c.orderId)) : [];
    const moje = ++verze.current;
    for (const c of cile) nevyrizene.current.set(`${klic}:${c.itemId}`, { hodnota, verze: moje });

    // 1) Hned na obrazovce.
    setItems((m) => nastavPriznakPolozek(m, cile, klic, hodnota));
    if (zmenyObjednavek.length) {
      setOrders((arr) => arr.map((x) => {
        const z = zmenyObjednavek.find((m) => m.orderId === x.id);
        return z ? { ...x, is_prepared: z.hotovo } : x;
      }));
    }

    // 2) Pak na server, v pořadí klepnutí.
    let chybaZapisu: string | null = null;
    try {
      chybaZapisu = await vPoradi(async () => {
        const e = await ulozPriznakPolozek(klic, cile.map((c) => c.itemId), hodnota);
        return e ?? (await ulozPripravenostObjednavek(zmenyObjednavek));
      });
    } catch (e: any) {
      chybaZapisu = e?.message ?? String(e);
    } finally {
      for (const c of cile) {
        const k = `${klic}:${c.itemId}`;
        if (nevyrizene.current.get(k)?.verze === moje) nevyrizene.current.delete(k);
      }
    }

    // 3) Server zápis odmítl → vrátit, co bylo, a říct to.
    if (chybaZapisu) {
      for (const puvodni of [true, false]) {
        const skupina = cile.filter((c) => drive.get(c.itemId) === puvodni);
        if (skupina.length) setItems((m) => nastavPriznakPolozek(m, skupina, klic, puvodni));
      }
      if (zmenyObjednavek.length) {
        setOrders((arr) => arr.map((x) => {
          const z = zmenyObjednavek.find((m) => m.orderId === x.id);
          return z ? { ...x, is_prepared: !z.hotovo } : x;
        }));
      }
      chyba('Odškrtnutí se nepodařilo uložit: ' + chybaZapisu);
    }
  };

  return { nastavPriznak, prekryj };
}
