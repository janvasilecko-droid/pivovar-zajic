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
  const { zasoba, nacteno, chybiMigrace, ulozit } = useMaleSudy();
  const { souhrn } = useHlidaniMalychSudu(zasoba);
  const male = packages
    .filter(jeMalySud)
    .sort((a, b) => Number(b.volume_l) - Number(a.volume_l));

  async function nastav(id: string, pocet: number | null) {
    const e = await ulozit(id, pocet == null ? null : Math.max(0, pocet), kdo);
    if (e) chyba(`Počet se neuložil: ${e}`);
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
        Naklikej, kolik máš malých sudů. Objednávky pak hlídají, aby je otevřené objednávky dohromady
        nepřečerpaly — co je navíc, označí červeně.
      </p>
      {male.length === 0 && <div className="card p-4 text-sm text-neutral-600">V obalech není žádný malý sud (KEG pod 30 l).</div>}
      {male.map((pk) => {
        const mame = zasoba[pk.id];
        const hlida = mame != null;
        const s = souhrn.find((x) => x.package_id === pk.id);
        return (
          <div key={pk.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="font-display font-black text-lg text-neutral-950">{formatPackageLabel(pk.label ?? '')}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost !rounded !px-3"
                  aria-label={`Ubrat ${pk.label}`}
                  disabled={!canEdit || !hlida || mame <= 0}
                  onClick={() => nastav(pk.id, (mame ?? 0) - 1)}
                >
                  <Minus size={18} />
                </button>
                <span className="w-12 text-center text-2xl font-black tabular-nums text-neutral-950" aria-live="polite">
                  {nacteno ? (hlida ? mame : '–') : '…'}
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
            {hlida ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={`font-bold ${s && s.nad > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  V otevřených objednávkách {s?.objednano ?? 0} ks
                  {s && s.nad > 0 ? ` — o ${s.nad} víc, než máš` : ` — zbývá ${mame - (s?.objednano ?? 0)}`}
                </span>
                {canEdit && (
                  <button type="button" className="btn-ghost !rounded text-xs" onClick={() => nastav(pk.id, null)}>
                    Nehlídat
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-500">Nehlídá se — klepni na + a zadej, kolik jich máš.</div>
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
