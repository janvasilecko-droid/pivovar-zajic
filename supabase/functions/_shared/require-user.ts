type ServiceClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message?: string } | null;
    }>;
  };
  from: (table: string) => any;
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type EdgeAuthOptions = {
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export type EdgeAuthResult =
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; response: Response };

function json(
  headers: Record<string, string>,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * Verify a real Supabase user access token (the public anon JWT is rejected),
 * require an approved e-mail and completed first-password change, then consume
 * a database-backed per-user rate limit.
 */
export async function requireApprovedUser(
  req: Request,
  admin: ServiceClient,
  corsHeaders: Record<string, string>,
  options: EdgeAuthOptions,
): Promise<EdgeAuthResult> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, response: json(corsHeaders, 401, { error: 'Přihlášení je povinné.' }) };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(match[1]);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    return { ok: false, response: json(corsHeaders, 401, { error: 'Neplatné nebo expirované přihlášení.' }) };
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  const { data: allowRow, error: allowError } = await admin
    .from('allowed_emails')
    .select('status')
    .ilike('email', normalizedEmail)
    .maybeSingle();
  if (allowError || allowRow?.status !== 'approved') {
    return { ok: false, response: json(corsHeaders, 403, { error: 'E-mail nemá schválený přístup.' }) };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('password_set')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || profile?.password_set !== true) {
    return {
      ok: false,
      response: json(corsHeaders, 403, { error: 'Nejdřív si nastavte vlastní heslo.' }),
    };
  }

  const { data: allowed, error: rateError } = await admin.rpc('consume_edge_rate_limit', {
    p_user_id: user.id,
    p_bucket: options.bucket,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (rateError) {
    return { ok: false, response: json(corsHeaders, 503, { error: 'Kontrola limitu není dostupná.' }) };
  }
  if (allowed !== true) {
    return {
      ok: false,
      response: json(corsHeaders, 429, { error: 'Příliš mnoho požadavků. Zkuste to později.' }),
    };
  }

  return { ok: true, user };
}

export async function readJsonWithLimit<T>(req: Request, maxBytes: number): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Požadavek je příliš velký (maximum ${maxBytes} B).`);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`Požadavek je příliš velký (maximum ${maxBytes} B).`);
  }
  return JSON.parse(text) as T;
}
