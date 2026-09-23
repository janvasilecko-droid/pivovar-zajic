/**
 * 🫀 Oživení mostu — ať se „proces žije, ale spojení je mrtvé" spraví samo.
 *
 * Z provozu 21.–22. 9. 2026 (už podruhé): appka hlásila „Most běží, ale 9
 * pracovních hodin nedorazila žádná zpráva", tep mostu byl čerstvý (právě teď)
 * a poznámka zamrzlá na „spojení zavřeno (kód 428)". Tedy: proces žil, HTTP
 * server odpovídal, tep se zapisoval každou minutu — ale k WhatsAppu už se
 * nikdy nepřipojil.
 *
 * Proč: znovupřipojení bylo slepá ulička.
 *
 *   setTimeout(() => { start().catch((e) => logger.error(e)) }, 3000)
 *
 * `start()` čeká na `useSupabaseAuthState()` (síťové volání do Supabase).
 * Když to jednou selže — výpadek sítě, restart Supabase, cokoli — chyba se
 * jen zaloguje a TÍM TO KONČÍ. Žádný další pokus se nenaplánuje, proces se
 * neukončí (drží ho HTTP server a interval tepu), takže Render nemá co
 * restartovat: spadlý proces by nahodil, zaseknutý nepozná.
 *
 * Druhá past: „Srovnat s WhatsAppem" v appce volalo `sock.end()` a spoléhalo,
 * že z toho přijde `connection.update` → close → nové připojení. Jenže socket
 * už byl mrtvý, žádná událost nepřišla — jediná ruční záchrana byla přesně
 * v tom stavu, kde je potřeba, bez efektu.
 *
 * Tenhle modul drží ROZHODOVÁNÍ (kdy zkusit znovu, kdy to vzdát a nechat se
 * restartovat) mimo index.js, aby šlo otestovat bez socketu a bez sítě.
 */

/** Odpojeno déle než tohle (minuty) → zkusit obnovu. */
export const MRTVO_MINUT = 5;

/**
 * Připojeno, ale z WhatsAppu celé hodiny nic (ani historie, ani zpráva) →
 * „přihlášená, ale hluchá" session. Detekce už v mostu byla (psala se jen do
 * poznámky v tepu), ale nikdo podle ní nic nedělal. Práh zůstává stejný, ať
 * se chování nezmění na něco, co tu ještě nebylo.
 */
export const HLUCHO_MINUT = 180;

/**
 * Po kolika marných pokusech o obnovu se proces radši ukončí (exit 1).
 * Render spadlou instanci nahodí znovu a ta si session načte z databáze —
 * čistý start je spolehlivější než donekonečna opravovat rozbitý stav
 * uvnitř běžícího procesu.
 */
export const MAX_POKUSU = 5;

/**
 * Odstup dalšího pokusu. Roste, ať se při delším výpadku Supabase/WhatsAppu
 * most nezahltí vlastními pokusy — ale strop je minuta, aby se po návratu
 * sítě připojil rychle.
 */
export function odstupMs(pokus) {
  const RADA = [3_000, 6_000, 12_000, 30_000, 60_000];
  const i = Math.max(0, Math.min(pokus, RADA.length - 1));
  return RADA[i];
}

/** Minut mezi dvěma časy; null, když čas chybí nebo je nesmyslný. */
function minutOd(casISO, ted) {
  if (!casISO) return null;
  const t = Date.parse(casISO);
  if (Number.isNaN(t)) return null;
  return Math.floor((ted.getTime() - t) / 60_000);
}

/**
 * Co má hlídač udělat.
 *
 * @param {object} stav
 * @param {boolean} stav.pripojeno     hlásí socket otevřené spojení?
 * @param {string|null} stav.odpojenoOd ISO čas posledního `close` (null = teď jsme připojení)
 * @param {string|null} stav.posledniUdalost ISO čas, kdy naposledy něco přišlo z WhatsAppu
 * @param {number} stav.pokusu         kolik obnov po sobě už selhalo
 * @param {Date} stav.ted
 * @returns {{akce: 'nic'|'obnovit'|'restart', duvod: string}}
 */
export function rozhodniOObnove({ pripojeno, odpojenoOd, posledniUdalost, pokusu = 0, ted }) {
  const nic = { akce: 'nic', duvod: '' };

  if (pripojeno) {
    const ticho = minutOd(posledniUdalost, ted);
    // Bez jediné události se hluchost posoudit nedá — čerstvě spárovaný most
    // taky nic nedostal a restartovat ho kvůli tomu by byl nesmysl.
    if (ticho === null || ticho < HLUCHO_MINUT) return nic;
    const duvod = `připojeno, ale ${Math.floor(ticho / 60)} h nic nepřišlo (hluchá session)`;
    return pokusu >= MAX_POKUSU ? { akce: 'restart', duvod } : { akce: 'obnovit', duvod };
  }

  const mrtvo = minutOd(odpojenoOd, ted);
  if (mrtvo === null || mrtvo < MRTVO_MINUT) return nic;
  const duvod = `odpojeno ${mrtvo} min`;
  return pokusu >= MAX_POKUSU ? { akce: 'restart', duvod } : { akce: 'obnovit', duvod };
}
