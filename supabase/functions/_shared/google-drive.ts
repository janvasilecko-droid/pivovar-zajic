// 📥 Google Disk pro „Načíst z Excelu" — čistá vrstva (žádné Deno.serve, žádná
// síť), aby šla otestovat pod vitestem stejně jako beer-match.ts/place-match.ts.
// Síťové volání (OAuth token, seznam a stažení souboru) dělá index.ts, který
// tohle jen skládá dohromady.
//
// Bez závislostí schválně: `npm:jose` má jiný specifikátor pod Denem
// (`npm:jose@5`) než pod vitestem (`jose`) — týž soubor by nešel použít
// v obou. Web Crypto (`crypto.subtle`) je ale globální stejně v Denu i
// v Node/vitestu, takže RS256 podpis JWT jde napsat bez jediné závislosti.

export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type SouborNaDisku = { id: string; name: string; modifiedTime: string };

/** Který soubor appka hledá pro který import (viz ImportExcelScreen.tsx). */
export const HLEDANI_PODLE_SOUBORU: Record<string, string> = {
  stac_lahve: 'staceni lahve',
};

/** Bez diakritiky, bez rozdílu velikosti písmen — jméno souboru se občas mírně liší (rok na konci, mezery). */
function normalizujNazevSouboru(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Najde v seznamu souborů složky ten, který odpovídá požadovanému importu. Neznámé id nebo nenalezený soubor → null. */
export function najdiSoubor(soubory: SouborNaDisku[], souborId: string): SouborNaDisku | null {
  const hledej = HLEDANI_PODLE_SOUBORU[souborId];
  if (!hledej) return null;
  return soubory.find((s) => normalizujNazevSouboru(s.name).includes(hledej)) ?? null;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192; // po částech — spread/apply na desetitisíce bytů přetéká zásobník
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(s));
}

/** Stejné chunkované kódování, pro obsah staženého souboru (posílá se appce jako base64). */
export function zakodujBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** `-----BEGIN PRIVATE KEY-----...` (PKCS8, base64) → syrové bajty pro crypto.subtle.importKey. */
function pemDoBajtu(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * JWT podepsaný soukromým klíčem servisního účtu (RS256) — Google ho vymění
 * za access token (JWT-bearer flow, https://developers.google.com/identity/protocols/oauth2/service-account).
 * `tedSekund` je parametr (ne `Date.now()`), aby šel test spustit deterministicky.
 */
export async function vytvorPodepsanyJwt(klic: ServiceAccountKey, tedSekund: number, scope: string): Promise<string> {
  const aud = klic.token_uri || 'https://oauth2.googleapis.com/token';
  const hlavicka = { alg: 'RS256', typ: 'JWT' };
  const obsah = { iss: klic.client_email, scope, aud, iat: tedSekund, exp: tedSekund + 3600 };
  const zaklad = `${base64UrlEncodeString(JSON.stringify(hlavicka))}.${base64UrlEncodeString(JSON.stringify(obsah))}`;

  const privatniKlic = await crypto.subtle.importKey(
    'pkcs8',
    pemDoBajtu(klic.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const podpis = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privatniKlic, new TextEncoder().encode(zaklad));
  return `${zaklad}.${base64UrlEncodeBytes(new Uint8Array(podpis))}`;
}
