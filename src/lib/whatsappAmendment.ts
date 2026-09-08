// ↩️ Odpovědi na WhatsApp objednávky — „ještě k tomu…", „bez summera",
// „nakonec 9x30".
// ---------------------------------------------------------------------------
// Ve skupině „Objednávky pivovar" se na objednávku často odpovídá a ta odpověď
// ji UPRAVUJE. Aplikace s tím dosud neuměla nic: odpověď buď skončila jako
// ignorovaná, nebo se z ní založila SAMOSTATNÁ objednávka.
//
// Reálné případy ze srpna 2026 (16 ze 108 zpráv je odpověď):
//   „Radek  Nakonec summer 9x30"  → mělo změnit 15 ks na 9; obsluha to musela
//                                    opravit ručně, přestože odpověď na to
//                                    doslova odpovídala
//   „Bez summera"                 → mělo z objednávky odebrat Summer Ale
//   „30 litrů, ne 20??"           → mělo změnit obal
//   „Plus 3x10 11sv"              → mělo přidat položku; místo toho vznikla
//                                    druhá objednávka pro téhož odběratele
//
// Tenhle modul řeší dvě věci:
//   1. ke které původní zprávě (a tím objednávce) odpověď patří,
//   2. jak se navrhovaný výsledek liší od toho, co v objednávce je teď —
//      aby šlo obsluze ukázat původní objednávku se zvýrazněnými změnami
//      a nechat ji potvrdit.

export type WhatsAppMsgRef = {
  id: string;
  created_at: string;
  message_text: string | null;
  quoted_text?: string | null;
  imported_order_id?: string | null;
};

/** Normalizace pro porovnání citace s původní zprávou. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Najde původní zprávu, na kterou odpověď reaguje.
 *
 * WhatsApp v citaci posílá jen ZAČÁTEK původní zprávy a delší text ořezává,
 * proto se porovnává prefixem v obou směrech. Krátké citace („Maneo",
 * „Pullitry") sedí na víc zpráv naráz — proto se z kandidátů bere ta, která
 * odpovědi časově nejblíž PŘEDCHÁZÍ, a přednost dostane zpráva, ze které
 * skutečně vznikla objednávka (tu má smysl upravovat).
 */
export function findQuotedMessage(
  reply: WhatsAppMsgRef,
  vsechny: WhatsAppMsgRef[]
): WhatsAppMsgRef | null {
  const q = norm(reply.quoted_text);
  if (q.length < 3) return null;

  const kandidati = vsechny.filter((m) => {
    if (m.id === reply.id) return false;
    if (m.created_at >= reply.created_at) return false;
    const t = norm(m.message_text);
    if (!t) return false;
    return t.startsWith(q) || q.startsWith(t);
  });
  if (kandidati.length === 0) return null;

  // Nejbližší předcházející; při shodě vyhraje ta s objednávkou.
  kandidati.sort((a, z) => {
    const aOrd = a.imported_order_id ? 1 : 0;
    const zOrd = z.imported_order_id ? 1 : 0;
    if (aOrd !== zOrd) return zOrd - aOrd;
    return a.created_at < z.created_at ? 1 : -1;
  });
  return kandidati[0];
}

/** Objednávku, kterou odpověď upravuje (pokud z citované zprávy nějaká vznikla). */
export function findAmendedOrderId(
  reply: WhatsAppMsgRef,
  vsechny: WhatsAppMsgRef[]
): string | null {
  return findQuotedMessage(reply, vsechny)?.imported_order_id ?? null;
}

export type ItemRef = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

export type DiffRow = {
  beer_id: string | null;
  package_id: string | null;
  /** Množství v objednávce teď (0 = položka tam není). */
  before: number;
  /** Množství po úpravě (0 = má se odebrat). */
  after: number;
  zmena: 'pridano' | 'odebrano' | 'zmeneno' | 'beze_zmeny';
};

const itemKey = (i: ItemRef) => `${i.beer_id ?? ''}__${i.package_id ?? ''}`;

