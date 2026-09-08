// 🔔 Oznámení, potvrzení a „Vrátit zpět" — náhrada systémových alert()/confirm().
// ---------------------------------------------------------------------------
// Proč: nativní dialogy prohlížeče blokují celou aplikaci, nejdou stylovat,
// v APK vypadají jinak než na webu a hlavně se ptají PŘED akcí („Opravdu?"),
// což je na telefonu o klepnutí navíc pokaždé, i když se uživatel nespletl.
// Lepší vzorec: akci provést a pár vteřin nabídnout „Vrátit zpět".
//
// Tenhle modul je záměrně BEZ Reactu — je to obyčejný singleton s odběrateli,
// takže se dá zavolat odkudkoli: z event handleru, z utility funkce i z catch
// bloku, bez hooku a bez předávání contextu. Vykresluje ho <ToastHost />
// namountovaný jednou v main.tsx.
import { zavibruj } from './haptika';
import { zalogujANahlas } from './chybyHlaseni';
import { zapisSelDoFronty } from './offline';

export type ToastTon = 'info' | 'uspech' | 'chyba' | 'varovani';

export type ToastAkce = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type Toast = {
  id: number;
  text: string;
  ton: ToastTon;
  akce?: ToastAkce;
  /** ms do automatického zmizení; 0 = nezmizí samo */
  trvani: number;
};

export type PotvrdOpts = {
  titulek?: string;
  /** Popisek potvrzovacího tlačítka. */
  potvrdit?: string;
  zrusit?: string;
  /** Červené potvrzovací tlačítko (mazání, storno). */
  nebezpecne?: boolean;
};

/**
 * Jedna možnost v dialogu s VÍC než dvěma tlačítky (viz `volba`).
 *
 * Vzniklo to z provozu: když se při schvalování WhatsApp objednávky našla
 * duplicita, dialog uměl jen „Pokračovat / Zrušit". Zrušení ale nechalo
 * zprávu viset mezi nevyřízenými a ignorovat se musela zvlášť — takže
 * nejčastější odpověď na „tohle už objednané je" byla ta nejpracnější.
 */
export type Moznost = {
  /** Co se vrátí, když se na tlačítko klikne. */
  klic: string;
  label: string;
  /** `hlavni` = zvýrazněné, `nebezpecne` = červené, jinak nenápadné. */
  ton?: 'hlavni' | 'nebezpecne' | 'vedlejsi';
};

export type PotvrdStav =
  | (PotvrdOpts & {
      text: string;
      /** Když je vyplněné, vykreslí se tahle tlačítka místo Potvrdit/Zrušit. */
      moznosti?: Moznost[];
      resolve: (v: boolean | string | null) => void;
    })
  | null;

export type StavOznameni = { toasty: Toast[]; potvrzeni: PotvrdStav };

let stav: StavOznameni = { toasty: [], potvrzeni: null };
const odberatele = new Set<() => void>();
let dalsiId = 1;
const casovace = new Map<number, ReturnType<typeof setTimeout>>();

function oznam_zmenu() {
  odberatele.forEach((fn) => fn());
}

/** Odběr pro <ToastHost /> (useSyncExternalStore). */
export function odebirejOznameni(fn: () => void): () => void {
  odberatele.add(fn);
  return () => { odberatele.delete(fn); };
}

export function stavOznameni(): StavOznameni {
  return stav;
}

export function zavriToast(id: number) {
  const c = casovace.get(id);
  if (c) { clearTimeout(c); casovace.delete(id); }
  stav = { ...stav, toasty: stav.toasty.filter((t) => t.id !== id) };
  oznam_zmenu();
}

/**
 * Zobrazí oznámení dole nad lištou. Vrací id, kterým se dá zavřít dřív.
 * Najednou se drží nejvýš tři — starší odpadávají, ať nezakryjí obsah.
 */
export function toast(text: string, opts: { ton?: ToastTon; akce?: ToastAkce; trvani?: number } = {}): number {
  const id = dalsiId++;
  const ton = opts.ton ?? 'info';
  // S akcí („Vrátit zpět") delší čas — uživatel si to musí stihnout přečíst
  // a trefit tlačítko, což na telefonu chvíli trvá.
  const trvani = opts.trvani ?? (opts.akce ? 7000 : ton === 'chyba' ? 6000 : 3500);
  const novy: Toast = { id, text, ton, akce: opts.akce, trvani };

  const toasty = [...stav.toasty, novy].slice(-3);
  stav = { ...stav, toasty };
  oznam_zmenu();

  if (trvani > 0) casovace.set(id, setTimeout(() => zavriToast(id), trvani));
  if (ton === 'chyba') zavibruj('chyba');
  // Bez hosta by zpráva zmizela beze stopy — chyba musí být aspoň v konzoli.
  if (odberatele.size === 0 && ton === 'chyba') zalogujANahlas('[oznámení]', text);
  return id;
}

