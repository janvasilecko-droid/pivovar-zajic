// 🚐 Kniha jízd — okno „Nová jízda“, „Tankování“ a „Upravit“.
// ---------------------------------------------------------------------------
// Jedno okno pro všechno, co se do knihy zapisuje ručně: jízda mimo objednávky,
// tankování a oprava vygenerovaného nebo dřív zapsaného záznamu. Stav tachometru
// na začátku navazuje na poslední jízdu auta (člověk ho nemusí opisovat) a okno
// předem ukáže, co se po uložení stane s pozdějšími jízdami. Veškerá logika je v
// lib/knihaJizdFormular.ts; tady je jen formulář.
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Fuel, Info, Lock } from 'lucide-react';
import { Field, Modal } from './ui';
import type { DavkaJizd } from '../lib/knihaJizdDb';
import {
  type UzavreneMesice,
  type VstupFormulare,
  type ZaznamJizdy,
  davkaPridani,
  davkaUpravy,
  jeTankovaniZaznam,
  klicMesice,
  planNoveJizdy,
  planUpravy,
  popisPosunu,
} from '../lib/knihaJizdFormular';
import { stavTachometruKDatu } from '../lib/knihaJizdRetez';
import { POZNAMKA_VYGENEROVANO } from '../lib/knihaJizd';

/** Účel, který se předvyplní u nové jízdy (stejný jako u vygenerovaných). */
export const VYCHOZI_UCEL = 'Rozvoz piva z objednávek & Svoz obalů';

/** Nejčastější účely mimo objednávky — jedno klepnutí místo psaní na telefonu. */
export const RYCHLE_UCELY = [
  'Rozvoz piva',
  'Nákup surovin',
  'Servis vozidla',
  'Úřad / banka / pošta',
];

const KM_FORMAT = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 });
const km = (x: number) => KM_FORMAT.format(x);

const cislo = (t: string): number => Number(t.trim().replace(',', '.'));

export type JizdaModalProps = {
  /** Co se zapisuje, když jde o NOVÝ záznam (u úpravy se pozná ze záznamu). */
  rezim: 'jizda' | 'tankovani';
  /** Upravovaný záznam; bez něj se zapisuje nový. */
  puvodni?: ZaznamJizdy | null;
  /** Všechny jízdy (z nich se bere návaznost tachometru a posun pozdějších). */
  jizdy: ZaznamJizdy[];
  uzavrene: UzavreneMesice;
  vozidla: string[];
  vychoziVozidlo: string;
  ridici: string[];
  vychoziRidic: string;
  vychoziDatum: string;
  onClose: () => void;
  /** Uloží dávku. Vrátí text chyby, nebo `null`, když se uložilo (okno pak zavře rodič). */
  onUlozit: (davka: DavkaJizd) => Promise<string | null>;
};