/**
 * Porovná, co v objednávce je teď, s tím, co z odpovědi vychází.
 * Vrací VŠECHNY položky (i nezměněné), aby šla ukázat celá objednávka
 * se zvýrazněnými změnami — ne jen samotný rozdíl.
 */
export function diffOrderItems(soucasne: ItemRef[], navrh: ItemRef[]): DiffRow[] {
  const pred = new Map<string, { i: ItemRef; q: number }>();
  soucasne.forEach((i) => {
    const k = itemKey(i);
    const e = pred.get(k);
    if (e) e.q += Number(i.quantity || 0);
    else pred.set(k, { i, q: Number(i.quantity || 0) });
  });

  const po = new Map<string, { i: ItemRef; q: number }>();
  navrh.forEach((i) => {
    const k = itemKey(i);
    const e = po.get(k);
    if (e) e.q += Number(i.quantity || 0);
    else po.set(k, { i, q: Number(i.quantity || 0) });
  });

  const out: DiffRow[] = [];
  const klice = new Set([...pred.keys(), ...po.keys()]);
  klice.forEach((k) => {
    const a = pred.get(k);
    const b = po.get(k);
    const before = a?.q ?? 0;
    const after = b?.q ?? 0;
    const vzor = (b ?? a)!.i;
    let zmena: DiffRow['zmena'];
    if (before === after) zmena = 'beze_zmeny';
    else if (before === 0) zmena = 'pridano';
    else if (after === 0) zmena = 'odebrano';
    else zmena = 'zmeneno';
    out.push({ beer_id: vzor.beer_id, package_id: vzor.package_id, before, after, zmena });
  });

  // Změněné nahoru, ať je vidět, o co jde.
  const poradi = { pridano: 0, zmeneno: 1, odebrano: 2, beze_zmeny: 3 };
  out.sort((a, z) => poradi[a.zmena] - poradi[z.zmena]);
  return out;
}

/** Má odpověď vůbec něco měnit? */
export function maZmeny(diff: DiffRow[]): boolean {
  return diff.some((d) => d.zmena !== 'beze_zmeny');
}

// ---------------------------------------------------------------------------
// 🗂️ ODPOVĚĎ MLUVÍ O ČÁSTI OBJEDNÁVKY, NE O CELÉ
// ---------------------------------------------------------------------------
// „Ty malé soudky budou Desitka 2x 20l, 11sv 1x15l. Tricitky a petky sedi."
//
// Tahle zpráva NEPOPISUJE celou objednávku — mluví jen o malých sudech a
// o zbytku výslovně říká, že je v pořádku. Objednávka přitom přišla jako
// PDF s šesti položkami a ta zpráva má tři z nich (10l a 15l sudy) nahradit
// dvěma novými; třicítky a petky zůstat.
//
// Dosud se návrh z odpovědi bral jako CELÝ nový obsah objednávky, takže
// všechno, co v odpovědi nebylo, vyšlo z porovnání jako „odebráno" — u téhle
// zprávy by tedy z objednávky spadly 2 třicítky a 24 petek, o kterých
// odběratel napsal, že sedí. Stejná past čekala na každou přičítací odpověď
// („Plus 3x10 11sv"): jedna přidaná položka by smazala celou objednávku.
//
// Nově se z odpovědi přečte, KTERÉ SKUPINY OBALŮ se týká, a nahradí se jen
// ty. Co odpověď nejmenuje, zůstává, jak bylo.

/** Skupina obalů tak, jak o ní lidi ve skupině mluví. */
export type SkupinaObalu = 'maly_sud' | 'tricitka' | 'padesatka' | 'petka' | 'lahev' | 'jine';

export type ObalInfo = {
  id: string;
  label?: string | null;
  kind?: string | null;
  volume_l?: number | null;
};

/**
 * Do jaké skupiny obal patří.
 *
 * POZOR na „petku": v pivovaru to je PET, tedy 1 nebo 1,5 litru — NIKDY sud
 * 15 l. Appka to hlídá i na vstupu (viz pravidla v parse-order-image a
 * orderParser: „petka 15" je skoro vždycky ztracená čárka v „1,5"), takže by
 * bylo dost špatné to tady rozhodnout jinak.
 */
