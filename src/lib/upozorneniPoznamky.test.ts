// 🔔 Upozornění u poznámky — viz hlavička upozorneniPoznamky.ts.
// Zadání z 19. 9. 2026: „když jsem zadal poznámku, tak ať k ní můžu přidat
// upozornění a jednodušeji to ukládat."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReminderItem } from './reminders';
import {
  RYCHLE_TERMINY, kdyCesky, nazevUpozorneni, proVstupDatumCas, terminKdy, upozorneniKPoznamce,
} from './upozorneniPoznamky';

const upozorneni = (zmeny: Partial<ReminderItem>): ReminderItem => ({
  id: 'r1',
  title: 'Etikety',
  note: 'Zítra ráno doveze Pavel nové etikety.',
  date_time: '2026-09-20T07:00',
  target_role: 'all',
  display_mode: 'both',
  created_by: 'jan@pivovar.cz',
  created_at: '2026-09-19T10:00:00Z',
  acknowledged_by: [],
  ...zmeny,
});

describe('nazevUpozorneni', () => {
  it('nadpis poznámky má přednost', () => {
    expect(nazevUpozorneni({ title: 'Etikety', body: 'cokoliv' })).toBe('Etikety');
  });

  it('bez nadpisu vezme první řádek textu — ne celý odstavec', () => {
    expect(nazevUpozorneni({ title: null, body: 'Doveze etikety\nA taky kartony' }))
      .toBe('Doveze etikety');
  });

  it('přeskočí prázdné řádky na začátku', () => {
    expect(nazevUpozorneni({ title: '  ', body: '\n\n  Doveze etikety' })).toBe('Doveze etikety');
  });

  it('dlouhý název se zkrátí, ať se vejde do notifikace', () => {
    expect(nazevUpozorneni({ title: 'x'.repeat(200), body: '' }).length).toBe(60);
  });

  it('z prázdné poznámky název neudělá', () => {
    expect(nazevUpozorneni({ title: null, body: '   ' })).toBe('');
  });
});

describe('upozorneniKPoznamce', () => {
  const poznamka = { title: 'Etikety', body: 'Zítra ráno doveze Pavel nové etikety.' };

  it('najde připomínku, která k poznámce patří', () => {
    expect(upozorneniKPoznamce(poznamka, [upozorneni({})])?.id).toBe('r1');
  });

  it('cizí připomínku nepřiřadí', () => {
    expect(upozorneniKPoznamce(poznamka, [upozorneni({ title: 'Něco jiného' })])).toBeNull();
    expect(upozorneniKPoznamce(poznamka, [upozorneni({ note: 'jiný text' })])).toBeNull();
  });

  it('odbavené se přeskakují — odznáček ukazuje, na co se čeká', () => {
    expect(upozorneniKPoznamce(poznamka, [upozorneni({ is_completed: true })])).toBeNull();
  });

  it('poznámka bez názvu i textu nemá co párovat', () => {
    expect(upozorneniKPoznamce({ title: null, body: '' }, [upozorneni({})])).toBeNull();
  });
});

describe('terminKdy', () => {
  const ted = new Date(2026, 8, 19, 9, 30); // pátek 19. 9. 2026, 9:30 místního času

  it('za hodinu', () => {
    expect(terminKdy('za-hodinu', ted)).toBe('2026-09-19T10:30');
  });

  it('zítra ráno je v sedm — začátek směny', () => {
    expect(terminKdy('zitra-rano', ted)).toBe('2026-09-20T07:00');
  });

  it('dnes odpoledne ve dvě', () => {
    expect(terminKdy('dnes-odpoledne', ted)).toBe('2026-09-19T14:00');
  });

  it('když už je po druhé, „dnes odpoledne" přeskočí na zítra', () => {
    const odpoledne = new Date(2026, 8, 19, 16, 0);
    expect(terminKdy('dnes-odpoledne', odpoledne)).toBe('2026-09-20T14:00');
  });

  it('za týden', () => {
    expect(terminKdy('za-tyden', ted)).toBe('2026-09-26T07:00');
  });

  it('všechny nabízené termíny jsou v budoucnu', () => {
    for (const t of RYCHLE_TERMINY) {
      expect(terminKdy(t.klic, ted) > proVstupDatumCas(ted), t.popis).toBe(true);
    }
  });
});

describe('proVstupDatumCas', () => {
  it('formátuje MÍSTNÍ čas — toISOString() by ujel o časové pásmo', () => {
    expect(proVstupDatumCas(new Date(2026, 0, 5, 7, 5))).toBe('2026-01-05T07:05');
  });
});

describe('kdyCesky', () => {
  it('nesmyslné datum vrátí tak, jak přišlo, místo „Invalid Date"', () => {
    expect(kdyCesky('nesmysl')).toBe('nesmysl');
  });
});

// Chování obrazovky, které se nedá spustit, ale dá se uhlídat ve zdroji.
describe('obrazovka Poznámky', () => {
  const ZDROJ = readFileSync('src/screens/Notes.tsx', 'utf8');

  it('upozornění se zakládá až po uložení poznámky', () => {
    // Opačné pořadí by při selhání zápisu nechalo připomínku na text, co nikde není.
    expect(ZDROJ.indexOf("from('notes').insert")).toBeLessThan(ZDROJ.indexOf('if (pridavamUpozorneni)'));
  });

  it('smazání poznámky smaže i její upozornění', () => {
    expect(ZDROJ).toMatch(/async function del[\s\S]{0,400}deleteReminder\(u\.id\)/);
  });

  it('úprava poznámky přepíše i připomínku, ať vazba drží', () => {
    expect(ZDROJ).toMatch(/async function saveEdit[\s\S]{0,700}from\('reminders'\)\.update/);
  });

  it('Ctrl+Enter ukládá v textu poznámky i při úpravě', () => {
    expect(ZDROJ).toMatch(/klavesyUlozeni\(add\)/);
    expect(ZDROJ).toMatch(/klavesyUlozeni\(\(\) => saveEdit\(n\.id\)/);
  });
});
