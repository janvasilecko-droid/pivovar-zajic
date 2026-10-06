// WhatsApp Sharing Utility for Minipivovar Zajíc
//
// Každá zpráva odsud nese NEVIDITELNOU značku (oznacZpravuZAplikace) —
// když dorazí zpátky přes most do appky, databáze i whatsapp-auto-parse ji
// poznají jako odeslanou z appky a nezpracují ji podruhé jako novou
// objednávku (6. 10. 2026). Viditelný text se nemění.
import { oznacZpravuZAplikace } from '../../supabase/functions/_shared/vlastni-hlaseni-objednavky';

type ObjednavkaKeSdileni = { place_name: string | null; order_date: string; delivery_day?: string | null; delivery_date?: string | null; note?: string | null };
type PolozkaKeSdileni = { beer_name: string | null; package_label: string | null; quantity: number };

export function shareOrderToWhatsApp(order: ObjednavkaKeSdileni, items: PolozkaKeSdileni[]) {
  const url = `https://wa.me/?text=${encodeURIComponent(textObjednavkyProWhatsApp(order, items))}`;
  if (typeof window !== 'undefined') {
    // Přímá navigace (ne nová záložka) — na mobilu spolehlivěji předá odkaz
    // rovnou nainstalované appce, místo aby zůstala viset prázdná záložka.
    window.location.href = url;
  }
}

/** Text objednávky ke sdílení — i s neviditelnou značkou „odesláno z appky". */
export function textObjednavkyProWhatsApp(order: ObjednavkaKeSdileni, items: PolozkaKeSdileni[]): string {
  const place = order.place_name || 'Neznámý odběratel';

  let itemListText = items
    .map((i) => `• *${i.quantity}x* ${i.package_label ? `${i.package_label} ` : ''}${i.beer_name || 'Pivo'}`)
    .join('\n');

  if (!itemListText) itemListText = '_Bez položek_';

  const noteText = order.note ? `\n*Poznámka:* ${order.note}` : '';

  // Bez data a bez ikon/nálepky "Odběratel:" — z provozu 24. 9. 2026: „ani
  // tam nepiš datum (datum na whatsupu vidím podle toho kdy zpráva přišla)
  // a odběratel, bude vypadat takhle Mates rybárna na jednom řádku, řádek
  // pod tím mezera, další řádek 2x50l 11 světlý ležák, po tom případné
  // poznámky". Datum appka nepíše — na WhatsAppu je vidět z času zprávy.
  return oznacZpravuZAplikace(`${place}\n\n${itemListText}${noteText}`);
}

export function shareDeliveryListToWhatsApp(
  dayLabel: string,
  ordersWithItems: { place_name: string | null; items: { beer_name: string | null; package_label: string | null; quantity: number }[]; note?: string | null }[]
) {
  let body = `🚚 *ZAVÁŽECÍ LIST — ${dayLabel.toUpperCase()}*\n_Kynšperk nad Ohří_\n\n`;

  ordersWithItems.forEach((o, idx) => {
    body += `*${idx + 1}. ${o.place_name || 'Neznámý odběratel'}*\n`;
    o.items.forEach((i) => {
      body += `   • ${i.quantity}x ${i.package_label ? `${i.package_label} ` : ''}${i.beer_name || 'Pivo'}\n`;
    });
    if (o.note) body += `   📝 _Poznámka: ${o.note}_\n`;
    body += `\n`;
  });

  const url = `https://wa.me/?text=${encodeURIComponent(oznacZpravuZAplikace(body.trim()))}`;
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