export function skupinaObalu(obal: ObalInfo): SkupinaObalu {
  const label = (obal.label ?? '').toLowerCase();
  const objem = Number(obal.volume_l ?? 0);
  const sud = obal.kind === 'keg' || label.includes('keg') || label.includes('sud');

  if (sud) {
    if (objem >= 45) return 'padesatka';
    if (objem >= 25) return 'tricitka';
    if (objem > 0) return 'maly_sud'; // 20 / 15 / 10 l
    return 'jine';
  }
  if (obal.kind === 'pet' || label.includes('pet')) return 'petka';
  // Litrové a půldruhalitrové balení bez `kind` — v katalogu bývá „1l"/„1,5l"
  // a v řeči je to pořád petka.
  if (objem >= 0.9) return 'petka';
  if (objem > 0) return 'lahev';
  return 'jine';
}

/** Jak se která skupina jmenuje v řeči (normalizovaně, bez diakritiky). */
const SLOVA_SKUPIN: Array<{ skupina: SkupinaObalu; vzor: RegExp }> = [
  // „malé soudky", „male sudy", „ty mensi sudy"
  { skupina: 'maly_sud', vzor: /\b(mal[ye]|mensi|men[sš]i)\s+(soudk\w*|sud\w*|keg\w*)/ },
  { skupina: 'tricitka', vzor: /\b(tricitk\w+|30\s*l\w*\s+sud\w*)/ },
  { skupina: 'padesatka', vzor: /\b(padesatk\w+|pade\b)/ },
  { skupina: 'petka', vzor: /\b(petk\w+|pet\b|pety\b)/ },
  { skupina: 'lahev', vzor: /\b(lahv\w+|flask\w+)/ },
];

/** Slovesa, po kterých následuje NOVÝ obsah té skupiny. */
const NAHRAZUJE = /\b(budou|bude|jsou|je|bud|maj\w*|davej\w*|d[eě]lej\w*)\b/;
/** Slovesa, kterými se skupina jen potvrzuje — nemá se hýbat. */
const POTVRZUJE = /\b(sedi|sed[ií]|plati|zustav\w*|ok|dobre|nemeni\w*|stejn\w*)\b/;

function normText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type RozsahOdpovedi = {
  /** Skupiny, jejichž obsah odpověď nadiktovala znovu — mají se nahradit. */
  nahradit: SkupinaObalu[];
  /** Skupiny, o kterých odpověď říká „sedí" — mají zůstat. */
  potvrzeno: SkupinaObalu[];
};

/**
 * Přečte z textu odpovědi, kterých skupin obalů se týká.
 *
 * Čte se po VĚTÁCH (a po řádcích), protože jedna zpráva mluví o dvou
 * skupinách různě: „Ty male soudky budou … Tricitky a petky sedi." Kdyby se
 * hledalo v celém textu naráz, potkalo by se „budou" i „sedi" u obojího
 * a nedalo by se rozhodnout.
 */
