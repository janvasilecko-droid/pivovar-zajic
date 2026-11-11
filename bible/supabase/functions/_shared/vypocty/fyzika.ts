// 🧪 Fyzikální vztahy výpočetního modulu bible (etapa 6) — sdílené výpočty
// katalogu 6a (katalog.ts) i 6b (katalog-6b.ts). Bez závislostí.

// --- Hustota a extrakt ---

/** °P z relativní hustoty 20/20 °C — kubická aproximace tabulek extraktu. */
export function platoZHustoty(sg: number): number {
  return -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
}

/** Relativní hustota 20/20 °C z °P — přesná inverze téhož polynomu (zpět vyjde stejné °P). */
export function hustotaZPlato(p: number): number {
  let dole = 0.95;
  let nahore = 1.25;
  for (let i = 0; i < 100; i += 1) {
    const stred = (dole + nahore) / 2;
    if (platoZHustoty(stred) < p) dole = stred;
    else nahore = stred;
  }
  return (dole + nahore) / 2;
}

/** Hustota vody při 20 °C (kg/L). */
export const HUSTOTA_VODY_20 = 0.9982;
/** Relativní hustota etanolu 20/20 °C (ABW → ABV). */
export const HUSTOTA_ETANOLU_REL = 0.7907;
/** Hmotnost 1 objemu CO₂ v litru (g/L, CO₂ při 0 °C a 101,325 kPa). */
export const G_NA_OBJEM_CO2 = 1.976;

// --- CO₂ ---

/** Objemy CO₂ v rovnováze při teplotě (°C) a přetlaku (bar). */
export function objemyCo2(tC: number, pretlakBar: number): number {
  const psi = pretlakBar * 14.5038;
  const tF = tC * 9 / 5 + 32;
  return (psi + 14.695) * (0.01821 + 0.090115 * Math.exp(-(tF - 32) / 43.11)) - 0.003342;
}

