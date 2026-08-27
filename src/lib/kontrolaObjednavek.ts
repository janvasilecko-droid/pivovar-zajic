// 🔎 Kontrola, jestli z WhatsAppu opravdu přišlo všechno.
// ---------------------------------------------------------------------------
// Stávající audit (lib/orderAudit.ts) umí zkontrolovat zprávy, které DORAZILY:
// najde duplicity, nesoulad mezi zprávou a objednávkou i nezpracované zprávy.
// Neumí ale odpovědět na otázku, která uživatele pálí nejvíc — „nepřišlo něco?"
// Chybějící zpráva v databázi z definice není, takže ji nejde najít přímo.
//
// Dá se ale poznat nepřímo, ze tří signálů:
//
//  1. TICHO U PRAVIDELNÉHO ODBĚRATELE. Hospoda, která objednává každý týden,
//     a najednou tři týdny nic — buď zavřela, nebo se zpráva ztratila. Tohle
//     je nejsilnější signál, protože rytmus objednávek je v provozu stabilní.
//
//  2. VÝPADEK PŘÍJMU. Když nepřijde ani jedna zpráva podstatně déle, než je
//     u daného provozu obvyklé, nejspíš neběžel most (bridge) — a co lidé
//     poslali mezitím, se nikde neobjevilo.
//
//  3. ZPRÁVA OD NEZNÁMÉHO ODESÍLATELE. Databázový trigger zprávu od čísla
//     mimo seznam povolených zahodí (viz migrace 20260818000000). Když
//     hospoda napíše z nového telefonu, objednávka zmizí beze stopy. Tenhle
//     případ řeší tabulka whatsapp_rejected — tady se jen zobrazuje.
//
// Čtvrtá kontrola je provozní a nejpraktičtější: POKRYTÍ TÝDNE — kdo objednal
// minulý týden a tenhle ještě ne.

export type Zprava = {
  id: string;
  sender_name: string | null;
  created_at: string;
  status: string;
};

export type ObjednavkaKontrola = {
  id: string;
  place_name: string | null;
  delivery_date: string | null;
  order_date: string;
  status: string;
};

/** Medián — jeden mimořádně dlouhý odstup rytmus nerozhodí. */
function median(cisla: number[]): number {
  if (!cisla.length) return 0;
  const s = [...cisla].sort((a, b) => a - b);
  const p = Math.floor(s.length / 2);
  return s.length % 2 ? s[p] : (s[p - 1] + s[p]) / 2;
}

const DEN = 86_400_000;

export type TichoRadek = {
  odesilatel: string;
  /** Obvyklý odstup mezi zprávami ve dnech (medián). */
  obvykleDnu: number;
  /** Kolik dní je ticho. */
  tichoDnu: number;
  posledniZprava: string;
  pocetZprav: number;
};

/**
 * Odesílatelé, kteří mlčí podezřele dlouho proti svému vlastnímu rytmu.
 *
 * Práh je záměrně nad dvojnásobkem obvyklého odstupu a zároveň aspoň týden —
 * u hospody, co píše obden, není pět dní ticha nic zvláštního, a upozornění,
 * které křičí pořád, přestane kdokoli číst.
 */
export function tichoUOdberatelu(
  zpravy: Zprava[],
  ted: Date,
  { minZprav = 4, nasobek = 2.5, minTichoDnu = 7 } = {},
): TichoRadek[] {
  const podleOdesilatele = new Map<string, number[]>();
  for (const z of zpravy) {
    const kdo = (z.sender_name || '').trim();
    if (!kdo || !z.created_at) continue;
    const cas = new Date(z.created_at).getTime();
    if (!Number.isFinite(cas)) continue;
    const seznam = podleOdesilatele.get(kdo) ?? [];
    seznam.push(cas);
    podleOdesilatele.set(kdo, seznam);
  }

  const out: TichoRadek[] = [];
  podleOdesilatele.forEach((casy, kdo) => {
    if (casy.length < minZprav) return; // bez historie se rytmus určit nedá
    casy.sort((a, b) => a - b);
    const odstupy: number[] = [];
    for (let i = 1; i < casy.length; i++) odstupy.push((casy[i] - casy[i - 1]) / DEN);
    const obvykle = median(odstupy);
    if (obvykle <= 0) return;
    const posledni = casy[casy.length - 1];
    const ticho = (ted.getTime() - posledni) / DEN;
    if (ticho < Math.max(minTichoDnu, obvykle * nasobek)) return;
    out.push({
      odesilatel: kdo,
      obvykleDnu: Math.round(obvykle * 10) / 10,
      tichoDnu: Math.floor(ticho),
      posledniZprava: new Date(posledni).toISOString().slice(0, 10),
      pocetZprav: casy.length,
    });
  });

  return out.sort((a, b) => b.tichoDnu / Math.max(1, b.obvykleDnu) - a.tichoDnu / Math.max(1, a.obvykleDnu));
}

