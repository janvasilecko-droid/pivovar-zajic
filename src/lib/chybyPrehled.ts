// 🧾 Třídění zapsaných chyb aplikace.
//
// Chybník ukazoval všechno v jedné hromadě a bez rozlišení, takže tam
// 8. 9. 2026 pořád svítilo šest chyb — a všech šest bylo z verzí, které už
// na produkci nikdo neběží. Čtyři z nich byla ta samá věc (`new Notification`
// na Androidu), opravená ve 2.324; dvě byly stálé kusy kódu po nasazení,
// opravené 7. 9. Admin je tedy četl jako „něco je rozbité", přestože nebylo.
//
// Chyba z jiné verze než té, co běží, není důkaz, že je opravená — ale je to
// jediné, co se dá poznat automaticky, a je to velký rozdíl proti „nevíme nic".
// Proto se jen oddělí a řekne se u nich, z jaké verze jsou.

/** Rozloží „2.324" na [2, 324]. Nečíselné části jdou na nulu. */
export function rozlozVerzi(verze: string | null | undefined): number[] {
  if (!verze) return [];
  return String(verze).split('.').map((c) => {
    const n = Number.parseInt(c, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Je chyba ze starší verze, než jaká teď běží?
 *
 * Neznámá verze (starý zápis bez čísla) se bere jako starší — takový záznam
 * je z doby, kdy se verze ještě nezapisovala, takže je starý určitě.
 */
export function jeZeStarsiVerze(verzeChyby: string | null | undefined, verzeAppky: string): boolean {
  if (!verzeChyby) return true;
  const a = rozlozVerzi(verzeChyby);
  const b = rozlozVerzi(verzeAppky);
  const delka = Math.max(a.length, b.length);
  for (let i = 0; i < delka; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export type ChybaProPrehled = {
  id: string;
  app_version: string | null;
  vyrizeno_at: string | null;
};

export type RozdeleneChyby<T extends ChybaProPrehled> = {
  /** Nevyřízené z verze, která běží teď — tyhle se dějí právě teď. */
  aktualni: T[];
  /** Nevyřízené ze starších verzí — dost možná už opravené. */
  starsi: T[];
  /** Odklepnuté. */
  vyrizene: T[];
};

export function rozdelChyby<T extends ChybaProPrehled>(radky: T[], verzeAppky: string): RozdeleneChyby<T> {
  const out: RozdeleneChyby<T> = { aktualni: [], starsi: [], vyrizene: [] };
  for (const r of radky) {
    if (r.vyrizeno_at) out.vyrizene.push(r);
    else if (jeZeStarsiVerze(r.app_version, verzeAppky)) out.starsi.push(r);
    else out.aktualni.push(r);
  }
  return out;
}

/**
 * Věta do hlavičky. Rozdíl mezi „něco je rozbité teď" a „tohle je historie"
 * je to jediné, co admin z chybníku potřebuje na první pohled.
 */
export function shrnutiChyb(r: RozdeleneChyby<ChybaProPrehled>): string {
  if (r.aktualni.length === 0 && r.starsi.length === 0) return 'nic nového';
  if (r.aktualni.length === 0) return `${r.starsi.length} ze starších verzí`;
  if (r.starsi.length === 0) return `${r.aktualni.length} z běžící verze`;
  return `${r.aktualni.length} z běžící verze, ${r.starsi.length} starších`;
}
