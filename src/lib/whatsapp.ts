// WhatsApp Sharing Utility for Minipivovar Zajíc

export function shareOrderToWhatsApp(
  order: { place_name: string | null; order_date: string; delivery_day?: string | null; delivery_date?: string | null; note?: string | null },
  items: { beer_name: string | null; package_label: string | null; quantity: number }[]
) {
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
  const msg = `${place}\n\n${itemListText}${noteText}`;

  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  if (typeof window !== 'undefined') {
    // Přímá navigace (ne nová záložka) — na mobilu spolehlivěji předá odkaz
    // rovnou nainstalované appce, místo aby zůstala viset prázdná záložka.
    window.location.href = url;
  }
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

  const url = `https://wa.me/?text=${encodeURIComponent(body.trim())}`;
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
