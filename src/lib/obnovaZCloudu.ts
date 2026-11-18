// 🔄 Poznámky a odpočty se mezi zařízeními propisují STAŽENÍM profilu.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „aby se propisovaly poznámky na stejný účet na jiném
// zařízení." Appka měla na převzetí změn z jiného zařízení jen realtime
// odběr tabulky `profiles` — jenže ta v realtime publikaci Supabase vůbec
// není (ověřeno zkouškou: událost u `whatsapp_incoming` dorazí, u `profiles`
// nikdy), takže poznámka napsaná na telefonu se na počítači ukázala až po
// obnovení stránky.
//
// Místo toho se profil stahuje (a) při návratu do appky — přepnutí záložky,
// odemčení telefonu, zaostření okna —, (b) po obnovení sítě a (c) pravidelně,
// dokud je appka vidět. Realtime tím zůstává jen bonus.
//
// Tohle je jen plánovač; co se stáhne a co se smí přepsat, rozhoduje
// `prevezmiZCloudu` v lib/auth.tsx (neověřuje se tu nic, jen se volá).

/** Jak často se při viditelné appce znovu stahuje (v milisekundách). */
export const OBNOVA_PROFILU_MS = 20_000;

/** Dvě stažení těsně po sobě (návrat do appky vyvolá víc událostí naráz) se sloučí. */
const MIN_ODSTUP_MS = 2_000;

/**
 * Stejný obsah bez ohledu na pořadí klíčů v objektech.
 *
 * Cloud ukládá `home_layout` jako jsonb, který klíče přeskládá (podle délky a
 * abecedy), kdežto místní kopie má klíče v pořadí, v jakém vznikly — prosté
 * porovnání `JSON.stringify` by hlásilo rozdíl i u totožných dat a appka by
 * pořád dokola přepisovala úložiště a rozesílala změny.
 */
export function stejnyObsah(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => stejnyObsah(x, b[i]));
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  // Klíč s hodnotou `undefined` je totéž co chybějící (JSON ho zahodí).
  const klicea = Object.keys(oa).filter((k) => oa[k] !== undefined);
  const kliceb = Object.keys(ob).filter((k) => ob[k] !== undefined);
  if (klicea.length !== kliceb.length) return false;
  return klicea.every((k) => k in ob && stejnyObsah(oa[k], ob[k]));
}

export type ObnovaZCloudu = {
  /** Stáhne profil a převezme z něj, co je novější. Chyby si ošetří sama. */
  stahni: () => Promise<void>;
  /** Je appka vidět? Skrytá záložka se nestahuje. Výchozí: `document.visibilityState`. */
  jeViditelna?: () => boolean;
  intervalMs?: number;
};

/**
 * Spustí stahování: při návratu do appky, po obnovení sítě a pravidelně,
 * dokud je appka vidět. Vrací funkci, která všechno zase zastaví.
 */
export function spustObnovuZCloudu(opts: ObnovaZCloudu): () => void {
  const jeViditelna = opts.jeViditelna ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let bezi = false;
  let posledni = -Infinity;
  let zruseno = false;

  const spust = async (hned: boolean) => {
    if (zruseno || bezi || !jeViditelna()) return;
    const ted = Date.now();
    // Pravidelné stahování se nikdy nezdržuje; události (návrat do appky)
    // se mezi sebou slučují.
    if (!hned && ted - posledni < MIN_ODSTUP_MS) return;
    bezi = true;
    posledni = ted;
    try {
      await opts.stahni();
    } catch {
      // Slabý signál: příště. Místní data zůstávají, jak jsou.
    } finally {
      bezi = false;
    }
  };

  const napredi = () => { void spust(false); };
  const casovac = setInterval(() => { void spust(true); }, opts.intervalMs ?? OBNOVA_PROFILU_MS);
  document.addEventListener('visibilitychange', napredi);
  window.addEventListener('focus', napredi);
  window.addEventListener('online', napredi);

  return () => {
    zruseno = true;
    clearInterval(casovac);
    document.removeEventListener('visibilitychange', napredi);
    window.removeEventListener('focus', napredi);
    window.removeEventListener('online', napredi);
  };
}
