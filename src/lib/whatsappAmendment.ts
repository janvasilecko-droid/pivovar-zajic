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
