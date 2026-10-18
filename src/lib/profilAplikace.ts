// 📱 Druhá instalace aplikace („Zajíc 2“) s vlastním přihlášením.
// ---------------------------------------------------------------------------
// Majitel 18. 10. 2026: „dej mi možnost stáhnout na plochu aplikaci Zajíc 2,
// kde budu přihlášen pod jiným než admin účtem a můžu kontrolovat, jak se
// popisují ženy / běžní uživatelé“.
//
// Obě aplikace jsou na téže adrese, a tak by sdílely přihlášení (token leží
// v úložišti prohlížeče pod jedním klíčem). Druhá se proto spouští s `?profil=2`
// (start_url jejího manifestu) a přihlášení ukládá pod JINÝ klíč — dá se být
// v jedné jako správce a ve druhé jako běžný uživatel zároveň.
//
// Profil se pozná jednou při startu a pamatuje si ho karta (sessionStorage),
// kdyby se při procházení z adresy `?profil=` ztratilo.
const KLIC = 'zajic_profil';

/** Povolené jméno profilu: pár písmen/číslic, ať se nedá podstrčit cokoli do klíče úložiště. */
export function platnyProfil(v: unknown): string {
  return typeof v === 'string' && /^[a-z0-9]{1,8}$/i.test(v) ? v.toLowerCase() : '';
}

function zjistiProfil(): string {
  try {
    const z = platnyProfil(new URLSearchParams(window.location.search).get('profil'));
    if (z) {
      window.sessionStorage.setItem(KLIC, z);
      return z;
    }
    return platnyProfil(window.sessionStorage.getItem(KLIC));
  } catch {
    return '';
  }
}

/** '' = běžná aplikace, '2' = Zajíc 2. */
export const PROFIL_APLIKACE: string = typeof window === 'undefined' ? '' : zjistiProfil();

export const JE_DRUHA_APLIKACE = PROFIL_APLIKACE === '2';

/** Klíč úložiště pro přihlášení Supabase; `undefined` = výchozí klíč běžné aplikace. */
export function klicUlozistePrihlaseni(profil: string = PROFIL_APLIKACE): string | undefined {
  return profil ? `sb-zajic-${profil}-auth-token` : undefined;
}

/** Adresa, na které se druhá aplikace instaluje z prohlížeče. */
export function adresaDruheAplikace(origin: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origin}/?profil=2`;
}
