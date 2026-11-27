// ✅ Závoz v minulosti = zavezeno (29. 9. 2026: „vše ber jako zavezeno — pokud není zavezeno, je buď smazáno,
// nebo ve Vrácení"). Totéž dělá databáze každou noc (migrace 20261231190000); appka jednou denně hned při
// otevření Rozvozu, ať se nečeká na noc. Chyba (třeba bez práv) nic neblokuje.
//
// 📵 Na tenhle zápis se NEČEKÁ (27. 11. 2026). Dřív stál před načtením seznamu — a na slabém signálu (server
// neodpovídá) tak každé otevření Rozvozu čekalo 10 s navíc, než zápis vyprší; do fronty se řadit nedá (filtr
// „starší než dnes"). Seznam se proto ukáže hned, a jen když zápis opravdu něco změnil, tiše se přenačte.
import { supabase } from './supabase';
import { uloz } from './uloziste';

/** Den, kdy se to naposledy povedlo — víckrát za den se nezapisuje. */
export const KLIC_MINULE_ZAVEZENO = 'pivovar_minule_zavezeno';

let bezi = false;

/**
 * Pustí zápis na pozadí a hned se vrátí. `poZmene` se zavolá, jen když se některá objednávka opravdu změnila.
 * Dokud jeden zápis běží, další se nepouští (obrazovka se přenačítá častěji, než zápis na slabém signálu doběhne).
 */
export function oznacMinuleZavezene(dnes: string, poZmene: () => void): void {
  let uzDnes = false;
  try { uzDnes = localStorage.getItem(KLIC_MINULE_ZAVEZENO) === dnes; } catch { /* bez úložiště se zkusí pokaždé */ }
  if (uzDnes || bezi) return;
  bezi = true;
  const konec = () => { bezi = false; };
  void Promise.resolve(
    supabase.from('orders').update({ is_delivered: true })
      .eq('is_delivered', false).neq('status', 'storno').lt('delivery_date', dnes).select('id'),
  ).then(({ data, error }) => {
    konec();
    if (error) return;
    uloz(KLIC_MINULE_ZAVEZENO, dnes);
    if (data && data.length > 0) poZmene();
  }, konec);
}

/** Jen pro testy. */
export function zapomenMinuleZavezenoProTesty(): void {
  bezi = false;
}
