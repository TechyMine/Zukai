DROP POLICY "Anyone can join the waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join the waitlist with a valid email" ON public.waitlist FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(email) BETWEEN 3 AND 255
  AND email = lower(btrim(email))
  AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (source IS NULL OR source IN ('modal', 'final-cta'))
  AND created_at > now() - interval '1 minute'
  AND created_at < now() + interval '1 minute'
);