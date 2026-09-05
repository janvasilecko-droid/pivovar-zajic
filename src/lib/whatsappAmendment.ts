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
  if (nahradit.length === 0) return zOdpovedi;

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
