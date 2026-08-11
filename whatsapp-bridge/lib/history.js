/**
 * Zpracování historie chatu (WhatsApp history sync) — Baileys event
 * `messaging-history.set`.
 *
 * WhatsApp po připojení (INITIAL_BOOTSTRAP / RECENT) pošle starší zprávy v dávkách.
 * Tento kolektor:
 *   • shromažďuje dávky do bufferu,
 *   • po zklidnění (quietMs bez nové dávky), při velkém objemu (flushAtLeast)
 *     nebo po maxWaitMs vybere NEJNOVĚJŠÍCH `cap` zpráv a přeposílá je sekvenčně
 *     s rozestupem (chrání webhook / auto-parse před přetížením),
 *   • zprávy jdou stejným pipeline jako živé (whitelist, fromMe bypass, dedup),
 *     takže cizí a nepovolené zprávy se stále vyfiltrují.
 *
 * Čistou funkci `pickRecent` lze testovat bez socketu.
 */

/** Baileys posílá `messageTimestamp` v sekundách → převod na ms. */
export function normTs(ts) {
  return typeof ts === 'number' ? ts * 1000 : Date.now();
}

/**
 * Vrátí nejnovějších `cap` zpráv seřazených od nejstarší po nejnovější
 * (chronologicky vzestupně — přeposílá se pak v původním pořadí).
 * Zprávy bez `key.id` (systémové) se vynechávají.
 */
export function pickRecent(messages, cap) {
  const limit = Math.max(0, Number(cap) || 0);
  const sorted = [...messages]
    .filter((m) => m && m.key && m.key.id)
    .sort((a, b) => normTs(a.messageTimestamp) - normTs(b.messageTimestamp));
  return sorted.slice(Math.max(0, sorted.length - limit));
}

export class HistoryCollector {
  /**
   * @param {object} opts
   * @param {(msg: object) => Promise<void>} opts.onMessage  zpracuje jednu zprávu
   * @param {number} [opts.cap]       kolik nejnovějších zpráv max. přeposlat (default 1000)
   * @param {number} [opts.quietMs]   jak dlouho čekat bez nové dávky před zpracováním (default 5000)
   * @param {number} [opts.maxWaitMs] horní pojistka čekání (default 60 000)
   * @param {number} [opts.flushAtLeastMultiplier] buffer naroste na cap × tento násobek → flush hned
   * @param {number} [opts.delayMs]   pauza mezi zprávami (default 150; v testech 0)
   * @param {object} [opts.logger]
   */
  constructor({
    onMessage,
    cap = 1000,
    quietMs = 5000,
    maxWaitMs = 60000,
    flushAtLeastMultiplier = 2,
    delayMs = 150,
    logger,
  } = {}) {
    if (typeof onMessage !== 'function') {
      throw new TypeError('onMessage musí být funkce');
    }
    this.onMessage = onMessage;
    this.cap = Number(cap) > 0 ? Number(cap) : 1000;
    this.quietMs = quietMs;
    this.maxWaitMs = maxWaitMs;
    this.flushAtLeast = this.cap * Math.max(1, flushAtLeastMultiplier);
    this.delayMs = Math.max(0, delayMs);
    this.logger = logger;
    this.all = [];
    this.timers = { quiet: null, max: null };
    this.processing = false;
  }

  /** Přidá dávku historie z `messaging-history.set`. */
  add({ messages = [], isLatest } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    this.all.push(...messages);
    this.logger?.info(
      `[history] dávka: ${messages.length} zpráv (buffer ${this.all.length}, isLatest=${isLatest})`
    );

    // Velký objem → nečekej na konec syncu, zpracuj hned (ostatní se doberou dál).
    if (this.all.length >= this.flushAtLeast && !this.processing) {
      this.flushNow();
      return;
    }

    // Jinak počkej na zklidnění (historie přichází v dávkách za sebou).
    this._resetQuietTimer();
    if (!this.timers.max) {
      this.timers.max = setTimeout(() => this.flushNow(), this.maxWaitMs);
      if (this.timers.max.unref) this.timers.max.unref();
    }
  }

  _resetQuietTimer() {
    if (this.timers.quiet) clearTimeout(this.timers.quiet);
    this.timers.quiet = setTimeout(() => this.flushNow(), this.quietMs);
    if (this.timers.quiet.unref) this.timers.quiet.unref();
  }

  /** Vyprázdní buffer: vybere nejnovějších `cap` zpráv a přeposílá sekvenčně. */
  async flushNow() {
    if (this.processing) return;
    this.processing = true;
    this._clearTimers();
    const all = this.all;
    this.all = [];
    try {
      const selected = pickRecent(all, this.cap);
      if (selected.length === 0) return;
      this.logger?.info(`[history] zpracovávám ${selected.length} nejnovějších zpráv historie…`);
      for (const msg of selected) {
        try {
          await this.onMessage(msg);
        } catch (e) {
          this.logger?.warn({ err: e }, '[history] chyba zpracování zprávy historie');
        }
        if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
      }
      this.logger?.info('[history] hotovo ✔');
    } finally {
      this.processing = false;
    }
  }

  _clearTimers() {
    for (const t of Object.values(this.timers)) {
      if (t) clearTimeout(t);
    }
    this.timers = { quiet: null, max: null };
  }
}
