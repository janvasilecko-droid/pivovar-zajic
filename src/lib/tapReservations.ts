import { supabase } from './supabase';
import type { TapEquipment, TapReservation } from '../screens/VycepyScreen';

export function autoReserveTapIfNeeded(customerName: string, dateStr: string, noteText?: string, orderId?: string): void {
  if (!noteText) return;
  const isVycepMentioned = /\b(\+\s*)?vycep\b|\bvycepy\b|\bvycepu\b|\bpujcit\s*vycep\b/i.test(noteText);
  if (!isVycepMentioned) return;

  try {
    const savedTaps = localStorage.getItem('vycepy_equipment_v1');
    const taps: TapEquipment[] = savedTaps ? JSON.parse(savedTaps) : [
      { id: 't1', name: 'Výčep #1 — Lindr Pygmy 25', tap_type: 'jednokohout', status: 'clean' },
      { id: 't2', name: 'Výčep #2 — Kontaktní Dvojkohout 50', tap_type: 'dvojkohout', status: 'clean' },
      { id: 't3', name: 'Výčep #3 — Trojkohout Master', tap_type: 'trojkohout', status: 'clean' },
    ];
    const savedRes = localStorage.getItem('vycepy_reservations_v1');
    const resList: TapReservation[] = savedRes ? JSON.parse(savedRes) : [];

    // Check if reservation already exists for this orderId
    if (orderId && resList.some((r) => r.order_id === orderId)) return;

    // Find available tap for this date or assign default tap #1
    const availableTap = taps.find((t) => !resList.some((r) => r.tap_id === t.id && r.date_from <= dateStr && r.date_to >= dateStr)) ?? taps[0];

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