export type VypadekRadek = { od: string; do: string; hodin: number };

/**
 * Okna, ve kterých nepřišla ani jedna zpráva podstatně déle, než je obvyklé.
 * Ukazuje na výpadek mostu — zprávy poslané mezitím se nikde neobjeví.
 */
export function vypadkyPrijmu(
  zpravy: Zprava[],
  { nasobek = 6, minHodin = 24 } = {},
): VypadekRadek[] {
  const casy = zpravy
    .map((z) => new Date(z.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (casy.length < 10) return [];

  const odstupyHodin: number[] = [];
  for (let i = 1; i < casy.length; i++) odstupyHodin.push((casy[i] - casy[i - 1]) / 3_600_000);
  const obvykle = median(odstupyHodin);
  if (obvykle <= 0) return [];
  const prah = Math.max(minHodin, obvykle * nasobek);

  const out: VypadekRadek[] = [];
  for (let i = 1; i < casy.length; i++) {
    const hodin = (casy[i] - casy[i - 1]) / 3_600_000;
    if (hodin < prah) continue;
    out.push({
      od: new Date(casy[i - 1]).toISOString().slice(0, 16).replace('T', ' '),
      do: new Date(casy[i]).toISOString().slice(0, 16).replace('T', ' '),
      hodin: Math.round(hodin),
    });
  }
  return out.sort((a, b) => b.hodin - a.hodin);
}

export type PokrytiRadek = {
  odberatel: string;
  minulyTyden: number;
  tentoTyden: number;
};

/**
 * Kdo objednal minulý týden a tenhle ještě ne. Nejpraktičtější kontrola —
 * dá se podle ní rovnou zavolat, ne jen konstatovat, že něco chybí.
 * Rozhoduje DEN ZÁVOZU, ne den zadání.
 */
export function pokrytiTydne(
  objednavky: ObjednavkaKontrola[],
  zacatekTohotoTydne: string,
): { chybi: PokrytiRadek[]; noviTentoTyden: string[] } {
  const zacatekMinuleho = new Date(zacatekTohotoTydne + 'T00:00:00Z');
  zacatekMinuleho.setUTCDate(zacatekMinuleho.getUTCDate() - 7);
  const minulyOd = zacatekMinuleho.toISOString().slice(0, 10);
  const konecMinuleho = new Date(zacatekTohotoTydne + 'T00:00:00Z');
  konecMinuleho.setUTCDate(konecMinuleho.getUTCDate() - 1);
  const minulyDo = konecMinuleho.toISOString().slice(0, 10);
  const konecTohoto = new Date(zacatekTohotoTydne + 'T00:00:00Z');
  konecTohoto.setUTCDate(konecTohoto.getUTCDate() + 6);
  const tentoDo = konecTohoto.toISOString().slice(0, 10);

  const spocitej = (od: string, doKdy: string) => {
    const m = new Map<string, number>();
    for (const o of objednavky) {
      if (o.status === 'storno') continue;
      const den = o.delivery_date || o.order_date;
      if (!den || den < od || den > doKdy) continue;
      const kdo = (o.place_name || '').trim() || 'Neuvedený odběratel';
      m.set(kdo, (m.get(kdo) ?? 0) + 1);
    }
    return m;
  };

  const minuly = spocitej(minulyOd, minulyDo);
  const tento = spocitej(zacatekTohotoTydne, tentoDo);

  const chybi: PokrytiRadek[] = [];
  minuly.forEach((pocet, kdo) => {
    if (!tento.has(kdo)) chybi.push({ odberatel: kdo, minulyTyden: pocet, tentoTyden: 0 });
  });
  const noviTentoTyden: string[] = [];
  tento.forEach((_, kdo) => { if (!minuly.has(kdo)) noviTentoTyden.push(kdo); });

  return {
    chybi: chybi.sort((a, b) => b.minulyTyden - a.minulyTyden || a.odberatel.localeCompare(b.odberatel, 'cs')),
    noviTentoTyden: noviTentoTyden.sort((a, b) => a.localeCompare(b, 'cs')),
  };
}
