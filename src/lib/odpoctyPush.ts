// ⏰ Běžící odpočty → server, aby konec přišel jako push i se zhasnutým
// displejem (migrace 20261231170000_odpocty_push.sql).
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „ten odpočet ať jede, i když není aplikace aktivní,
// ať může být aplikace v pozadí nebo zhasnutý displej."
//
// Telefon appku v pozadí uspí a časovač v JavaScriptu stojí. Proto se při
// každé změně odpočtů zapíše, KDY který doběhne; server pak pošle push jen
// tomu, kdo ho spustil. Zastavený, pozastavený nebo už ohlášený odpočet se
// ze serveru smaže — když appka doběhnutí zachytí sama, push nepřijde.
//
// Bez migrace (tabulka ještě není) se tiše nic neděje — alarm v otevřené
// appce funguje dál jako dřív.
import { supabase } from './supabase';
import type { CountdownTimer } from './stopwatchTimers';

/** Co je na serveru: id řádku → konec (ms). */
const naServeru = new Map<string, number>();
let nacteno = false;
let fronta: Promise<void> = Promise.resolve();

export type ZmenyOdpoctu = { zapsat: { id: string; nazev: string; konec: number }[]; smazat: string[] };

/** Čistý výpočet: co zapsat a co smazat (kvůli testům bez databáze). */
export function spoctiZmenyOdpoctu(
  odpocty: CountdownTimer[],
  stav: Map<string, number>,
  userId: string,
  ted: number,
  /** Appka je právě na displeji — alarm zazněl v ní, push už netřeba. */
  viditelna = true,
): ZmenyOdpoctu {
  const bezi = new Map<string, { nazev: string; konec: number }>();
  for (const t of odpocty) {
    if (t.targetAt == null || t.notifiedAt) continue;
    if (t.targetAt <= ted) continue;
    bezi.set(`${userId}:${t.id}`, { nazev: t.label || 'Odpočet', konec: t.targetAt });
  }
  const zapsat = [...bezi.entries()]
    .filter(([id, v]) => stav.get(id) !== v.konec)
    .map(([id, v]) => ({ id, nazev: v.nazev, konec: v.konec }));
  // Zastavený před koncem → pryč. DOBĚHLÝ jen když je appka vidět: v pozadí
  // ho appka mohla „zachytit" přibrzděným časovačem bez zvuku a push by se
  // pak neposlal vůbec — ten řádek si server označí sám.
  const smazat = [...stav.entries()]
    .filter(([id, konec]) => id.startsWith(`${userId}:`) && !bezi.has(id) && (konec > ted || viditelna))
    .map(([id]) => id);
  return { zapsat, smazat };
}

export function synchronizujOdpocty(odpocty: CountdownTimer[]): Promise<void> {
  // Po sobě, ať se rychlé klepání (start/stop) nepředběhne.
  fronta = fronta.then(() => proved(odpocty)).catch(() => {});
  return fronta;
}

async function proved(odpocty: CountdownTimer[]) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;

  // Po startu appky: co na serveru zůstalo z minula (appka zavřená během
  // odpočtu), ať se to porovná se skutečností.
  if (!nacteno) {
    const { data: radky, error } = await supabase
      .from('odpocty_push')
      .select('id, konec')
      .is('odeslano_at', null);
    if (error) return; // bez migrace nic
    for (const r of (radky ?? []) as { id: string; konec: string }[]) naServeru.set(r.id, new Date(r.konec).getTime());
    nacteno = true;
  }

  const viditelna = typeof document === 'undefined' || document.visibilityState === 'visible';
  const { zapsat, smazat } = spoctiZmenyOdpoctu(odpocty, naServeru, userId, Date.now(), viditelna);
  if (zapsat.length > 0) {
    const { error } = await supabase.from('odpocty_push').upsert(zapsat.map((z) => ({
      id: z.id,
      user_id: userId,
      nazev: z.nazev,
      konec: new Date(z.konec).toISOString(),
      odeslano_at: null,
    })));
    if (!error) zapsat.forEach((z) => naServeru.set(z.id, z.konec));
  }
  if (smazat.length > 0) {
    const { error } = await supabase.from('odpocty_push').delete().in('id', smazat);
    if (!error) smazat.forEach((id) => naServeru.delete(id));
  }
}
