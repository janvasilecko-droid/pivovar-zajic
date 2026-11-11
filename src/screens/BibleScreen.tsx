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
import { Suspense, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Calculator, Factory, FlaskConical, Lock, Search, Settings, Stethoscope, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { bibleRole } from '../lib/bibleOpravneni';
import { cestaKnihy, rozeberCestuKnihy } from '../lib/bibleCteni';
import { lazyStranka } from '../lib/lazyStranka';
import { BibleKnihovna } from '../components/bible/BibleKnihovna';
import { BibleSprava } from '../components/bible/BibleSprava';
import { BibleZkusenosti } from '../components/bible/BibleZkusenosti';
import { BiblePripravujeme } from '../components/bible/BiblePripravujeme';
import { BibleHledani } from '../components/bible/BibleHledani';
import { BibleVypocty } from '../components/bible/BibleVypocty';
import { BibleTechnologie } from '../components/bible/BibleTechnologie';
import { BibleVarky } from '../components/bible/BibleVarky';
import { BibleProblemy } from '../components/bible/BibleProblemy';

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
  // Zatím hledání v knihách (3. 11. 2026, majitel k chatbotu: „zatím jen hledání").
  { id: 'chat', nazev: 'Hledání v knihách', popis: 'Česky i v anglických knihách, s otevřením stránky', ikona: Search },
  { id: 'knihovna', nazev: 'Knihovna dokumentů', popis: 'Odborná knihovna: knihy, nahrávání, zpracování a čtení', ikona: BookOpen },
  // Etapy 6a a 6b (4. a 11. 11. 2026): výpočty s ověřenými vzorci; stejný kód počítá i Claude přes konektor.
  { id: 'vypocty', nazev: 'Výpočtová laboratoř', popis: 'Extrakt, alkohol, IBU, chlazení, voda, potrubí, CIP, energie, daň a náklady', ikona: Calculator },
  // Etapa 7 (11. 11. 2026): parametry provozu se zdrojem; Claude je čte nástrojem profil_pivovaru.
  { id: 'technologie', nazev: 'Technologie pivovaru', popis: 'Profil pivovaru: varna, tanky, čerpadla, chlazení a provozní postupy', ikona: Factory },
  // Etapa 8 (11. 11. 2026): evidence várek, porovnání stejným kódem jako Claude (porovnej_varky), nic se nedomýšlí.
  { id: 'varky', nazev: 'Receptury a várky', popis: 'Evidence várek, receptury a porovnání várek s cíli a výtěžkem', ikona: FlaskConical },
  // Etapa 10 (11. 11. 2026): problémy se zjištěními šesti typů, porovnání dotčených várek a trend; příčiny hledá Claude přes konektor (R14).
  { id: 'problemy', nazev: 'Analýza problémů', popis: 'Příčiny vad a odchylek: fakta, hypotézy, co chybí a trend várek', ikona: Stethoscope },
  { id: 'zkusenosti', nazev: 'Zkušenosti sládků', popis: 'Praxe s úrovní důvěryhodnosti 1–5, ruční zápis', ikona: Users },
  { id: 'sprava', nazev: 'Správa znalostí', popis: 'Oblasti A–T, přístup, kapacita, AI', ikona: Settings },
];

const SEKCE = new Set<string>(['plocha', ...BIBLE_DLAZDICE.map((d) => d.id)]);
export const jeBibleSekce = (s: string | undefined): s is BibleSekce => !!s && SEKCE.has(s);

// Čtečka knihy má vlastní líný kus — plochu bible ani start appky nezvětší.
const BibleKniha = lazyStranka(() => import('../components/bible/BibleKniha'));