export function rozsahOdpovedi(text: string | null | undefined): RozsahOdpovedi {
  const nahradit = new Set<SkupinaObalu>();
  const potvrzeno = new Set<SkupinaObalu>();

  // Věta = úsek mezi tečkou/vykřičníkem/novým řádkem. Zprávy se píšou bez
  // interpunkce, takže nový řádek nese stejnou váhu jako tečka.
  //
  // POZOR: normalizuje se tu zvlášť, KONCE ŘÁDKŮ SE MUSÍ ZACHOVAT. Obecný
  // `normText` slepuje všechny mezery včetně nových řádků do jedné — a z celé
  // Maneo zprávy pak byla jediná věta, ve které stálo „budou" i „sedi"
  // zároveň. Potvrzení vyhrálo a nenahradilo se nic.
  const vety = (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .split(/[.!?;\n]+|(?=\bale\b)/);

  for (const veta of vety) {
    if (!veta.trim()) continue;
    const zminene = SLOVA_SKUPIN.filter((s) => s.vzor.test(veta)).map((s) => s.skupina);
    if (zminene.length === 0) continue;
    // Když věta obsahuje obojí, vyhrává potvrzení: „tricitky sedi, petky budou
    // dva" se rozpadne na dvě věty; pokud ne, je bezpečnější nechat být.
    if (POTVRZUJE.test(veta)) zminene.forEach((s) => potvrzeno.add(s));
    else if (NAHRAZUJE.test(veta)) zminene.forEach((s) => nahradit.add(s));
  }

  // Potvrzená skupina se nikdy nenahrazuje — kdyby ji zachytily oba vzory,
  // rozhoduje „sedí".
  potvrzeno.forEach((s) => nahradit.delete(s));
  return { nahradit: [...nahradit], potvrzeno: [...potvrzeno] };
}

/**
 * Složí navrhovaný obsah objednávky: co odpověď nadiktovala znovu, se
 * nahradí; co nejmenuje, zůstává.
 *
 * Když odpověď žádnou skupinu nediktuje (`nahradit` je prázdné), vrací se
 * položky z odpovědi tak, jak přišly — to je původní chování pro zprávy
 * typu „Nakonec summer 9x30", které opravdu popisují celou objednávku a
 * porovnání si s nimi poradí samo.
 */
export function slozNavrh(opts: {
  /** Co je v objednávce teď. */
  soucasne: ItemRef[];
  /** Co se přečetlo z odpovědi. */
  zOdpovedi: ItemRef[];
  /** Text odpovědi — z něj se čte rozsah. */
  text: string | null | undefined;
  /** Katalog obalů, aby šlo položky zařadit do skupin. */
  obaly: ObalInfo[];
}): ItemRef[] {
  const { soucasne, zOdpovedi, text, obaly } = opts;
  const { nahradit } = rozsahOdpovedi(text);
  if (nahradit.length === 0) {
    // ➕ PŘÍDAVEK: „Pro Radka ještě plus toto", „Plus 3x10 11sv". Tahle zpráva
    //    objednávku NEPOPISUJE ZNOVU — přidává k ní. Bez téhle větve by z ní
    //    vyšel návrh „objednávka = jen tyhle dvě limonády" a schválení by
    //    zbytek objednávky smazalo. Přesně ta past, před kterou varuje
    //    komentář výš („jedna přidaná položka by smazala celou objednávku").
    //    Množství se SČÍTÁ: „plus 1x30 višeň" u objednávky, kde už dvě jsou,
    //    znamená tři.
    if (vypadaJakoPridavek(text)) return prictiPolozky(soucasne, zOdpovedi);
    return zOdpovedi;
  }

  const podleId = new Map(obaly.map((p) => [p.id, p]));
  const skupina = (i: ItemRef): SkupinaObalu => {
    const obal = i.package_id ? podleId.get(i.package_id) : undefined;
    return obal ? skupinaObalu(obal) : 'jine';
  };
  const nahrazovana = new Set(nahradit);

  // 1) Ze současné objednávky zůstává všechno, o čem odpověď nediktovala nový
  //    obsah — včetně položek, které vůbec nejmenuje.
  const vysledek: ItemRef[] = soucasne.filter((i) => !nahrazovana.has(skupina(i)));

  // 2) Z odpovědi se berou položky nahrazovaných skupin.
  const zbytek: ItemRef[] = [];
  for (const i of zOdpovedi) {
    if (nahrazovana.has(skupina(i))) vysledek.push(i);
    else zbytek.push(i);
  }

  // 3) Položka z odpovědi MIMO nahrazovanou skupinu je dodatek („…a ještě
  //    3x50"). Když už v objednávce je, platí množství z odpovědi — odběratel
  //    ho právě teď napsal; jinak se přidá.
  for (const i of zbytek) {
    const k = itemKey(i);
    const stejna = vysledek.findIndex((v) => itemKey(v) === k);
    if (stejna >= 0) vysledek[stejna] = i;
    else vysledek.push(i);
  }

  return vysledek;
}

/**
 * Skupiny, které odpověď potvrdila („petky sedí"), ale v načtené původní
 * objednávce k nim NENÍ jediná položka.
 *
 * „Sedí" znamená „nech to, jak to je" — jenže když v objednávce ta skupina
 * vůbec není, není co nechat: buď se původní objednávka načetla neúplná
 * (z PDF se třeba petky nevytáhly), nebo odběratel mluví o něčem, co appka
 * nevidí. Tiše by pak z „petky sedí" nevzniklo nic a obsluha by netušila
 * proč. Tohle vrátí takové skupiny, ať to kontrola může nahlas říct.
 */
export function potvrzeneBezPolozek(opts: {
  soucasne: ItemRef[];
  potvrzeno: SkupinaObalu[];
  obaly: ObalInfo[];
}): SkupinaObalu[] {
  const { soucasne, potvrzeno, obaly } = opts;
  if (potvrzeno.length === 0) return [];
  const podleId = new Map(obaly.map((p) => [p.id, p]));
  const skupinyVObjednavce = new Set<SkupinaObalu>();
  for (const i of soucasne) {
    if (Number(i.quantity || 0) <= 0) continue;
    const obal = i.package_id ? podleId.get(i.package_id) : undefined;
    if (obal) skupinyVObjednavce.add(skupinaObalu(obal));
  }
  return potvrzeno.filter((s) => !skupinyVObjednavce.has(s));
}

/**
 * Říká zpráva, že je to PŘÍDAVEK k něčemu, co už je objednané?
 *
 * Skutečný případ (6. 9. 2026): fotka papíru
 *
 *     SKLAD
 *     + 1x 30l LIMO VIŠEŇ
 *       1x 30l LIMO KIWI
 *
 * s popiskem „Pro Radka jeste plus toto". Znamená to „tohle navíc k tomu, co
 * už pro Radka jede". Aplikace z toho ale založila SAMOSTATNOU objednávku,
 * protože doplněk pozná jen tehdy, když je zpráva odpovědí s citací
 * (`amends_order_id`, viz `findQuotedMessage`) — a tohle je nová zpráva
 * s fotkou, žádná odpověď.
 *
 * Rozpoznat to jistě z textu nejde: „plus" může být i součást normální
 * objednávky. Proto tahle funkce nic NEROZHODUJE — jen řekne, že to tak
 * vypadá, a obsluze se ukáže upozornění, ať se podívá, jestli objednávka pro
 * toho člověka už neexistuje. Rozhodnutí zůstává na člověku; tichá záměna
 * „přidat" za „založit novou" je přesně to, co dělá v objednávkách nepořádek.
 *
 * Hledá se jen v ÚVODU zprávy (první dva řádky / prvních 60 znaků): „plus"
 * uprostřed výčtu položek je součást objednávky, ne pokyn.
 */
export function vypadaJakoPridavek(text: string | null | undefined): boolean {
  const uvod = (text ?? '')
    .split('\n').slice(0, 2).join(' ')
    .slice(0, 60)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!uvod.trim()) return false;
  // „jeste plus toto", „plus jeste", „navic", „k tomu jeste", „pridej"
  return /\b(jeste\s+plus|plus\s+jeste|jeste\s+k\s+tomu|k\s+tomu\s+jeste|navic|pridej|pridat)\b/.test(uvod)
    || /^\s*(a\s+)?plus\b/.test(uvod)
    || /\bplus\s+(toto|tohle|tohleto)\b/.test(uvod);
}

