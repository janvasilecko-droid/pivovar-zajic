// Odškrtnutá poznámka zmizí sama do 24 hodin a nenechá po sobě nic.
import { describe, expect, it } from 'vitest';
import { SMAZAT_PO_MS, uklidStareOdskrtnute, type HomeNote } from './homeNotes';

const TED = Date.parse('2026-09-01T12:00:00.000Z');
const pred = (ms: number) => new Date(TED - ms).toISOString();

const n = (over: Partial<HomeNote>): HomeNote => ({
  id: 'x', text: 'poznámka', completed: false, createdAt: pred(0), ...over,
});

describe('uklidStareOdskrtnute', () => {
  it('neodškrtnuté nechá být, ať jsou jakkoli staré', () => {
    const stara = n({ id: 'a', createdAt: pred(30 * SMAZAT_PO_MS) });
    const { notes, zmeneno } = uklidStareOdskrtnute([stara], TED);
    expect(notes).toEqual([stara]);
    expect(zmeneno).toBe(false);
  });

  it('čerstvě odškrtnutá zůstane — jde vzít zpět', () => {
    const cerstva = n({ id: 'b', completed: true, completedAt: pred(60 * 60 * 1000) });
    expect(uklidStareOdskrtnute([cerstva], TED).notes).toHaveLength(1);
  });

  it('odškrtnutá před víc než 24 h zmizí', () => {
    const stara = n({ id: 'c', completed: true, completedAt: pred(SMAZAT_PO_MS + 1000) });
    const { notes, zmeneno } = uklidStareOdskrtnute([stara], TED);
    expect(notes).toHaveLength(0);
    expect(zmeneno).toBe(true);
  });

  it('přesně na hranici 24 h už mizí', () => {
    const hranice = n({ id: 'd', completed: true, completedAt: pred(SMAZAT_PO_MS) });
    expect(uklidStareOdskrtnute([hranice], TED).notes).toHaveLength(0);
  });

  it('odškrtnutá BEZ času dostane razítko a zmizí až za den', () => {
    // Poznámky odškrtnuté před zavedením 24h mazání. Smazat je hned by
    // uživateli sebralo něco, co mu na nástěnce leželo.
    const bezCasu = n({ id: 'e', completed: true });
    const { notes, zmeneno } = uklidStareOdskrtnute([bezCasu], TED);
    expect(notes).toHaveLength(1);
    expect(notes[0].completedAt).toBe(new Date(TED).toISOString());
    expect(zmeneno).toBe(true);

    // O den později už je pryč.
    expect(uklidStareOdskrtnute(notes, TED + SMAZAT_PO_MS).notes).toHaveLength(0);
  });

  it('poškozený čas se bere jako „nevím kdy" a orazítkuje se', () => {
    const rozbita = n({ id: 'f', completed: true, completedAt: 'nesmysl' });
    const { notes } = uklidStareOdskrtnute([rozbita], TED);
    expect(notes).toHaveLength(1);
    expect(notes[0].completedAt).toBe(new Date(TED).toISOString());
  });

  it('bez změny nehlásí změnu — jinak by se úložiště přepisovalo při každém čtení', () => {
    const seznam = [
      n({ id: 'g' }),
      n({ id: 'h', completed: true, completedAt: pred(1000) }),
    ];
    expect(uklidStareOdskrtnute(seznam, TED).zmeneno).toBe(false);
  });

  it('smazané nezůstanou nikde — vrací se čistý seznam, ne archiv', () => {
    const seznam = [
      n({ id: 'i' }),
      n({ id: 'j', completed: true, completedAt: pred(SMAZAT_PO_MS * 3) }),
      n({ id: 'k', completed: true, completedAt: pred(SMAZAT_PO_MS * 2) }),
    ];
    const { notes } = uklidStareOdskrtnute(seznam, TED);
    expect(notes.map((x) => x.id)).toEqual(['i']);
  });
});
