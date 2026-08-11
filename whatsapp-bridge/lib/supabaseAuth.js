/**
 * Baileys auth state provider s perzistencí v Supabase.
 *
 * Bezplatný hosting (Render free) má dočasný souborový systém — přihlašovací
 * údaje Multi-Device session proto ukládáme do PostgreSQL (tabulka
 * `whatsapp_session`, migrace 20260820000000_add_whatsapp_session_table.sql).
 *
 * Rozhraní odpovídá `useMultiFileAuthState` z Baileys:
 *   { state: { creds, keys }, saveCreds }
 */
import { createClient } from '@supabase/supabase-js';
import { initAuthCreds, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

/**
 * JSON nemá nativní typ pro Buffer — JSON.stringify(Buffer) dá
 * { type: 'Buffer', data: [...] }. Tato funkce rekurzivně převede takové
 * objekty zpět na Buffer (Baileys klíče jsou Buffery).
 */
function reviveBuffers(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reviveBuffers);
  if (value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = reviveBuffers(v);
  return out;
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Nastav je jako environment variables (viz .env.example).'
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Vrátí Baileys auth state, který čte a zapisuje do tabulky `whatsapp_session`.
 * Volá se PŘED vytvořením socketu; `saveCreds` se napojí na událost
 * `creds.update`, ať se změny přihlašovacích klíčů průběžně ukládají.
 */
export async function useSupabaseAuthState({ logger } = {}) {
  const supabase = getSupabase();

  const read = async (key) => {
    const { data, error } = await supabase
      .from('whatsapp_session')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) throw new Error(`[session] read "${key}": ${error.message}`);
    return data ? reviveBuffers(data.value) : null;
  };

  const write = async (key, value) => {
    const { error } = await supabase
      .from('whatsapp_session')
      .upsert({ key, value }, { onConflict: 'key' });
    if (error) throw new Error(`[session] write "${key}": ${error.message}`);
  };

  // Pokud ještě nemáme žádnou relaci → vytvoří nové (nepárované) credentials,
  // Baileys pak vygeneruje QR kód.
  const creds = (await read('creds')) || initAuthCreds();

  const keys = makeCacheableSignalKeyStore(
    {
      get: async (type, ids) => {
        const out = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await read(`${type}-${id}`);
            if (value !== null) out[id] = value;
          })
        );
        return out;
      },
      set: async (data) => {
        const tasks = [];
        for (const type in data) {
          for (const id in data[type]) {
            const value = data[type][id];
            const key = `${type}-${id}`;
            if (value) {
              tasks.push(write(key, value));
            } else {
              tasks.push(supabase.from('whatsapp_session').delete().eq('key', key));
            }
          }
        }
        await Promise.all(tasks);
      },
    },
    logger || undefined
  );

  return {
    state: { creds, keys },
    saveCreds: () => write('creds', creds),
  };
}

/**
 * Smaže celou session z `whatsapp_session` — používá se po odhlášení zařízení
 * (loggedOut), aby se automaticky vygeneroval nový QR bez ručního mazání v DB.
 */
export async function clearSession(supabase, logger) {
  const { error } = await supabase.from('whatsapp_session').delete().neq('key', '');
  if (error) throw new Error(`[session] clear: ${error.message}`);
  logger?.info('[session] whatsapp_session vyčištěna — připravuji nový QR');
}
