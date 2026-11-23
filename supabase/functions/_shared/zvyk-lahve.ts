// 🍾 Jakou lahev odběratel bere — 0,33 l, nebo 0,5 l?
// ---------------------------------------------------------------------------
// „5 beden světlého" velikost lahve neříká. Do 3. 11. 2026 četla appka bednu
// jako třetinky, od té doby jako půllitry (kvůli „dvě basy sklo 12sv", které
// byly 0,5 l). Obojí je špatně pro část odběratelů: Lužec bere třetinky
// (9. 11. 2026 se mu „5 beden světlého a 3 tmavého" zapsalo jako 0,5 l),
// ostatní půllitry. Rozhoduje proto to, co odběratel bere doopravdy — jeho
// poslední objednávky se skleněnými lahvemi.
//
// Platí jen pro řádek, který velikost neudává (jeLahevBezObjemu
// v beer-match.ts). Co je v řádku napsané („0,33", „třetinky"), má přednost.

/** Jedna dřívější objednávka odběratele: datum a objemy lahví, které v ní byly. */
export type ObjednavkaSLahvemi = { datum: string; objemy: number[] };

/** Kolik posledních objednávek s lahvemi rozhoduje. */
export const POCET_OBJEDNAVEK_LAHVI = 3;
/** Jak daleko zpátky se dívá (dny) — starší odběr už o dnešku nic neříká. */
export const DNU_ZPET_LAHVE = 180;

const jeSklo = (v: number) => v === 0.33 || v === 0.5;

/**
 * Velikost lahve podle posledních objednávek odběratele. Vrací ji jen tehdy,
 * když se na ní shodnou VŠECHNY z posledních POCET_OBJEDNAVEK_LAHVI objednávek
 * s lahvemi a jsou aspoň dvě: jedna objednávka zvyk není a smíšený odběr
 * (jednou třetinky, podruhé půllitry) nerozhodne nic — pak platí výchozí 0,5 l.
 */
export function zvykLahve(objednavky: ObjednavkaSLahvemi[]): 0.33 | 0.5 | null {
  const posledni = objednavky
    .filter((o) => o.objemy.some(jeSklo))
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, POCET_OBJEDNAVEK_LAHVI);
  if (posledni.length < 2) return null;
  const velikosti = new Set(posledni.flatMap((o) => o.objemy.filter(jeSklo)));
  if (velikosti.size !== 1) return null;
  return velikosti.has(0.33) ? 0.33 : 0.5;
}

/**
 * Načte poslední objednávky odběratele se skleněnými lahvemi a vrátí jeho zvyk.
 *
 * Jako nactiHistorii: na JEDNOM místě pro server (whatsapp-auto-parse) i pro
 * „Přečíst znovu" v aplikaci, ať se táž zpráva nečte dvakrát jinak. Nikdy
 * nevyhazuje výjimku — bez zvyku se čte jako dosud (lahev 0,5 l).
 */
export async function nactiZvykLahve(
  supabase: { from: (t: string) => any },
  opts: {
    placeId: string | null | undefined;
    placeName: string | null | undefined;
    /** Kdy zpráva přišla (ISO) — rozhodují objednávky do toho dne. */
    kdy: string;
    packages: { id: string; volume_l?: number | null }[];
  },
): Promise<0.33 | 0.5 | null> {
  try {
    const lahve = opts.packages.filter((p) => jeSklo(Number(p.volume_l)));
    const jmeno = (opts.placeName ?? '').trim();
    if (!lahve.length || (!opts.placeId && !jmeno)) return null;
    const kdy = new Date(opts.kdy);
    if (Number.isNaN(kdy.getTime())) return null;
    const doDne = kdy.toISOString().slice(0, 10);
    const odDne = new Date(kdy.getTime() - DNU_ZPET_LAHVE * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let dotaz = supabase
      .from('order_items')
      .select('package_id, orders!inner(id, order_date, place_id, place_name, status)')
      .in('package_id', lahve.map((p) => p.id))
      .gte('orders.order_date', odDne)
      .lte('orders.order_date', doDne)
      .neq('orders.status', 'storno');
    dotaz = opts.placeId ? dotaz.eq('orders.place_id', opts.placeId) : dotaz.eq('orders.place_name', jmeno);
    const { data } = await dotaz.limit(500);

    const objemObalu = new Map(lahve.map((p) => [p.id, Number(p.volume_l)]));
    const podleObjednavky = new Map<string, ObjednavkaSLahvemi>();
    for (const r of (data ?? []) as any[]) {
      const id = r.orders?.id;
      const objem = objemObalu.get(r.package_id);
      if (!id || objem === undefined) continue;
      const o = podleObjednavky.get(id) ?? { datum: String(r.orders.order_date ?? ''), objemy: [] };
      o.objemy.push(objem);
      podleObjednavky.set(id, o);
    }
    return zvykLahve([...podleObjednavky.values()]);
  } catch (e) {
    console.error('Zvyk odběratele u lahví se nenačetl (platí 0,5 l):', e);
    return null;
  }
}
