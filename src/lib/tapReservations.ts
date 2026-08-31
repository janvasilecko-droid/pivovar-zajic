import { nactiRezervace, nactiVycepy, ulozRezervaci } from './vycepyData';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';

/**
 * All synonyms that indicate a tap (výčep) is being requested in an order note.
 * Covers: výčep, jednokohout, dvojkohout, trojkohout, pipa, jednopipa, dvojpipa,
 * trojpipa, kohout, pípa, etc.
 */
const TAP_SYNONYMS = [
  'vycep', 'vycepy', 'vycepu', 'vycepem', 'vycepni', 'vycepu', 'vycepcima',
  'jednokohout', 'dvojkohout', 'trojkohout', 'ctyrkohout', 'sestikohout',
  'pipa', 'pipu', 'pipy', 'pipom', 'pipam',
  'jednopipa', 'dvojpipa', 'trojpipa', 'sestipipa',
  'kohout', 'kohouty', 'kohoutek', 'kohoutku',
  'chlazeni', 'chladak',
  'narazec', 'narazece',
];

/**
 * Detect whether the note text mentions a tap (výčep) using any of the synonyms.
 */
export function isTapMentioned(noteText?: string): boolean {
  if (!noteText) return false;
  const text = noteText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return TAP_SYNONYMS.some((syn) => {
    return new RegExp(`(^|[^a-z0-9])${syn}([^a-z0-9]|$)`, 'i').test(text);
  });
}

export type TapTypeHint = 'jednokohout' | 'dvojkohout' | 'trojkohout' | 'sestikohout' | null;

/**
 * Detect the requested tap type from the note text (e.g. "jednokohout", "dvojkohout",
 * "trojpipa", "dvojpipa", "sestikohout", etc.). Returns null if no specific type is mentioned.
 */
export function detectTapType(noteText?: string): TapTypeHint {
  if (!noteText) return null;
  const text = noteText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const has = (re: RegExp) => re.test(text);

  // Šestikohout / šestipipa
  if (has(/\bsest(pipa|kohout|vycep|pipy)\b/)) return 'sestikohout';
  // Trojkohout / trojpipa
  if (has(/\btroj(pipa|kohout|vycep|pipy)\b/)) return 'trojkohout';
  // Dvojkohout / dvojpipa
  if (has(/\bdvoj(pipa|kohout|vycep|pipy)\b/)) return 'dvojkohout';
  // Jednokohout / jednopipa
  if (has(/\bjedno(pipa|kohout|vycep|pipy)\b/)) return 'jednokohout';
  // Generic "pipa" / "kohout" / "výčep" — no specific type
  return null;
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
 */
export async function autoReserveTapIfNeeded(
  customerName: string, dateStr: string, noteText?: string, orderId?: string,
): Promise<void> {
  if (!isTapMentioned(noteText)) return;

  try {
    const [taps, resList] = await Promise.all([nactiVycepy(), nactiRezervace()]);
    // Bez založených výčepů není co rezervovat. Dřív se tu vyráběly čtyři
    // ukázkové — a ty pak vypadaly jako skutečné vybavení pivovaru.
    if (taps.length === 0) return;

    if (orderId && resList.some((r) => r.order_id === orderId)) return;

    const jeVolny = (t: TapEquipment) =>
      !resList.some((r) => r.tap_id === t.id && r.date_from <= dateStr && r.date_to >= dateStr);

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

    await ulozRezervaci(newReservation);
  } catch (e) {
    console.warn('Auto tap reservation warning:', e);
  }
}
