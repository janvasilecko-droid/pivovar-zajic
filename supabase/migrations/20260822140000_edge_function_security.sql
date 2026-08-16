-- Server-side rate limiting and execution hardening for Edge Functions.

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  user_id uuid NOT NULL,
  bucket text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edge_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resulting_count integer;
BEGIN
  IF p_user_id IS NULL OR btrim(COALESCE(p_bucket, '')) = '' THEN
    RETURN false;
  END IF;
  IF p_limit < 1 OR p_limit > 10000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate-limit configuration';
  END IF;

  INSERT INTO public.edge_rate_limits AS limits (
    user_id,
    bucket,
    window_started_at,
    request_count
  ) VALUES (
    p_user_id,
    p_bucket,
    clock_timestamp(),
    1
  )
  ON CONFLICT (user_id, bucket) DO UPDATE
  SET window_started_at = CASE
        WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          THEN clock_timestamp()
        ELSE limits.window_started_at
      END,
      request_count = CASE
        WHEN limits.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
          THEN 1
        ELSE limits.request_count + 1
      END
  RETURNING request_count INTO resulting_count;

  RETURN resulting_count <= p_limit;
END
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(uuid, text, integer, integer)
  TO service_role;

-- Reserve pending WhatsApp messages for exactly one worker. The row locks are
-- held for the update and SKIP LOCKED lets concurrent workers take other rows.
CREATE OR REPLACE FUNCTION public.claim_pending_whatsapp_messages(p_limit integer DEFAULT 10)
RETURNS SETOF public.whatsapp_incoming
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.whatsapp_incoming
    WHERE status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  )
  UPDATE public.whatsapp_incoming AS message
  SET status = 'processing'
  FROM candidates
  WHERE message.id = candidates.id
  RETURNING message.*;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_whatsapp_messages(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_whatsapp_messages(integer)
  TO service_role;

-- SECURITY DEFINER maintenance routines are never browser-callable.
ALTER FUNCTION public.close_all_open_tanks() SET search_path = public;
REVOKE ALL ON FUNCTION public.close_all_open_tanks()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_all_open_tanks()
  TO service_role;
