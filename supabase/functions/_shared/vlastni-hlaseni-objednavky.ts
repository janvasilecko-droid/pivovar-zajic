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
 * Pozná vlastní hlášení appky o vytvořené objednávce — text ZAČÍNÁ
 * značkou (po odstranění bílých znaků na začátku).
 *
 * Kontroluje se jen u zpráv OD MAJITELE (`fromMe`): zákaznická zpráva se
 * stejným začátkem textu (nepravděpodobné, ale appka to nemá jak vyloučit)
 * se týkat nemá — je to pořád zpráva od odběratele, ne appky.
 */
export function jeVlastniHlaseniObjednavky(text: string | null | undefined, fromMe: boolean): boolean {
  if (!fromMe) return false;
  return (text ?? "").trimStart().startsWith(ZNACKA_VLASTNIHO_HLASENI);
}