/**
 * Přičte položky ze zprávy k tomu, co v objednávce je.
 *
 * Stejná položka (pivo + obal) se sečte, nová se připojí na konec. Pořadí
 * původních položek se nemění — obsluha porovnává návrh s objednávkou očima
 * a přeskládaný seznam se čte hůř než ten, ve kterém přibyl řádek dole.
 */
export function prictiPolozky(soucasne: ItemRef[], pridavane: ItemRef[]): ItemRef[] {
  const vysledek: ItemRef[] = soucasne.map((i) => ({ ...i, quantity: Number(i.quantity || 0) }));
  for (const p of pridavane) {
    const mnozstvi = Number(p.quantity || 0);
    if (mnozstvi === 0) continue;
    const i = vysledek.findIndex((v) => itemKey(v) === itemKey(p));
    if (i >= 0) vysledek[i] = { ...vysledek[i], quantity: vysledek[i].quantity + mnozstvi };
    else vysledek.push({ ...p, quantity: mnozstvi });
  }
  return vysledek;
}

/**
 * Mluví zpráva o objednávce, která už existuje — a jak?
 *
 *   `'uprava'`   „Ty malé soudky budou Desítka 2×20l", „petky sedí"
 *                → jmenuje skupinu obalů a říká, co v ní má být (nebo že
 *                  zůstat). Takovou zprávu je potřeba do vybrané objednávky
 *                  ZAPRACOVAT: jmenované skupiny se přepíšou, zbytek zůstane.
 *   `'pridavek'` „Pro Radka ještě plus toto", „Plus 3×10 11sv"
 *                → nic nepřepisuje, jen přidává.
 *   `null`       běžná nová objednávka.
 *
 * Pořadí je záměrné a musí sedět se `slozNavrh`: když zpráva diktuje skupinu,
 * rozhoduje diktát, i kdyby začínala slovem „plus". Kdyby si UI a import
 * vybraly jinak, ukázal by náhled něco jiného, než co se zapíše.
 */
