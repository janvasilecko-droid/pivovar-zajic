// 🛡️ Čerstvá místní změna se nesmí přepsat ozvěnou vlastního zápisu.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „ten poznámkový blok nefunguje, nepřidá se na plochu
// do ty dlaždice." Appka poslouchá realtime změny `profiles` a při každé z nich
// přepisovala místní poznámky tím, co přišlo ze serveru. Jenže ty události
// chodí i jako OZVĚNA vlastních zápisů — a přidání poznámky se do cloudu píše
// odloženě (debounce 250 ms), kdežto připnutí dlaždice na plochu hned. Ozvěna
// toho druhého zápisu dorazila ještě se STARÝM seznamem poznámek a čerstvou
// poznámku smazala z úložiště i z dlaždice.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cloudSmiPrepsat, queueHomeLayoutPatch, zapomenOchranu } from './profileSync';

describe('cloudSmiPrepsat', () => {
  beforeEach(() => { zapomenOchranu(); vi.useRealTimers(); });

  it('pole, do kterého se nesahalo, cloud přepsat smí', () => {
    expect(cloudSmiPrepsat('notes')).toBe(true);
  });

  it('hned po zapsání poznámky cloud přepsat NESMÍ — ozvěna nese starší data', () => {
    queueHomeLayoutPatch({ notes: [{ id: 'n1' }] });
    expect(cloudSmiPrepsat('notes')).toBe(false);
  });

  it('ochrana platí jen pro dotčené pole, ne pro celý profil', () => {
    queueHomeLayoutPatch({ notes: [] });
    expect(cloudSmiPrepsat('notes')).toBe(false);
    expect(cloudSmiPrepsat('countdowns')).toBe(true);
    expect(cloudSmiPrepsat('pages')).toBe(true);
  });

  it('po uplynutí ochranné lhůty je cloud zase pán', () => {
    vi.useFakeTimers();
    try {
      queueHomeLayoutPatch({ notes: [] });
      expect(cloudSmiPrepsat('notes')).toBe(false);
      // Debounce (250 ms) + ochranné okno (10 s) a ještě chvíle navíc.
      vi.advanceTimersByTime(11_000);
      vi.setSystemTime(Date.now() + 11_000);
      expect(cloudSmiPrepsat('notes')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('zdroj pravdy o poznámkách', () => {
  it('auth přebírá z cloudu jen to, co není rozepsané', async () => {
    const zdroj = (await import('node:fs')).readFileSync('src/lib/auth.tsx', 'utf8');
    expect(zdroj).toMatch(/cloudSmiPrepsat\('notes'\)/);
    expect(zdroj).toMatch(/cloudSmiPrepsat\('countdowns'\)/);
    // Přepsání natvrdo, bez ptaní, je přesně ta chyba.
    expect(zdroj).not.toMatch(/if \(hl\?\.notes && Array\.isArray\(hl\.notes\)\) \{\s*saveHomeNotes\(hl\.notes\);/);
  });

  it('převzetí z cloudu se neposílá rovnou zpátky do cloudu', async () => {
    const zdroj = (await import('node:fs')).readFileSync('src/lib/auth.tsx', 'utf8');
    expect(zdroj).toMatch(/saveHomeNotes\(hl\.notes, true\)/);
  });
});

// ── Upozornění i v poznámkovém bloku na ploše ─────────────────────────────
// Zadání z 19. 9. 2026: „plus tam přidej možnost upozornění."
describe('upozornění v poznámkovém bloku', () => {
  const ZDROJ = () => require('node:fs').readFileSync('src/components/HomeNotesModal.tsx', 'utf8');

  it('u nové poznámky jde zapnout upozornění', () => {
    expect(ZDROJ()).toMatch(/chciUpozorneni/);
    expect(ZDROJ()).toMatch(/<UpozorneniForm/);
  });

  it('u už napsané poznámky je zvoneček', () => {
    expect(ZDROJ()).toMatch(/Přidat upozornění/);
  });

  it('upozornění se zakládá až po uložení poznámky', () => {
    // Obráceně by při selhání zápisu zbyla připomínka na text, co nikde není.
    const z = ZDROJ();
    expect(z.indexOf('addHomeNote(newText')).toBeLessThan(z.indexOf('if (chciUpozorneni)'));
  });

  it('smazání poznámky zruší i její upozornění', () => {
    expect(ZDROJ()).toMatch(/deleteHomeNote\(note\.id\)[\s\S]{0,80}zrusUpozorneni\(maUpozorneni\.id\)/);
  });

  it('páruje se stejnou funkcí jako obrazovka Poznámky — ne vlastní kopií', () => {
    expect(ZDROJ()).toMatch(/upozorneniKPoznamce\(/);
  });
});