export default function BibleScreen({ setPage, pageSubTab }: {
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}) {
  const { profile } = useAuth();
  const role = bibleRole(profile?.role, (profile as { permissions?: unknown } | null)?.permissions);
  const [sekce, setSekce] = useState<BibleSekce>(jeBibleSekce(pageSubTab) ? pageSubTab : 'plocha');
  // Otevřená kniha (trasa 'kniha:<id>[:<list>]') má přednost před sekcí.
  const [kniha, setKniha] = useState(() => rozeberCestuKnihy(pageSubTab));
  // „Najít v knihách“ z Výpočtové laboratoře: hledání se otevře s tímto dotazem.
  const [dotazHledani, setDotazHledani] = useState<string | null>(null);

  useEffect(() => {
    setSekce(jeBibleSekce(pageSubTab) ? pageSubTab : 'plocha');
    setKniha(rozeberCestuKnihy(pageSubTab));
  }, [pageSubTab]);

  function jdi(s: BibleSekce) {
    setKniha(null);
    setDotazHledani(null);
    setSekce(s);
    // Do historie stránek, ať tlačítko Zpět vrátí na plochu bible.
    setPage?.('bible', undefined, s === 'plocha' ? '' : s);
  }

  function otevriKnihu(id: string, list: number | null = null) {
    setKniha({ id, list });
    setPage?.('bible', undefined, cestaKnihy(id, list));
  }

  const dlazdice = kniha ? undefined : BIBLE_DLAZDICE.find((d) => d.id === sekce);

  return (
    <div className="bible-plocha rounded-2xl bg-neutral-950 text-neutral-100 border border-neutral-800 p-3 sm:p-5 space-y-4 min-h-[70vh]">
      <header className="flex items-center gap-3">
        {kniha ? (
          <button type="button" className="btn-tmave w-11 px-0" aria-label="Zpět do knihovny" onClick={() => jdi('knihovna')}>
            <ArrowLeft size={20} />
          </button>
        ) : sekce !== 'plocha' && (
          <button type="button" className="btn-tmave w-11 px-0" aria-label="Zpět na plochu bible" onClick={() => jdi('plocha')}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">Pivovarská bible</div>
          <h1 className="text-lg sm:text-xl font-black text-neutral-50 truncate">{kniha ? 'Čtení knihy' : dlazdice ? dlazdice.nazev : 'Digitální hlavní sládek'}</h1>
        </div>
      </header>

      {role === null ? (
        <div role="alert" className="rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 p-4 space-y-2">
          <div className="flex items-center gap-2 font-black"><Lock size={18} className="text-amber-400" /> Do Pivovarské bible nemáš přístup.</div>
          <p className="text-sm text-neutral-300">
            Knihy v knihovně jsou soukromé a chráněné autorským právem. Přístup povoluje admin v Uživatelé → Práva → „Pivovarská bible".
          </p>
        </div>
      ) : kniha ? (
        <Suspense fallback={<div className="text-sm text-neutral-300">Načítám čtečku…</div>}>
          <BibleKniha key={kniha.id} id={kniha.id} pocatecniList={kniha.list} doKnihovny={() => jdi('knihovna')} />
        </Suspense>
      ) : sekce === 'plocha' ? (
        <BiblePlocha jdi={jdi} />
      ) : sekce === 'knihovna' ? (
        <BibleKnihovna role={role} setPage={setPage} onCist={(id) => otevriKnihu(id)} />
      ) : sekce === 'chat' ? (
        <BibleHledani key={dotazHledani ?? ''} otevri={(id, list) => otevriKnihu(id, list)} pocatecniDotaz={dotazHledani ?? undefined} />
      ) : sekce === 'vypocty' ? (
        <BibleVypocty hledej={(dotaz) => { jdi('chat'); setDotazHledani(dotaz); }} />
      ) : sekce === 'zkusenosti' ? (
        <BibleZkusenosti role={role} />
      ) : sekce === 'technologie' ? (
        <BibleTechnologie role={role} />
      ) : sekce === 'varky' ? (
        <BibleVarky role={role} />
      ) : sekce === 'problemy' ? (
        <BibleProblemy role={role} />
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
