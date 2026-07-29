/*
# Enable realtime on all brewery tables

Adds every data table to the supabase_realtime publication so that
postgres_changes events fire for authenticated clients. This lets
all open apps/devices refresh automatically when anyone edits data.
*/

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'beers','packages','places','orders','order_items',
    'bottling','kegging','fasovani','writeoffs','inventory',
    'kegging_tanks','parser_aliases','akce','akce_items',
    'calendar_events','audit_log'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I;', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;
