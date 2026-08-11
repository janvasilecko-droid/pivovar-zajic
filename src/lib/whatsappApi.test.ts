import { describe, it, expect, vi } from 'vitest';

// whatsappApi.ts importuje supabase klienta, který v testech není potřeba
// (a bez VITE_* proměnných by spadl), proto modul zamaskujeme.
vi.mock('./supabase', () => ({ supabase: {} }));

import { normSenderName, isSenderAllowed, type WhatsAppSender } from './whatsappApi';

describe('normSenderName', () => {
  it('odstraní diakritiku, okrajové mezery a převede na malá písmena', () => {
    expect(normSenderName('Objednávky pivovar')).toBe('objednavky pivovar');
    // Vnitřní mezery se neslučují — stejně jako webhook (normName) i DB (whatsapp_norm).
    expect(normSenderName('  OBJEDNÁVKY  PIVOVAR  ')).toBe('objednavky  pivovar');
    expect(normSenderName('Objednavky Pivovar')).toBe('objednavky pivovar');
  });

  it('vrátí prázdný řetězec pro null/undefined', () => {
    expect(normSenderName(null)).toBe('');
    expect(normSenderName(undefined)).toBe('');
    expect(normSenderName('   ')).toBe('');
  });
});

describe('isSenderAllowed', () => {
  const senders: WhatsAppSender[] = [{ id: '1', sender_name: 'Objednávky pivovar' }];

  it('prázdný whitelist = povoleno vše (zpětně kompatibilní)', () => {
    expect(isSenderAllowed([], 'Kdokoliv')).toBe(true);
    expect(isSenderAllowed([], null)).toBe(true);
  });

  it('povolí přesnou shodu názvu', () => {
    expect(isSenderAllowed(senders, 'Objednávky pivovar')).toBe(true);
  });

  it('povolí shodu bez diakritiky a velikosti písmen (jako webhook/DB)', () => {
    expect(isSenderAllowed(senders, 'objednavky pivovar')).toBe(true);
    expect(isSenderAllowed(senders, 'OBJEDNÁVKY PIVOVAR')).toBe(true);
    expect(isSenderAllowed(senders, 'Objednavky Pivovar')).toBe(true);
  });

  it('zakáže nepovoleného odesílatele a prázdný název', () => {
    expect(isSenderAllowed(senders, 'Jiná hospoda')).toBe(false);
    expect(isSenderAllowed(senders, '')).toBe(false);
    expect(isSenderAllowed(senders, null)).toBe(false);
  });
});
