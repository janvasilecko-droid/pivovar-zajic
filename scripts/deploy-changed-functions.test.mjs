// Který push nasadí kterou edge funkci — viz hlavička
// deploy-changed-functions.mjs, proč tenhle skript vznikl.
//
// Testuje se proti SKUTEČNÉ struktuře supabase/functions/ (ne proti umělé
// fixture) — je to jediný způsob, jak ověřit, že skript opravdu chytí
// dnešní sdílené závislosti, a ne jejich zastaralý opis v testu.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { vsechnySlugy, sdileneZavislosti, kNasazeniPodleZmen, zmeneneSoubory } from './deploy-changed-functions.mjs';

describe('vsechnySlugy', () => {
  it('najde whatsapp-auto-parse a nezahrne _shared', () => {
    const slugy = vsechnySlugy();
    expect(slugy).toContain('whatsapp-auto-parse');
    expect(slugy).not.toContain('_shared');
  });
});

describe('sdileneZavislosti', () => {
  it('whatsapp-auto-parse importuje beer-match', () => {
    const zav = sdileneZavislosti('whatsapp-auto-parse');
    expect(zav).toContain('beer-match.ts');
  });
});

describe('kNasazeniPodleZmen', () => {
  it('když se změní jen index.ts jedné funkce, nasadí se jen ona', () => {
    const k = kNasazeniPodleZmen(['supabase/functions/posli-push/index.ts']);
    expect(k).toEqual(['posli-push']);
  });

  it('když se změní sdílený modul, nasadí se všechny funkce, které ho importují', () => {
    // require-user.ts dnes importuje skoro všechno kromě auth-auto-login,
    // fix-order-dates, manage-users a whatsapp-webhook (viz jejich index.ts).
    const k = kNasazeniPodleZmen(['supabase/functions/_shared/require-user.ts']);
    expect(k).toContain('whatsapp-auto-parse');
    expect(k).toContain('posli-push');
    expect(k).not.toContain('auth-auto-login');
  });

  it('sdílený modul používaný jen jednou funkcí nasadí jen ji', () => {
    // beer-match.ts dnes používá jen whatsapp-auto-parse. Přesně tohle je
    // ten scénář, kvůli kterému skript vznikl 9. 9. 2026: oprava sedí
    // v ../_shared/x.ts, index.ts se vůbec nezmění, a bez týhle kontroly
    // by na nasazení nikdo nepomyslel.
    const k = kNasazeniPodleZmen(['supabase/functions/_shared/beer-match.ts']);
    expect(k).toEqual(['whatsapp-auto-parse']);
  });

  it('nesouvisející změna (web, migrace) nenasadí nic', () => {
    const k = kNasazeniPodleZmen(['src/screens/Orders.tsx', 'supabase/migrations/x.sql']);
    expect(k).toEqual([]);
  });

  it('`null` (diff se nedal spočítat) nasadí radši úplně všechno', () => {
    // Bezpečnější než tiše nenasadit nic — viz komentář u zmeneneSoubory.
    expect(kNasazeniPodleZmen(null)).toEqual(vsechnySlugy());
  });

  it('prázdný seznam změn nenasadí nic', () => {
    expect(kNasazeniPodleZmen([])).toEqual([]);
  });
});

describe('zmeneneSoubory', () => {
  it('mezi dvěma reálnými commity vrátí seznam souborů', () => {
    // HEAD~1..HEAD v tomhle repozitáři vždycky existuje (má víc než jeden
    // commit) — nezávisí na obsahu, jen na tom, že diff vůbec projde.
    const out = execFileSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();
    const zmeny = zmeneneSoubory(out, 'HEAD');
    expect(Array.isArray(zmeny)).toBe(true);
  });

  it('neplatný rozsah (např. samé nuly z force pushe) vrátí null, ne pád', () => {
    const zmeny = zmeneneSoubory('0000000000000000000000000000000000000000', 'HEAD');
    expect(zmeny).toBeNull();
  });
});
