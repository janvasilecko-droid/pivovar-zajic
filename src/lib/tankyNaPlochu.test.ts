// 🛢️ Co se o tanku ukáže nahoře na ploše (lib/tankyNaPlochu.ts).
import { describe, it, expect } from 'vitest';
import { sestavTankyNaPlochu, barvyPiv } from './tankyNaPlochu';

const PIVA = [
  { id: 'b12', name: '12° Světlá', beer_color: '#f4c430' },
  { id: 'btm', name: '12° Tmavá', beer_color: '#3b1f0a' },
];
const tank = (label: string, o: Record<string, unknown> = {}) => ({
  id: label, label, current_beer_id: null, current_volume_l: 0, initial_volume_l: null,
  status: 'empty', kegging_active: false, kegging_ended_at: null, ...o,
});

describe('sestavTankyNaPlochu', () => {
  // Stav z provozu 18. 11. 2026 (Tank 7: po louhu, 600 l zůstalo zapsaných).
  const tanky = [
    tank('Spilka 1'),
    tank('Tank 8', { current_beer_id: 'b12', current_volume_l: 4750, initial_volume_l: 6000, status: 'emptying', kegging_active: true }),
    tank('Tank 7', { current_beer_id: 'b12', current_volume_l: 600, status: 'cleaning', kegging_ended_at: '2026-11-03T13:20:00Z' }),
    tank('Tank 2', { status: 'sanitizing', kegging_ended_at: '2026-11-17T12:43:00Z' }),
    tank('Tank 3', { status: 'rinsing' }),
    tank('Tank 4', { kegging_ended_at: '2026-11-03T08:42:00Z' }),
    tank('Tank 5'),
    tank('Tank 10', { current_beer_id: 'btm', current_volume_l: 7500, status: 'active' }),
  ];
  const sanitace = [
    { tank_id: 'Tank 4', method: 'kyselina_dusicna', created_at: '2026-11-09T08:21:00Z' },
    { tank_id: 'Tank 5', method: 'kyselina_dusicna', created_at: '2026-09-02T09:49:00Z' },
    { tank_id: 'Tank 5', method: 'louh', created_at: '2026-09-02T09:50:00Z' },
  ];

  const radky = sestavTankyNaPlochu({ tanky, piva: PIVA, zapisySanitace: sanitace });
  const jeden = (label: string) => radky.find((r) => r.label === label)!;

  it('Spilka na ploše není, ležácké tanky jsou podle čísla (Tank 10 až za Tankem 8)', () => {
    expect(radky.map((r) => r.label)).toEqual(['Tank 10', 'Tank 2', 'Tank 3', 'Tank 4', 'Tank 5', 'Tank 7', 'Tank 8'].sort((a, b) => a.localeCompare(b, 'cs', { numeric: true })));
    expect(radky[radky.length - 1].label).toBe('Tank 10');
  });

  it('uzavřený, po oplachu a po louhu nesou svou fázi', () => {
    expect(jeden('Tank 2').faze).toBe('uzavreny');
    expect(jeden('Tank 3').faze).toBe('po_oplachu');
    expect(jeden('Tank 7').faze).toBe('po_louhu');
  });

  it('prázdný tank po kyselině je vysanitovaný, ostatní prázdné jen prázdné', () => {
    expect(jeden('Tank 4').faze).toBe('vysanitovany');
    expect(jeden('Tank 5').faze).toBeNull();
    expect(jeden('Tank 5').prazdny).toBe(true);
  });

  it('tank s pivem má pivo, barvu, litry a výstav a žádnou fázi; stáčející se je označený', () => {
    const t8 = jeden('Tank 8');
    expect(t8).toMatchObject({ pivo: '12° Světlá', barva: '#f4c430', litry: 4750, vystav: 6000, staci: true, prazdny: false, faze: null });
    expect(jeden('Tank 10')).toMatchObject({ pivo: '12° Tmavá', vystav: 7500, faze: null, staci: false });
  });

  it('bez zapsaného výstavu se bere nominál nádoby', () => {
    expect(jeden('Tank 10').vystav).toBeGreaterThan(0);
    expect(jeden('Tank 7').vystav).toBeGreaterThan(0);
  });

  it('bez deníku (chyba čtení) zůstane prázdný tank prázdný a nic nespadne', () => {
    const bez = sestavTankyNaPlochu({ tanky, piva: PIVA, zapisySanitace: [] });
    expect(bez.find((r) => r.label === 'Tank 4')!.faze).toBeNull();
    expect(bez.find((r) => r.label === 'Tank 2')!.faze).toBe('uzavreny');
  });
});

describe('barvyPiv', () => {
  it('klíč je id i jméno malými písmeny', () => {
    const b = barvyPiv(PIVA);
    expect(b.get('b12')).toBe('#f4c430');
    expect(b.get('12° světlá')).toBe('#f4c430');
  });
});
