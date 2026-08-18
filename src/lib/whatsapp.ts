// WhatsApp Sharing Utility for Minipivovar Zajíc

export function shareOrderToWhatsApp(
  order: { place_name: string | null; order_date: string; delivery_day?: string | null; delivery_date?: string | null; note?: string | null },
  items: { beer_name: string | null; package_label: string | null; quantity: number }[]
) {
  const place = order.place_name || 'Neznámý odběratel';
  const date = order.order_date;
  const day = order.delivery_day ? ` (${order.delivery_day.toUpperCase()})` : '';

  let itemListText = items
    .map((i) => `• *${i.quantity}x* ${i.beer_name || 'Pivo'} ${i.package_label ? `(${i.package_label})` : ''}`)
    .join('\n');

  if (!itemListText) itemListText = '_Bez položek_';

  const noteText = order.note ? `\n📝 *Poznámka:* ${order.note}` : '';

  const msg = `🍺 *OBJEDNÁVKA — Kynšperk nad Ohří*\n\n🏬 *Odběratel:* ${place}\n📅 *Datum:* ${date}${day}${noteText}\n\n*Položky:* \n${itemListText}\n\n_Minipivovar Zajíc Kynšperk_`;

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
      body += `   • ${i.quantity}x ${i.beer_name || 'Pivo'} ${i.package_label ? `(${i.package_label})` : ''}\n`;
    });
    if (o.note) body += `   📝 _Poznámka: ${o.note}_\n`;
    body += `\n`;
  });

  const url = `https://wa.me/?text=${encodeURIComponent(body.trim())}`;
  if (typeof window !== 'undefined') {
    window.location.href = url;
  }
}
