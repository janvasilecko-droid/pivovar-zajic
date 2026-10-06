// Z provozu 24. 9. 2026: „pokud se obednavka odelslal z aplikace ,tak ji
// uz neparsuj ,je udele kratky hlaseni obednavka co je obednano ,ale
// nechci klikat ,at se omylem nenacte 2x ,uz se mi to stalo ,ze ve vice
// obednavek sem potvrdil i obednavku vytvorenou aplikaci a pak sem ji
// tam mel 2x."
import { describe, it, expect } from 'vitest';
import { jeVlastniHlaseniObjednavky, ZNACKA_VLASTNIHO_HLASENI, ZNACKA_Z_APLIKACE, oznacZpravuZAplikace } from './vlastni-hlaseni-objednavky';

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

// 6. 10. 2026: „když si pošlu z aplikace objednávku na WhatsApp, ať se mi
// tam nezobrazuje, ať to program pozná, že jde o objednávku odeslanou od něj."
describe('zpráva odeslaná z appky tlačítkem Sdílet (neviditelná značka)', () => {
  const SDILENO = oznacZpravuZAplikace('Mates Rybárna\n\n• *2x* 50l 11° Světlá');

  it('značka je na konci prvního řádku a viditelný text se nemění', () => {
    expect(SDILENO.split('\n')[0]).toBe(`Mates Rybárna${ZNACKA_Z_APLIKACE}`);
    expect(SDILENO.replaceAll(ZNACKA_Z_APLIKACE, '')).toBe('Mates Rybárna\n\n• *2x* 50l 11° Světlá');
    expect(SDILENO.trim()).toBe(SDILENO); // trim() ji neořízne
  });

  it('pozná se od majitele i z jiného telefonu (bez from_me)', () => {
    expect(jeVlastniHlaseniObjednavky(SDILENO, true)).toBe(true);
    expect(jeVlastniHlaseniObjednavky(SDILENO, false)).toBe(true);
  });

  it('stejný text bez značky (napsaný ručně) se dál zpracuje jako objednávka', () => {
    expect(jeVlastniHlaseniObjednavky('Mates Rybárna\n\n• *2x* 50l 11° Světlá', true)).toBe(false);
  });

  it('jednořádková zpráva dostane značku na konec, druhé označení nic nepřidá', () => {
    expect(oznacZpravuZAplikace('Lužec 2x30')).toBe(`Lužec 2x30${ZNACKA_Z_APLIKACE}`);
    expect(oznacZpravuZAplikace(SDILENO)).toBe(SDILENO);
  });
});
