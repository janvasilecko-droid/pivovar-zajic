// 🔐 Šifrování denní zálohy.
//
// Repozitář je veřejný, a záloha v něm tak byla čitelná komukoli (objednávky,
// odběratelé, jména z podpisů). Od 13. 9. 2026 se do gitu ukládá jen
// zašifrovaná: AES-256-GCM, klíč z hesla přes scrypt, každý soubor s vlastní
// solí a IV. GCM zároveň hlídá, že soubor nikdo nepozměnil — špatné heslo
// i poškozený soubor skončí chybou, ne tichým nesmyslem.
//
// Heslo je secret ZALOHA_HESLO v GitHubu (pro zálohu) a v .env (pro obnovu).
// BEZ HESLA SE ZÁLOHA NEDÁ OBNOVIT — musí být uložené i mimo GitHub.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const FORMAT = 'pivovar-zaloha';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function klic(heslo, sul, parametry = SCRYPT) {
  if (!heslo || heslo.length < 12) {
    throw new Error('Heslo zálohy (ZALOHA_HESLO) chybí nebo je kratší než 12 znaků.');
  }
  return scryptSync(heslo, sul, 32, parametry);
}

/** SHA-256 textu — do manifestu, ať se pozná, jestli se data od minula změnila. */
export function otisk(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Text → obálka (JSON řetězec), která se ukládá do souboru .json.enc. */
export function zasifruj(text, heslo) {
  const sul = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', klic(heslo, sul), iv);
  const data = Buffer.concat([cipher.update(gzipSync(Buffer.from(text, 'utf8'))), cipher.final()]);
  return JSON.stringify({
    format: FORMAT,
    v: 1,
    kdf: 'scrypt',
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
    sul: sul.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  }) + '\n';
}

/** Obálka (JSON řetězec) → původní text. Špatné heslo nebo poškozený soubor vyhodí chybu. */
export function desifruj(obalkaText, heslo) {
  let o;
  try { o = JSON.parse(obalkaText); } catch { throw new Error('Soubor zálohy není platná obálka (nejde přečíst JSON).'); }
  if (o?.format !== FORMAT || o.v !== 1) throw new Error('Neznámý formát zálohy.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    klic(heslo, Buffer.from(o.sul, 'base64'), { N: o.N, r: o.r, p: o.p, maxmem: SCRYPT.maxmem }),
    Buffer.from(o.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(o.tag, 'base64'));
  let zip;
  try {
    zip = Buffer.concat([decipher.update(Buffer.from(o.data, 'base64')), decipher.final()]);
  } catch {
    throw new Error('Zálohu nejde rozšifrovat — špatné heslo, nebo je soubor poškozený.');
  }
  return gunzipSync(zip).toString('utf8');
}
