// 📊 Stav čtení tabulky z fotky v oknech zadávání (stáčení lahví, sudů, výdej).
// ---------------------------------------------------------------------------
// Všechna tři okna čtou fotku stejně a potřebují totéž: zapamatovaný režim
// (seznam / tabulka z Excelu), datum „číst od", paměť fotky (přepis Vision se
// nedělá znovu při změně data), výsledek čtení a vybraný den. Tenhle hook to
// drží na jednom místě; okna si z výsledku dělají vlastní řádky (viz
// lib/tabulkaStaceni.ts, radky…ZTabulky).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nacti, uloz } from './uloziste';
import {
  ctiTabulkuZFotky,
  navrhOdData,
  vychoziDen,
  type FotoTabulky,
  type PametFotky,
  type VysledekCteniTabulky,
} from './tabulkaStaceni';
import type { DenTabulky } from '../../supabase/functions/_shared/tabulka-staceni';

export type RezimCteni = 'seznam' | 'tabulka';

/** Co se o poslední přečtené fotce ukazuje v panelu. */
export type InfoFotky =
  | { stav: 'ok'; dny: DenTabulky[]; varovani: string[]; orezano: boolean; ocr: boolean; vynechano: number; bezData: number; odData: string | null }
  | { stav: 'nic-od-data'; odData: string; posledniDatum: string | null };

const KLIC = 'pivovar_cteni_fotky_rezim_';

/** Dny ze všech přečtených fotek (stejný den z víc fotek se sečte); nejdřív řádky bez data, pak vzestupně. */
function souhrnDnu(info: Record<number, InfoFotky>): DenTabulky[] {
  const pocty = new Map<string | null, number>();
  for (const i of Object.values(info)) {
    if (i.stav !== 'ok') continue;
    for (const d of i.dny) pocty.set(d.datum, (pocty.get(d.datum) ?? 0) + d.radku);
  }
  return [...pocty.entries()]
    .map(([datum, radku]) => ({ datum, radku }))
    .sort((a, b) => (a.datum === null ? -1 : b.datum === null ? 1 : a.datum.localeCompare(b.datum)));
}

export function useTabulkaZFotky(opts: {
  klic: string;
  vychoziRezim: RezimCteni;
  posledniZapis?: string | null;
  /**
   * Okno umí vložit víc dnů najednou (každý řádek na svůj den): výchozí výběr
   * je „Všechny dny“ a den se dá jen zúžit. Bez toho se vkládá jeden den
   * (formulář má jedno datum).
   */
  vsechnyDny?: boolean;
}) {
  const [rezim, setRezimStav] = useState<RezimCteni>(() => {
    const ulozeny = nacti(KLIC + opts.klic);
    return ulozeny === 'tabulka' || ulozeny === 'seznam' ? ulozeny : opts.vychoziRezim;
  });
  const setRezim = useCallback((r: RezimCteni) => {
    setRezimStav(r);
    uloz(KLIC + opts.klic, r);
  }, [opts.klic]);

  // Datum „číst od": den po posledním zápisu v aplikaci, dokud ho obsluha sama nezmění.
  const [odData, setOdDataStav] = useState(() => navrhOdData(opts.posledniZapis));
  const zmenenoRucne = useRef(false);
  const setOdData = useCallback((v: string) => { zmenenoRucne.current = true; setOdDataStav(v); }, []);
  useEffect(() => {
    if (!zmenenoRucne.current) setOdDataStav(navrhOdData(opts.posledniZapis));
  }, [opts.posledniZapis]);

  const pamet = useRef<Record<number, PametFotky>>({});
  // Výsledky čtení: stav pro vykreslení a jeho kopie v refu (ať se z něj dá počítat mimo vykreslování).
  const [info, setInfoStav] = useState<Record<number, InfoFotky>>({});
  const infoRef = useRef<Record<number, InfoFotky>>({});
  const upravInfo = useCallback((zmena: (p: Record<number, InfoFotky>) => Record<number, InfoFotky>) => {
    infoRef.current = zmena(infoRef.current);
    setInfoStav(infoRef.current);
    return infoRef.current;
  }, []);
  /** Podle jakého data se četlo naposledy (kvůli tlačítku „Přečíst znovu od …"). */
  const [nactenoOdData, setNactenoOdData] = useState<string | null>(null);
  const [vybranyDen, setVybranyDen] = useState<string | null | undefined>(undefined);

  const dny = useMemo<DenTabulky[]>(() => souhrnDnu(info), [info]);

  /** Přečte fotku `idx` od zadaného data a zapamatuje si výsledek. */
  const cti = useCallback(
    async (idx: number, foto: FotoTabulky, piva: { id: string; name: string; degree?: string | null }[]): Promise<VysledekCteniTabulky> => {
      const pametFotky = (pamet.current[idx] ??= {});
      const pouzite = odData || null;
      const v = await ctiTabulkuZFotky({ foto, odData: pouzite, piva, pamet: pametFotky });
      setNactenoOdData(pouzite);
      if (v.stav === 'ok') {
        const dalsi = upravInfo((p) => ({
          ...p,
          [idx]: { stav: 'ok', dny: v.dny, varovani: v.varovani, orezano: v.orezano, ocr: v.ocr, vynechano: v.vynechano, bezData: v.bezData, odData: v.odData },
        }));
        // Výchozí den z dní VŠECH fotek; už vybraný den zůstane, pokud tam ještě je.
        const dnyVse = souhrnDnu(dalsi);
        setVybranyDen((aktualni) => {
          if (aktualni !== undefined && dnyVse.some((d) => d.datum === aktualni)) return aktualni;
          // Víc dnů a okno umí všechny: nezúžené = všechny dny (undefined).
          if (opts.vsechnyDny && dnyVse.length > 1) return undefined;
          return vychoziDen(dnyVse, pouzite);
        });
      } else if (v.stav === 'nic-od-data') {
        upravInfo((p) => ({ ...p, [idx]: { stav: 'nic-od-data', odData: v.odData, posledniDatum: v.posledniDatum } }));
      } else {
        upravInfo((p) => { const { [idx]: _pryc, ...zbytek } = p; return zbytek; });
      }
      return v;
    },
    [odData, upravInfo, opts.vsechnyDny],
  );

  /** Fotka se změnila (ořez v editoru) nebo se čte znovu od začátku: zapomene, co o ní ví. */
  const zapomen = useCallback((idx?: number) => {
    if (idx === undefined) { pamet.current = {}; upravInfo(() => ({})); setVybranyDen(undefined); return; }
    delete pamet.current[idx];
    upravInfo((p) => { const { [idx]: _pryc, ...zbytek } = p; return zbytek; });
  }, [upravInfo]);

  return {
    rezim, setRezim, zapnuto: rezim === 'tabulka', vsechnyDny: !!opts.vsechnyDny,
    odData, setOdData, nactenoOdData, posledniZapis: opts.posledniZapis ?? null,
    info, dny, vybranyDen, setVybranyDen,
    cti, zapomen,
  };
}

export type TabulkaZFotky = ReturnType<typeof useTabulkaZFotky>;
