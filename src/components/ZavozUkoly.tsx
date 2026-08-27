import { ArrowLeftRight, GlassWater, Receipt, StickyNote, Disc } from 'lucide-react';
import { IkonaSud, IkonaLahev, IkonaVycep } from './ikony';
import { ukolyZPoznamky, souhrnUkolu, type UkolKlic } from '../lib/zavozUkoly';

/**
 * Úkoly k závozu — co kromě piva naložit nebo přivézt zpátky.
 *
 * Požadavky jako „ještě vyzvednout sudy" nebo „přidat podtácky" dosud
 * skončily v poznámce objednávky, kde je vidět jen malá kurzíva pod jménem
 * odběratele. Při nakládání auta se to přehlédne — proto z poznámky vznikají
 * štítky a nad každým dnem souhrn „nezapomeň naložit".
 *
 * Poznámka zůstává vidět tak jako dřív; tohle je navíc, ne místo ní.
 */

const IKONY: Record<UkolKlic, (p: { size?: number; className?: string }) => JSX.Element> = {
  sudy: (p) => <ArrowLeftRight {...p} />,
  lahve: (p) => <IkonaLahev {...p} />,
  vycep: (p) => <IkonaVycep {...p} />,
  sklo: (p) => <GlassWater {...p} />,
  podtacky: (p) => <Disc {...p} />,
  spotak: (p) => <StickyNote {...p} />,
  faktura: (p) => <Receipt {...p} />,
};

/**
 * Vyzvednutí sudů je jediný úkol, který se dělá NA MÍSTĚ a při zapomenutí
 * znamená cestu znovu — proto svítí červeně, zbytek je klidně žlutý.
 */
const TONY: Record<UkolKlic, string> = {
  sudy: 'bg-rose-100 text-rose-900 border-rose-300',
  lahve: 'bg-rose-50 text-rose-900 border-rose-200',
  vycep: 'bg-amber-100 text-amber-900 border-amber-300',
  sklo: 'bg-amber-100 text-amber-900 border-amber-300',
  podtacky: 'bg-amber-100 text-amber-900 border-amber-300',
  spotak: 'bg-amber-100 text-amber-900 border-amber-300',
  faktura: 'bg-sky-100 text-sky-900 border-sky-300',
};

/** Štítky u jedné objednávky. Když poznámka nic neobsahuje, nevykreslí nic. */
export function UkolyObjednavky({ poznamka }: { poznamka: string | null | undefined }) {
  const ukoly = ukolyZPoznamky(poznamka);
  if (ukoly.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {ukoly.map((u) => {
        const Ikona = IKONY[u.klic];
        return (
          <span
            key={u.klic}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-black text-[11px] ${TONY[u.klic]}`}
          >
            <Ikona size={13} className="shrink-0" />
            {u.popis}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Souhrn za celý den nad seznamem objednávek. Bez něj by se úkoly musely
 * hledat proklikáním všech karet dne — což při nakládání nikdo nedělá.
 */
export function UkolyDne({
  objednavky,
}: {
  objednavky: { note: string | null | undefined; place_name: string | null | undefined }[];
}) {
  const souhrn = souhrnUkolu(objednavky.map((o) => ({ poznamka: o.note, odberatel: o.place_name })));
  if (souhrn.length === 0) return null;

  return (
    <div className="rounded border-2 border-rose-300/80 bg-rose-50/70 px-3.5 py-3">
      <div className="font-display font-black text-sm text-rose-900 mb-2">
        Nezapomeňte k tomuhle dni
      </div>
      <div className="space-y-1.5">
        {souhrn.map((u) => {
          const Ikona = IKONY[u.klic];
          return (
            <div key={u.klic} className="flex items-start gap-2 text-xs">
              <Ikona size={14} className="shrink-0 mt-0.5 text-rose-800" />
              <div className="min-w-0">
                <span className="font-black text-neutral-900">{u.popis}</span>
                <span className="text-neutral-600 font-medium"> — {u.odberatele.join(', ')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
