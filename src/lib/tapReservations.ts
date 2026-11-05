import { nactiRezervace, nactiVycepy, ulozRezervaci } from './vycepyData';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';
import { jeZminenVycep, typVycepu, type TypVycepu } from '../../supabase/functions/_shared/vycep-z-textu';
import { chyba as chybaOznam, varovani } from './toast';

/**
 * Zmínka o výčepu (pípa, kohout, výčep, chlazení, narážeč) v poznámce objednávky.
 * Pravidla jsou na jednom místě společném se čtením zprávy na serveru a v appce
 * i s úkoly k závozu: supabase/functions/_shared/vycep-z-textu.ts.
 */
export function isTapMentioned(noteText?: string): boolean {
  return jeZminenVycep(noteText);
}

export type TapTypeHint = TypVycepu | null;

/**
 * Požadovaný druh výčepu z poznámky („jednokohout", „pipa dvoukohout",
 * „šestikohout"…). `null`, když druh není řečen nebo je nejednoznačný.
 */
export function detectTapType(noteText?: string): TapTypeHint {
  return typVycepu(noteText);
}

/**
 * Je výčep v CELÉM rozsahu od–do volný? Počítá se překryv rozsahů, ne jen
 * krajní dny: rezervace 5.–6. blokuje výčep i pro zájemce o 4.–7. (okno
 * rezervace dřív kontrolovalo jen první a poslední den, takže ten uprostřed
 * prošel). `krome` = rezervace, která se nepočítá — vlastní rezervace téže
 * objednávky, když se jen upravuje.
 */
export function jeVycepVolny(
  tapId: string, od: string, doDne: string, rezervace: TapReservation[], krome?: string,
): boolean {
  return !rezervace.some((r) =>
    r.id !== krome && r.tap_id === tapId && od <= r.date_to && doDne >= r.date_from);
}

/**
 * Zamluví výčep, když ho poznámka objednávky zmiňuje.
 *
 * Zapisuje do DATABÁZE (dřív jen do localStorage, takže rezervace vzniklá na
 * jednom zařízení nikde jinde neexistovala — a na zařízení, kde si nikdo
 * výčepy nezaložil, se nestala vůbec).
 *
 * Dvojí rezervaci téže objednávky hlídá unikátní index na `order_id`, ne jen
 * kontrola níž: ukládá se při každém uložení objednávky a dvě uložení hned po
 * sobě by se přes samotnou kontrolu prosmýkla.
 *
 * Když se zápis nepovede (nemáte právo na Výčepy, vypadl signál…), ozve se to
 * hláškou — dřív se rezervace potichu nevytvořila a nikdo se to nedozvěděl.
 */
export async function autoReserveTapIfNeeded(
  customerName: string, dateStr: string, noteText?: string, orderId?: string,
): Promise<void> {
  if (!isTapMentioned(noteText)) return;

  try {
    const [taps, resList] = await Promise.all([nactiVycepy(), nactiRezervace()]);
    // Bez založených výčepů není co rezervovat. Dřív se tu vyráběly čtyři
    // ukázkové — a ty pak vypadaly jako skutečné vybavení pivovaru. Mlčet se tu
    // ale nesmí: poznámka „+ výčep“ vypadá, že se výčep zamluvil, a nezamluvil.
    if (taps.length === 0) {
      varovani('Výčep k objednávce se nezarezervoval — v evidenci nejsou žádné výčepy. Založíte je v sekci Výčepy.');
      return;
    }

    if (orderId && resList.some((r) => r.order_id === orderId)) return;

    const jeVolny = (t: TapEquipment) => jeVycepVolny(t.id, dateStr, dateStr, resList);

    // Přednost má výčep požadovaného typu; jinak první volný, jinak první.
    const typeHint = detectTapType(noteText);
    const availableTap =
      (typeHint ? taps.find((t) => t.tap_type === typeHint && jeVolny(t)) : undefined)
      ?? taps.find(jeVolny)
      ?? taps[0];

    const newReservation: TapReservation = {
      id: crypto.randomUUID(),
      tap_id: availableTap.id,
      tap_name: availableTap.name,
      date_from: dateStr,
      date_to: dateStr,
      customer_name: customerName || 'Zákazník z objednávky',
      note: `🍺 Automaticky zarezervováno z poznámky (+ výčep): ${noteText}`,
      order_id: orderId,
    };

    const chyba = await ulozRezervaci(newReservation);
    if (chyba) {
      // Druhé uložení téže objednávky těsně po prvním zamítl unikátní index na
      // `order_id` — rezervace už je, o nic nejde.
      if (orderId && (await nactiRezervace()).some((r) => r.order_id === orderId)) return;
      console.warn('Auto tap reservation warning:', chyba);
      chybaOznam('Výčep se nepodařilo zarezervovat: ' + chyba);
    }
  } catch (e) {
    console.warn('Auto tap reservation warning:', e);
    chybaOznam('Výčep se nepodařilo zarezervovat.');
  }
}

/**
 * Rezervace potvrzená dřív, než objednávka vznikla („Půjčení výčepu" ve
 * formuláři), se po uložení objednávky naváže na ni — podle ID rezervace, kterou
 * okno vrátilo. Dřív se „nejnovější rezervace bez objednávky" hledala jen v
 * kopii v prohlížeči a do databáze se vazba nezapsala vůbec.
 *
 * Vrací text chyby, nebo `null`.
 */
export async function propojRezervaciSObjednavkou(rezervaceId: string, orderId: string): Promise<string | null> {
  const rezervace = await nactiRezervace();
  const r = rezervace.find((x) => x.id === rezervaceId);
  if (!r) return 'Rezervace výčepu už neexistuje.';
  if (r.order_id === orderId) return null;
  return ulozRezervaci({ ...r, order_id: orderId });
}
