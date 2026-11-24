// 🛢️ Malé sudy — kolik máme KEG 20/15/10 l. Záložka v Objednávkách
// a samostatná dlaždice na ploše (29. 9. 2026: „ty malé sudy udělej jako
// samostatnou dlaždici a záložku dej k objednávkám"; dřív byla v KEG).
//
// Z provozu 29. 9. 2026: „pro stáčení sudů připrav záložku malé sudy, tam
// naklikám počet malých sudů 20, 15, 10, a pak mi v objednávkách hlídej…"
// Počet se ukládá do tabulky male_sudy (sdílená pro všechny), Objednávky
// podle něj označí položky nad počet (lib/maleSudy.ts).
import { useEffect, useState } from 'react';
import { MessageSquare, Minus, Plus } from 'lucide-react';
import { supabase, formatPackageLabel } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { canUserEdit, getUserPermissions } from '../lib/permissions';
import { Spinner } from './ui';
import { jeMalySud, type ObalProSudy } from '../lib/maleSudy';
import { popisOdvezenych } from '../lib/maleSudyPopis';
import { useHlidaniMalychSudu, useMaleSudy, type VolbyUlozeni } from '../lib/useMaleSudy';
import { chyba } from '../lib/toast';
import { nactiJson, ulozJson } from '../lib/uloziste';
import { businessDateISO } from '../lib/businessDate';
import { cisloProSms, odkazSms } from '../lib/sms';
import { prijemceMaleSudy, textSmsMaleSudy, type PrijemceSms, type SudProSms } from '../lib/maleSudyZprava';

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

/** Pod tímhle klíčem si telefon pamatuje ručně zadané číslo příjemce SMS (jen v tomhle zařízení). */
export const KLIC_CISLA_SMS = 'male_sudy_sms_cislo_v1';

/**
 * „Odeslat Radkovi" (24. 11. 2026: „u položky malé sudy udělej tlačítko odeslat Radkovi, přes bránu
 * telefonu se mu pošle sms s počtem malých sudů … sms se odešle od toho, kdo dá odeslat sms").
 * Žádná SMS brána v appce není, proto tlačítko otevře v telefonu aplikaci zpráv s číslem a hotovým
 * textem — odešle ji ten, kdo drží telefon, ze svého čísla. Text je vidět pod tlačítkem.
 *
 * Číslo bere z karty odběratele Radek. Pole „Číslo, kam jde SMS" ho dovolí přepsat — třeba na vlastní
 * číslo při zkoušce („testování udělej na moje číslo"); ručně zadané číslo platí jen v tomhle
 * telefonu, nikam se neposílá a po smazání se zase použije číslo z karty.
 */
