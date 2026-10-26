/** Porovnání čísel verzí „2.9“ a „2.10“. Nečíselná část se bere jako 0. */

function casti(verze: string): number[] {
  return verze.split('.').map((c) => {
    const n = parseInt(c, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** `true`, když `verze` je nižší než `aktualni` (telefon je pozadu). */
export function jeStarsiVerze(verze: string, aktualni: string): boolean {
  const a = casti(verze);
  const b = casti(aktualni);
  const delka = Math.max(a.length, b.length);
  for (let i = 0; i < delka; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d < 0) return true;
    if (d > 0) return false;
  }
  return false;
}
