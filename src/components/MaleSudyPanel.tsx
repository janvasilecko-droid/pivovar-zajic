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
        Naklikej, kolik máš prázdných malých sudů. Velké číslo je, kolik jich zbývá po otevřených objednávkách. Objednávky hlídají, aby je otevřené objednávky dohromady
        nepřečerpaly — co je navíc, označí červeně.
      </p>
      {male.length === 0 && <div className="card p-4 text-sm text-neutral-600">V obalech není žádný malý sud (KEG pod 30 l).</div>}
      {male.map((pk) => {
        const mame = zasoba[pk.id];
        const hlida = mame != null;
        const s = souhrn.find((x) => x.package_id === pk.id);
        // Velké číslo = kolik jich ještě zbývá po otevřených objednávkách
        // (5. 10. 2026: „mám 2× 20 l, v objednávce 2× 20 l 12° Světlá —
        // v malých se po objednávce ukáže 0 u 20 l").
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
                  disabled={!canEdit || !hlida || volne <= 0}
                  onClick={() => nastav(pk.id, (mame ?? 0) - 1)}
                >
                  <Minus size={18} />
                </button>
                <span className="w-12 text-center text-2xl font-black tabular-nums text-neutral-950" aria-live="polite">
                  {nacteno ? (hlida ? volne : '–') : '…'}
                </span>
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
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={`font-bold ${s && s.nad > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  Prázdných celkem {mame}, v otevřených objednávkách {objednano}
                  {(s?.zapocitanoPlnych ?? 0) > 0 ? ` (dalších ${s!.zapocitanoPlnych} pokryjí plné skladem)` : ''}
                  {s && s.nad > 0 ? ` — o ${s.nad} víc, než máš` : ''}
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
