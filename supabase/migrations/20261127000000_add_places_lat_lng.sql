-- Add lat/lng columns to places (odběratelé/hospody).
-- Created: 2026-11-27
-- Reason: Kniha jízd potřebuje reálné jízdní vzdálenosti mezi pivovarem a
--         jednotlivými odběrateli pro daný den rozvozu, aby se km nemusely
--         zapisovat ručně z tachometru. Souřadnice se doplní automaticky
--         při vyhledání adresy (🔍 Načíst adresu, Nominatim/OSM) a použijí
--         se pro výpočet trasy přes veřejné OSRM routovací API.

ALTER TABLE places ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE places ADD COLUMN IF NOT EXISTS lng numeric;
