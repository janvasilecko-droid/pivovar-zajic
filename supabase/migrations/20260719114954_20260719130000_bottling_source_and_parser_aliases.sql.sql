/*
# Stáčení lahví: zdrojový objem + ztráty + poznámka; Parser aliases

1. bottling — nové sloupce
- `source_volume_l` (numeric, nullable) — kolik litrů z sudů bylo stočeno (zdroj)
- `note` už existuje (text) — poznámka k stáčení
Ztráty se počítají v aplikaci: loss = source_volume_l - (quantity * package.volume_l); loss% = loss / source_volume_l * 100

2. parser_aliases — nová tabulka pro učení se opravám
- Ukládá mapping: normalized text → beer_id (případně package_id)
- Když uživatel v ImportFromImage opraví přiřazení piva, uloží se alias
- Při dalším parsování se nejprve zkontrolují naučené aliasy
*/

ALTER TABLE public.bottling
  ADD COLUMN IF NOT EXISTS source_volume_l numeric;

-- Tabulka aliasů pro parser
CREATE TABLE IF NOT EXISTS parser_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_text text NOT NULL,
  beer_id uuid REFERENCES beers(id) ON DELETE SET NULL,
  package_id uuid REFERENCES packages(id) ON DELETE SET NULL,
  hit_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (alias_text)
);

ALTER TABLE parser_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_aliases" ON parser_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_aliases" ON parser_aliases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_aliases" ON parser_aliases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_aliases" ON parser_aliases FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_parser_aliases_text ON parser_aliases(alias_text);
