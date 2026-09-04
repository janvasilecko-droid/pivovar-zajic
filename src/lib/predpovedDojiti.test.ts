import { describe, it, expect } from 'vitest';
import {
  predpovedDojiti, obvyklaDenniSpotreba, VYDEJOVE_POHYBY,
  MIN_DNU_SE_SPOTREBOU, PRAH_DOCHAZI,
} from './predpovedDojiti';
import type { Movement, MovementKind } from './stockLedger';

const DNES = '2026-09-03';

function pohyb(date: string, qty: number, kind: MovementKind = 'zavoz'): Movement {
  return { date, beer_id: 'b1', package_id: 'p1', qty, kind };
}

/** Výdej ve `dnu` po sobě jdoucích dnech, každý den `kusu`. */
function vydejPoDnech(kusu: number, dnu: number, kind: MovementKind = 'zavoz'): Movement[] {
  const out: Movement[] = [];
  for (let i = 1; i <= dnu; i += 1) {
    const d = new Date(`${DNES}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(pohyb(d.toISOString().slice(0, 10), -kusu, kind));
  }
  return out;
}

describe('obvyklaDenniSpotreba', () => {
  it('sečte výdej po dnech a vezme medián', () => {
    const r = obvyklaDenniSpotreba(vydejPoDnech(10, 6), DNES);
    expect(r.denne).toBe(10);
    expect(r.dnuSeSpotrebou).toBe(6);
  });

  it('PŘÍJEM se nepočítá — jinak by čerstvě stočené pivo „vydrželo navždy"', () => {
    const pohyby = [...vydejPoDnech(10, 6), pohyb('2026-09-02', 500, 'kegovani')];
    expect(obvyklaDenniSpotreba(pohyby, DNES).denne).toBe(10);
  });

  it('jeden festival medián nerozhodí (proto ne průměr)', () => {
    // Průměr by z 10 ks/den udělal skoro 60 a aplikace by hlásila
    // docházející pivo každý týden. Po třetím falešném poplachu si toho
    // nikdo nevšimne.
    const pohyby = [...vydejPoDnech(10, 6), pohyb('2026-09-01', -300, 'akce')];
    const r = obvyklaDenniSpotreba(pohyby, DNES);
    expect(r.denne).toBeLessThanOrEqual(15);
  });

  it('počítají se jen dny, kdy se opravdu vydávalo', () => {
    // Pivo vydávané dvakrát týdně by s nulovými dny vyšlo na nulu za den
    // — tedy „vydrží navždy" u piva, které za deset dní dojde.
    const pohyby = [pohyb('2026-09-01', -20), pohyb('2026-08-28', -20), pohyb('2026-08-25', -20), pohyb('2026-08-21', -20)];
    const r = obvyklaDenniSpotreba(pohyby, DNES);
    expect(r.denne).toBe(20);
    expect(r.dnuSeSpotrebou).toBe(4);
  });

  it('starší pohyby než okno se ignorují', () => {
    const stary = [pohyb('2026-01-01', -500)];
    expect(obvyklaDenniSpotreba(stary, DNES).dnuSeSpotrebou).toBe(0);
  });

  it('všechny výdejové druhy se počítají', () => {
    for (const kind of VYDEJOVE_POHYBY) {
      const r = obvyklaDenniSpotreba(vydejPoDnech(5, 5, kind), DNES);
      expect(r.denne, `druh ${kind}`).toBe(5);
    }
  });
});

describe('predpovedDojiti', () => {
  it('spočítá dny ze stavu a obvyklé spotřeby', () => {
    const p = predpovedDojiti(100, vydejPoDnech(10, 6), DNES);
    expect(p.dni).toBe(10);
    expect(p.stav).toBe('staci');
    expect(p.popis).toContain('10');
  });

  it('do sedmi dnů hlásí, že dochází', () => {
    const p = predpovedDojiti(10 * PRAH_DOCHAZI, vydejPoDnech(10, 6), DNES);
    expect(p.stav).toBe('dochazi');
  });

  it('prázdný sklad je prázdný, ne „vydrží 0 dní při nula spotřebě"', () => {
    expect(predpovedDojiti(0, vydejPoDnech(10, 6), DNES).stav).toBe('prazdno');
    // Záporný stav (evidence nesedí — platná odpověď skladové knihy) taky.
    expect(predpovedDojiti(-5, vydejPoDnech(10, 6), DNES).stav).toBe('prazdno');
  });

  it('málo pohybů = ŘEKNE, že neví — nehádá', () => {
    // Vymyšlené číslo je horší než žádné: podle „vydrží 9 dní" se plánuje
    // várka.
    const p = predpovedDojiti(100, vydejPoDnech(10, MIN_DNU_SE_SPOTREBOU - 1), DNES);
    expect(p.stav).toBe('nevim');
    expect(p.dni).toBeNull();
  });

  it('žádné pohyby vůbec = neví', () => {
    const p = predpovedDojiti(100, [], DNES);
    expect(p.stav).toBe('nevim');
    expect(p.dni).toBeNull();
  });

  it('skloňuje česky', () => {
    expect(predpovedDojiti(10, vydejPoDnech(10, 6), DNES).popis).toContain('1 den');
    expect(predpovedDojiti(30, vydejPoDnech(10, 6), DNES).popis).toContain('3 dny');
    expect(predpovedDojiti(80, vydejPoDnech(10, 6), DNES).popis).toContain('8 dní');
  });
});
