/**
 * Filtr čtení — které zprávy se z WhatsApp čtou a přeposílají na webhook.
 *
 * Pravidla jsou IDENTICKÁ s autoritativní bránou na webhooku
 * (supabase/functions/whatsapp-webhook/index.ts), DB triggeru
 * (check_whatsapp_sender_allowed) a whatsapp-auto-parse:
 *
 *   • zpráva je povolená, když NORMALIZOVANÝ NÁZEV (bez diakritiky a velikosti)
 *     odpovídá whitelistu NEBO chat_id odpovídá zaregistrovanému chat_id
 *     (skupina se mohla přejmenovat — chat_id je stabilní);
 *   • prázdný whitelist = povoleno vše (zpětně kompatibilní).
 *
 * Whitelist se čte ze STEJNÉ tabulky jako webhook (`whatsapp_senders`, edituje se
 * v aplikaci Nastavení → WhatsApp odesílatelé) a sjednocuje se s lokálními env
 * proměnnými ALLOWED_GROUPS / ALLOWED_CONTACTS. Načítá se při startu a pravidelně
 * obnovuje, aby změny provedené v aplikaci platily bez restartu služby.
 */

/** Normalizace názvu: malá písmena, ořezané mezery, bez diakritiky. */
export function norm(s) {
  return (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Čistá funkce — sestaví bránu z whitelistů bez databáze (používá se v testech).
 *
 * @param {object} opts
 * @param {string[]} [opts.allowedGroups]    povolené skupiny z env ALLOWED_GROUPS
 * @param {string[]} [opts.allowedContacts]  povolené kontakty z env ALLOWED_CONTACTS
 * @param {Array<{sender_name?: string, chat_id?: string | null}>} [opts.senders]
 *        řádky tabulky whatsapp_senders
 */
export function buildGate({ allowedGroups = [], allowedContacts = [], senders = [] } = {}) {
  const allowedNames = new Set();
  const allowedChatIds = new Set();

  for (const g of allowedGroups || []) if (g && g.trim()) allowedNames.add(norm(g));
  for (const c of allowedContacts || []) if (c && c.trim()) allowedNames.add(norm(c));
  for (const s of senders || []) {
    if (!s) continue;
    if (s.sender_name && s.sender_name.trim()) allowedNames.add(norm(s.sender_name));
    if (s.chat_id && s.chat_id.trim()) allowedChatIds.add(norm(s.chat_id));
  }

  const isEmpty = allowedNames.size === 0 && allowedChatIds.size === 0;

  return {
    allowedNames,
    allowedChatIds,
    isEmpty,
    /**
     * Skupinová zpráva je povolená, když název odpovídá whitelistu NEBO chat_id
     * odpovídá zaregistrovanému chat_id (přejmenovaná skupina → necháme projít,
     * webhook ji přebere podle chat_id).
     */
    isGroupAllowed(groupName, chatId) {
      if (isEmpty) return true;
      if (groupName && allowedNames.has(norm(groupName))) return true;
      if (chatId && allowedChatIds.has(norm(chatId))) return true;
      return false;
    },
    /**
     * Soukromá zpráva (1:1) je povolená, když jméno NEBO telefonní číslo
     * odpovídá whitelistu.
     */
    isContactAllowed(senderName, senderNumber) {
      if (isEmpty) return true;
      if (senderName && allowedNames.has(norm(senderName))) return true;
      if (senderNumber && allowedNames.has(norm(senderNumber))) return true;
      return false;
    },
  };
}

/**
 * Rozhodne o JEDNÉ zprávě: pustit dál, nebo zahodit?
 *
 * Čistá funkce schválně — tohle rozhodování bylo rozepsané v podmínkách uvnitř
 * `handleMessage`, kde ho nešlo otestovat, a dvakrát se v něm otevřela tatáž
 * díra: vlastní zprávy majitele obcházely whitelist a do provozní aplikace se
 * nahrála i jeho soukromá pošta. Jednou to zavřela migrace, podruhé se to
 * vrátilo. Tady na to jdou napsat testy.
 *
 * DVĚ PRAVIDLA, KTERÁ SE NESMÍ ZTRATIT:
 *
 *  1. VLASTNÍ ZPRÁVA (from_me) NENÍ VÝJIMKA. Objednávka napsaná z majitelova
 *     telefonu do objednávkové skupiny projde proto, že ta skupina je ve
 *     whitelistu — ne proto, že ji psal majitel. Výjimka by nepustila dál nic
 *     navíc, co má projít, jen všechno ostatní.
 *  2. SOUKROMÁ ZPRÁVA SE NESPOLÉHÁ NA PRÁZDNÝ WHITELIST. „Prázdný seznam =
 *     povoleno vše" je zpětná kompatibilita kvůli skupinám; u konverzace
 *     jednoho s jedním by to znamenalo sypat do appky osobní poštu, dokud si
 *     někdo nevzpomene whitelist vyplnit. Nevyplněný whitelist je
 *     nedopatření, ne pokyn ke čtení všeho.
 *
 * @returns {{ pustit: boolean, duvod: string }} `duvod` jde do logu.
 */
export function smiProjit(gate, zprava) {
  // `isOwn` (from_me) se tu SCHVÁLNĚ PŘIJÍMÁ A IGNORUJE. Kdyby ho funkce
  // nebrala vůbec, nedalo by se testem doložit, že na rozhodnutí nemá vliv —
  // a nic by nezabránilo tomu, aby si výjimku někdo příště napsal u volajícího
  // (přesně tak vznikl ten únik). Takhle na to existuje test, který spadne.
  const { isGroup, groupName = '', chatId = '', senderName = '', senderNumber = '' } = zprava || {};

  if (isGroup) {
    if (!gate.isGroupAllowed(groupName, chatId)) {
      return { pustit: false, duvod: `skupina „${groupName}“ (${chatId}) není povolená` };
    }
    return { pustit: true, duvod: 'skupina je ve whitelistu' };
  }

  if (gate.isEmpty) {
    return { pustit: false, duvod: `soukromá zpráva od „${senderName}“ a prázdný whitelist` };
  }
  if (!gate.isContactAllowed(senderName, senderNumber)) {
    return { pustit: false, duvod: `kontakt „${senderName}“ (${senderNumber}) není povolený` };
  }
  return { pustit: true, duvod: 'kontakt je ve whitelistu' };
}

/**
 * Vytvoří bránu napojenou na Supabase: při startu načte `whatsapp_senders`
 * a sjednotí ji s env whitelisty. `load()` lze volat opakovaně (refresh) — změny
 * provedené v aplikaci se projeví do ~5 minut bez restartu služby.
 */
export function createMessageGate({
  supabase,
  allowedGroups = [],
  allowedContacts = [],
  logger,
  refreshMs = 5 * 60 * 1000,
}) {
  let gate = buildGate({ allowedGroups, allowedContacts });
  let timer = null;

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_senders')
        .select('sender_name, chat_id');
      if (error) throw error;
      gate = buildGate({ allowedGroups, allowedContacts, senders: data || [] });
      logger?.info(
        `[gate] whitelist načten z whatsapp_senders: ${gate.allowedNames.size} názvů, ${gate.allowedChatIds.size} chat_id` +
          (gate.isEmpty ? ' (prázdný = povoleno vše)' : '')
      );
    } catch (e) {
      logger?.warn(
        `[gate] nelze načíst whatsapp_senders (${e?.message}) — používám lokální whitelist (env)`
      );
    }
  };

  const startRefresh = () => {
    if (timer) return;
    timer = setInterval(load, refreshMs);
    if (timer.unref) timer.unref(); // nebrání ukončení procesu
  };

  const stopRefresh = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    getGate: () => gate,
    isGroupAllowed: (groupName, chatId) => gate.isGroupAllowed(groupName, chatId),
    isContactAllowed: (senderName, senderNumber) => gate.isContactAllowed(senderName, senderNumber),
    load,
    startRefresh,
    stopRefresh
  };
}
