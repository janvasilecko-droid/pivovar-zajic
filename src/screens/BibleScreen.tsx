// 📚 Pivovarská bible — digitální hlavní sládek.
// ---------------------------------------------------------------------------
// Zadání majitele 30. 10. 2026 („PIVOVARSKÁ BIBLE AI"): odborná knihovna
// pivovarské literatury, nad kterou odpovídá AI (Claude) s citací kniha –
// kapitola – strana, výpočtový engine, profil pivovaru a analýza várek.
// Návrh a etapy: docs/pivovarska-bible/.
//
// Tmavá průmyslová plocha s 8 dlaždicemi přesně podle zadání (bod 10).
// Hotová je Knihovna dokumentů (nahrávání a stav zpracování) a Správa
// znalostí. Ostatní dlaždice poctivě říkají, ve které etapě přijdou — nic
// se netváří, že funguje, dokud nefunguje (zadání, bod 6 knihovny).
//
// Přístup je fail-closed (lib/bibleOpravneni.ts, databáze to vynucuje sama).
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Bot, Calculator, Factory, FlaskConical, Lock, Settings, Stethoscope, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { bibleRole } from '../lib/bibleOpravneni';
import { BibleKnihovna } from '../components/bible/BibleKnihovna';
import { BibleSprava } from '../components/bible/BibleSprava';
import { BiblePripravujeme } from '../components/bible/BiblePripravujeme';

export type BibleSekce = 'plocha' | 'chat' | 'knihovna' | 'vypocty' | 'technologie' | 'varky' | 'problemy' | 'zkusenosti' | 'sprava';

export type BibleDlazdice = {
  id: Exclude<BibleSekce, 'plocha'>;
  nazev: string;
  popis: string;
  ikona: LucideIcon;
  /** Etapa, ve které dlaždice začne fungovat; chybí = už funguje. */
  etapa?: number;
  /** Co v ní bude — ukazuje se, dokud není hotová. */
  bude?: string;
};

export const BIBLE_DLAZDICE: readonly BibleDlazdice[] = [
  {
    id: 'chat', nazev: 'Odborný chatbot', popis: 'Otázky s citací knihy, kapitoly a strany', ikona: Bot, etapa: 5,
    bude: 'Claude odpoví jen z nalezených pasáží knihovny a u každého tvrzení řekne, odkud je (kniha, kapitola, strana). Rozliší literaturu, výpočet, praxi a vlastní doporučení. Navazující otázky a historie konverzací.',
  },
  { id: 'knihovna', nazev: 'Knihovna dokumentů', popis: 'Odborná knihovna: knihy, nahrávání, stav zpracování', ikona: BookOpen },
  {
    id: 'vypocty', nazev: 'Výpočtová laboratoř', popis: 'Plato, výtěžnost, rmutování, IBU, voda, hydraulika', ikona: Calculator, etapa: 6,
    bude: 'Samostatné výpočetní moduly s testy z ručně ověřených příkladů. Každý výsledek ukáže vstupy, jednotky, vzorec, předpoklady, rozsah platnosti a nejistotu.',
  },
  {
    id: 'technologie', nazev: 'Technologie pivovaru', popis: 'Profil pivovaru: varna, nádoby, čerpadla, chlazení', ikona: Factory, etapa: 7,
    bude: 'Typ varny, objemy nádob, technologické schéma, čerpadla, potrubí, výměníky, chlazení, kvasné a ležácké tanky a provozní postupy. Jde založit i další pivovary.',
  },
  {
    id: 'varky', nazev: 'Receptury a várky', popis: 'Evidence várek a hledání příčin odchylek', ikona: FlaskConical, etapa: 8,
    bude: 'Receptura, slady, voda, rmutování, scezování, hustoty, objemy, chmelovar, kvašení a laboratorní hodnoty. AI porovná várky z uložených údajů a nic si nedomýšlí.',
  },
  {
    id: 'problemy', nazev: 'Analýza problémů', popis: 'Příčiny vad a odchylek z literatury a dat', ikona: Stethoscope, etapa: 10,
    bude: 'Řešení technologických problémů (oblast T): chatbot nad várkami, výpočty a literaturou, s jasným označením, co je fakt, co hypotéza a co chybí.',
  },
  {
    id: 'zkusenosti', nazev: 'Zkušenosti sládků', popis: 'Praxe s úrovní důvěryhodnosti', ikona: Users, etapa: 3,
    bude: 'Případové studie, postupy a řešení problémů s důvěryhodností 1–5 (ověřená publikace → neověřená informace). Ruční zápis z vlastního provozu. Jednotlivá zkušenost se nikdy nevydává za pravidlo.',
  },
  { id: 'sprava', nazev: 'Správa znalostí', popis: 'Oblasti A–T, přístup, kapacita, AI', ikona: Settings },
];

