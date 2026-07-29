import { Package } from './supabase';

// Váha obalu (prázdného + piva), v kg.
// 1 l piva = 1 kg. K tomu hmotnost obalu:
//   KEG 50l + 12 kg, KEG 30l + 10 kg, KEG 20/15/10 l + 7,5 kg.
//   PET 1,5l = 1,5 kg (celkem obal + pivo za 1,5 l),
//   ostatní lahve = objem v litrech (1 l = 1 kg), obal zanedbáme.
//
// Pro KEG je "váha obalu" táry + pivo uvnitř: volume_l * 1 + tara_kg.
// Pro PET 1,5l dáváme celkovou váhu 1,5 kg (pivo + obal dohromady).
// Pro ostatní lahve platí 1 l = 1 kg, tj. volume_l kg.
export function packageWeightKg(pkg: Package): number {
  if (pkg.kind === 'keg') {
    const vol = Number(pkg.volume_l);
    const tara = vol >= 50 ? 12 : vol >= 30 ? 10 : 7.5;
    return vol + tara;
  }
  // bottle
  const vol = Number(pkg.volume_l);
  if (vol >= 1.5) return 1.5; // PET 1,5l = 1,5 kg celkem
  return vol; // 1l = 1kg, 0,5l = 0,5 kg, 0,33l = 0,33 kg
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
