// Adresa aplikace — malý samostatný modul, ať se kvůli ní do hlavního kusu
// nenatahuje celý návod (lib/pozvanka.ts ho importuje a je v něm hodně textu).

/** Adresa ostrého provozu — když se pozvánka skládá mimo prohlížeč. */
export const ODKAZ_APLIKACE = 'https://zajic-pivovar.pages.dev/';

export function odkazAplikace(): string {
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:/.test(window.location.origin)) {
    return `${window.location.origin}/`;
  }
  return ODKAZ_APLIKACE;
}