export function uspech(text: string, opts: { akce?: ToastAkce; trvani?: number } = {}) {
  // Offline zápis se tváří jako povedený a hlásil zelené „Uloženo" úplně
  // stejné jako při odeslání — ve sklepě s kolísavým signálem se kvůli tomu
  // zapisovalo stáčení s tím, že je hotovo. Když zápis právě šel do fronty,
  // oznámení to doříct musí (viz zapisSelDoFronty v lib/offline.ts).
  const doplnek = zapisSelDoFronty() ? ' Telefon je offline — zápis čeká v telefonu a odešle se po signálu.' : '';
  return toast(text + doplnek, { ...opts, ton: 'uspech', trvani: opts.trvani ?? (doplnek ? 7000 : undefined) });
}

export function varovani(text: string, opts: { akce?: ToastAkce; trvani?: number } = {}) {
  return toast(text, { ...opts, ton: 'varovani' });
}

/** Neutrální oznámení — přímá náhrada za alert(). */
export function oznam(text: string, opts: { akce?: ToastAkce; trvani?: number } = {}) {
  return toast(text, { ...opts, ton: 'info' });
}

/** Chyba. Bere i Error/PostgrestError, vytáhne z nich čitelnou zprávu. */
export function chyba(duvod: unknown, opts: { akce?: ToastAkce; trvani?: number } = {}) {
  const text =
    typeof duvod === 'string' ? duvod
    : duvod instanceof Error ? duvod.message
    : (duvod as any)?.message ? String((duvod as any).message)
    : String(duvod);
  return toast(text || 'Něco se nepovedlo.', { ...opts, ton: 'chyba' });
}

/**
 * Akce se provedla a pár vteřin jde vzít zpět. Tohle je preferovaný vzorec
 * místo ptaní se předem — viz komentář nahoře.
 */
export function toastZpet(text: string, zpet: () => void | Promise<void>) {
  return toast(text, {
    ton: 'uspech',
    akce: {
      label: 'Vrátit zpět',
      onClick: async () => {
        try {
          await zpet();
          uspech('Vráceno zpět.');
        } catch (e) {
          chyba(e);
        }
      },
    },
  });
}

/**
 * Potvrzovací dialog. Náhrada za confirm() — vrací Promise<boolean>, takže
 * volající místo `if (!confirm(x)) return` píše `if (!(await potvrd(x))) return`.
 */
export function potvrd(text: string, opts: PotvrdOpts = {}): Promise<boolean> {
  // Pojistka: bez namountovaného <ToastHost /> by Promise nikdy nedoběhla
  // a mazání by tiše NIC neudělalo. Spadneme na prohlížečový dialog —
  // ošklivý, ale funkční. Týká se to testů a případu, kdy by se host
  // nevykreslil kvůli chybě jinde ve stromu.
  if (odberatele.size === 0) {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(text)
      : true;
    return Promise.resolve(ok);
  }
  // Rozdělaný dialog nikdy nezahazujeme tiše — předchozí se uzavře jako
  // „zrušeno", jinak by na jeho Promise někdo čekal navždy.
  if (stav.potvrzeni) stav.potvrzeni.resolve(false);
  return new Promise<boolean>((resolve) => {
    // `potvrd` zná jen ano/ne; zavření dialogu (null) je pro něj „ne".
    const odpovez = (v: boolean | string | null) => resolve(v === true);
    stav = { ...stav, potvrzeni: { ...opts, text, resolve: odpovez } };
    oznam_zmenu();
  });
}

/**
 * Dialog s víc možnostmi. Vrací `klic` zvolené možnosti, nebo `null`, když
 * uživatel dialog zavřel (klepnutím vedle nebo tlačítkem Zpět).
 *
 * Proč zvlášť a ne rozšířený `potvrd`: `potvrd` vrací ano/ne a používá se na
 * osmdesáti místech. Míchat do něj třetí odpověď by znamenalo, že každé z nich
 * musí řešit stav, který nemůže nastat.
 */
export function volba(text: string, moznosti: Moznost[], opts: PotvrdOpts = {}): Promise<string | null> {
  // Stejná pojistka jako u `potvrd`: bez namountovaného <ToastHost /> by
  // Promise nikdy nedoběhla. Bez dialogu se nedá vybrat — vracíme null,
  // tedy „nedělej nic", což je vždycky bezpečná odpověď.
  if (odberatele.size === 0) return Promise.resolve(null);
  if (stav.potvrzeni) stav.potvrzeni.resolve(null);
  return new Promise<string | null>((resolve) => {
    stav = { ...stav, potvrzeni: { ...opts, text, moznosti, resolve: resolve as (v: boolean | string | null) => void } };
    oznam_zmenu();
  });
}

/** Volá <ToastHost /> po kliknutí v dialogu. */
export function uzavriPotvrzeni(vysledek: boolean | string | null) {
  const p = stav.potvrzeni;
  if (!p) return;
  stav = { ...stav, potvrzeni: null };
  oznam_zmenu();
  p.resolve(vysledek);
}
