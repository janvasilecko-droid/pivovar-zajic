/*
# Enable realtime for fasovani_private

Adds fasovani_private to the publication used by Supabase Realtime.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.fasovani_private;