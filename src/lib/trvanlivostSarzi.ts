// 🗓️ Blíží se trvanlivost lahví, které leží na skladě?
//
// Evidence nezná, ze které šarže se která lahev prodala — zná jen, kolik
// lahví je teď na skladě a kdy se co lahvovalo. Předpoklad je FIFO: vydávají
// se nejstarší lahve první, takže na skladě zůstávají ty z posledních
// lahvování. Sečtou se tedy lahvování od nejnovějšího, dokud nepokryjí stav
// skladu — lahvování, u kterého se to stane, je NEJSTARŠÍ šarže, která na
// skladě pravděpodobně ještě je. Její datum + trvanlivost piva = datum,
// na které se má hlídat.
//
// Je to odhad a obrazovka to tak musí říkat. Když se ve skutečnosti vydává
// jinak než FIFO, na skladě můžou být i starší lahve — odhad je tedy spíš
// optimistický, nikdy ne poplašný.

/** Kolik dní před koncem trvanlivosti se začne upozorňovat. */
export const UPOZORNIT_DNI_PREDEM = 30;

export type Lahvovani = { entry_date: string; quantity: number };

export type TrvanlivostSkladu = {
  stav: 'ok' | 'blizi-se' | 'prosla';
  /** Datum lahvování nejstarší šarže, která je pravděpodobně na skladě. */
  lahvovano: string;
  /** Datum minimální trvanlivosti té šarže. */
  trvanlivostDo: string;
  /** Dní do konce trvanlivosti (záporné = prošlo). */
  dni: number;
};

function plusDni(iso: string, dni: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

function rozdilDni(od: string, doKdy: string): number {
  return Math.round((Date.parse(`${doKdy}T00:00:00Z`) - Date.parse(`${od.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/**
 * @param naSklade   aktuální počet lahví daného piva a obalu
 * @param lahvovani  lahvování TÉHOŽ piva a obalu (v libovolném pořadí)
 * @param trvanlivostDni  trvanlivost piva ve dnech; null = nehlídá se
 */
export function trvanlivostSkladu(
  naSklade: number,
  lahvovani: Lahvovani[],
  trvanlivostDni: number | null | undefined,
  dnes: string,
): TrvanlivostSkladu | null {
  if (!trvanlivostDni || trvanlivostDni <= 0 || naSklade <= 0) return null;
  const serazene = lahvovani
    .filter((l) => Number(l.quantity) > 0 && /^\d{4}-\d{2}-\d{2}/.test(l.entry_date))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  if (serazene.length === 0) return null;

  let pokryto = 0;
  let nejstarsi = serazene[serazene.length - 1];
  for (const l of serazene) {
    pokryto += Number(l.quantity);
    if (pokryto >= naSklade) { nejstarsi = l; break; }
  }

  const lahvovano = nejstarsi.entry_date.slice(0, 10);
  const trvanlivostDo = plusDni(lahvovano, trvanlivostDni);
  const dni = rozdilDni(dnes, trvanlivostDo);
  const stav = dni < 0 ? 'prosla' : dni <= UPOZORNIT_DNI_PREDEM ? 'blizi-se' : 'ok';
  return { stav, lahvovano, trvanlivostDo, dni };
}
