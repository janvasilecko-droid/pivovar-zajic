// 🔔 Nastavení upozornění — kdy, komu a kde se ukáže.
// ---------------------------------------------------------------------------
// Vytažené z bývalé obrazovky „Upozornění" (RemindersScreen), která zanikla.
// Zadání z 19. 9. 2026: „celý ty upozornění předělej do poznámek… a pak
// dlaždici upomínky smaž." Text upozornění se už nepíše tady — bere se
// z poznámky, ke které patří. Tenhle formulář řeší JEN nastavení.
import { useEffect, useState } from 'react';
import { Bell, Lock, Mail, Smartphone, Target, Upload, User, Users as UsersIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  NastaveniUpozorneni, RYCHLE_TERMINY, RychlyTermin, proVstupDatumCas, terminKdy,
} from '../lib/upozorneniPoznamky';

type UzivatelVSeznamu = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
};

/** Volba se zvýrazní, ať je i na telefonu vidět, co je zaškrtnuté. */
function tridaVolby(vybrano: boolean): string {
  return `flex items-start gap-2.5 p-2.5 rounded border transition cursor-pointer ${
    vybrano ? 'bg-amber-100/70 border-amber-400 font-bold' : 'bg-neutral-50 border-neutral-200'
  }`;
}

export default function UpozorneniForm({
  hodnota,
  zmen,
}: {
  hodnota: NastaveniUpozorneni;
  zmen: (n: NastaveniUpozorneni) => void;
}) {
  const [seznamUzivatelu, setSeznamUzivatelu] = useState<UzivatelVSeznamu[]>([]);
  const [nacitamSeznam, setNacitamSeznam] = useState(false);

  const uprav = (zmeny: Partial<NastaveniUpozorneni>) => zmen({ ...hodnota, ...zmeny });

  // Adresář kolegů se načítá až při volbě „konkrétní lidi" — na telefonu
  // s pomalou sítí nemá smysl tahat ho pro formulář, kde se skoro vždycky
  // nechá „všichni".
  useEffect(() => {
    if (hodnota.komu !== 'users' || seznamUzivatelu.length > 0 || nacitamSeznam) return;
    let zruseno = false;
    (async () => {
      setNacitamSeznam(true);
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users/directory`;
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(url, { headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}` } });
        if (res.ok) {
          const j = await res.json();
          if (!zruseno) {
            const list = ((j.users ?? []) as UzivatelVSeznamu[]).filter((u) => u.email);
            setSeznamUzivatelu(list.sort((a, b) => (a.display_name || a.email).localeCompare(b.display_name || b.email)));
          }
        }
      } catch {
        // Adresář není dostupný → zůstane prázdný a nabídne se ruční zadání e-mailů.
      }
      if (!zruseno) setNacitamSeznam(false);
    })();
    return () => { zruseno = true; };
  }, [hodnota.komu, seznamUzivatelu.length, nacitamSeznam]);

  function prepniUzivatele(email: string) {
    uprav({
      uzivatele: hodnota.uzivatele.includes(email)
        ? hodnota.uzivatele.filter((e) => e !== email)
        : [...hodnota.uzivatele, email],
    });
  }

  return (
    <div className="space-y-3">
      {/* ── Kdy ───────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-black text-neutral-700 mb-1">Kdy upozornit?</label>
        <label className={`${tridaVolby(hodnota.ihned)} mb-2`}>
          <input
            type="checkbox"
            checked={hodnota.ihned}
            onChange={(e) => uprav({ ihned: e.target.checked })}
            className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
          />
          <div className="text-xs">
            <div className="font-black text-neutral-900"><Upload className="ikona-text" /> Hned teď</div>
            <div className="text-udaj text-neutral-500">Ukáže se do ~12 sekund, bez čekání na termín.</div>
          </div>
        </label>

        {!hodnota.ihned && (
          <>
            {/* Rychlé termíny — datetime-local se na telefonu vyplňuje přes
                systémový výběr data a času, což je pět klepnutí. Skoro každé
                upozornění přitom míří na dnešek, zítřek nebo za týden. */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RYCHLE_TERMINY.map((t) => (
                <button
                  key={t.klic}
                  type="button"
                  onClick={() => uprav({ kdy: terminKdy(t.klic as RychlyTermin) })}
                  className={`btn-sm ${hodnota.kdy === terminKdy(t.klic as RychlyTermin) ? 'btn-amber' : 'btn-ghost'}`}
                >
                  {t.popis}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={hodnota.kdy}
              min={proVstupDatumCas(new Date())}
              onChange={(e) => uprav({ kdy: e.target.value })}
              className="input font-mono font-bold"
              aria-label="Datum a čas upozornění"
            />
          </>
        )}
      </div>

      {/* ── Komu ──────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-black text-neutral-700 mb-1">Komu upozornění přijde?</label>
        <div className="space-y-1.5">
          <label className={tridaVolby(hodnota.komu === 'all')}>
            <input
              type="radio" name="komu" checked={hodnota.komu === 'all'}
              onChange={() => uprav({ komu: 'all' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><UsersIcon className="ikona-text" /> Všem v pivovaru</div>
              <div className="text-udaj text-neutral-500">Ukáže se každému, kdo aplikaci používá.</div>
            </div>
          </label>

          <label className={tridaVolby(hodnota.komu === 'role')}>
            <input
              type="radio" name="komu" checked={hodnota.komu === 'role'}
              onChange={() => uprav({ komu: 'role' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><Target className="ikona-text" /> Podle pozice</div>
              <div className="text-udaj text-neutral-500">Např. jen sládek, výroba, obchod…</div>
            </div>
          </label>
          {hodnota.komu === 'role' && (
            <select
              value={hodnota.role}
              onChange={(e) => uprav({ role: e.target.value })}
              className="input font-bold mt-1"
              aria-label="Pozice, které upozornění přijde"
            >
              <option value="admin">Jen správci</option>
              <option value="sef">Jen šéf a vedení</option>
              <option value="sladek">Jen sládek</option>
              <option value="vyroba">Výroba a sklep</option>
              <option value="obchod">Obchod a rozvoz</option>
            </select>
          )}

          <label className={tridaVolby(hodnota.komu === 'users')}>
            <input
              type="radio" name="komu" checked={hodnota.komu === 'users'}
              onChange={() => uprav({ komu: 'users' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><User className="ikona-text" /> Konkrétním lidem</div>
              <div className="text-udaj text-neutral-500">Vyberte jednoho nebo víc kolegů.</div>
            </div>
          </label>
          {hodnota.komu === 'users' && (
            <div className="mt-1 space-y-2">
              {nacitamSeznam ? (
                <div className="text-udaj font-bold text-neutral-500">Načítám seznam lidí…</div>
              ) : seznamUzivatelu.length === 0 ? (
                <div className="text-udaj font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Seznam lidí není dostupný — použijte „Na e-mail" a napište adresy ručně.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded p-2 space-y-1 bg-white">
                  {seznamUzivatelu.map((u) => {
                    const vybrany = hodnota.uzivatele.includes(u.email);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition ${
                          vybrany ? 'bg-amber-100 border border-amber-300' : 'hover:bg-neutral-50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox" checked={vybrany}
                          onChange={() => prepniUzivatele(u.email)}
                          className="w-5 h-5 shrink-0 accent-amber-500"
                        />
                        <span className="font-black text-neutral-800">{u.display_name || u.email.split('@')[0]}</span>
                        <span className="text-neutral-400 truncate">{u.email}</span>
                        <span className="ml-auto text-udaj font-bold uppercase text-neutral-400 shrink-0">{u.role}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <label className={tridaVolby(hodnota.komu === 'custom')}>
            <input
              type="radio" name="komu" checked={hodnota.komu === 'custom'}
              onChange={() => uprav({ komu: 'custom' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><Mail className="ikona-text" /> Na e-mail</div>
              <div className="text-udaj text-neutral-500">Adresy napište ručně, víc oddělte čárkou.</div>
            </div>
          </label>
          {hodnota.komu === 'custom' && (
            <input
              type="text"
              placeholder="napriklad@seznam.cz, kolega@firma.cz"
              value={hodnota.vlastniMaily}
              onChange={(e) => uprav({ vlastniMaily: e.target.value })}
              className="input font-bold mt-1"
              aria-label="E-maily příjemců"
            />
          )}
        </div>
      </div>

      {/* ── Kde ───────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-black text-neutral-700 mb-1">Kde se upozornění ukáže?</label>
        <div className="space-y-1.5">
          <label className={tridaVolby(hodnota.zobrazeni === 'both')}>
            <input
              type="radio" name="zobrazeni" checked={hodnota.zobrazeni === 'both'}
              onChange={() => uprav({ zobrazeni: 'both' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><Bell className="ikona-text" /> Obojí</div>
              <div className="text-udaj text-neutral-500">Vyskočí po přihlášení a zároveň přijde na plochu. Nejjistější.</div>
            </div>
          </label>

          <label className={tridaVolby(hodnota.zobrazeni === 'login_modal')}>
            <input
              type="radio" name="zobrazeni" checked={hodnota.zobrazeni === 'login_modal'}
              onChange={() => uprav({ zobrazeni: 'login_modal' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><Lock className="ikona-text" /> Po přihlášení</div>
              <div className="text-udaj text-neutral-500">Vyskočí okno, které musí člověk odkliknout.</div>
            </div>
          </label>

          <label className={tridaVolby(hodnota.zobrazeni === 'desktop_push')}>
            <input
              type="radio" name="zobrazeni" checked={hodnota.zobrazeni === 'desktop_push'}
              onChange={() => uprav({ zobrazeni: 'desktop_push' })}
              className="mt-0.5 w-5 h-5 shrink-0 accent-amber-500"
            />
            <div className="text-xs">
              <div className="font-black text-neutral-900"><Smartphone className="ikona-text" /> Na plochu</div>
              <div className="text-udaj text-neutral-500">Systémové upozornění na displeji telefonu nebo monitoru.</div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
