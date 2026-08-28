import { useEffect, useState } from 'react';
import { getAllUserVersions } from '../lib/appVersionTracker';
import { useAuth } from '../lib/auth';
import { Smartphone, RefreshCw, Clock, User } from 'lucide-react';

type UserVersion = {
  user_id: string;
  display_name: string | null;
  version: string;
  device_info: string | null;
  last_seen_at: string;
};

export default function AppVersionsScreen() {
  const { profile } = useAuth();
  const [versions, setVersions] = useState<UserVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllUserVersions();
      setVersions(data);
    } catch (err: any) {
      setError(err?.message || 'Chyba při načítání verzí');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Only admin can see this
  if (profile?.role !== 'admin') {
    return (
      <div className="p-6 text-center text-neutral-500">
        <p>Pouze pro administrátory.</p>
      </div>
    );
  }

  // Statistiky
  const totalUsers = versions.length;
  const uniqueVersions = [...new Set(versions.map(v => v.version))];
  const versionCounts = uniqueVersions.map(ver => ({
    version: ver,
    count: versions.filter(v => v.version === ver).length,
  }));

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('cs-CZ', {
        day: 'numeric', month: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Verze aplikace
        </h1>
        <button
          onClick={load}
          disabled={loading}
          className="btn btn-sm btn-ghost"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Obnovit
        </button>
      </div>

      {/* Přehled */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded p-4 shadow-sm border border-neutral-200">
          <div className="text-2xl font-bold text-primary-600">{totalUsers}</div>
          <div className="text-xs text-neutral-500">Uživatelů</div>
        </div>
        <div className="bg-white rounded p-4 shadow-sm border border-neutral-200">
          <div className="text-2xl font-bold text-primary-600">{uniqueVersions.length}</div>
          <div className="text-xs text-neutral-500">Různých verzí</div>
        </div>
        <div className="bg-white rounded p-4 shadow-sm border border-neutral-200 col-span-2 sm:col-span-1">
          <div className="text-lg font-bold text-primary-600">
            {versionCounts.sort((a, b) => b.count - a.count).slice(0, 3).map(v => (
              <span key={v.version} className="block text-sm">
                v{v.version}: <strong>{v.count}</strong> už.
              </span>
            ))}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Nejčastější verze</div>
        </div>
      </div>

      {/* Chyba */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded p-4 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center text-neutral-400 py-8">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Načítám...
        </div>
      )}

      {/* Seznam uživatelů */}
      {!loading && !error && versions.length === 0 && (
        <div className="text-center text-neutral-400 py-8">
          <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Zatím žádná data. Až se uživatelé přihlásí, uvidíš zde jejich verze.</p>
        </div>
      )}

      {!loading && versions.length > 0 && (
        <div className="space-y-2">
          {versions.map((v) => (
            <div
              key={v.user_id}
              className="bg-white rounded p-4 shadow-sm border border-neutral-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="font-semibold truncate">{v.display_name || 'Neznámý'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                  <Smartphone className="w-3 h-3 shrink-0" />
                  <span className="truncate">{v.device_info || 'Neznámé zařízení'}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                  v{v.version}
                </span>
                <span className="flex items-center gap-1 text-xs text-neutral-400">
                  <Clock className="w-3 h-3" />
                  {formatDate(v.last_seen_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
