// 🔌 Konektor Pivovarské bible do aplikace Claude — schválení a správa připojení.
// ---------------------------------------------------------------------------
// Majitel 3. 11. 2026 zvolil „obě" (přehledy + konektor). Claude v aplikaci
// majitele si přes bible-mcp hledá v knihách a odpovídá s odkazy. Tady je jen
// to, co dělá appka: „Povolit" (OAuth kód přes bible-api) a seznam připojení
// s tlačítkem Odpojit. Žádné tokeny se do appky nedostanou.
import { volejBibli } from './bibleKlient';

/** Adresa konektoru, kterou majitel vloží do aplikace Claude. */
export const ADRESA_KONEKTORU = 'https://cegrelgvkygcatupqwrx.supabase.co/functions/v1/bible-mcp';
/** Kam smí Claude nechat poslat odpověď (stejné jako na serveru, _shared/mcp.ts). */
export const NAVRATY_CLAUDE: readonly string[] = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

export type ZadostClaude = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  responseType: string;
};

/** Parametry OAuth z adresy /claude-pripojeni?…; null, když chybí nebo nejsou od Claude. */
export function zadostZAdresy(search: string): ZadostClaude | null {
  const p = new URLSearchParams(search);
  const z: ZadostClaude = {
    clientId: p.get('client_id') ?? '',
    redirectUri: p.get('redirect_uri') ?? '',
    codeChallenge: p.get('code_challenge') ?? '',
    codeChallengeMethod: p.get('code_challenge_method') ?? '',
    state: p.get('state') ?? '',
    responseType: p.get('response_type') ?? '',
  };
  if (!z.clientId || !NAVRATY_CLAUDE.includes(z.redirectUri) || z.responseType !== 'code') return null;
  return z;
}

/** Adresa pro „Zamítnout" (jen na adresu Claude — jinam se nepřesměruje nikdy). */
export function adresaZamitnuti(z: ZadostClaude): string {
  const u = new URL(z.redirectUri);
  u.searchParams.set('error', 'access_denied');
  if (z.state) u.searchParams.set('state', z.state);
  return u.toString();
}

export async function povolitClaude(z: ZadostClaude): Promise<{ ok: true; presmerovat: string } | { ok: false; zprava: string }> {
  const r = await volejBibli<{ presmerovat?: unknown }>('bible-api', {
    akce: 'mcp_povolit', client_id: z.clientId, redirect_uri: z.redirectUri, code_challenge: z.codeChallenge,
    code_challenge_method: z.codeChallengeMethod, state: z.state,
  });
  if (!r.ok) return { ok: false, zprava: r.chyba.zprava };
  const cil = typeof r.data?.presmerovat === 'string' ? r.data.presmerovat : '';
  // Pojistka: přesměrovat jen zpátky do aplikace Claude.
  if (!NAVRATY_CLAUDE.some((n) => cil.startsWith(`${n}?`))) return { ok: false, zprava: 'Server vrátil nečekanou adresu.' };
  return { ok: true, presmerovat: cil };
}

export type PripojeniClaude = { pripojeni: string; klient: string | null; od: string | null; naposled: string | null };

export async function nactiPripojeni(): Promise<{ ok: true; pripojeni: PripojeniClaude[]; migrace: boolean } | { ok: false; zprava: string }> {
  const r = await volejBibli<{ pripojeni?: unknown; migrace?: unknown }>('bible-api', { akce: 'mcp_pripojeni' });
  if (!r.ok) return { ok: false, zprava: r.chyba.zprava };
  const seznam: PripojeniClaude[] = [];
  for (const v of Array.isArray(r.data?.pripojeni) ? r.data.pripojeni : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    if (typeof o.pripojeni !== 'string') continue;
    seznam.push({
      pripojeni: o.pripojeni, klient: typeof o.klient === 'string' ? o.klient : null,
      od: typeof o.od === 'string' ? o.od : null, naposled: typeof o.naposled === 'string' ? o.naposled : null,
    });
  }
  return { ok: true, pripojeni: seznam, migrace: r.data?.migrace !== false };
}

export async function odpojitClaude(pripojeni: string | null): Promise<{ ok: true } | { ok: false; zprava: string }> {
  const r = await volejBibli('bible-api', { akce: 'mcp_odpojit', pripojeni });
  return r.ok ? { ok: true } : { ok: false, zprava: r.chyba.zprava };
}
