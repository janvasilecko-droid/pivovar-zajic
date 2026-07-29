// Verze aplikace — zvyšuje se při každé provedené úpravě, aby šlo v UI poznat,
// jestli je načtená nejnovější nasazená verze (řeší problémy s cachí prohlížeče/PWA).
export const APP_VERSION = '1.143';
export const APP_VERSION_DATE = '29.7.2026 19:15';

// Stručný přehled změn v aktuální verzi (zobrazuje se v admin sekci Nastavení)
export const APP_CHANGELOG: string[] = [
  '📱 Sledování verzí: admin vidí v menu "Verze aplikace" přehled, kdo má jakou verzi',
  '📱 Automatické hlášení verze: každý uživatel při startu a přihlášení zapíše svou verzi do DB',
  '📱 Nová tabulka user_app_versions v Supabase pro sledování verzí',
];
