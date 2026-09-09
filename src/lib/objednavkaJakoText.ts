// 📋 Objednávka jako prostý text — pro poslání zákazníkovi přes SMS/e-mail.
//
// WhatsApp zprávu appka umí poskládat už při zadávání nové objednávky
// (Orders.tsx), ale u ULOŽENÉ objednávky, kterou chce někdo přeposlat nebo
// jen nadiktovat po telefonu, se muselo opisovat ručně z obrazovky.

export type PolozkaKTextu = {
  beer_name: string | null;
  package_label: string | null;
  quantity: number;
};

export type ObjednavkaKTextu = {
  order_date: string;
  delivery_date?: string | null;
  place_name?: string | null;
  note?: string | null;
};

/**
 * Poskládá objednávku do prostého textu. Žádné Markdown ani emoji navíc —
 * jde rovnou do SMS/WhatsAppu, kde by se hvězdičky zobrazily doslova.
 */
export function objednavkaJakoText(
  objednavka: ObjednavkaKTextu,
  polozky: PolozkaKTextu[],
  nazevMista?: string | null,
): string {
  const radky: string[] = [];
  const misto = nazevMista || objednavka.place_name;
  radky.push(misto ? `Objednávka — ${misto}` : 'Objednávka');
  radky.push(`Datum: ${objednavka.order_date}`);
  if (objednavka.delivery_date) radky.push(`Závoz: ${objednavka.delivery_date}`);
  radky.push('');

  for (const p of polozky) {
    const pivo = p.beer_name || '?';
    const obal = p.package_label || '';
    radky.push(`${p.quantity}× ${pivo}${obal ? ` ${obal}` : ''}`);
  }

  const celkem = polozky.reduce((s, p) => s + Number(p.quantity || 0), 0);
  radky.push('');
  radky.push(`Celkem: ${celkem} ks`);

  if (objednavka.note && objednavka.note.trim()) {
    radky.push('');
    radky.push(`Poznámka: ${objednavka.note.trim()}`);
  }

  return radky.join('\n');
}
