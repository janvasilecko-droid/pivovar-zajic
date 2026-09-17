import { businessDateISO } from './businessDate';

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
  // OPRAVA 16. 9. 2026: „dnes" bývalo `new Date()` s vynulovaným ČASEM
  // (lokální půlnoc), zatímco `dateStr` se parsoval jako UTC půlnoc — v ČR
  // (UTC+1/+2) to obě strany posouvalo o hodinu až dvě, a `Math.ceil`
  // z toho udělal systematickou chybu o den (dokument platný „do dneška"
  // hlásil ještě 1 den navíc, dokument prošlý včera hlásil 0 dní místo
  // EXPIROVALO). Obě strany se teď parsují stejně — jako UTC půlnoc kalendářního
  // dne — přesně jako `rozdilDni` v sudyVenku.ts.
  const today = new Date(businessDateISO() + 'T00:00:00Z');
  const target = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  const diffTime = target.getTime() - today.getTime();
  const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const fmtDate = new Date(dateStr).toLocaleDateString('cs-CZ');

  if (daysLeft < 0) {
    return { daysLeft, status: 'expired', label: `EXPIROVALO před ${Math.abs(daysLeft)} dny (${fmtDate})` };
  } else if (daysLeft <= 30) {
    return { daysLeft, status: 'warning', label: `Vyprší za ${daysLeft} dní (${fmtDate})` };
  } else {
    return { daysLeft, status: 'ok', label: `Platné do ${fmtDate}` };
  }
}