export function OdeslatRadkovi({ text, prijemce }: { text: string; prijemce: PrijemceSms | null }) {
  const jmeno = prijemce?.jmeno || 'Radek';
  const [rucne, setRucne] = useState<string>(() => nactiJson<string>(KLIC_CISLA_SMS, ''));
  const zmenCislo = (v: string) => { setRucne(v); ulozJson(KLIC_CISLA_SMS, v); };
  const zadano = rucne.trim() !== '';
  const telefon = zadano ? rucne : prijemce?.telefon;
  const cislo = cisloProSms(telefon);

  let napoveda: string;
  if (zadano) {
    napoveda = cislo
      ? `Ručně zadané číslo (jen v tomhle telefonu) — SMS se otevře pro ${rucne.trim()}. Smaž ho a použije se číslo z karty odběratele ${jmeno}.`
      : 'Číslo nevypadá správně (potřebuju devět číslic nebo číslo s předvolbou) — SMS se otevře bez příjemce.';
  } else if (cislo) {
    napoveda = `Číslo z karty odběratele ${jmeno} (${prijemce?.telefon}) — SMS se otevře pro něj, odešleš ji ty v aplikaci zpráv.`;
  } else {
    napoveda = `U odběratele ${jmeno} není telefon — napiš číslo sem, nebo ho doplň v Odběratelích (Odběratelé, piva, obaly → ${jmeno} → Telefon). Bez čísla si příjemce vybereš v aplikaci zpráv.`;
  }

  return (
    <div data-testid="odeslat-radkovi" className="card p-3 space-y-2">
      {text ? (
        <a href={odkazSms(telefon, text)} className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2">
          <MessageSquare size={18} aria-hidden="true" /> Odeslat Radkovi
        </a>
      ) : (
        <button type="button" className="btn-primary w-full min-h-[52px] flex items-center justify-center gap-2" disabled>
          <MessageSquare size={18} aria-hidden="true" /> Odeslat Radkovi
        </button>
      )}
      {text ? (
        <p data-testid="sms-text" className="text-sm font-semibold text-neutral-800">SMS: „{text}“</p>
      ) : (
        <p className="text-xs font-semibold text-neutral-700">SMS jde odeslat, až se načtou počty a objednávky a je zadaný aspoň jeden malý sud.</p>
      )}
      {text && (
        <div className="space-y-1">
          <label htmlFor="male-sudy-sms-cislo" className="label">Číslo, kam jde SMS</label>
          <input
            id="male-sudy-sms-cislo"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="input"
            value={rucne}
            onChange={(e) => zmenCislo(e.target.value)}
            placeholder={prijemce?.telefon ? `${prijemce.telefon} (z karty ${jmeno})` : 'Např. 777 123 456'}
          />
          <p data-testid="sms-prijemce" className="text-xs font-semibold text-neutral-700">{napoveda}</p>
        </div>
      )}
    </div>
  );
}

