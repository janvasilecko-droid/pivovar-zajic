import { supabase } from './supabase';
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
  'chlazeni', 'chladak', 'stojan', 'pivnice', 'hospoda', 'bar',
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

export function autoReserveTapIfNeeded(customerName: string, dateStr: string, noteText?: string, orderId?: string): void {
  if (!isTapMentioned(noteText)) return;

  try {
    const savedTaps = localStorage.getItem('vycepy_equipment_v1');
    const taps: TapEquipment[] = savedTaps ? JSON.parse(savedTaps) : [
      { id: 't1', name: 'Výčep #1 — Lindr Pygmy 25', tap_type: 'jednokohout', status: 'clean' },
      { id: 't2', name: 'Výčep #2 — Kontaktní Dvojkohout 50', tap_type: 'dvojkohout', status: 'clean' },
      { id: 't3', name: 'Výčep #3 — Trojkohout Master', tap_type: 'trojkohout', status: 'clean' },
      { id: 't4', name: 'Výčep #4 — Šestikohout na akce', tap_type: 'sestikohout', status: 'clean' },
    ];
    const savedRes = localStorage.getItem('vycepy_reservations_v1');
    const resList: TapReservation[] = savedRes ? JSON.parse(savedRes) : [];

    // Check if reservation already exists for this orderId
    if (orderId && resList.some((r) => r.order_id === orderId)) return;

    // Prefer a tap matching the requested type, otherwise first available
    const typeHint = detectTapType(noteText);
    let availableTap = taps.find((t) =>
      typeHint && t.tap_type === typeHint &&
      !resList.some((r) => r.tap_id === t.id && r.date_from <= dateStr && r.date_to >= dateStr)
    );
    if (!availableTap) {
      availableTap = taps.find((t) => !resList.some((r) => r.tap_id === t.id && r.date_from <= dateStr && r.date_to >= dateStr)) ?? taps[0];
    }

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

    const nextResList = [newReservation, ...resList];
    localStorage.setItem('vycepy_reservations_v1', JSON.stringify(nextResList));
  } catch (e) {
    console.warn('Auto tap reservation warning:', e);
  }
}
