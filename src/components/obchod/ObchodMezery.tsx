// 🕳️ Obchod: chybějící uzávěrky.
// ---------------------------------------------------------------------------
// Sklad obchodu se počítá z uzávěrek — chybí-li den, prodej z něj ze skladu
// neubyl a sklad ukazuje víc, než je na regálu (lib/obchodMezery.ts). Ve Skladu
// je to jen upozornění, v Uzávěrkách rovnou tlačítka: zadat uzávěrku za tu
// mezeru, nebo označit dny jako „zavřeno" (neděle, svátek).
import { useMemo } from 'react';
import { AlertTriangle, CalendarOff, Receipt } from 'lucide-react';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, potvrd, uspech } from '../../lib/toast';
import { dnyMezery, mezeryUzaverek, textMezery, type Mezera } from '../../lib/obchodMezery';
import { smazZavreno, zapisZavreno, type DataObchodu } from '../../lib/obchodData';
import type { TypUzaverky } from '../../lib/obchodSklad';

const dnuText = (n: number) => `${n} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;

/** Mezery v uzávěrkách pro dané data obchodu. */
export function useMezery(data: Pick<DataObchodu, 'uzaverky' | 'zavreno'>): Mezera[] {
  const dnes = businessDateISO();
  return useMemo(() => mezeryUzaverek({ uzaverky: data.uzaverky, zavreno: data.zavreno, dnes }), [data.uzaverky, data.zavreno, dnes]);
}

/** Typ uzávěrky, který odpovídá celé mezeře — jinak null a vybere se ručně. */
export function typProMezeru(m: Pick<Mezera, 'od' | 'do' | 'dnu'>): TypUzaverky | null {
  if (m.dnu === 1) return 'denni';
  const od = new Date(m.od + 'T00:00:00Z');
  if (m.dnu === 7 && od.getUTCDay() === 1) return 'tydenni';
  const posledni = new Date(Date.UTC(od.getUTCFullYear(), od.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (od.getUTCDate() === 1 && m.do === posledni) return 'mesicni';
  return null;
}

/** Stručné upozornění do Skladu — odkaz na Uzávěrky, kde se to řeší. */
export function UpozorneniMezery({ mezery, jdiNaUzaverky }: { mezery: Mezera[]; jdiNaUzaverky: () => void }) {
  if (mezery.length === 0) return null;
  const dnuCelkem = mezery.reduce((a, m) => a + m.dnu, 0);
  return (
    <div role="alert" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 flex items-start gap-2 text-amber-950">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 text-sm font-bold">
        Chybí uzávěrky za {dnuText(dnuCelkem)}: {mezery.slice(0, 3).map((m) => textMezery(m)).join(', ')}{mezery.length > 3 ? ` a ${mezery.length - 3} dalších` : ''}
        <div className="text-xs font-semibold mt-0.5">Dokud chybí, sklad obchodu ukazuje víc, než je na regálu.</div>
        <button type="button" className="btn-primary !rounded !py-1.5 mt-2 text-xs" onClick={jdiNaUzaverky}>Doplnit v Uzávěrkách</button>
      </div>
    </div>
  );
}

/** Seznam mezer s tlačítky (Uzávěrky): zadat uzávěrku, nebo označit jako zavřeno. */
export function MezeryUzaverek({ data, zapsal, mezery, zadejUzaverku }: {
  data: DataObchodu;
  zapsal: string | null;
  mezery: Mezera[];
  zadejUzaverku: (m: Mezera) => void;
}) {
  async function zavreno(m: Mezera) {
    if (!(await potvrd(`Označit ${textMezery(m)} (${dnuText(m.dnu)}) jako zavřeno? Znamená to, že se tehdy nic neprodávalo a uzávěrka neexistuje.`, { titulek: 'Zavřeno', potvrdit: 'Ano, zavřeno' }))) return;
    const e = await zapisZavreno(dnyMezery(m), zapsal);
    if (e) { toastChyba(e); return; }
    uspech('Označeno jako zavřeno.');
    data.znovu();
  }

  if (mezery.length === 0) return null;
  // Středisko se píše jen tehdy, když obchod má víc pokladen — jinak je to šum.
  const vicStredisek = new Set(data.uzaverky.map((u) => (u.stredisko ?? '').trim())).size > 1;
  return (
    <section aria-label="Chybějící uzávěrky" className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2 text-amber-950">
      <div className="text-sm font-black flex items-center gap-1.5"><AlertTriangle size={16} /> Chybějící uzávěrky</div>
      <div className="text-[11px] font-semibold">
        Za tyhle dny nemá obchod žádnou uzávěrku, takže se z nich neodečetl prodej. Zadej uzávěrku, nebo označ dny, kdy bylo zavřeno.
      </div>
      <ul className="space-y-2">
        {mezery.map((m) => (
          <li key={`${m.stredisko ?? ''}|${m.od}`} className="rounded-lg bg-white/70 border border-amber-300 p-2 space-y-1.5">
            <div className="text-sm font-black">
              {textMezery(m)} <span className="font-semibold">({dnuText(m.dnu)}{vicStredisek && m.stredisko ? `, středisko ${m.stredisko}` : ''})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary !rounded !py-1.5 text-xs flex items-center gap-1" onClick={() => zadejUzaverku(m)}>
                <Receipt size={13} /> Zadat uzávěrku
              </button>
              <button type="button" className="btn-ghost !rounded !py-1.5 text-xs font-bold flex items-center gap-1" disabled={data.chybiOdpisAZavreno} onClick={() => void zavreno(m)}>
                <CalendarOff size={13} /> Zavřeno
              </button>
            </div>
          </li>
        ))}
      </ul>
      {data.chybiOdpisAZavreno && (
        <div className="text-[11px] font-bold">„Zavřeno" potřebuje druhou migraci obchodu (20261231280000_obchod_odpis_zavreno) — spusť ji v Auditu → Databázové migrace.</div>
      )}
    </section>
  );
}

/** Dny označené jako zavřeno (poslední dva měsíce) — s možností vzít označení zpět. */
export function ZavrenoDny({ data }: { data: DataObchodu }) {
  const dnes = businessDateISO();
  const od = new Date(Date.parse(dnes + 'T00:00:00Z') - 62 * 86_400_000).toISOString().slice(0, 10);
  const dny = data.zavreno.filter((z) => z.datum >= od).sort((a, b) => b.datum.localeCompare(a.datum));
  if (dny.length === 0) return null;

  async function zrus(datum: string) {
    const e = await smazZavreno(datum);
    if (e) { toastChyba(e); return; }
    uspech('Označení „zavřeno" zrušeno.');
    data.znovu();
  }

  return (
    <section aria-label="Dny označené jako zavřeno" className="rounded-xl border-2 border-neutral-200 bg-white p-3 space-y-1.5">
      <div className="text-xs font-black uppercase tracking-wide text-neutral-600">Zavřeno (nic se neprodávalo)</div>
      <ul className="flex flex-wrap gap-1.5">
        {dny.map((z) => (
          <li key={z.datum} className="flex items-center gap-1 rounded-full bg-neutral-100 pl-3 pr-1 py-0.5 text-xs font-bold text-neutral-800">
            {textMezery({ od: z.datum, do: z.datum })}
            <button type="button" className="btn-ghost !rounded-full !py-0.5 !px-2 text-xs font-bold" onClick={() => void zrus(z.datum)}>
              Zrušit
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
