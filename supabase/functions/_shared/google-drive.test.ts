// Google Disk pro import z Excelu — čistá vrstva. Podpis JWT se ověřuje
// skutečným RS256 (lokálně vygenerovaný testovací klíč, žádná síť/Google).
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { najdiSoubor, vytvorPodepsanyJwt, zakodujBase64, type SouborNaDisku } from './google-drive';

describe('najdiSoubor', () => {
  const SOUBORY: SouborNaDisku[] = [
    { id: '1', name: 'Zápis fasování.xlsx', modifiedTime: '2026-01-01' },
    { id: '2', name: 'Zápis stáčení KEG.xlsx', modifiedTime: '2026-01-01' },
    { id: '3', name: 'Zápis stáčení lahve 25.xlsx', modifiedTime: '2026-01-01' },
    { id: '4', name: 'Zápis výdej obj.xlsx', modifiedTime: '2026-01-01' },
  ];

  it('najde soubor podle jména bez ohledu na diakritiku a rok na konci', () => {
    expect(najdiSoubor(SOUBORY, 'stac_lahve')).toEqual(SOUBORY[2]);
  });

  it('nespojí stáčení lahví se stáčením KEG (podobný začátek jména)', () => {
    const r = najdiSoubor(SOUBORY, 'stac_lahve');
    expect(r?.id).not.toBe('2');
  });

  it('neznámé id importu vrátí null, nehádá nejbližší shodu', () => {
    expect(najdiSoubor(SOUBORY, 'neco_neznameho')).toBeNull();
  });

  it('soubor, co ve složce chybí, vrátí null', () => {
    expect(najdiSoubor([SOUBORY[0]], 'stac_lahve')).toBeNull();
  });
});

describe('zakodujBase64', () => {
  it('zakóduje a jde zpátky rozkódovat (round-trip), i přes hranici chunku', () => {
    const bytes = new Uint8Array(20000).map((_, i) => i % 256);
    const b64 = zakodujBase64(bytes);
    const zpet = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(zpet).toEqual(bytes);
  });
});

describe('vytvorPodepsanyJwt', () => {
  it('vytvoří JWT podepsaný RS256, který jde ověřit odpovídajícím veřejným klíčem', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const ted = 1_800_000_000;
    const jwt = await vytvorPodepsanyJwt(
      { client_email: 'pivovar-import@test.iam.gserviceaccount.com', private_key: privateKey as unknown as string },
      ted,
      'https://www.googleapis.com/auth/drive.readonly',
    );

    const [hlavickaB64, obsahB64, podpisB64] = jwt.split('.');
    expect(hlavickaB64).toBeTruthy();
    expect(obsahB64).toBeTruthy();
    expect(podpisB64).toBeTruthy();

    // Hlavička a obsah — ověří se přesně to, co Google od JWT-bearer flow čeká.
    const b64UrlDecode = (s: string) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(b64UrlDecode(hlavickaB64)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const obsah = b64UrlDecode(obsahB64);
    expect(obsah).toMatchObject({
      iss: 'pivovar-import@test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ted,
      exp: ted + 3600,
    });

    // Skutečné RS256 ověření podpisu odpovídajícím veřejným klíčem — potvrdí,
    // že appka podepisuje přesně to, co Google očekává (base64url hlavička.obsah).
    const { createVerify } = await import('node:crypto');
    const zaklad = `${hlavickaB64}.${obsahB64}`;
    const podpisBuf = Buffer.from(podpisB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const overovac = createVerify('RSA-SHA256');
    overovac.update(zaklad);
    expect(overovac.verify(publicKey, podpisBuf)).toBe(true);
  });

  it('respektuje vlastní token_uri z klíče (jiné prostředí/proxy), místo natvrdo Google', async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const jwt = await vytvorPodepsanyJwt(
      { client_email: 'x@test.iam.gserviceaccount.com', private_key: privateKey as unknown as string, token_uri: 'https://vlastni.example/token' },
      1000,
      'scope',
    );
    const obsah = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    expect(obsah.aud).toBe('https://vlastni.example/token');
  });
});
