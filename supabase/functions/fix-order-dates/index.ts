const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

/**
 * Retired one-off maintenance endpoint.
 *
 * The original implementation used the service role to rewrite every August
 * 2026 order date and could be invoked by anyone who knew the public URL. The
 * historical correction is complete, so keeping any mutation path here is
 * unnecessary and unsafe. Deploying this tombstone makes stale callers fail
 * visibly without touching data.
 */
Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: 'Tato jednorázová servisní funkce byla trvale vypnuta.',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
