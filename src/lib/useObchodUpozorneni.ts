// 🔔 Odznak dlaždice Obchod na ploše: kolik věcí čeká na pozornost.
// ---------------------------------------------------------------------------
// Plocha se otevírá nejčastěji ze všeho, takže se tu NENAČÍTÁ celá historie
// obchodu (to dělá až obrazovka Obchod). Stav skladu se počítá od poslední
// inventury každého zboží, a dřívější data se na něj nijak nepromítají — proto
// stačí řádky uzávěrek, příjmů a odpisů NOVĚJŠÍ než nejstarší z posledních
// inventur (`odKdy`). Počítá to stejná funkce jako uvnitř Obchodu
// (spoctiUpozorneni), čísla se tedy rozcházet nemají.
//
// Chyba načtení (třeba migrace obchodu ještě neběžela) se tady NEHLÁSÍ —
// odznak se prostě neukáže. Říct, co chybí, je práce obrazovky Obchod.
import { useCallback, useEffect, useState } from 'react';
import { fetchAllRows, useRealtime } from './supabase';
import { usePosledniNacteni } from './nacitani';
import { businessDateISO } from './businessDate';
import { odKdyJePotrebaZnatPohyby, spoctiUpozorneni, type UpozorneniObchodu } from './obchodUpozorneni';
import type { FasovaniRadek, InventuraRadek, OdpisRadek, PrijemRadek, ProdanyRadek, UzaverkaHlavicka, Zbozi } from './obchodSklad';

const TABULKY = [
  'obchod_zbozi', 'obchod_prijem', 'obchod_uzaverky', 'obchod_uzaverky_radky', 'obchod_inventura', 'fasovani_private',
  'obchod_odpis', 'obchod_zavreno',
];

export function useObchodUpozorneni(povoleno: boolean): UpozorneniObchodu | null {
  const [vysledek, setVysledek] = useState<UpozorneniObchodu | null>(null);
  const zacniNacteni = usePosledniNacteni();

  const nacti = useCallback(async () => {
    const smiZapsat = zacniNacteni();
    try {
      const [z, inv, uz, zav] = await Promise.all([
        fetchAllRows<Zbozi>('obchod_zbozi', 'kod,nazev,beer_id,package_id,min_ks,aktivni'),
        fetchAllRows<InventuraRadek>('obchod_inventura', 'kod,datum,napocitano'),
        fetchAllRows<UzaverkaHlavicka>('obchod_uzaverky', 'id,datum_od,datum_do,stredisko'),
        // Druhá migrace nemusí běžet — pak není co hlídat a prázdný seznam stačí.
        fetchAllRows<{ datum: string }>('obchod_zavreno', 'datum'),
      ]);
      if (z.error || inv.error || uz.error) { if (smiZapsat()) setVysledek(null); return; }
      const inventury = inv.data ?? [];
      const uzaverky = uz.data ?? [];

      const odKdy = odKdyJePotrebaZnatPohyby(inventury);
      const prvniInventura = inventury.reduce<string | null>((min, i) => (min == null || i.datum < min ? i.datum : min), null);
      let radky: ProdanyRadek[] = [];
      let fasovani: FasovaniRadek[] = [];
      let prijmy: PrijemRadek[] = [];
      let odpisy: OdpisRadek[] = [];
      if (odKdy && prvniInventura) {
        const idUzaverek = uzaverky.filter((u) => u.datum_do > odKdy).map((u) => u.id);
        const [r, f, p, o] = await Promise.all([
          idUzaverek.length ? fetchAllRows<ProdanyRadek>('obchod_uzaverky_radky', 'uzaverka_id,kod,mnozstvi').in('uzaverka_id', idUzaverek) : Promise.resolve({ data: [], error: null }),
          // Fasování bez zboží se hledá od PRVNÍ inventury (viz fasovaniBezZbozi), stav skladu od poslední.
          fetchAllRows<FasovaniRadek>('fasovani_private', 'beer_id,package_id,quantity,entry_date').gt('entry_date', prvniInventura),
          fetchAllRows<PrijemRadek>('obchod_prijem', 'kod,datum,mnozstvi').gt('datum', odKdy),
          fetchAllRows<OdpisRadek>('obchod_odpis', 'kod,datum,mnozstvi').gt('datum', odKdy),
        ]);
        if (r.error || f.error || p.error) { if (smiZapsat()) setVysledek(null); return; }
        radky = r.data ?? [];
        fasovani = f.data ?? [];
        prijmy = p.data ?? [];
        odpisy = o.error ? [] : o.data ?? [];
      }
      if (!smiZapsat()) return;
      setVysledek(spoctiUpozorneni(
        { zbozi: z.data ?? [], fasovani, prijmy, odpisy, uzaverky, radky, inventury },
        zav.error ? [] : zav.data ?? [],
        businessDateISO(),
      ));
    } catch {
      if (smiZapsat()) setVysledek(null);
    }
  }, [zacniNacteni]);

  // Chvíli po otevření plochy, ne při něm — odznak počká a první vykreslení ne.
  useEffect(() => {
    if (!povoleno) { setVysledek(null); return; }
    const t = setTimeout(() => { void nacti(); }, 800);
    return () => clearTimeout(t);
  }, [povoleno, nacti]);

  useRealtime(TABULKY, () => { if (povoleno) void nacti(); });

  return povoleno ? vysledek : null;
}
