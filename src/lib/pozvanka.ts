// ✉️ Pozvánka do aplikace — text e-mailu pro nového člověka.
// ---------------------------------------------------------------------------
// Aplikace sama žádné e-maily neposílá (přihlašuje se e-mailem a heslem, účet
// zakládá admin schválením e-mailu). Admin proto po schválení otevře pozvánku
// ve své poště (mailto:) — text je předvyplněný: odkaz, instalace na plochu
// bez obchodu Google Play a první přihlášení. Dočasné heslo je v e-mailu jen
// tehdy, když ho správce výslovně pošle z okna s heslem (platí do prvního
// přihlášení, pak si uživatel založí vlastní).

import { NAVOD_ODDILY } from '../components/NavodPouziti';
import { ODKAZ_APLIKACE, odkazAplikace } from './odkazAplikace';

export { ODKAZ_APLIKACE, odkazAplikace };

export const PREDMET_POZVANKY = 'Pozvánka do aplikace Pivovar Zajíc';

/** Tělo e-mailu (prostý text). */
export type Pristup = { email: string; heslo: string };

/** Co v aplikaci je: jeden řádek na oddíl návodu (bez úvodního „Začínáme“) + co umí. */
export function prehledAplikace(podrobne = true): string[] {
  const radky: string[] = [];
  for (const o of NAVOD_ODDILY) {
    if (o.klic === 'zaciname') continue;
    radky.push(`• ${o.nazev} — ${o.kCemu}`);
    if (podrobne && o.body.length > 0) radky.push(`   Umí: ${o.body.map((b) => b.co).join(', ')}.`);
  }
  return radky;
}

/** Jak podrobný je přehled „co v aplikaci je“ — v mailto: se kvůli délce zkracuje. */
export type PrehledAplikace = 'podrobny' | 'strucny' | 'zadny';

export function textPozvanky(odkaz: string = odkazAplikace(), pristup?: Pristup, prehled: PrehledAplikace = 'podrobny'): string {
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
    ...(prehled === 'zadny'
      ? []
      : ['5) CO V APLIKACI VŠECHNO JE (každý oddíl se v Info rozbalí a má postupy):', ...prehledAplikace(prehled === 'podrobny'), '']),
    'Když se něco nedaří, napiš do „Zpětné vazby“ v aplikaci, nebo mi zavolej.',
  ].join('\n');
}

/** Nejvíc znaků, které mailto: bezpečně unese (Outlook a část prohlížečů ořezávají kolem 2 000). */
const MAX_MAILTO = 1900;

/**
 * Odkaz `mailto:` s předvyplněným předmětem a textem. Dlouhý text (celý přehled
 * aplikace) se do adresy nevejde, takže se zkrátí postupně: přehled bez výčtu
 * funkcí, pak jen odkaz na Info. Celý text jde vždy zkopírovat (textPozvanky).
 */
export function mailtoPozvanky(email: string, odkaz?: string, heslo?: string): string {
  const pristup = heslo ? { email, heslo } : undefined;
  const sestav = (telo: string) => {
    const p = new URLSearchParams({ subject: PREDMET_POZVANKY, body: telo });
    // URLSearchParams píše mezeru jako „+“, což pošta v mailto: nečte.
    return `mailto:${encodeURIComponent(email)}?${p.toString().replace(/\+/g, '%20')}`;
  };
  for (const prehled of ['podrobny', 'strucny', 'zadny'] as const) {
    const m = sestav(textPozvanky(odkaz, pristup, prehled));
    if (m.length <= MAX_MAILTO) return m;
  }
  return sestav(textKratce(odkaz, pristup));
}

/** Nejkratší pozvánka (vejde se do mailto: i s heslem): odkaz, instalace, přihlášení, kde je návod. */
export function textKratce(odkaz: string = odkazAplikace(), pristup?: Pristup): string {
  return [
    'Ahoj, dostal(a) jsi přístup do aplikace Pivovar Zajíc (objednávky, sklad, stáčení).',
    '',
    `Otevři v telefonu: ${odkaz}`,
    'Na plochu: Android (Chrome) tři tečky → Nainstalovat aplikaci; iPhone (Safari) Sdílet → Přidat na plochu. Nic z obchodu Google Play.',
    ...(pristup
      ? [`Přihlášení: ${pristup.email} / dočasné heslo ${pristup.heslo} (po přihlášení si založíš vlastní).`]
      : ['Přihlášení: přijde ti e-mail s odkazem — klepni na něj a nastav si heslo.']),
    '',
    'Návod a přehled všeho, co v aplikaci je, najdeš po přihlášení v dlaždici „Info“ (oddíl „Začínáme“).',
  ].join('\n');
}

