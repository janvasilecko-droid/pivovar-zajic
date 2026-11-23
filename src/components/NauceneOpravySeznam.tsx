// 🧠 Přehled naučených oprav čtení — co si appka pamatuje, protože to uživatel
// v kontrole zprávy z WhatsAppu výslovně potvrdil zaškrtnutím „Naučit"
// (tabulka naucene_opravy, pravidla v supabase/functions/_shared/naucene-opravy.ts).
// Každou opravu jde smazat; nic jiného se tu nemění.
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { nactiNauceneOpravyProSpravu, smazNaucenouOpravu } from '../lib/nauceneOpravy';
import { chyba, potvrd } from '../lib/toast';
import type { NaucenaOprava } from '../../supabase/functions/_shared/naucene-opravy';

type Pivo = { id: string; name: string };
type Obal = { id: string; label: string };

export function NauceneOpravySeznam({ beers, packages }: { beers: Pivo[]; packages: Obal[] }) {
  const [opravy, setOpravy] = useState<NaucenaOprava[]>([]);
  const [chybiMigrace, setChybiMigrace] = useState(false);
  const [nacitam, setNacitam] = useState(true);

  async function nacti() {
    setNacitam(true);
    try {
      const v = await nactiNauceneOpravyProSpravu();
      setOpravy(v.opravy);
      setChybiMigrace(v.chybiMigrace);
    } catch (e) {
      chyba(e);
    } finally {
      setNacitam(false);
    }
  }
  useEffect(() => { nacti(); }, []);

  async function smaz(o: NaucenaOprava) {
    if (!o.id || !(await potvrd(`Zapomenout opravu „${o.radek}“ u odběratele ${o.place_name ?? '(bez jména)'}?`))) return;
    try {
      await smazNaucenouOpravu(o.id);
      await nacti();
    } catch (e) {
      chyba(e);
    }
  }

  return (
    <section className="space-y-2" aria-label="Naučené opravy čtení">
      <h4 className="text-sm font-black text-neutral-800">Naučené opravy čtení</h4>
      <p className="text-sm text-neutral-600">
        Co si appka pamatuje ze zpráv z WhatsAppu. Vzniká jen tak, že v kontrole zprávy opravíš pivo nebo obal
        a zaškrtneš „Naučit“. Oprava platí pro odběratele, u kterého vznikla.
      </p>
      {chybiMigrace && (
        <div role="status" className="text-sm rounded border border-amber-300 bg-amber-50 text-amber-900 p-3">
          Zapamatování zatím nejde: v Systém → Databázové migrace čeká migrace „naucene_opravy_cteni“.
        </div>
      )}
      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {nacitam && <div className="text-sm text-neutral-400 py-2">Načítám…</div>}
        {!nacitam && opravy.map((o) => {
          const pivo = beers.find((b) => b.id === o.beer_id)?.name?.trim();
          const obal = packages.find((p) => p.id === o.package_id)?.label?.trim();
          return (
            <div key={o.id ?? `${o.misto_klic}|${o.klic}`} className="flex items-center justify-between p-3 rounded bg-neutral-50 border border-neutral-200 gap-2">
              <div className="min-w-0">
                <div className="text-sm font-black text-neutral-800 break-words">
                  {o.place_name ?? '(bez jména)'}: „{o.radek}“ → {[pivo, obal].filter(Boolean).join(' / ') || '(pivo nebo obal už v katalogu není)'}
                </div>
                <div className="text-xs text-neutral-500">
                  {[o.created_by, o.created_at ? new Date(o.created_at).toLocaleDateString('cs-CZ') : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                onClick={() => smaz(o)}
                className="btn-ghost !rounded !p-2 !min-h-0 !border-none text-rose-500 hover:text-rose-700 shrink-0"
                title="Zapomenout naučenou opravu" aria-label="Zapomenout naučenou opravu"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        {!nacitam && !chybiMigrace && opravy.length === 0 && (
          <div className="text-sm text-neutral-400 py-2 italic">Zatím nic — appka si pamatuje jen to, u čeho zaškrtneš „Naučit“.</div>
        )}
      </div>
    </section>
  );
}