export type DruhZmeny = 'pridavek' | 'uprava';

export function vypadaJakoZmenaObjednavky(text: string | null | undefined): DruhZmeny | null {
  const { nahradit, potvrzeno } = rozsahOdpovedi(text);
  if (nahradit.length > 0 || potvrzeno.length > 0) return 'uprava';
  if (vypadaJakoPridavek(text)) return 'pridavek';
  return null;
}

// ---------------------------------------------------------------------------
// 🔗 KE KTERÉ OBJEDNÁVCE PŘÍDAVEK PATŘÍ
// ---------------------------------------------------------------------------
// `vypadaJakoPridavek` umí říct „tohle je přídavek", ale ne k čemu. Napojení
// na objednávku (`amends_order_id`) dosud uměla jen citovaná odpověď — u nové
// zprávy s fotkou žádná citace není a obsluze nezbylo než objednávku najít
// v seznamu, zapamatovat si ji a přepsat ručně.
//
// Tohle vybere objednávky, které přicházejí v úvahu, a nechá výběr na
// člověku. Rozhodnout to za něj by znamenalo tiše připsat položky k cizí
// objednávce — což je horší chyba než založit druhou.

export type ObjednavkaKandidat = {
  id: string;
  order_date: string | null;
  delivery_date: string | null;
  delivery_day: string | null;
  place_id: string | null;
  place_name: string | null;
  status: string | null;
};

/**
 * Je to totéž slovo v jiném pádu? „radka" vs. „radek", „dubu" vs. „dub".
 *
 * Přesné skloňování by potřebovalo slovník; tohle je záměrně hrubé pravidlo —
 * stejný začátek, jiná koncovka. Cena za omyl je nízká: nabídne se o jednu
 * objednávku v seznamu navíc a vybírá z něj člověk. Cena za opatrnost je
 * naopak vysoká: objednávka, kterou obsluha hledá, se vůbec neukáže.
 *
 * Krátká slova („u", „na", „pod") se vynechávají — na těch by si byla podobná
 * skoro všechna jména.
 */
function stejneSlovoJinyPad(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  // Pád mění koncovku, ne délku slova: „radek"/„radka" (0), „dub"/„dubu" (1).
  // Dva znaky rozdílu už znamenají jiné slovo — „radek" vs. „radnice".
  if (Math.abs(a.length - b.length) > 1) return false;
  return a.slice(0, 3) === b.slice(0, 3);
}