/** Celá pozvánka včetně přihlašovacích údajů (WhatsApp / SMS / e-mail). */
export function textSHeslem(email: string, heslo: string, odkaz: string = odkazAplikace()): string {
  return textPozvanky(odkaz, { email, heslo });
}

// ── Šablony e-mailů, které rozesílá Supabase ────────────────────────────────
// Pozvánku po schválení i odkaz „zapomenuté heslo“ posílá Supabase ze šablon
// (Authentication → Email Templates). Tyhle texty se tam vloží jednou; nesou
// odkaz pro nastavení hesla ({{ .ConfirmationURL }}), instalaci na plochu a
// přehled toho, co v aplikaci je.

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type DruhSablony = 'pozvanka' | 'obnova';

export const PREDMET_SABLONY: Record<DruhSablony, string> = {
  pozvanka: 'Pozvánka do aplikace Pivovar Zajíc',
  obnova: 'Pivovar Zajíc — nové heslo',
};

export function sablonaEmailuSupabase(druh: DruhSablony, odkaz: string = odkazAplikace()): string {
  const uvod = druh === 'pozvanka'
    ? 'Správce ti schválil přístup do aplikace <strong>Pivovar Zajíc</strong> — objednávky, sklad a stáčení na jednom místě.'
    : 'Požádal(a) jsi o nové heslo do aplikace <strong>Pivovar Zajíc</strong>.';
  const tlacitko = druh === 'pozvanka' ? 'Otevřít aplikaci a nastavit heslo' : 'Nastavit nové heslo';
  const prehled = NAVOD_ODDILY.filter((o) => o.klic !== 'zaciname')
    .map((o) => `<li><strong>${esc(o.nazev)}</strong> — ${esc(o.kCemu)}<br><span style="color:#777">Umí: ${esc(o.body.map((b) => b.co).join(', '))}.</span></li>`)
    .join('\n');
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.5">
<h2 style="color:#7a3b0c">Pivovar Zajíc</h2>
<p>${uvod}</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#f59e0b;color:#111;font-weight:bold;padding:14px 22px;border-radius:10px;text-decoration:none">${tlacitko}</a></p>
<p style="color:#777;font-size:13px">Klepnutím se ti rovnou otevře aplikace a nastavíš si své heslo (aspoň 6 znaků). Odkaz platí krátce a jen jednou. Nefunguje tlačítko? Zkopíruj do prohlížeče: {{ .ConfirmationURL }}</p>
<h3>Dej si aplikaci na plochu</h3>
<p>Nestahuje se z obchodu Google Play ani App Store — stačí prohlížeč. Otevři <a href="${odkaz}">${odkaz}</a> a:</p>
<ul>
<li><strong>Android (Chrome):</strong> tři tečky vpravo nahoře → „Nainstalovat aplikaci“ (nebo „Přidat na plochu“).</li>
<li><strong>iPhone (Safari):</strong> Sdílet (čtvereček se šipkou) → „Přidat na plochu“.</li>
<li><strong>Počítač (Chrome / Edge):</strong> ikonka instalace v adresním řádku vpravo.</li>
</ul>
<h3>Jak se to používá</h3>
<p>V aplikaci klepni na dlaždici <strong>Info</strong> (nebo „?“ vedle lupy). Oddíl „Začínáme“ je napsaný od nuly: co která ikona znamená, kde se co zapisuje, jak fungují odpočty a odečty ze skladu. Příště se přihlásíš e-mailem a svým heslem; zapomeneš-li ho, na přihlašovací obrazovce klepni na „Zapomněl(a) jsem heslo“.</p>
<h3>Co v aplikaci všechno je</h3>
<ul>
${prehled}
</ul>
<p style="color:#777;font-size:13px">Když se něco nedaří, napiš do „Zpětné vazby“ v aplikaci, nebo se ozvi správci.</p>
</div>`;
}
