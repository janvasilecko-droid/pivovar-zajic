import { useState } from 'react';
import { getAuditLogs, AuditLogEntry } from '../lib/audit';
import { Clock, History, Scroll, Search, Shield, User } from 'lucide-react';

export function AuditLogViewer() {
  const [logs] = useState<AuditLogEntry[]>(() => getAuditLogs());
  const [query, setQuery] = useState('');

  const filtered = logs.filter(
    (l) =>
      l.user_email.toLowerCase().includes(query.toLowerCase()) ||
      l.module.toLowerCase().includes(query.toLowerCase()) ||
      l.action.toLowerCase().includes(query.toLowerCase()) ||
      l.details.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
            <Scroll className="ikona-text" />
          </div>
          <div>
            <h3 className="font-display font-black text-xl text-amber-400">
              Auditní stopa & Bezpečnostní log (History Log)
            </h3>
            <p className="text-xs text-neutral-300 font-medium">
              Chronoměřený záznam všech důležitých úprav v databázi, změně zásob, nastavení uživatelů a sanitacích.
            </p>
          </div>
        </div>

        <div className="relative pt-1">
          <Search className="absolute left-3.5 top-4 text-neutral-400" size={18} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 rounded bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-400 text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            placeholder="Hledat v logu podle uživatele, modulu nebo provedené akce…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((log) => (
          <div key={log.id} className="p-4 rounded bg-white border border-neutral-200 shadow-2xs flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-950 font-black text-[11px] border border-amber-200">
                  {log.module}
                </span>
                <span className="font-display font-black text-xs text-neutral-900">{log.action}</span>
              </div>
              <p className="text-xs text-neutral-600 font-medium">{log.details}</p>
            </div>

            <div className="text-right shrink-0 text-[11px] text-neutral-400 font-mono space-y-0.5">
              <div><User className="ikona-text" /> {log.user_name}</div>
              <div>{new Date(log.timestamp).toLocaleString('cs-CZ')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