export function MaleSudyPanel({ packages, canEdit, kdo, prijemce, dnes }: {
  packages: (ObalProSudy & { sort_order?: number | null })[];
  canEdit: boolean;
  kdo?: string | null;
  /** Komu jde SMS z tlačítka „Odeslat Radkovi" (odběratel Radek); bez něj se číslo vybere v aplikaci zpráv. */
  prijemce?: PrijemceSms | null;
  /** Dnešek (YYYY-MM-DD) pro text SMS; bez něj obchodní den z lib/businessDate. */
  dnes?: string;
}) {
  const { zasoba, zadanoKdy, zapocitatPlne, umiZapocitatPlne, nacteno, chybiMigrace, chybaNacteni, ulozit, nastavZapocitatPlne } = useMaleSudy();
  const { souhrn, jmenaPiv, nacteno: hlidaniNacteno, chybaNacteni: bezObjednavek } = useHlidaniMalychSudu(zasoba, undefined, zapocitatPlne, zadanoKdy);
  const male = packages
    .filter(jeMalySud)
    .sort((a, b) => Number(b.volume_l) - Number(a.volume_l));

  // Hlášku pro člověka skládá useMaleSudy (chyba, bez signálu, obal bez počtu).
  async function nastav(id: string, pocet: number | null, volby?: VolbyUlozeni) {
    const e = await ulozit(id, pocet == null ? null : Math.max(0, pocet), kdo, volby);
    if (e) chyba(e);
  }
  async function odpovez(id: string, ano: boolean) {
    const e = await nastavZapocitatPlne(id, ano);
    if (e) chyba(e);
  }

  // Čísla jednoho obalu — jedno místo pro kartu i pro SMS Radkovi, ať se nikdy nerozejdou.
  const stavObalu = (pk: { id: string }) => {
    const naklikano = zasoba[pk.id];
    const hlida = naklikano != null;
    const s = souhrn.find((x) => x.package_id === pk.id);
    // Velké číslo = prázdné TEĎ: naklikané číslo minus sudy objednávek, které
    // od zadání odjely (1. 11. 2026: „ty se měly odečíst podle objednávek,
    // měly by tam být jen 2× 10 prázdné"). Hned po zadání je to přesně
    // naklikané číslo (13. 10. 2026: „proč je tam prázdných 12, mají být
    // tolik, kolik jsem jich zadal" — dřív ukazovalo zbytek po OTEVŘENÝCH
    // objednávkách). Otevřené objednávky ubírají až z „K dispozici" pod ním.
    const mame = hlida ? (s?.mame ?? naklikano) : undefined;
    // Dokud se nenačtou objednávky, číslo by poskočilo — radši „…".
    const ceka = hlida && !hlidaniNacteno;
    // Objednávky se nenačetly vůbec: číslo je jen naklikané (bez odjetých) —
    // +/− by ho uložilo jako nový stav, proto jen přepsat číslem.
    const jenNaklikane = hlida && !ceka && bezObjednavek;
    const objednano = s?.objednano ?? 0;
    const volne = mame != null ? Math.max(0, mame - objednano) : 0;
    return { naklikano, hlida, s, mame, ceka, jenNaklikane, objednano, volne };
  };

  // SMS Radkovi (24. 11. 2026): jen z přesných čísel — dokud se objednávky nenačetly nebo
  // nenačetly vůbec, velké číslo by neodpovídalo skutečnosti, proto se neposílá.
  const stavy = male.map((pk) => ({ pk, ...stavObalu(pk) }));
  // Obal bez zadaného čísla se bere jako 0 (jako ve hlídání objednávek); do SMS ale jde jen tehdy, když
  // jsou čísla načtená a opravdu „prázdná teď" — viz výše.
  const sudyProSms: SudProSms[] = stavy.map((x) => ({ objem: Number(x.pk.volume_l), pocet: x.mame ?? 0 }));
  const smsNepripravena = stavy.every((x) => !x.hlida) || stavy.some((x) => x.hlida && (x.ceka || x.jenNaklikane));
  const textSms = smsNepripravena ? '' : textSmsMaleSudy(sudyProSms, dnes ?? businessDateISO());

  if (chybiMigrace) {
    return (
      <div className="card p-4 text-sm text-neutral-700">
        Evidence malých sudů ještě není v databázi (čeká úprava databáze). Zkuste to prosím za pár minut znovu.
      </div>
    );
  }
  // Uložené počty se nenačetly (síť): „+" by tu začalo od nuly a přepsalo je.
  if (chybaNacteni) {
    return (
      <div role="alert" className="card p-4 text-sm font-bold text-rose-800">
        Počty malých sudů se nepodařilo načíst — zkus to prosím za chvíli znovu (nic se nezměnilo).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Naklikej, kolik máš prázdných malých sudů — velké číslo je to, co zadáš, a ubývá o sudy objednávek, které od té doby odjely. Pod ním je
        „K dispozici": prázdné minus sudy, které berou otevřené objednávky (např. pro Radka), tedy kolik se ještě dá stočit pro dalšího. Co
        objednávky přečerpají, označí červeně.
      </p>
      {male.length === 0 && <div className="card p-4 text-sm text-neutral-600">V obalech není žádný malý sud (KEG pod 30 l).</div>}
      {male.length > 0 && <OdeslatRadkovi text={textSms} prijemce={prijemce ?? null} />}
      {male.map((pk) => {
        const { hlida, s, mame, ceka, jenNaklikane, objednano, volne } = stavObalu(pk);
        const odkud = s ? popisOdvezenych(s, zadanoKdy?.[pk.id]?.den) : null;
        // +/− opraví naklikané číslo o kus a čas zadání nechá: odjeté objednávky
        // i plné sudy k zadání se dál počítají od původního zadání (jinak by
        // sudy stočené od zadání u „započítat plné" nafoukly K dispozici —
        // revize 1. 11. 2026). Velké číslo se tak změní přesně o 1. Napsané
        // číslo je nový stav TEĎ (nové zadání).
        // Čas zadání i čísla jsou z TOHOTO vykreslení — kdyby čas přišel
        // odjinud (novější načtení), uložilo by se číslo k cizímu zadání. Když
        // čas už neplatí (minulý týden), uloží se jako nové zadání zobrazené
        // číslo ± 1 (pocetNoveZadani), ne naklikané s odjetými starého zadání.
        const posun = (o: 1 | -1) => {
          const noveVelke = Math.max(0, (mame ?? 0) + o);
          return nastav(pk.id, (s?.odvezeno ?? 0) + noveVelke, { zachovatCas: zadanoKdy?.[pk.id]?.cas ?? null, pocetNoveZadani: noveVelke });
        };
        // „Započítat plné" se ukládá k řádku obalu — obal doplněný nulou (bez
        // zadaného počtu) řádek nemá, volba by se neuložila (revize 1. 11. 2026).
        const maZadani = !!zadanoKdy?.[pk.id];
        return (
          <div key={pk.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="font-display font-black text-lg text-neutral-950">{formatPackageLabel(pk.label ?? '')}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost !rounded !px-3"
                  aria-label={`Ubrat ${pk.label}`}
                  disabled={!canEdit || !nacteno || !hlida || ceka || jenNaklikane || (mame ?? 0) <= 0}
                  onClick={() => posun(-1)}
                >
                  <Minus size={18} />
                </button>
                {/* Počet jde i NAPSAT (klepnout na číslo): po změně logiky zůstaly
                    uložené staré počty a nastavovat je po jednom klikáním bylo
                    zdlouhavé. Uloží se při opuštění pole / Enter. */}
                <PocetPrazdnych
                  hodnota={nacteno && !ceka && mame != null ? mame : null}
                  zobraz={!nacteno || ceka ? '…' : hlida ? undefined : '–'}
                  povoleno={canEdit && nacteno}
                  popisek={`Počet prázdných ${pk.label}`}
                  ulozit={(n) => nastav(pk.id, n)}
                />
                <button
                  type="button"
                  className="btn-ghost !rounded !px-3"
                  aria-label={`Přidat ${pk.label}`}
                  disabled={!canEdit || !nacteno || ceka || jenNaklikane}
                  onClick={() => posun(1)}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {hlida && !ceka && odkud && (
              <div className="text-xs font-semibold text-neutral-600">{odkud}</div>
            )}
            {jenNaklikane && (
              <div role="note" className="text-xs font-bold text-amber-800">
                Objednávky se nenačetly — číslo je naklikané a nejsou v něm odjeté ani otevřené objednávky. Zkus to za chvíli znovu.
              </div>
            )}
            {hlida && !ceka && !jenNaklikane && (
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
                    {umiZapocitatPlne && maZadani ? ' Započítat je do objednávek?' : ''}
                  </div>
                  {umiZapocitatPlne && !maZadani ? (
                    <div className="text-xs font-semibold">Plné se dají započítat, až zadáš počet tohoto obalu.</div>
                  ) : umiZapocitatPlne ? (
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
  // Komu jde SMS z „Odeslat Radkovi" (číslo z karty odběratele). Nenačtení nic nerozbije — SMS se pak otevře bez čísla.
  const [prijemce, setPrijemce] = useState<PrijemceSms | null>(null);
  useEffect(() => {
    let zivy = true;
    supabase.from('packages').select('id, kind, volume_l, label, sort_order').order('sort_order').then(({ data }) => {
      if (zivy) setPackages((data ?? []) as (ObalProSudy & { sort_order?: number | null })[]);
    });
    supabase.from('places').select('name, phone').then(({ data }) => {
      if (zivy) setPrijemce(prijemceMaleSudy((data ?? []) as { name: string | null; phone: string | null }[]));
    });
    return () => { zivy = false; };
  }, []);
  if (!packages) return <Spinner />;
  // Zápis do male_sudy hlídá databáze podle práva na KEG (migrace
  // 20261231160000_male_sudy.sql) — tlačítka tomu odpovídají.
  const canEdit = canUserEdit(profile?.role, user?.id, 'kegging', getUserPermissions(user?.id ?? '', (profile as any)?.permissions));
  return <MaleSudyPanel packages={packages} canEdit={canEdit} kdo={profile?.display_name ?? null} prijemce={prijemce} />;
}