/** Datum, podle kterého se objednávka řadí: den závozu, jinak den objednání. */
export function datumObjednavky(o: ObjednavkaKandidat): string {
  return o.delivery_date || o.order_date || '';
}

/** Rozdíl dvou dnů ve dnech (YYYY-MM-DD), kladně i záporně. */
function rozdilDnu(a: string, b: string): number {
  const ta = Date.parse(a + 'T00:00:00Z');
  const tb = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.round((ta - tb) / 86400000);
}

/**
 * Objednávky, ke kterým může přídavek patřit — od té nejpravděpodobnější.
 *
 * Pravidla, a proč zrovna tahle:
 *  • **Stornované ne.** Připsat položku ke zrušené objednávce nedává smysl.
 *  • **Odběratel musí sedět.** Podle `place_id`, když ho zpráva má; jinak
 *    podle jména oběma směry (v objednávce „Hospoda U Radka", ve zprávě
 *    „Radek"), protože WhatsApp zprávy jmenují odběratele zkratkou.
 *  • **Časové okno.** Objednávka stará měsíc je dávno zavezená; přídavek
 *    k ní by byl omyl. Výchozí okno je týden zpět a dva týdny dopředu.
 *  • **Řadí se podle blízkosti k dnešku**, ne podle stáří: objednávka na
 *    zítřek je pravděpodobnější cíl než ta z minulého týdne. Při shodné
 *    vzdálenosti vyhrává pozdější datum.
 *
 * Vyřízené objednávky se NEVYHAZUJÍ — jen je u nich vidět stav. „Zavezeno"
 * bývá překlep obsluhy stejně často jako pravda a schovat objednávku, kterou
 * člověk hledá, je horší než mu ji ukázat i s varováním.
 */
export function kandidatiNaDoplneni(opts: {
  objednavky: ObjednavkaKandidat[];
  placeId?: string | null;
  placeName?: string | null;
  /** Dnešek jako YYYY-MM-DD. */
  dnes: string;
  dnuZpet?: number;
  dnuVpred?: number;
  /** Nejvýš tolik návrhů (výchozí 6) — delší seznam se na telefonu nedá projít. */
  limit?: number;
}): ObjednavkaKandidat[] {
  const { objednavky, placeId, placeName, dnes } = opts;
  const dnuZpet = opts.dnuZpet ?? 7;
  const dnuVpred = opts.dnuVpred ?? 14;
  const limit = opts.limit ?? 6;

  const jmeno = normText(placeName);
  const sediOdberatel = (o: ObjednavkaKandidat): boolean => {
    if (placeId && o.place_id) return o.place_id === placeId;
    if (!jmeno) return false;
    const n = normText(o.place_name);
    if (!n) return false;
    if (n === jmeno || n.includes(jmeno) || jmeno.includes(n)) return true;
    // Skloňování: „Pro RADKA" ve zprávě, „RADEK" v objednávce. Kus textu
    // se neshoduje ani jedním směrem a bez tohohle by se objednávka, kterou
    // obsluha hledá, prostě nenabídla.
    const slovaA = jmeno.split(' ').filter(Boolean);
    const slovaB = n.split(' ').filter(Boolean);
    return slovaA.some((a) => slovaB.some((b) => stejneSlovoJinyPad(a, b)));
  };

  return objednavky
    .filter((o) => o.status !== 'storno')
    .filter(sediOdberatel)
    .filter((o) => {
      const d = datumObjednavky(o);
      if (!d) return false;
      const rozdil = rozdilDnu(d, dnes);
      return rozdil >= -dnuZpet && rozdil <= dnuVpred;
    })
    .sort((a, z) => {
      const da = Math.abs(rozdilDnu(datumObjednavky(a), dnes));
      const dz = Math.abs(rozdilDnu(datumObjednavky(z), dnes));
      if (da !== dz) return da - dz;
      return datumObjednavky(a) < datumObjednavky(z) ? 1 : -1;
    })
    .slice(0, limit);
}
