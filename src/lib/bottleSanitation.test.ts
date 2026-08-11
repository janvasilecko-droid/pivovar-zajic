import { describe, it, expect } from 'vitest';
import { mapChecklistToBottleSan, BOTTLE_SAN_FIELDS } from './bottleSanitation';

describe('mapChecklistToBottleSan (promítnutí checklistu do deníku lahví)', () => {
  it('konec stáčení — denní proplach vodou a úklid prostor', () => {
    const res = mapChecklistToBottleSan([
      { id: 'end_2', text: 'Po posledním stočeném pivu důkladný proplach pivních cest čistou vodou' },
      { id: 'end_9', text: 'Oplach čistou vodou povrch stáčeček ze všech stran' },
      { id: 'end_17', text: 'Oplach podlah (pozor hlavně na nohy od stáčecí linky)' },
    ]);
    expect(res.louh).toBe(false);
    expect(res.proplach_vodou).toBe(true);
    expect(res.cela_cesta_na_louhu).toBe(false);
    expect(res.prostory).toBe(true);
  });

  it('konec stáčení — úklid louhem a kartáčem započítá louh', () => {
    const res = mapChecklistToBottleSan([
      { id: 'end_6', text: 'Sundat vrchní kryt stáčečky a zkontrolovat, zda je vnitřek čistý (pokud ne, vyčistit louhem a kartáčem) a vypláchnout čistou vodou' },
    ]);
    expect(res.louh).toBe(true);
    expect(res.proplach_vodou).toBe(true);
    expect(res.cela_cesta_na_louhu).toBe(false);
  });

  it('měsíční údržba — louh na celé cestě i vzduchové, bez proplachu vodou', () => {
    const res = mapChecklistToBottleSan([
      { id: 'month_10', text: 'Do sudu připravit 1% louh, natlakovat VZDUCHEM, projet louhem nápojové i vzduchové cesty a nechat 24 hodin' },
      { id: 'month_11', text: 'Propláchnout veškeré cesty, včetně odtokové na pivo, a nechat do nejbližšího stáčení na stáčečky na louhu' },
      { id: 'month_3', text: 'Důkladně vyčistit podlahy (kolem stáčecí linky, za kanálem, u sodovky)' },
    ]);
    expect(res.louh).toBe(true);
    expect(res.cela_cesta_na_louhu).toBe(true);
    expect(res.proplach_vodou).toBe(false);
    expect(res.prostory).toBe(true);
  });

  it('prázdný checklist → nic není splněno', () => {
    const res = mapChecklistToBottleSan([]);
    expect(res).toEqual({ louh: false, proplach_vodou: false, cela_cesta_na_louhu: false, prostory: false });
  });

  it('deník lahví má povinné položky: louh, proplach vodou, cesta na louhu, prostory', () => {
    const ids = BOTTLE_SAN_FIELDS.map((f) => f.id);
    expect(ids).toContain('louh');
    expect(ids).toContain('proplach_vodou');
    expect(ids).toContain('cela_cesta_na_louhu');
    expect(ids).toContain('prostory');
    expect(BOTTLE_SAN_FIELDS.find((f) => f.id === 'louh')?.label.toLowerCase()).toContain('louh');
  });
});
