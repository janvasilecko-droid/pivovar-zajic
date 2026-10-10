// 🕳️ Obchod: hlídání mezer v uzávěrkách.
// ---------------------------------------------------------------------------
// Sklad obchodu se počítá z uzávěrek. Chybí-li uzávěrka za nějaké dny, prodej
// z nich ze skladu neubyl a sklad ukazuje víc, než je na regálu. Tady se hledají
// dny, které nepokrývá žádná uzávěrka (po jejím datum_od–datum_do) a nejsou
// označené jako „zavřeno" (neděle, svátek — neprodávalo se, uzávěrka není).
//
// Mezery se hledají zvlášť pro každé středisko (pokladnu): uzávěrka jedné
// pokladny nepokryje druhou. Začátek je první uzávěrka daného střediska
// (před ní se prodej nesledoval) a konec včerejšek — dnešní uzávěrka se dělá
// až večer. Staré mezery (starší než okno) se neukazují: nejde s nimi nic
// dělat a trvale by volaly poplach.
import type { UzaverkaHlavicka } from './obchodSklad';

export type Mezera = {
  od: string;
  do: string;
  /** Počet dní v mezeře. */
  dnu: number;
  /** Středisko (pokladna), jehož uzávěrka chybí; null = uzávěrky bez střediska. */
  stredisko: string | null;
};

export type VstupMezer = {
  uzaverky: Pick<UzaverkaHlavicka, 'datum_od' | 'datum_do' | 'stredisko'>[];
  /** Dny, kdy se neprodávalo. */
  zavreno: { datum: string }[];
  dnes: string;
  /** Jak daleko do minulosti se mezery ukazují (dní od dneška). */
  oknoDni?: number;
};

const DEN = 86_400_000;
const posun = (iso: string, dnu: number) => new Date(Date.parse(iso + 'T00:00:00Z') + dnu * DEN).toISOString().slice(0, 10);

export function mezeryUzaverek({ uzaverky, zavreno, dnes, oknoDni = 62 }: VstupMezer): Mezera[] {
  const konec = posun(dnes, -1);
  const odOkna = posun(dnes, -oknoDni);
  const zavrenoDny = new Set(zavreno.map((z) => z.datum));

  const poStrediscich = new Map<string, typeof uzaverky>();
  for (const u of uzaverky) {
    const k = (u.stredisko ?? '').trim();
    (poStrediscich.get(k) ?? poStrediscich.set(k, []).get(k)!).push(u);
  }

  const out: Mezera[] = [];
  for (const [stredisko, skupina] of poStrediscich) {
    const zacatek = skupina.reduce((min, u) => (u.datum_od < min ? u.datum_od : min), skupina[0].datum_od);
    if (zacatek > konec) continue;

    // Pokryté dny: rozbalení uzávěrek (týdenní = 7 dní, měsíční ≤ 31) na dny.
    const pokryto = new Set<string>();
    for (const u of skupina) {
      if (u.datum_do < u.datum_od) continue;
      for (let d = u.datum_od; d <= u.datum_do; d = posun(d, 1)) pokryto.add(d);
    }

    let od: string | null = null;
    const zavri = (do_: string) => {
      if (od == null) return;
      const zacatekMezery = od < odOkna ? odOkna : od;
      if (do_ >= zacatekMezery) {
        out.push({
          od: zacatekMezery,
          do: do_,
          dnu: Math.round((Date.parse(do_ + 'T00:00:00Z') - Date.parse(zacatekMezery + 'T00:00:00Z')) / DEN) + 1,
          stredisko: stredisko === '' ? null : stredisko,
        });
      }
      od = null;
    };
    for (let d = zacatek; d <= konec; d = posun(d, 1)) {
      const chybi = !pokryto.has(d) && !zavrenoDny.has(d);
      if (chybi && od == null) od = d;
      if (!chybi && od != null) zavri(posun(d, -1));
    }
    zavri(konec);
  }
  return out.sort((a, b) => a.od.localeCompare(b.od) || (a.stredisko ?? '').localeCompare(b.stredisko ?? ''));
}

/** Dny mezery jako seznam dat (pro zápis „zavřeno" za celou mezeru). */
export function dnyMezery(m: Pick<Mezera, 'od' | 'do'>): string[] {
  const out: string[] = [];
  for (let d = m.od; d <= m.do; d = posun(d, 1)) out.push(d);
  return out;
}

/** „3.–5. 10." / „3. 10." / „30. 9.–2. 10." — krátký zápis mezery. */
export function textMezery(m: Pick<Mezera, 'od' | 'do'>): string {
  const den = (iso: string) => Number(iso.slice(8, 10));
  const mes = (iso: string) => Number(iso.slice(5, 7));
  if (m.od === m.do) return `${den(m.od)}. ${mes(m.od)}.`;
  if (m.od.slice(0, 7) === m.do.slice(0, 7)) return `${den(m.od)}.–${den(m.do)}. ${mes(m.do)}.`;
  return `${den(m.od)}. ${mes(m.od)}.–${den(m.do)}. ${mes(m.do)}.`;
}
