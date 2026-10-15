// 🔎 Objednávky a jejich položky pro Rozbor za týden nebo měsíc.
// ---------------------------------------------------------------------------
// Bere je ze sdílené paměti (lib/sdilenaData.ts) — obrazovka Rozbor je tak
// nemusí stahovat při každém přepnutí měsíce a objednávky se přenačtou samy,
// když se v tabulce něco změní. Když se načtení nepovede, zůstane poslední
// ÚPLNÝ stav: součty z půlky tabulky jsou horší než žádné.
import { useCallback, useEffect, useState } from 'react';
import { useRealtime } from './supabase';
import { nactiSdilenouTabulku } from './sdilenaData';
import { usePosledniNacteni } from './nacitani';
import type { ObjednavkaRozboru, PolozkaObjednavkyRozboru } from './rozborObdobi';

export type ObjednavkyRozboru = {
  objednavky: ObjednavkaRozboru[];
  polozky: PolozkaObjednavkyRozboru[];
};

export function useObjednavkyRozboru(): { data: ObjednavkyRozboru | null; chyba: boolean } {
  const [data, setData] = useState<ObjednavkyRozboru | null>(null);
  const [chyba, setChyba] = useState(false);
  // Pozdě došlá starší odpověď nesmí přepsat novější (lib/nacitani.ts).
  const zacniNacteni = usePosledniNacteni();

  const nacti = useCallback(async () => {
    const smiZapsat = zacniNacteni();
    try {
      const [o, p] = await Promise.all([
        nactiSdilenouTabulku<ObjednavkaRozboru>('orders'),
        nactiSdilenouTabulku<PolozkaObjednavkyRozboru>('order_items'),
      ]);
      if (!smiZapsat()) return;
      if (o.error || p.error || !o.data || !p.data) { setChyba(true); return; }
      setData({ objednavky: o.data, polozky: p.data });
      setChyba(false);
    } catch {
      if (smiZapsat()) setChyba(true);
    }
  }, [zacniNacteni]);

  useEffect(() => { void nacti(); }, [nacti]);
  useRealtime(['orders', 'order_items'], () => { void nacti(); });

  return { data, chyba };
}
