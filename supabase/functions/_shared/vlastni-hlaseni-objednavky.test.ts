// Z provozu 24. 9. 2026: „pokud se obednavka odelslal z aplikace ,tak ji
// uz neparsuj ,je udele kratky hlaseni obednavka co je obednano ,ale
// nechci klikat ,at se omylem nenacte 2x ,uz se mi to stalo ,ze ve vice
// obednavek sem potvrdil i obednavku vytvorenou aplikaci a pak sem ji
// tam mel 2x."
import { describe, it, expect } from 'vitest';
import { jeVlastniHlaseniObjednavky, ZNACKA_VLASTNIHO_HLASENI } from './vlastni-hlaseni-objednavky';

const HLASENI = `${ZNACKA_VLASTNIHO_HLASENI}\nOdběratel: Lužec\nMnožství: 2× KEG 30l   Pivo: 12° Světlé`;

describe('jeVlastniHlaseniObjednavky', () => {
  it('pozná vlastní hlášení appky (from_me + značka) a nezamění ho se zákaznickou objednávkou', () => {
    expect(jeVlastniHlaseniObjednavky(HLASENI, true)).toBe(true);
  });

  it('bez fromMe se netýká — i kdyby zákazník náhodou napsal stejný text', () => {
    expect(jeVlastniHlaseniObjednavky(HLASENI, false)).toBe(false);
  });

  it('obyčejná objednávka od majitele z vlastního telefonu (fromMe, ale bez značky) se parsuje normálně', () => {
    expect(jeVlastniHlaseniObjednavky('Lužec 2x30 12°', true)).toBe(false);
  });

  it('mezery na začátku textu značku neschovají', () => {
    expect(jeVlastniHlaseniObjednavky(`   ${HLASENI}`, true)).toBe(true);
  });

  it('prázdný nebo chybějící text není vlastní hlášení', () => {
    expect(jeVlastniHlaseniObjednavky('', true)).toBe(false);
    expect(jeVlastniHlaseniObjednavky(null, true)).toBe(false);
    expect(jeVlastniHlaseniObjednavky(undefined, true)).toBe(false);
  });
});
