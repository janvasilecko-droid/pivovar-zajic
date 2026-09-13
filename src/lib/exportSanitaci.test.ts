import { describe, it, expect } from 'vitest';
import { tabulkaDeniku, popisSloupce } from './exportSanitaci';

describe('export sanitačních deníků', () => {
  it('prázdný deník do sešitu nejde', () => {
    expect(tabulkaDeniku([])).toBeNull();
  });

  it('datum a provedl jdou dopředu, technické sloupce ven, řazeno podle data', () => {
    const t = tabulkaDeniku([
      { id: 'x', created_at: 'y', note: 'druhý', performed_by: 'Petr', sanitation_date: '2026-09-02', proc_rinse_water: true },
      { id: 'z', created_at: 'y', note: 'první', performed_by: 'Jana', sanitation_date: '2026-09-01', proc_rinse_water: false },
    ])!;
    expect(t[0]).toEqual(['Datum', 'Provedl', 'Poznámka', 'rinse water']);
    expect(t[1]).toEqual(['2026-09-01', 'Jana', 'první', 'ne']);
    expect(t[2]).toEqual(['2026-09-02', 'Petr', 'druhý', 'ano']);
  });

  it('sloupec, který má jen část řádků, se neztratí', () => {
    const t = tabulkaDeniku([
      { sanitation_date: '2026-09-01' },
      { sanitation_date: '2026-09-02', mismatch_note: 'netěsní ventil' },
    ])!;
    expect(t[0]).toContain('Neshoda');
    expect(t[2]).toContain('netěsní ventil');
  });

  it('JSON kroky se zapíšou jako text, ne [object Object]', () => {
    const t = tabulkaDeniku([{ sanitation_date: '2026-09-01', steps: { louh: true } }])!;
    expect(t[1][1]).toBe('{"louh":true}');
  });

  it('neznámý sloupec dostane čitelný technický popisek', () => {
    expect(popisSloupce('proc_month_visual_clean')).toBe('month visual clean');
  });
});