export default function KnihaJizdJizdaModal({
  rezim,
  puvodni = null,
  jizdy,
  uzavrene,
  vozidla,
  vychoziVozidlo,
  ridici,
  vychoziRidic,
  vychoziDatum,
  onClose,
  onUlozit,
}: JizdaModalProps) {
  const upravuje = !!puvodni;
  const tankovani = upravuje ? jeTankovaniZaznam(puvodni!) : rezim === 'tankovani';

  // Id a čas zápisu se určí jednou — kvůli pořadí záznamů i dávce je potřeba znát je předem.
  const nove = useRef<{ id: string; vytvoreno: string } | null>(null);
  if (!nove.current) nove.current = { id: puvodni?.id ?? crypto.randomUUID(), vytvoreno: new Date().toISOString() };

  const [datum, setDatum] = useState(puvodni?.date ?? vychoziDatum);
  const [vozidlo, setVozidlo] = useState(puvodni?.vehicle_name ?? vychoziVozidlo);
  const [ridic, setRidic] = useState(puvodni?.driver ?? vychoziRidic);
  const [kam, setKam] = useState(puvodni?.route_to ?? '');
  const [ucel, setUcel] = useState(puvodni?.purpose ?? (tankovani ? 'Tankování' : VYCHOZI_UCEL));
  const [ujeto, setUjeto] = useState(puvodni && !tankovani ? String(puvodni.km_driven) : '');
  const [litry, setLitry] = useState(puvodni?.fuel_liters != null ? String(puvodni.fuel_liters) : '');
  const [zacatekText, setZacatekText] = useState(puvodni ? String(puvodni.km_start) : '');
  const [zacatekRucne, setZacatekRucne] = useState(false);
  const [poznamka, setPoznamka] = useState(puvodni?.note ?? '');

  const [uklada, setUklada] = useState(false);
  const [chybaText, setChybaText] = useState<string | null>(null);

  const vozidloBeze = vozidlo.trim();
  const mesic = datum.slice(0, 7);
  const premisteno = upravuje && (puvodni!.vehicle_name !== vozidloBeze || puvodni!.date !== datum);

  // Kde auto v ten den stálo. U nového záznamu to je předvyplněný začátek; u úpravy má záznam
  // svůj začátek (jen při přesunu jinam se dopočítá znovu).
  const navazuje = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(datum) && vozidloBeze ? stavTachometruKDatu(jizdy, vozidloBeze, datum) : null),
    [jizdy, vozidloBeze, datum],
  );
  const zacatekPole = upravuje || zacatekRucne || navazuje == null ? zacatekText : String(navazuje);

  const vstup: VstupFormulare = {
    rezim: tankovani ? 'tankovani' : 'jizda',
    id: nove.current.id,
    datum,
    vozidlo,
    ridic,
    kam,
    ucel,
    ujeto: cislo(ujeto),
    litry: litry.trim() === '' ? null : cislo(litry),
    zacatek: zacatekPole.trim() === '' ? null : cislo(zacatekPole),
    zacatekRucne: upravuje || zacatekRucne,
    poznamka,
    vytvoreno: nove.current.vytvoreno,
  };

  const plan = useMemo(
    () => (puvodni ? planUpravy(vstup, puvodni, jizdy, uzavrene) : planNoveJizdy(vstup, jizdy, uzavrene)),
    // `vstup` se skládá z polí níž; seznam jízd a uzavřených měsíců se mění zřídka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puvodni, jizdy, uzavrene, datum, vozidlo, ridic, kam, ucel, ujeto, litry, zacatekPole, zacatekRucne, poznamka, tankovani],
  );

  const mesicUzavreny = !!vozidloBeze && /^\d{4}-\d{2}$/.test(mesic) && uzavrene.has(klicMesice(vozidloBeze, mesic));
  const vygenerovana = upravuje && (puvodni!.note ?? '').startsWith(POZNAMKA_VYGENEROVANO);
  const posun = plan.ok ? popisPosunu(plan) : '';

  // Vozidlo upravovaného záznamu musí být v nabídce, i když už v seznamu aut není.
  const nabidkaVozidel = vozidla.includes(vozidlo) || !vozidlo ? vozidla : [vozidlo, ...vozidla];

  async function ulozit(e: FormEvent) {
    e.preventDefault();
    if (uklada) return;
    if (!plan.ok) {
      setChybaText(plan.chyba);
      return;
    }
    setChybaText(null);
    setUklada(true);
    const chyba = await onUlozit(puvodni ? davkaUpravy(puvodni, plan) : davkaPridani(plan));
    if (chyba) {
      setUklada(false);
      setChybaText(chyba);
    }
  }

  const nadpis = upravuje ? (tankovani ? 'Upravit tankování' : 'Upravit jízdu') : tankovani ? 'Tankování' : 'Nová jízda';

  return (
    <Modal open onClose={onClose} title={nadpis}>
      <form onSubmit={ulozit} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <input type="date" className="input font-mono font-bold" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </Field>
          <Field label="Řidič">
            <input className="input font-bold" value={ridic} onChange={(e) => setRidic(e.target.value)} list="kniha-jizd-ridici" autoComplete="off" />
            <datalist id="kniha-jizd-ridici">
              {ridici.map((r) => <option key={r} value={r} />)}
            </datalist>
          </Field>
        </div>

        <Field label="Vozidlo">
          {nabidkaVozidel.length > 0 ? (
            <select className="input font-bold" value={vozidlo} onChange={(e) => setVozidlo(e.target.value)}>
              {nabidkaVozidel.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input className="input font-bold" value={vozidlo} onChange={(e) => setVozidlo(e.target.value)} placeholder="Např. Velké auto (Peugeot Boxer / 3K1 2244)" />
          )}
        </Field>

        {tankovani ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Natankováno (l)">
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                  className="input font-mono font-bold" value={litry} onChange={(e) => setLitry(e.target.value)} placeholder="např. 45,2"
                />
              </Field>
              <Field label="Kde (nepovinné)">
                <input className="input font-bold" value={kam} onChange={(e) => setKam(e.target.value)} placeholder="Čerpací stanice" />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Kam / trasa" hint="Návrat do Kynšperku se doplní sám.">
              <input className="input font-bold" value={kam} onChange={(e) => setKam(e.target.value)} placeholder="Např. Sokolov → Karlovy Vary" />
            </Field>

            <Field label="Účel jízdy">
              <input className="input font-bold" value={ucel} onChange={(e) => setUcel(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {RYCHLE_UCELY.map((u) => (
                  <button key={u} type="button" className="btn-ghost btn-sm" onClick={() => setUcel(u)}>{u}</button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Ujeté km" hint="Odhad stačí, rozdíl se doladí při uzavření měsíce.">
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0}
                  className="input font-mono font-bold" value={ujeto} onChange={(e) => setUjeto(e.target.value)}
                />
              </Field>
              <Field label="Natankováno (l)" hint="Nepovinné.">
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.01" min={0}
                  className="input font-mono font-bold" value={litry} onChange={(e) => setLitry(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        <Field
          label={tankovani ? 'Stav tachometru (km)' : 'Stav tachometru na začátku (km)'}
          hint={
            premisteno
              ? 'Při přesunu jinam se začátek dopočítá podle nového místa v řadě.'
              : !upravuje && !zacatekRucne && navazuje != null
                ? 'Navazuje na poslední jízdu auta.'
                : !upravuje && navazuje == null
                  ? 'Tohle auto zatím nemá žádnou jízdu — zadej stav palubní desky.'
                  : undefined
          }
        >
          <input
            type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0}
            className="input font-mono font-bold" value={premisteno && plan.ok ? String(plan.zaznam.km_start) : zacatekPole}
            disabled={premisteno}
            onChange={(e) => { setZacatekText(e.target.value); setZacatekRucne(true); }}
          />
          {!upravuje && zacatekRucne && navazuje != null && (
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => { setZacatekRucne(false); setZacatekText(''); }}>
              Navázat na poslední jízdu ({km(navazuje)} km)
            </button>
          )}
        </Field>

        <Field label="Poznámka (nepovinné)">
          <input className="input" value={poznamka} onChange={(e) => setPoznamka(e.target.value)} />
        </Field>

        {plan.ok && (
          <div className="text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded px-3 py-2 space-y-1">
            <div className="font-mono font-bold">
              {tankovani ? <Fuel className="ikona-text" /> : null} Tachometr: {km(plan.zaznam.km_start)} → {km(plan.zaznam.km_end)} km
            </div>
            {posun && <div className="text-sky-800 font-semibold">{posun}</div>}
          </div>
        )}

        {vygenerovana && (
          <div className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded px-3 py-2 font-semibold">
            <Info className="ikona-text" /> Jízda vznikla z objednávek. Po úpravě ji už „Generovat z objednávek“ nepřepíše.
          </div>
        )}

        {mesicUzavreny && (
          <div role="alert" className="text-sm text-amber-950 bg-amber-50 border border-amber-300 rounded px-3 py-2 font-bold">
            <Lock className="ikona-text" /> Měsíc {Number(mesic.slice(5))}/{mesic.slice(0, 4)} auta {vozidloBeze} je uzavřený — nejdřív ho otevři.
          </div>
        )}

        {chybaText && (
          <div role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded px-3 py-2 font-bold">
            <AlertTriangle className="ikona-text" /> {chybaText}
          </div>
        )}

        <div className="lista-akci pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button type="submit" className="btn-primary" disabled={uklada || mesicUzavreny}>
            {uklada ? 'Ukládám…' : upravuje ? 'Uložit změny' : 'Uložit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
