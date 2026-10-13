// 🛢️ Malé sudy — kolik máme KEG 20/15/10 l. Záložka v Objednávkách
// a samostatná dlaždice na ploše (29. 9. 2026: „ty malé sudy udělej jako
// samostatnou dlaždici a záložku dej k objednávkám"; dřív byla v KEG).
//
// Z provozu 29. 9. 2026: „pro stáčení sudů připrav záložku malé sudy, tam
// naklikám počet malých sudů 20, 15, 10, a pak mi v objednávkách hlídej…"
// Počet se ukládá do tabulky male_sudy (sdílená pro všechny), Objednávky
// podle něj označí položky nad počet (lib/maleSudy.ts).
import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { supabase, formatPackageLabel } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { canUserEdit, getUserPermissions } from '../lib/permissions';
import { Spinner } from './ui';
import { jeMalySud, type ObalProSudy } from '../lib/maleSudy';
import { useHlidaniMalychSudu, useMaleSudy } from '../lib/useMaleSudy';
import { chyba } from '../lib/toast';

/** Číslo, na které se dá klepnout a přepsat; ukládá se po opuštění pole nebo Enteru. */
function PocetPrazdnych({ hodnota, zobraz, povoleno, popisek, ulozit }: {
  hodnota: number | null;
  zobraz?: string;
  povoleno: boolean;
  popisek: string;
  ulozit: (n: number) => void;
}) {
  const [rozepsano, setRozepsano] = useState<string | null>(null);
  if (hodnota == null) {
    return <span className="w-14 text-center text-2xl font-black tabular-nums text-neutral-950">{zobraz ?? '–'}</span>;
  }
  const potvrd = () => {
    if (rozepsano == null) return;
    const n = Math.floor(Number(rozepsano));
    setRozepsano(null);
    if (Number.isFinite(n) && n >= 0 && n !== hodnota) ulozit(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={popisek}
      disabled={!povoleno}
      value={rozepsano ?? String(hodnota)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setRozepsano(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={potvrd}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="w-16 h-11 text-center text-2xl font-black tabular-nums text-neutral-950 bg-transparent border border-transparent focus:border-amber-400 focus:bg-white rounded"
    />
  );
}

export function MaleSudyPanel({ packages, canEdit, kdo }: {
  packages: (ObalProSudy & { sort_order?: number | null })[];
  canEdit: boolean;
  kdo?: string | null;
}) {
  const { zasoba, zapocitatPlne, umiZapocitatPlne, nacteno, chybiMigrace, ulozit, nastavZapocitatPlne } = useMaleSudy();
  const { souhrn, jmenaPiv } = useHlidaniMalychSudu(zasoba, undefined, zapocitatPlne);
  const male = packages
    .filter(jeMalySud)
    .sort((a, b) => Number(b.volume_l) - Number(a.volume_l));

  async function nastav(id: string, pocet: number | null) {
    const e = await ulozit(id, pocet == null ? null : Math.max(0, pocet), kdo);
    if (e) chyba(`Počet se neuložil: ${e}`);
  }
  async function odpovez(id: string, ano: boolean) {
    const e = await nastavZapocitatPlne(id, ano);
    if (e) chyba(`Volba se neuložila: ${e}`);
  }

  if (chybiMigrace) {
    return (
      <div className="card p-4 text-sm text-neutral-700">
        Evidence malých sudů ještě není v databázi (čeká úprava databáze). Zkuste to prosím za pár minut znovu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Naklikej, kolik máš prázdných malých sudů — velké číslo je přesně to, co zadáš. Pod ním je „K dispozici": prázdné minus sudy, které berou otevřené
        objednávky (např. pro Radka), tedy kolik se ještě dá stočit pro dalšího. Co objednávky přečerpají, označí červeně.
      </p>
      {male.length === 0 && <div className="card p-4 text-sm text-neutral-600">V obalech není žádný malý sud (KEG pod 30 l).</div>}
      {male.map((pk) => {
        const mame = zasoba[pk.id];
        const hlida = mame != null;
        const s = souhrn.find((x) => x.package_id === pk.id);
        // Velké číslo = PŘESNĚ to, co člověk naklikal (kolik má prázdných).
        // Dřív ukazovalo zbytek po objednávkách (5. 10. 2026), a tak 7 prázdných
        // při 5 objednaných ukázalo 2 — a aby se na displeji dostal na 7, musel
        // člověk naklikat 12 („proč je tam prázdných 12, mají být tolik, kolik
        // jsem jich zadal", 13. 10. 2026). Zbytek po objednávkách je pod číslem.
        const objednano = s?.objednano ?? 0;
        const volne = hlida ? Math.max(0, mame - objednano) : 0;
        return (
          <div key={pk.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="font-display font-black text-lg text-neutral-950">{formatPackageLabel(pk.label ?? '')}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost !rounded !px-3"
                  aria-label={`Ubrat ${pk.label}`}
                  disabled={!canEdit || !hlida || (mame ?? 0) <= 0}
                  onClick={() => nastav(pk.id, (mame ?? 0) - 1)}
                >
                  <Minus size={18} />
                </button>
                {/* Počet jde i NAPSAT (klepnout na číslo): po změně logiky zůstaly
                    uložené staré počty a nastavovat je po jednom klikáním bylo
                    zdlouhavé. Uloží se při opuštění pole / Enter. */}
                <PocetPrazdnych
                  hodnota={nacteno && hlida ? (mame as number) : null}
                  zobraz={nacteno ? (hlida ? undefined : '–') : '…'}
                  povoleno={canEdit && nacteno}
                  popisek={`Počet prázdných ${pk.label}`}
                  ulozit={(n) => nastav(pk.id, n)}
                />
                <button
                  type="button"
                  className="btn-ghost !rounded !px-3"
                  aria-label={`Přidat ${pk.label}`}
                  disabled={!canEdit}
                  onClick={() => nastav(pk.id, (mame ?? 0) + 1)}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {hlida && (
              <div
                className={`rounded border px-3 py-2 flex items-center justify-between gap-3 ${
                  s && s.nad > 0
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : volne > 0
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                {/* K DISPOZICI = prázdné − malé sudy v otevřených objednávkách:
                    kolik se ještě dá stočit pro dalšího odběratele (13. 10. 2026:
                    „jak to, že mi vše svítí zeleně, když je v objednávce pro
                    Radka plno malých zabraných… tady se mají ukazovat k dispozici
                    jen ty, které se dají stočit… to je k dispozici dál pro
                    Maneo"). Zelená = ještě něco zbývá, žlutá = zbývá nula,
                    červená = objednávky chtějí víc, než je prázdných. */}
                <div className="text-sm font-bold">
                  <div className="text-xs uppercase tracking-wide opacity-80">K dispozici</div>
                  <div>
                    v otevřených objednávkách {objednano}
                    {(s?.zapocitanoPlnych ?? 0) > 0 ? ` (dalších ${s!.zapocitanoPlnych} pokryjí plné skladem)` : ''}
                    {s && s.nad > 0 ? ` — o ${s.nad} víc, než máš` : ''}
                  </div>
                </div>
                <span className="text-3xl font-black tabular-nums" aria-live="polite">
                  {s && s.nad > 0 ? `−${s.nad}` : volne}
                </span>
              </div>
            )}
            {/* Plné sudy skladem: otázka, jestli je započítat (6. 10. 2026:
                „když ne, nepočítej je, když jo, tak je počítej"). Bez odpovědi
                se nepočítají — číslo nahoře jsou prázdné sudy. */}
            {hlida && s && Object.keys(s.plneSkladem ?? {}).length > 0 && (() => {
              const zapocitat = zapocitatPlne.has(pk.id);
              return (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 space-y-2 text-sm font-bold text-amber-950">
                  <div>
                    Skladem jsou plné: {Object.entries(s.plneSkladem ?? {}).map(([b, n]) => `${n}× ${jmenaPiv.get(b) ?? '?'}`).join(', ')}.
                    {umiZapocitatPlne ? ' Započítat je do objednávek?' : ''}
                  </div>
                  {umiZapocitatPlne ? (
                    <div className="flex gap-2">
                      <button type="button" className={`${zapocitat ? 'btn-primary' : 'btn-ghost'} flex-1 min-h-[48px]`} disabled={!canEdit} aria-pressed={zapocitat} onClick={() => odpovez(pk.id, true)}>
                        Ano, započítat
                      </button>
                      <button type="button" className={`${zapocitat ? 'btn-ghost' : 'btn-primary'} flex-1 min-h-[48px]`} disabled={!canEdit} aria-pressed={!zapocitat} onClick={() => odpovez(pk.id, false)}>
                        Ne
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-semibold">Volba „započítat" půjde po spuštění migrace 20261231260100 — zatím se plné nepočítají.</div>
                  )}
                </div>
              );
            })()}
            {!hlida && (
              <div className="text-xs text-neutral-500">Zatím se nehlídá — klepni na + a zadej, kolik jich máš. Ostatní malé sudy bez čísla se pak berou jako 0.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Celá obrazovka (záložka Objednávek / dlaždice): sama si načte obaly a práva. */
export function MaleSudyObrazovka() {
  const { profile, user } = useAuth();
  const [packages, setPackages] = useState<(ObalProSudy & { sort_order?: number | null })[] | null>(null);
  useEffect(() => {
    let zivy = true;
    supabase.from('packages').select('id, kind, volume_l, label, sort_order').order('sort_order').then(({ data }) => {
      if (zivy) setPackages((data ?? []) as (ObalProSudy & { sort_order?: number | null })[]);
    });
    return () => { zivy = false; };
  }, []);
  if (!packages) return <Spinner />;
  // Zápis do male_sudy hlídá databáze podle práva na KEG (migrace
  // 20261231160000_male_sudy.sql) — tlačítka tomu odpovídají.
  const canEdit = canUserEdit(profile?.role, user?.id, 'kegging', getUserPermissions(user?.id ?? '', (profile as any)?.permissions));
  return <MaleSudyPanel packages={packages} canEdit={canEdit} kdo={profile?.display_name ?? null} />;
}
