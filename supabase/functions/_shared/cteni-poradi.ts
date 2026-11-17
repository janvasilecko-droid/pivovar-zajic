// ⏱️ Čtení objednávky víc AI NAJEDNOU — aby se vešlo do času, který server dá.
// ---------------------------------------------------------------------------
// 17. 11. 2026, majitel: „nechce se mi naparsovat fotka objednávky". Gemini byl
// přetížený (HTTP 503), náhradní modely neodpověděly včas a čtení trvalo přes
// dvě minuty. Pokusy šly ZA SEBOU a počítalo se se 140 s — jenže worker edge
// funkce na Supabase přijímá nové požadavky jen prvních 75 s a ve 150 s končí
// (změřeno 17. 11. 2026: nový worker každých ~75 s). Jistých je tedy jen 75 s;
// co trvá déle, skončí HTTP 546 a zpráva se nepřečte vůbec.
//
// Proto pokusy běží SOUBĚŽNĚ a mají POŘADÍ:
//   • „nejlepší" čtení (Gemini s fotkou) se rozjede hned — hlavní model
//     a náhradní verze vedle sebe,
//   • „zálohy" (slabší čtení — menší modely, čtení z přepisu) se přidají, až
//     když nejlepší čtení skončí bez výsledku, nebo když do konce zbývá jen
//     rezerva a nejlepší čtení už ohlásilo potíž (přetížení, chyba) — i kdyby
//     ještě běželo. Dokud potíž není (Gemini je jen pomalý, fotku čte 30–50 s),
//     zálohy se nevolají: objednávka nemá chodit dalším službám zbytečně.
//     S `zalohyHned` startují zároveň s nejlepším čtením (ví se, že to nejde),
//   • vyhrává čtení, které je v pořadí nejvýš a něco přečetlo. Na výš
//     postavené se čeká, dokud neskončí (každé si hlídá čas samo), takže
//     rychlá slabší odpověď nepředběhne pomalejší lepší.
// Když je `zalohy` null, čte se jen to nejlepší (čerstvá fotka z WhatsAppu —
// radši chvíli počkat na Gemini než vzít slabší čtení, viz whatsapp-auto-parse).

export type VysledekCteni = {
  /** Vyčištěná odpověď AI; "" = tahle dráha nepřečetla nic. */
  text: string;
  /** Kdo četl (jde do `_provider` v odpovědi funkce). */
  provider: string;
};

export const NEPRECTENO: VysledekCteni = { text: "", provider: "" };

/**
 * Jedna dráha čtení. Nesmí vyhodit chybu; když dostane `zrus`, má skončit.
 * `potiz()` zavolá, když jí pokus selhal (služba je přetížená, vrátila chybu).
 */
export type DrahaCteni = (zrus: AbortSignal, potiz: () => void) => Promise<VysledekCteni>;

/**
 * Signál, který se ozve po `ms` (TimeoutError), nebo když se ozve `zrus`.
 * `AbortSignal.any` má Deno i Node; ruční spojení je tu pro starší běh.
 */
export function signalSCasem(ms: number, zrus?: AbortSignal): AbortSignal {
  const cas = AbortSignal.timeout(Math.max(1, Math.round(ms)));
  if (!zrus) return cas;
  // deno-lint-ignore no-explicit-any
  const any = (AbortSignal as any).any;
  if (typeof any === "function") return any.call(AbortSignal, [cas, zrus]);
  const spojeny = new AbortController();
  for (const s of [cas, zrus]) {
    if (s.aborted) spojeny.abort(s.reason);
    else s.addEventListener("abort", () => spojeny.abort(s.reason), { once: true });
  }
  return spojeny.signal;
}

/** Pauza, kterou zrušení ukončí hned. */
export function pauza(ms: number, zrus?: AbortSignal): Promise<void> {
  return new Promise((hotovo) => {
    if (zrus?.aborted) return hotovo();
    const casovac = setTimeout(hotovo, ms);
    zrus?.addEventListener("abort", () => { clearTimeout(casovac); hotovo(); }, { once: true });
  });
}

/**
 * Spustí dráhy čtení podle pravidel výše a vrátí výsledek té nejvýš postavené,
 * která něco přečetla; `NEPRECTENO`, když nepřečetla žádná. `zalozni` = vyhrála
 * dráha ze `zalohy`. Po návratu jsou zbylé dráhy zrušené.
 */
export async function ctiSPoradim(opts: {
  nejlepsi: DrahaCteni[];
  zalohy: DrahaCteni[] | null;
  /** Kolik ms zbývá do konce celého čtení. */
  zbyvaMs: () => number;
  /** Tolik ms před koncem se rozjedou zálohy, když nejlepší čtení má potíže. */
  rezervaMs: number;
  /** Zálohy startují hned vedle nejlepšího čtení (už se ví, že nejlepší nejde). */
  zalohyHned?: boolean;
}): Promise<VysledekCteni & { zalozni: boolean }> {
  const zrus = new AbortController();
  let bezi: Promise<VysledekCteni>[] | null = null;
  let maPotiz = false;
  let jeRezerva = false;
  const spust = (draha: DrahaCteni): Promise<VysledekCteni> => {
    try {
      return draha(zrus.signal, potiz).then((v) => (v?.text ? v : NEPRECTENO), () => NEPRECTENO);
    } catch {
      return Promise.resolve(NEPRECTENO);
    }
  };
  const spustZalohy = (): Promise<VysledekCteni>[] => (bezi ??= (opts.zalohy ?? []).map(spust));
  // Potíž nejlepšího čtení: zálohy se rozjedou, jakmile zbývá jen rezerva.
  function potiz(): void {
    maPotiz = true;
    if (jeRezerva && opts.zalohy && !zrus.signal.aborted) spustZalohy();
  }
  let casovac: ReturnType<typeof setTimeout> | null = null;
  try {
    const nejlepsi = opts.nejlepsi.map(spust);
    if (opts.zalohy && opts.zalohyHned) spustZalohy();
    else if (opts.zalohy) {
      casovac = setTimeout(() => {
        jeRezerva = true;
        if (maPotiz) spustZalohy();
      }, Math.max(0, opts.zbyvaMs() - opts.rezervaMs));
    }
    for (const draha of nejlepsi) {
      const v = await draha;
      if (v.text) return { ...v, zalozni: false };
    }
    if (!opts.zalohy) return { ...NEPRECTENO, zalozni: false };
    for (const draha of spustZalohy()) {
      const v = await draha;
      if (v.text) return { ...v, zalozni: true };
    }
    return { ...NEPRECTENO, zalozni: false };
  } finally {
    if (casovac) clearTimeout(casovac);
    zrus.abort();
  }
}
