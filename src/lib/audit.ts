import { getAdminEmail, getAdminName } from './config';

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  user_email: string;
  user_name: string;
  module: string;
  action: string;
  details: string;
};

const AUDIT_STORAGE_KEY = 'pivovar_audit_trail_v1';

export function getAuditLogs(): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return getDefaultSeedLogs();
    return JSON.parse(raw);
  } catch {
    return getDefaultSeedLogs();
  }
}

export function logAuditEvent(userEmail: string, userName: string, module: string, action: string, details: string) {
  const logs = getAuditLogs();
  const newEntry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    user_email: userEmail || getAdminEmail(),
    user_name: userName || getAdminName(),
    module,
    action,
    details,
  };
  const updated = [newEntry, ...logs].slice(0, 200); // keep max 200 logs
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
}

function getDefaultSeedLogs(): AuditLogEntry[] {
  return [
    {
      id: 'seed_1',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      user_email: getAdminEmail(),
      user_name: getAdminName() + ' (Admin)',
      module: 'Uživatelé a Práva',
      action: 'Úprava přístupových práv',
      details: 'Změněna oprávnění pro uživatele (Sládek - Varna & Sklep)',
    },
    {
      id: 'seed_2',
      timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
      user_email: getAdminEmail(),
      user_name: getAdminName() + ' (Admin)',
      module: 'Stáčení KEG',
      action: 'Zápis stočených sudů',
      details: 'Stočen tank CCT 3: 20x KEG 50L (Světlý ležák 11°)',
    },
    {
      id: 'seed_3',
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      user_email: getAdminEmail(),
      user_name: getAdminName() + ' (Admin)',
      module: 'Sanitační řád HACCP',
      action: 'Provedení sanitace CIP',
      details: 'Sanitace CCT 1 (2% NaOH 80°C + Persteril 0.5%) - Schváleno',
    },
  ];
}
