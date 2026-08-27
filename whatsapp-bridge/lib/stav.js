/**
 * Tep mostu a příkazy z aplikace.
 *
 * TEP: most každou minutu zapíše „žiju" do `whatsapp_most_stav`. Bez toho se
 * nedá odlišit „nikdo nic neposlal" od „most neběžel" — obojí vypadá v databázi
 * stejně (nic tam není). Na bezplatném Renderu je to podstatné: instance po
 * ~15 minutách nečinnosti usne, spící most nemá otevřené spojení s WhatsAppem
 * a zprávy poslané mezitím se živě nedoručí.
 *
 * PŘÍKAZY: aplikace nemůže na most volat přímo (spící instance neodpoví a
 * z prohlížeče by to znamenalo řešit CORS a tajemství v klientovi). Místo toho
 * zapíše řádek do `whatsapp_prikazy` a most si ho vyzvedne, až běží.
 *
 * Jediný příkaz je 'srovnat': most se znovu připojí a WhatsApp mu při párování
 * pošle historii skupiny — chybějící zprávy tím projdou stejnou cestou jako
 * živé (dedup podle key.id zabrání duplicitám).
 */

const TEP_MS = 60 * 1000;
const PRIKAZY_MS = 30 * 1000;

/**
 * Spustí pravidelný zápis tepu. Vrací funkci pro zastavení.
 * @param {object} supabase klient se service_role klíčem
 * @param {() => {pripojeno: boolean, poznamka?: string}} ctiStav
 * @param {object} logger
 */
export function spustTep(supabase, ctiStav, logger, verze = '') {
  const zapis = async () => {
    try {
      const s = ctiStav();
      await supabase.from('whatsapp_most_stav').upsert({
        id: 'most',
        naposledy: new Date().toISOString(),
        pripojeno: !!s.pripojeno,
        verze: verze || null,
        poznamka: s.poznamka || null,
        // Vlastní veřejná adresa — aplikace ji nemusí mít nakonfigurovanou
        // a spící instanci pak dokáže probudit obyčejným pingem.
        url: process.env.RENDER_EXTERNAL_URL || process.env.BRIDGE_PUBLIC_URL || null,
      });
    } catch (e) {
      // Tep je diagnostika — když se nezapíše, most musí běžet dál.
      logger?.warn?.({ err: e }, '[tep] zápis selhal');
    }
  };
  zapis();
  const t = setInterval(zapis, TEP_MS);
  return () => clearInterval(t);
}

/**
 * Spustí vyzvedávání příkazů. `provedSrovnani` má znovu navázat spojení
 * (nejjednodušší je zavřít socket — most se sám připojí a dostane historii).
 * Vrací funkci pro zastavení.
 */
export function spustPrikazy(supabase, provedSrovnani, logger) {
  let bezi = false;

  const tik = async () => {
    if (bezi) return; // dva běhy najednou by se praly o tentýž příkaz
    bezi = true;
    try {
      const { data, error } = await supabase
        .from('whatsapp_prikazy')
        .select('id, prikaz')
        .eq('stav', 'ceka')
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      const prikaz = data?.[0];
      if (!prikaz) return;

      // Označit jako běžící hned, ať si ho druhá instance nevezme taky.
      await supabase.from('whatsapp_prikazy')
        .update({ stav: 'bezi', updated_at: new Date().toISOString() })
        .eq('id', prikaz.id)
        .eq('stav', 'ceka');

      logger?.info?.(`[prikazy] provádím "${prikaz.prikaz}" (${prikaz.id})`);
      try {
        const vysledek = await provedSrovnani();
        await supabase.from('whatsapp_prikazy').update({
          stav: 'hotovo',
          vysledek: vysledek || 'Most se znovu připojuje, historie se dopočítá.',
          updated_at: new Date().toISOString(),
        }).eq('id', prikaz.id);
      } catch (e) {
        await supabase.from('whatsapp_prikazy').update({
          stav: 'chyba',
          vysledek: e?.message || String(e),
          updated_at: new Date().toISOString(),
        }).eq('id', prikaz.id);
      }
    } catch (e) {
      logger?.warn?.({ err: e }, '[prikazy] vyzvednutí selhalo');
    } finally {
      bezi = false;
    }
  };

  const t = setInterval(tik, PRIKAZY_MS);
  tik();
  return () => clearInterval(t);
}
