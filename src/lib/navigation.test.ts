import { describe, it, expect } from 'vitest';
import { buildCustomerDeliveryWhatsAppText } from './navigation';

// Obal hned za množstvím, ne za pivem — stejná konvence jako u sdílení
// objednávky/zavážecího listu na WhatsApp (viz whatsapp.test.ts).
describe('buildCustomerDeliveryWhatsAppText — pořadí obal hned za množstvím', () => {
  it('obal je mezi množstvím a pivem', () => {
    const text = buildCustomerDeliveryWhatsAppText('Hospoda U Zajíce', [
      { beer_name: 'Jantar', package_label: '1 L', quantity: 4 },
    ]);
    expect(text).toContain('4x 1 L Jantar');
  });

  it('chybějící obal a pivo mají záložní text', () => {
    const text = buildCustomerDeliveryWhatsAppText('Hospoda', [
      { beer_name: null, package_label: null, quantity: 2 },
    ]);
    expect(text).toContain('2x obal Pivo');
  });
});
