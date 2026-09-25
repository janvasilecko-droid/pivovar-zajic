// 🔔 Upozornění u poznámky — viz hlavička upozorneniPoznamky.ts.
// Zadání z 19. 9. 2026: „když jsem zadal poznámku, tak ať k ní můžu přidat
// upozornění a jednodušeji to ukládat."
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReminderItem } from './reminders';
import {
  RYCHLE_TERMINY, komuCesky, kdyCesky, nazevUpozorneni, prijemciZNastaveni, proVstupDatumCas,
  rozdelMaily, terminKdy, terminZNastaveni, upozorneniKPoznamce, vychoziNastaveni, zobrazeniCesky,
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

// ⚠️ POZNÁMKY JSOU JEDNY. Bývaly tři — samostatná obrazovka nad tabulkou
// `notes`, blok na ploše a vzkazy směně. Ta obrazovka měla vlastní „Uložit",
// jenže zapisovala do úložiště, které blok na hlavní straně nikdy nečetl.
// Z provozu 19. 9. 2026: „poznámka se má objevit v tom bloku na hlavní straně,
// ale když dám uložit, nic se nestane."
describe('poznámka má v aplikaci jedno místo', () => {
  it('osiřelá obrazovka Poznámky je pryč', () => {
    expect(() => readFileSync('src/screens/Notes.tsx', 'utf8')).toThrow();
  });

  it('všechny cesty vedou na blok poznámek na ploše', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toMatch(/p === 'notes' \|\| p === 'reminders'/);
    expect(app).toMatch(/requestOpenHomeNotes\(\)/);
  });

  it('záložka Poznámky v plánování už není', () => {
    const tabs = readFileSync('src/screens/PlanningTabbed.tsx', 'utf8');
    expect(tabs).not.toMatch(/id: 'notes'/);
  });
});

// ── Plné nastavení upozornění (po zrušení samostatné obrazovky) ────────────
describe('prijemciZNastaveni', () => {
  const zaklad = vychoziNastaveni(new Date(2026, 8, 19, 9, 30));

  it('všem v pivovaru', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'all' }))
      .toEqual({ target_role: 'all', target_emails: [] });
  });

  it('podle pozice', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'role', role: 'sladek' }))
      .toEqual({ target_role: 'sladek', target_emails: [] });
  });

  it('konkrétním lidem', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'users', uzivatele: ['a@b.cz'] }))
      .toEqual({ target_role: 'custom', target_emails: ['a@b.cz'] });
  });

  it('bez vybraného člověka to neprojde — upozornění bez příjemce nesmí vzniknout', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'users', uzivatele: [] }))
      .toEqual({ chyba: 'Vyberte aspoň jednoho kolegu.' });
  });

  it('bez e-mailu to neprojde', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'custom', vlastniMaily: '  ' }))
      .toEqual({ chyba: 'Napište aspoň jeden e-mail.' });
  });

  it('e-maily jdou oddělit čárkou, středníkem i mezerou', () => {
    expect(prijemciZNastaveni({ ...zaklad, komu: 'custom', vlastniMaily: 'a@b.cz, c@d.cz; e@f.cz' }))
      .toEqual({ target_role: 'custom', target_emails: ['a@b.cz', 'c@d.cz', 'e@f.cz'] });
  });
});

describe('rozdelMaily', () => {
  it('prázdné kusy zahodí', () => {
    expect(rozdelMaily(' a@b.cz ,, ; c@d.cz ')).toEqual(['a@b.cz', 'c@d.cz']);
  });
});

describe('terminZNastaveni', () => {
  const ted = new Date(2026, 8, 19, 9, 30);

  it('naplánované vrací zadaný čas', () => {
    expect(terminZNastaveni({ ...vychoziNastaveni(ted), kdy: '2026-09-20T07:00' }, ted))
      .toBe('2026-09-20T07:00');
  });

  it('„hned teď" nečeká na termín', () => {
    expect(terminZNastaveni({ ...vychoziNastaveni(ted), ihned: true }, ted)).toBe(ted.toISOString());
  });
});

describe('komuCesky', () => {
  it('bez e-mailů ukáže roli', () => {
    expect(komuCesky('all')).toBe('Všichni');
    expect(komuCesky('sladek')).toBe('sladek');
  });

  it('e-maily se vypíšou, dlouhý seznam se zkrátí', () => {
    expect(komuCesky('custom', ['a@b.cz'])).toBe('1 člověku (a@b.cz)');
    expect(komuCesky('custom', ['a@b.cz', 'c@d.cz', 'e@f.cz'])).toBe('3 lidem (a@b.cz, c@d.cz…)');
  });
});

describe('zobrazeniCesky', () => {
  it('pojmenuje všechny tři způsoby', () => {
    expect(zobrazeniCesky('both')).toBe('Okno + Push');
    expect(zobrazeniCesky('login_modal')).toBe('Okno po přihlášení');
    expect(zobrazeniCesky('desktop_push')).toBe('Push na ploše');
  });
});

// Samostatná obrazovka „Upozornění" zanikla — hlídáme, že se nevrátí zadní
// cestou a že se cesta k ní nikde neutrhla.
describe('upozornění žijí jen v Poznámkách', () => {
  const nemelBySeVratit = 'src/screens/RemindersScreen.tsx';

  it('stará obrazovka je pryč', () => {
    expect(() => readFileSync(nemelBySeVratit, 'utf8')).toThrow();
  });

  it('v záložkách plánování není ani „Upozornění", ani „Poznámky"', () => {
    // Obojí žije v bloku poznámek na ploše — viz komentář u setPage v App.tsx.
    const tabs = readFileSync('src/screens/PlanningTabbed.tsx', 'utf8');
    expect(tabs).not.toMatch(/id: 'reminders'/);
    expect(tabs).not.toMatch(/id: 'notes'/);
  });

  it('dlaždice „Připomínky" je pryč z menu', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(layout).not.toMatch(/id: 'reminders', label:/);
  });

  it('staré odkazy na „reminders" vedou na blok poznámek, ne do prázdna', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toMatch(/p === 'notes' \|\| p === 'reminders'/);
  });

  it('upozornění z notifikace otevře Poznámky', () => {
    const manager = readFileSync('src/components/ReminderNotificationManager.tsx', 'utf8');
    expect(manager).toMatch(/stranka: 'notes'/);
  });

  it('upozornění bez poznámky se pořád ukazují — nesmí zmizet se zrušenou obrazovkou', () => {
    const modal = readFileSync('src/components/HomeNotesModal.tsx', 'utf8');
    expect(modal).toMatch(/upozorneniBezPoznamky/);
  });
});
