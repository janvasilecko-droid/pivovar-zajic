import { ArrowLeftRight, Check, GlassWater, Receipt, StickyNote, Disc } from 'lucide-react';
import { IkonaLahev, IkonaVycep } from './ikony';
import { ukolyZPoznamky, souhrnUkolu, type UkolKlic } from '../lib/zavozUkoly';
import { klicUkolu } from '../lib/zavozUkolyDb';

/**
 * Úkoly k závozu — co kromě piva naložit nebo přivézt zpátky.
 *
 * Požadavky jako „ještě vyzvednout sudy" nebo „přidat podtácky" dosud
 * skončily v poznámce objednávky, kde je vidět jen malá kurzíva pod jménem
 * odběratele. Při nakládání auta se to přehlédne — proto z poznámky vznikají
 * štítky a nad každým dnem souhrn „nezapomeň naložit".
 *
 * Štítek je zároveň odškrtávátko: klepnutím se úkol označí za splněný.
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
  sudy: 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200',
  lahve: 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100',
  vycep: 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200',
  sklo: 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200',
  podtacky: 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200',
  spotak: 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200',
  faktura: 'bg-sky-100 text-sky-900 border-sky-300 hover:bg-sky-200',
};

const TON_SPLNENO = 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200';

export type UkolyProps = {
  poznamka: string | null | undefined;
  /** Bez id se štítky jen zobrazí — odškrtnout je nelze. */
  orderId?: string;
  hotove?: Set<string>;
  onPrepni?: (orderId: string, klic: UkolKlic, hotovo: boolean) => void;
};

/** Štítky u jedné objednávky. Když poznámka nic neobsahuje, nevykreslí nic. */
export function UkolyObjednavky({ poznamka, orderId, hotove, onPrepni }: UkolyProps) {
  const ukoly = ukolyZPoznamky(poznamka);
  if (ukoly.length === 0) return null;

  const lzeOdskrtnout = Boolean(orderId && onPrepni);

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {ukoly.map((u) => {
        const Ikona = IKONY[u.klic];
        const splneno = Boolean(orderId && hotove?.has(klicUkolu(orderId, u.klic)));
        // 44 px na výšku — štítek se odškrtává v autě, prstem a v rukavici.
        const tridy = `inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded border font-black text-udaj text-left transition ${
          splneno ? TON_SPLNENO : TONY[u.klic]
        }`;

        if (!lzeOdskrtnout) {
          return (
            <span key={u.klic} className={tridy}>
              <Ikona size={14} className="shrink-0" />
              {u.popis}
            </span>
          );
        }

        return (
          <button
            key={u.klic}
            type="button"
            onClick={() => onPrepni!(orderId!, u.klic, !splneno)}
            className={tridy}
            title={splneno ? 'Klepnutím zrušit odškrtnutí' : 'Klepnutím označit za hotové'}
          >
            <span
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                splneno ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-white/70 border-current'
              }`}
            >
              {splneno ? <Check size={12} strokeWidth={4} /> : <Ikona size={12} />}
            </span>
            <span className={splneno ? 'line-through opacity-70' : ''}>{u.popis}</span>
          </button>
        );
      })}
    </div>
  );
}

export type UkolyDneProps = {
  objednavky: { id?: string; note: string | null | undefined; place_name: string | null | undefined }[];
  hotove?: Set<string>;
};

/**
 * Souhrn za celý den nad seznamem objednávek. Bez něj by se úkoly musely
 * hledat proklikáním všech karet dne — což při nakládání nikdo nedělá.
 *
 * Hotové úkoly ze souhrnu mizí. Když je hotové všechno, zmizí celý pruh —
 * jinak by ve výhledu zůstala trvalá červená výstraha, kterou se člověk
 * naučí přehlížet, a s ní i ta příští, na které záleží.
 */
export function UkolyDne({ objednavky, hotove }: UkolyDneProps) {
  const souhrn = souhrnUkolu(
    objednavky.map((o) => ({
      poznamka: o.note,
      odberatel: o.place_name,
      // Odškrtnuté úkoly se z poznámky vyfiltrují až tady, aby se souhrn
      // počítal ze stejné funkce jako štítky u odběratelů.
      vynechat: o.id && hotove
        ? ukolyZPoznamky(o.note).filter((u) => hotove.has(klicUkolu(o.id!, u.klic))).map((u) => u.klic)
        : [],
    })),
  );

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
