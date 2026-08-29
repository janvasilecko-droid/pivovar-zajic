/**
 * Typ obrázku přečtený z hlavičky data URL (`data:image/png;base64,…`).
 *
 * Proč to nestačí uhodnout: obrazovky pro čtení fotek posílaly do AI funkce
 * natvrdo "image/jpeg". Anthropic ale kontroluje, že ohlášený typ sedí
 * s obsahem, a snímek obrazovky z WhatsAppu je PNG — čtení tedy spadlo hned
 * u prvního poskytovatele a přes zálohy propadlo až k chybě. Čtení objednávek
 * posílalo typ ze souboru správně a fungovalo; stáčení lahví, KEG a prodejna
 * na to zapomněly.
 *
 * Hlavička data URL je spolehlivější než `File.type`: platí i pro fotku
 * upravenou v editoru (ta už žádný soubor nemá) a pro obrázek vložený
 * ze schránky.
 */
export function typObrazku(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/jpeg';
}
