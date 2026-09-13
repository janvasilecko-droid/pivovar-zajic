// 🛢️ Jak dlouho má odběratel naše sudy u sebe.
//
// Konto sudů (lib/kegAccount.ts) umí říct, KOLIK sudů kdo dluží, ale ne
// odkdy. Sud za 2–3 tisíce, který leží u hospody dva měsíce, je jiná
// situace než sud z úterního závozu — a z počtu samotného se to nepozná.
//
// Pravidlo je schválně jednoduché, aby šlo stejně spočítat i v databázi
// (ranní souhrn, migrace 20261231030000): „dní od posledního vrácení".
// Kdo nikdy nic nevrátil, počítá se od prvního odvozu. Přesné párování
// sudů (který konkrétní sud se vrátil) evidence nezná, takže FIFO by
// předstíralo přesnost, kterou data nemají.
import type { KegMovement } from './kegAccount';

/** Od kolika dní se sudy u odběratele hlásí jako „dlouho venku". */
export const DLOUHO_VENKU_DNI = 30;

export type SudyVenku = {
  /** Klíč shodný s computeKegBalances (place_id, jinak jméno). */
  klic: string;
  placeName: string;
  pocet: number;
  /** Dní od posledního vrácení, případně od prvního odvozu. */
  dni: number;
  /** Datum, od kterého se dny počítají. */
  od: string;
};

function klicMista(m: Pick<KegMovement, 'place_id' | 'place_name'>): string {
  return m.place_id || `name:${(m.place_name || '').toLowerCase()}`;
}

function rozdilDni(od: string, dnes: string): number {
  const a = Date.parse(`${od.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${dnes.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Pro každého odběratele s nevrácenými sudy spočítá, jak dlouho je má. */
export function sudyVenku(movements: KegMovement[], dnes: string): SudyVenku[] {
  const mista = new Map<string, { placeName: string; pocet: number; posledniVraceni: string | null; prvniOdvoz: string | null }>();
  for (const m of movements) {
    const klic = klicMista(m);
    if (klic === 'name:') continue;
    const e = mista.get(klic) ?? { placeName: m.place_name || 'Neznámý odběratel', pocet: 0, posledniVraceni: null, prvniOdvoz: null };
    const datum = String(m.entry_date).slice(0, 10);
    if (m.direction === 'out') {
      e.pocet += m.quantity;
      if (!e.prvniOdvoz || datum < e.prvniOdvoz) e.prvniOdvoz = datum;
    } else {
      e.pocet -= m.quantity;
      if (!e.posledniVraceni || datum > e.posledniVraceni) e.posledniVraceni = datum;
    }
    if (m.place_name) e.placeName = m.place_name;
    mista.set(klic, e);
  }

  const out: SudyVenku[] = [];
  mista.forEach((e, klic) => {
    if (e.pocet <= 0) return;
    const od = e.posledniVraceni ?? e.prvniOdvoz;
    if (!od) return;
    out.push({ klic, placeName: e.placeName, pocet: e.pocet, dni: rozdilDni(od, dnes), od });
  });
  return out.sort((a, b) => b.dni - a.dni);
}

/** Jen ti, u kterých sudy leží déle než práh. */
export function sudyDlouhoVenku(movements: KegMovement[], dnes: string, prah = DLOUHO_VENKU_DNI): SudyVenku[] {
  return sudyVenku(movements, dnes).filter((s) => s.dni >= prah);
}
