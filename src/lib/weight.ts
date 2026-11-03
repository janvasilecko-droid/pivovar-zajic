import { Package } from './supabase';

// Váha obalu (prázdného + piva), v kg.
// 1 l piva = 1 kg. K tomu hmotnost obalu:
//   KEG 50l + 12 kg, KEG 30l + 10 kg, KEG 20/15/10 l + 7,5 kg.
//   PET 1,5l = 1,5 kg (celkem obal + pivo za 1,5 l),
//   skleněné lahve 0,5 l i 0,33 l = 0,55 kg za kus (majitel, 3. 11. 2026),
//   lahev 1 l = 1 kg.
//
// Pro KEG je "váha obalu" táry + pivo uvnitř: volume_l * 1 + tara_kg.
// Pro PET 1,5l dáváme celkovou váhu 1,5 kg (pivo + obal dohromady).
// Pro lahve do 0,5 l platí pevně 0,55 kg za kus, pro ostatní 1 l = 1 kg.
/** Skleněná lahev 0,5 l i 0,33 l — stejná váha za kus. */
export const SKLENENA_LAHEV_KG = 0.55;

export function packageWeightKg(pkg: Package): number {
  if (pkg.kind === 'keg') {
    const vol = Number(pkg.volume_l);
    const tara = vol >= 50 ? 12 : vol >= 30 ? 10 : 7.5;
    return vol + tara;
  }
  // bottle
  const vol = Number(pkg.volume_l);
  if (vol >= 1.5) return 1.5; // PET 1,5l = 1,5 kg celkem
  if (vol < 1) return SKLENENA_LAHEV_KG; // 0,5 l i 0,33 l
  return vol; // 1l = 1kg
}

export function itemWeightKg(pkg: Package | undefined, quantity: number): number {
  if (!pkg) return 0;
  return packageWeightKg(pkg) * Number(quantity);
}

export function orderWeightKg(
  items: { package_id: string | null; quantity: number }[],
  packages: Package[]
): number {
  return items.reduce((sum, i) => {
    const pkg = packages.find((p) => p.id === i.package_id);
    return sum + itemWeightKg(pkg, Number(i.quantity));
  }, 0);
}

export function fmtKg(kg: number): string {
  return kg.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
}
