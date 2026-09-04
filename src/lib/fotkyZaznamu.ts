/**
 * 📷 Fotka k zápisu.
 *
 * K odpisu („zkažené, rozbitá láhev"), k rozbitému sudu i k závozu se
 * hodí fotka — jinak je jediným dokladem věta v poznámce a po měsíci si
 * nikdo nevzpomene, jak to vypadalo. Zmenšování obrázků appka umí
 * (`obrazek.ts`), chybělo úložiště a políčko u zápisu.
 *
 * Fotky jdou do Supabase Storage (bucket `zaznam-fotky`, NEVEŘEJNÝ) a do
 * tabulky `zaznam_fotky` se ukládá jen cesta. Do databáze se obrázek
 * nedává: řádky se čtou po tisících a base64 fotka by se stahovala do
 * telefonu při každém načtení obrazovky.
 *
 * V tomhle modulu je jen to, co se dá spočítat a otestovat — cesta,
 * kontrola typu a velikosti. Nahrávání samotné je v `fotkyZaznamuApi.ts`.
 */

/** Bucket v Supabase Storage. Neveřejný — čte se přes podepsané URL. */
export const BUCKET_FOTEK = 'zaznam-fotky';

/** K čemu fotka patří. Klíč se ukládá do databáze, tak se nemění. */
export const TYPY_ZAZNAMU = {
  odpis: 'Odpis',
  objednavka: 'Objednávka',
  sud: 'Sud',
  zavoz: 'Závoz',
} as const;

export type TypZaznamu = keyof typeof TYPY_ZAZNAMU;

/** Co se dá nahrát. Jiné typy Storage přijme, ale prohlížeč je nezobrazí. */
export const PODPOROVANE_TYPY = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Strop velikosti po zmenšení. Fotka z telefonu má 4–8 MB, po zmenšení
 * kolem 200 kB; 3 MB je hranice, za kterou už je něco špatně (nezmenšilo
 * se, nebo to není fotka).
 */
export const MAX_BAJTU_FOTKY = 3_000_000;

const PRIPONY: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function jePodporovanyTyp(mime: string | null | undefined): boolean {
  return PODPOROVANE_TYPY.includes((mime ?? '').toLowerCase());
}

export function jeMocVelka(bajtu: number, max = MAX_BAJTU_FOTKY): boolean {
  return bajtu > max;
}

/**
 * Cesta souboru v bucketu: `typ/zaznam/čas-nahodne.pripona`.
 *
 * Náhodná část je schválně: dvě fotky pořízené ve stejnou vteřinu (série
 * z telefonu) by se jinak přepsaly a druhá by tu první tiše smazala.
 * Jméno z telefonu se nepoužívá vůbec — bývá v něm diakritika, mezery i
 * lomítka a Storage by z toho udělal podadresáře.
 */
export function cestaFotky(
  typ: TypZaznamu,
  zaznamId: string,
  mime: string,
  nyni: Date = new Date(),
  nahodne: string = Math.random().toString(36).slice(2, 8),
): string {
  const pripona = PRIPONY[(mime ?? '').toLowerCase()] ?? 'jpg';
  const cas = nyni.toISOString().replace(/[:.]/g, '-');
  const id = (zaznamId || 'bez-zaznamu').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${typ}/${id || 'bez-zaznamu'}/${cas}-${nahodne}.${pripona}`;
}

/**
 * Proč fotka neprošla — nebo null, když je v pořádku. Vrací se věta pro
 * člověka, ne kód: „nepodařilo se" bez důvodu vede k tomu, že to zkusí
 * pětkrát znovu se stejnou fotkou.
 */
export function chybaFotky(mime: string | null | undefined, bajtu: number): string | null {
  if (!jePodporovanyTyp(mime)) return 'Tohle není fotka (jde nahrát JPG, PNG nebo WEBP).';
  if (jeMocVelka(bajtu)) return 'Fotka je i po zmenšení moc velká — zkus ji vyfotit znovu.';
  return null;
}
