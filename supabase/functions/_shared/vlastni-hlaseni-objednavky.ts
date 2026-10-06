// ✅ Krátké hlášení, které appka sama posílá do skupiny „Objednávky
// pivovar" po vytvoření objednávky (viz whatsapp-send-order/index.ts) —
// a whatsapp-auto-parse ho nesmí přečíst jako NOVOU objednávku od
// odběratele.
//
// Z provozu 24. 9. 2026: „pokud se obednavka odelslal z aplikace ,tak ji
// uz neparsuj ,je udele kratky hlaseni obednavka co je obednano ,ale
// nechci klikat ,at se omylem nenacte 2x ,uz se mi to stalo ,ze ve vice
// obednavek sem potvrdil i obednavku vytvorenou aplikaci a pak sem ji
// tam mel 2x."
//
// Appka posílá hlášení pod vlastním číslem do TÉŽE skupiny, ze které čte
// objednávky — Baileys ho vrátí appce zpátky jako normální příchozí
// zprávu (from_me = true), whitelist na chat_id/název ho pustí (je to ta
// správná skupina, viz check_whatsapp_sender_allowed — from_me bránu
// neobchází, jen se jí drží), a bez týhle pojistky by AI přečetla vlastní
// hlášení jako další objednávku od odběratele.
//
// Značka je schválně JEDNA konstanta, kterou sdílí odesílání i detekce —
// ne druhá kopie stejného textu, která by se dřív nebo později rozešla.
export const ZNACKA_VLASTNIHO_HLASENI = "✅ Nová objednávka";

/**
 * NEVIDITELNÁ značka zpráv, které appka posílá tlačítkem „Sdílet na
 * WhatsApp" (src/lib/whatsapp.ts) — objednávka, zavážecí list, zpráva
 * řidiče odběrateli. Text zůstává přesně ve tvaru, jaký si provoz určil
 * (24. 9. 2026: „Mates rybárna na jednom řádku, řádek pod tím mezera…"),
 * proto ne viditelná hlavička jako u ZNACKA_VLASTNIHO_HLASENI.
 *
 * Z provozu 6. 10. 2026: „když si pošlu z aplikace objednávku na WhatsApp,
 * ať se mi tam nezobrazuje, ať to program pozná, že jde o objednávku
 * odeslanou od něj, ať se pak nezpracuje 2× zbytečně."
 *
 * U+2063 INVISIBLE SEPARATOR, U+200B ZERO WIDTH SPACE, U+2063 — v běžném
 * textu se ta trojice nevyskytuje a trim() ji neořízne (nejsou to bílé
 * znaky). Stojí na konci PRVNÍHO řádku, ne na konci zprávy.
 */
export const ZNACKA_Z_APLIKACE = "\u2063\u200B\u2063";

/** Přidá neviditelnou značku na konec prvního řádku zprávy. */
export function oznacZpravuZAplikace(text: string): string {
  if (text.includes(ZNACKA_Z_APLIKACE)) return text;
  const konecRadku = text.indexOf("\n");
  return konecRadku < 0 ? text + ZNACKA_Z_APLIKACE : text.slice(0, konecRadku) + ZNACKA_Z_APLIKACE + text.slice(konecRadku);
}

/**
 * Pozná vlastní zprávu appky, která NENÍ nová objednávka:
 *  • zpráva odeslaná z appky tlačítkem „Sdílet" (neviditelná značka) —
 *    bez ohledu na odesílatele: značku umí vložit jen appka, a když ji
 *    někdo přepošle zpátky, pořád jde o objednávku, která v appce už je;
 *  • hlášení o vytvořené objednávce (text ZAČÍNÁ ZNACKA_VLASTNIHO_HLASENI)
 *    — jen u zpráv OD MAJITELE (`fromMe`): zákaznická zpráva se stejným
 *    začátkem textu (nepravděpodobné, ale appka to nemá jak vyloučit) je
 *    pořád zpráva od odběratele, ne appky.
 */
export function jeVlastniHlaseniObjednavky(text: string | null | undefined, fromMe: boolean): boolean {
  if ((text ?? "").includes(ZNACKA_Z_APLIKACE)) return true;
  if (!fromMe) return false;
  return (text ?? "").trimStart().startsWith(ZNACKA_VLASTNIHO_HLASENI);
}
