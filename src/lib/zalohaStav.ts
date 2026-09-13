// 🛟 Doběhla noční záloha?
//
// Denní šifrovaná záloha (.github/workflows/zaloha.yml) běží v GitHubu, kam
// z telefonu nikdo nekouká. Když selže — chybí heslo, Supabase je dole —
// GitHub sice založí issue, ale appka o tom nevěděla nic a záloha mohla
// týdny tiše stát. Tohle se podívá na poslední běhy workflow.
//
// Repozitář je veřejný, API pro čtení běhů tedy nepotřebuje klíč (stejně jako
// lib/nasazeniStav.ts). Výpadek sítě nebo limit dotazů = „nevím", nikdy poplach.
import { GITHUB_OWNER, GITHUB_REPO } from './nasazeniStav';

/** Po kolika hodinách bez úspěšné zálohy se hlásí „stará" (denní běh + rezerva). */
export const ZALOHA_STARA_PO_HODINACH = 50;

export type BehZalohy = {
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
};

export type StavZalohy =
  | { stav: 'ok'; posledni: string }
  | { stav: 'selhala'; kdy: string; url: string }
  | { stav: 'stara'; posledni: string | null; url: string | null }
  | { stav: 'neznamo' };

/**
 * @param behy poslední běhy workflow, nejnovější první (jak je vrací GitHub)
 */
export function vyhodnotZalohu(behy: BehZalohy[] | null, ted: Date): StavZalohy {
  if (!behy) return { stav: 'neznamo' };
  const dokoncene = behy.filter((b) => b.status === 'completed');
  if (dokoncene.length === 0) return behy.length ? { stav: 'neznamo' } : { stav: 'stara', posledni: null, url: null };

  const posledni = dokoncene[0];
  if (posledni.conclusion !== 'success' && posledni.conclusion !== 'skipped') {
    return { stav: 'selhala', kdy: posledni.created_at, url: posledni.html_url };
  }
  const uspesna = dokoncene.find((b) => b.conclusion === 'success');
  if (!uspesna) return { stav: 'stara', posledni: null, url: posledni.html_url };
  const hodin = (ted.getTime() - Date.parse(uspesna.created_at)) / 3_600_000;
  if (!Number.isFinite(hodin)) return { stav: 'neznamo' };
  return hodin > ZALOHA_STARA_PO_HODINACH
    ? { stav: 'stara', posledni: uspesna.created_at, url: uspesna.html_url }
    : { stav: 'ok', posledni: uspesna.created_at };
}

export async function nactiBehyZalohy(): Promise<BehZalohy[] | null> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/zaloha.yml/runs?per_page=5&branch=main`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!r.ok) return null;
    const data = await r.json();
    return ((data?.workflow_runs ?? []) as BehZalohy[]).map((b) => ({
      status: b.status, conclusion: b.conclusion, html_url: b.html_url, created_at: b.created_at,
    }));
  } catch {
    return null;
  }
}
