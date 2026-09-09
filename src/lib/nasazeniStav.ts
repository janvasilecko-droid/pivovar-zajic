// 🚦 Poslední automatické nasazení — uspělo, nebo ne?
//
// Push do `main` teď appku sám sestaví, otestuje a nasadí (viz README,
// sekce „Nasazení"). Když se to nepovede, GitHub Actions sám založí issue
// — ale na to nikdo z telefonu nekouká. Appka tak dál běžela ve staré,
// naposledy úspěšně nasazené verzi, a nikdo se nedozvěděl, že se poslední
// pokus o nasazení nepovedl.
//
// Repozitář je veřejný, takže GitHub API pro čtení běhů workflow nepotřebuje
// žádný token — přímo z prohlížeče admina.

const OWNER = 'janvasilecko-droid';
const REPO = 'pivovar-zajic';
const WORKFLOW = 'deploy.yml';

export type BehNasazeni = {
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
};

export type VysledekNasazeni = 'v-poradku' | 'selhalo' | 'bezi' | 'neznamo';

/**
 * Vyhodnotí poslední běh. `cancelled`/`timed_out`/`action_required` se
 * berou jako „selhalo" — admina zajímá „šlo to na produkci, nebo ne",
 * ne přesný důvod (ten je v `html_url`).
 */
export function vyhodnotBeh(beh: BehNasazeni | null): VysledekNasazeni {
  if (!beh) return 'neznamo';
  if (beh.status !== 'completed') return 'bezi';
  return beh.conclusion === 'success' ? 'v-poradku' : 'selhalo';
}

/**
 * Stáhne poslední běh nasazovacího workflow. Vrací `null` při jakémkoli
 * problému (offline, GitHub nedostupný, limit dotazů) — tenhle údaj je
 * bonus k diagnostice, ne kritická cesta, takže selhání nesmí appku nijak
 * shodit ani vypsat poplašnou zprávu jen kvůli výpadku sítě.
 */
export async function nactiPosledniBehNasazeni(): Promise<BehNasazeni | null> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1&branch=main`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!r.ok) return null;
    const data = await r.json();
    const beh = data?.workflow_runs?.[0];
    if (!beh) return null;
    return {
      status: beh.status,
      conclusion: beh.conclusion,
      html_url: beh.html_url,
      created_at: beh.created_at,
    };
  } catch {
    return null;
  }
}
