// ✉️ Pozvánka do aplikace — text e-mailu pro nového člověka.
// ---------------------------------------------------------------------------
// Aplikace sama žádné e-maily neposílá (přihlašuje se e-mailem a heslem, účet
// zakládá admin schválením e-mailu). Admin proto po schválení otevře pozvánku
// ve své poště (mailto:) — text je předvyplněný: odkaz, instalace na plochu
// bez obchodu Google Play a první přihlášení. Dočasné heslo je v e-mailu jen
// tehdy, když ho správce výslovně pošle z okna s heslem (platí do prvního
// přihlášení, pak si uživatel založí vlastní).

/** Adresa ostrého provozu — když se pozvánka skládá mimo prohlížeč. */
export const ODKAZ_APLIKACE = 'https://zajic-pivovar.pages.dev/';

export function odkazAplikace(): string {
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:/.test(window.location.origin)) {
    return `${window.location.origin}/`;
  }
  return ODKAZ_APLIKACE;
}

export const PREDMET_POZVANKY = 'Pozvánka do aplikace Pivovar Zajíc';

/** Tělo e-mailu (prostý text). */
export type Pristup = { email: string; heslo: string };

export function textPozvanky(odkaz: string = odkazAplikace(), pristup?: Pristup): string {
  return [
    'Ahoj,',
    '',
    'dostal(a) jsi přístup do aplikace Pivovar Zajíc — objednávky, sklad a stáčení na jednom místě.',
    '',
    '1) OTEVŘI ODKAZ (v telefonu):',
    odkaz,
    '',
    '2) DEJ SI APLIKACI NA PLOCHU — není to z obchodu Google Play ani App Store, stačí prohlížeč:',
    '• Android (Chrome): klepni na tři tečky vpravo nahoře → „Nainstalovat aplikaci“ (nebo „Přidat na plochu“).',
    '• iPhone (Safari): klepni na Sdílet (čtvereček se šipkou dole) → „Přidat na plochu“.',
    '• Počítač (Chrome / Edge): ikonka instalace v adresním řádku vpravo.',
    '• Nebo v aplikaci: Aplikace & Nastavení → Instalace aplikace.',
    'Na ploše se objeví ikona se zajícem; otevírá se jako běžná aplikace na celou obrazovku.',
    '',
    '3) PŘIHLÁŠENÍ:',
    ...(pristup
      ? [`• E-mail: ${pristup.email}`, `• Dočasné heslo: ${pristup.heslo}`]
      : ['• Přijde ti e-mail s odkazem (podívej se i do spamu). Klepni na něj — aplikace se ti rovnou otevře a nastavíš si své heslo.', '• Příště se přihlásíš e-mailem a svým heslem. Zapomeneš-li ho, na přihlašovací obrazovce klepni na „Zapomněl(a) jsem heslo“ a pošle se ti odkaz.']),
    '• Vlastní heslo má aspoň 6 znaků. Dočasné heslo (pokud ho dostaneš) platí jen do prvního přihlášení.',
    '',
    '4) JAK NA TO:',
    'V aplikaci klepni na dlaždici „Info“ (nebo na „?“ vedle lupy nahoře). Oddíl „Začínáme“ je napsaný od nuly: co která ikona znamená, kde se co zapisuje a jak fungují odpočty a odečty ze skladu.',
    '',
    'Když se něco nedaří, napiš do „Zpětné vazby“ v aplikaci, nebo mi zavolej.',
  ].join('\n');
}

/** Odkaz `mailto:` s předvyplněným předmětem a textem. */
export function mailtoPozvanky(email: string, odkaz?: string, heslo?: string): string {
  const p = new URLSearchParams({ subject: PREDMET_POZVANKY, body: textPozvanky(odkaz, heslo ? { email, heslo } : undefined) });
  // URLSearchParams píše mezeru jako „+“, což pošta v mailto: nečte.
  return `mailto:${encodeURIComponent(email)}?${p.toString().replace(/\+/g, '%20')}`;
}

/** Celá pozvánka včetně přihlašovacích údajů (WhatsApp / SMS / e-mail). */
export function textSHeslem(email: string, heslo: string, odkaz: string = odkazAplikace()): string {
  return textPozvanky(odkaz, { email, heslo });
}
