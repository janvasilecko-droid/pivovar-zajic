// Pomocné funkce pro 1-Click navigaci řidiče a WhatsApp komunikaci

export type NavigationApp = 'google' | 'waze' | 'mapycz';

export function openNavigation(app: NavigationApp, destination: string) {
  if (!destination.trim()) return;
  const encoded = encodeURIComponent(destination.trim());

  switch (app) {
    case 'google':
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
      break;
    case 'waze':
      window.open(`https://waze.com/ul?q=${encoded}&navigate=yes`, '_blank');
      break;
    case 'mapycz':
      window.open(`https://mapy.cz/zakladni?q=${encoded}`, '_blank');
      break;
  }
}

export function buildCustomerDeliveryWhatsAppText(
  customerName: string,
  items: { beer_name?: string | null; package_label?: string | null; quantity: number }[],
  note?: string | null
): string {
  const lines: string[] = [
    `Dobrý den, ${customerName},`,
    `vezeme vám dnešní závoz piva z Pivovaru Zajíček:`,
    '',
  ];

  items.forEach((it) => {
    lines.push(`• ${it.quantity}x ${it.beer_name || 'Pivo'} (${it.package_label || 'obal'})`);
  });

  if (note) {
    lines.push('');
    lines.push(`Poznámka: ${note}`);
  }

  lines.push('');
  lines.push('Těšíme se na vás, řidič Pivovaru Zajíček 🚚🍺');

  return lines.join('\n');
}

export function openCustomerWhatsApp(phone: string | undefined, message: string) {
  const cleanPhone = (phone || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
  const encodedMsg = encodeURIComponent(message);
  if (cleanPhone) {
    window.open(`https://wa.me/${cleanPhone}?text=${encodedMsg}`, '_blank');
  } else {
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
  }
}
