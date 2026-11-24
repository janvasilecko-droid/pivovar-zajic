// 📱 SMS přes telefon — odkaz `sms:`, který otevře aplikaci zpráv s hotovým textem.
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026: „u položky malé sudy udělej tlačítko odeslat Radkovi, přes
// bránu telefonu se mu pošle sms s počtem malých sudů." Appka žádnou SMS bránu
// (placenou službu ani aplikaci, která posílá SMS sama) nemá. Odkaz `sms:` ale
// otevře v telefonu aplikaci zpráv s předvyplněným číslem a textem — stačí ťuknout
// na odeslání. Stejně funguje „Uložit a odeslat na WhatsApp" (lib/navigation.ts).
//
// Číslo i text jdou do odkazu — žádná SMS se neodešle sama a nic se neposílá na server.

/**
 * Číslo pro odkaz `sms:` v mezinárodním tvaru bez mezer a závorek („+420777123456").
 * České devítimístné číslo dostane předvolbu +420; zápis „00…" se změní na „+…".
 * Prázdné (nebo nepodobné číslu — míň než 9 číslic) vrátí '' — odkaz pak otevře SMS
 * bez příjemce a vybere ho člověk.
 */
export function cisloProSms(telefon: string | null | undefined): string {
  const zdroj = (telefon ?? '').trim();
  if (!zdroj) return '';
  const zacinaPlusem = zdroj.startsWith('+');
  let cislice = zdroj.replace(/\D/g, '');
  let mezinarodni = zacinaPlusem;
  if (!mezinarodni && cislice.startsWith('00')) { cislice = cislice.slice(2); mezinarodni = true; }
  if (!mezinarodni && cislice.length === 12 && cislice.startsWith('420')) mezinarodni = true; // předvolba bez plus
  if (!mezinarodni) {
    if (cislice.length !== 9) return ''; // české číslo má devět číslic; cokoli jiného bez předvolby neznáme
    return `+420${cislice}`;
  }
  if (cislice.length < 9 || cislice.length > 15) return '';
  return `+${cislice}`;
}

/**
 * Odkaz, který v telefonu otevře SMS: `sms:<číslo>?&body=<text>`. Zápis `?&body=` čtou
 * Android i iPhone. Bez čísla (`sms:?&body=…`) si příjemce vybere člověk v aplikaci zpráv.
 */
export function odkazSms(telefon: string | null | undefined, text: string): string {
  return `sms:${cisloProSms(telefon)}?&body=${encodeURIComponent(text)}`;
}
