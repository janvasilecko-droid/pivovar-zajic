// 📱 Druhá instalace aplikace („Zajíc 2“) s vlastním přihlášením.
// ---------------------------------------------------------------------------
// Majitel 18. 10. 2026: „dej mi možnost stáhnout na plochu aplikaci Zajíc 2,
// kde budu přihlášen pod jiným než admin účtem a můžu kontrolovat, jak se
// popisují ženy / běžní uživatelé“.
//
// Obě aplikace jsou na téže adrese, a tak by sdílely přihlášení (token leží
// v úložišti prohlížeče pod jedním klíčem). Druhá proto běží na vlastní cestě
// `/zajic2/` (vlastní manifest s vlastním rozsahem, takže se s hlavní nepřekrývá
// a jde nainstalovat samostatně) a přihlášení ukládá pod JINÝ klíč — dá se být
// v jedné jako správce a ve druhé jako běžný uživatel zároveň.
//
// Stejně je to s „AI sládkem“ (R39): samostatná aplikace s chatbotem na vlastní cestě
// `/sladek/` (vlastní manifest, ikona a přihlášení), která využívá data i funkce
// Pivovarské bible, ale nenese celou aplikaci pivovaru.
//
// Profil se pozná jednou při startu z adresy: cesta /zajic2/ (nebo starší ?profil=2),
// nebo /sladek/. Nic se nepamatuje v úložišti karty — jinak by hlavní aplikace v téže
// kartě po návštěvě druhé aplikace omylem převzala její profil.
/** Povolené jméno profilu: pár písmen/číslic, ať se nedá podstrčit cokoli do klíče úložiště. */
export function platnyProfil(v: unknown): string {
  return typeof v === 'string' && /^[a-z0-9]{1,8}$/i.test(v) ? v.toLowerCase() : '';
}

/** Druhá aplikace žije na vlastní cestě /zajic2/ (vlastní rozsah = vlastní instalace, žádné překrývání s hlavní). */
export const CESTA_DRUHE_APLIKACE = '/zajic2/';

/** Samostatná aplikace AI sládek (R39): vlastní cesta = vlastní rozsah = vlastní instalace. */
export const CESTA_SLADEK = '/sladek/';

function zjistiProfil(): string {
  try {
    if (/^\/zajic2(\/|$)/.test(window.location.pathname)) return '2';
    if (/^\/sladek(\/|$)/.test(window.location.pathname)) return 'sladek';
    return platnyProfil(new URLSearchParams(window.location.search).get('profil'));
  } catch {
    return '';
  }
}

/** '' = běžná aplikace, '2' = Zajíc 2, 'sladek' = samostatná aplikace AI sládek. */
export const PROFIL_APLIKACE: string = typeof window === 'undefined' ? '' : zjistiProfil();

export const JE_DRUHA_APLIKACE = PROFIL_APLIKACE === '2';

/** Běží samostatná aplikace AI sládek (adresa /sladek/)? */
export const JE_SLADEK = PROFIL_APLIKACE === 'sladek';

/** Cesta, na které aplikace běží — sem se vrací přihlášení odkazem z e-mailu i přes Google. */
export function cestaAplikace(profil: string = PROFIL_APLIKACE): string {
  if (profil === '2') return CESTA_DRUHE_APLIKACE;
  if (profil === 'sladek') return CESTA_SLADEK;
  return '/';
}

/** Klíč úložiště pro přihlášení Supabase; `undefined` = výchozí klíč běžné aplikace. */
export function klicUlozistePrihlaseni(profil: string = PROFIL_APLIKACE): string | undefined {
  return profil ? `sb-zajic-${profil}-auth-token` : undefined;
}

/** Adresa, na které se druhá aplikace instaluje z prohlížeče. */
export function adresaDruheAplikace(origin: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origin}${CESTA_DRUHE_APLIKACE}`;
}

/** Adresa, na které se AI sládek instaluje z prohlížeče. */
export function adresaSladek(origin: string = typeof window === 'undefined' ? '' : window.location.origin): string {
  return `${origin}${CESTA_SLADEK}`;
}