const SEKCE = new Set<string>(['plocha', ...BIBLE_DLAZDICE.map((d) => d.id)]);
export const jeBibleSekce = (s: string | undefined): s is BibleSekce => !!s && SEKCE.has(s);

export default function BibleScreen({ setPage, pageSubTab }: {
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}) {
  const { profile } = useAuth();
  const role = bibleRole(profile?.role, (profile as { permissions?: unknown } | null)?.permissions);
  const [sekce, setSekce] = useState<BibleSekce>(jeBibleSekce(pageSubTab) ? pageSubTab : 'plocha');

  useEffect(() => {
    setSekce(jeBibleSekce(pageSubTab) ? pageSubTab : 'plocha');
  }, [pageSubTab]);

  function jdi(s: BibleSekce) {
    setSekce(s);
    // Do historie stránek, ať tlačítko Zpět vrátí na plochu bible.
    setPage?.('bible', undefined, s === 'plocha' ? '' : s);
  }

  const dlazdice = BIBLE_DLAZDICE.find((d) => d.id === sekce);

  return (
    <div className="rounded-2xl bg-neutral-950 text-neutral-100 border border-neutral-800 p-3 sm:p-5 space-y-4 min-h-[70vh]">
      <header className="flex items-center gap-3">
        {sekce !== 'plocha' && (
          <button type="button" className="btn-tmave w-11 px-0" aria-label="Zpět na plochu bible" onClick={() => jdi('plocha')}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">Pivovarská bible</div>
          <h1 className="text-lg sm:text-xl font-black text-neutral-50 truncate">{dlazdice ? dlazdice.nazev : 'Digitální hlavní sládek'}</h1>
        </div>
      </header>

      {role === null ? (
        <div role="alert" className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
          <div className="flex items-center gap-2 font-black"><Lock size={18} className="text-amber-400" /> Do Pivovarské bible nemáš přístup.</div>
          <p className="text-sm text-neutral-300">
            Knihy v knihovně jsou soukromé a chráněné autorským právem. Přístup povoluje admin v Uživatelé → Práva → „Pivovarská bible".
          </p>
        </div>
      ) : sekce === 'plocha' ? (
        <BiblePlocha jdi={jdi} />
      ) : sekce === 'knihovna' ? (
        <BibleKnihovna role={role} setPage={setPage} />
      ) : sekce === 'sprava' ? (
        <BibleSprava role={role} setPage={setPage} />
      ) : dlazdice ? (
        <BiblePripravujeme dlazdice={dlazdice} jdiDoKnihovny={() => jdi('knihovna')} />
      ) : null}
    </div>
  );
}

function BiblePlocha({ jdi }: { jdi: (s: BibleSekce) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Odborná knihovna pivovarské literatury a AI sládek, který odpovídá jen z nahraných a zpracovaných knih. U každého tvrzení řekne, odkud je, a čísla počítá samostatný výpočetní modul.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BIBLE_DLAZDICE.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => jdi(d.id)}
            className="btn flex-col items-start justify-between text-left gap-3 p-4 min-h-[128px] bg-neutral-900 text-neutral-100 border border-neutral-700 hover:border-amber-500 hover:bg-neutral-800"
          >
            <d.ikona size={26} className="text-amber-400" />
            <span className="space-y-1">
              <span className="block text-sm font-black leading-tight">{d.nazev}</span>
              <span className="block text-xs font-semibold text-neutral-300 leading-snug">{d.popis}</span>
              {d.etapa && <span className="block text-[11px] font-black uppercase tracking-wide text-amber-300">Připravujeme · etapa {d.etapa}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
