// Z provozu 28. 9. 2026: „já jako admin určím, komu se měsíční úklid zobrazí."
import { describe, it, expect } from 'vitest';
import { vidiMesicniUklid, getUserPermissions } from './permissions';

describe('vidiMesicniUklid', () => {
  it('bez nastavení se zobrazuje (dřívější chování)', () => {
    expect(vidiMesicniUklid(undefined)).toBe(true);
    expect(vidiMesicniUklid(null)).toBe(true);
    expect(vidiMesicniUklid({ cellar: { view: true, edit: true } })).toBe(true);
  });

  it('admin ho může vypnout i zapnout', () => {
    expect(vidiMesicniUklid({ mesicni_uklid: false })).toBe(false);
    expect(vidiMesicniUklid({ mesicni_uklid: true })).toBe(true);
  });

  it('nastavení přežije načtení práv ze serveru', () => {
    const prava = getUserPermissions('u1', { mesicni_uklid: false });
    expect(prava.mesicni_uklid).toBe(false);
    expect(vidiMesicniUklid(prava)).toBe(false);
  });
});
