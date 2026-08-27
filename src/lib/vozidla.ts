/**
 * Platnost STK a dálniční známky.
 *
 * Bydlí to v knihovně, ne v obrazovce Katalogy: domovská stránka tenhle
 * výpočet potřebuje pro upozornění, a kdyby si ho brala z Katalogů, stáhla by
 * s ním při každém spuštění celou obrazovku Katalogů (~50 kB) — kvůli jedné
 * funkci na dvacet řádků.
 */
export function getVehicleExpiryStatus(dateStr: string | null | undefined): {
  daysLeft: number | null;
  status: 'ok' | 'warning' | 'expired' | 'none';
  label: string;
} {
  if (!dateStr) return { daysLeft: null, status: 'none', label: 'Nezadáno' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00Z');
  const diffTime = target.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const fmtDate = new Date(dateStr).toLocaleDateString('cs-CZ');

  if (daysLeft < 0) {
    return { daysLeft, status: 'expired', label: `🚨 EXPIROVALO před ${Math.abs(daysLeft)} dny (${fmtDate})` };
  } else if (daysLeft <= 30) {
    return { daysLeft, status: 'warning', label: `⚠️ Vyprší za ${daysLeft} dní (${fmtDate})` };
  } else {
    return { daysLeft, status: 'ok', label: `Platné do ${fmtDate}` };
  }
}
