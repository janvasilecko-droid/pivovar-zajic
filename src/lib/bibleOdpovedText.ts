// 📋 Odpověď AI sládka jako prostý text — tlačítka Kopírovat a Sdílet
// v AI sládkovi (poslat kolegovi, vložit do protokolu várky). Bez Markdownu
// (tučné písmo a nadpisy by v SMS, WhatsAppu i e-mailu byly hvězdičky
// a mřížky); citace [n] zůstanou a dole je seznam zdrojů — kniha se stranou
// a odkazem do čtečky appky (otevře ho jen člověk s přístupem do bible),
// web s adresou.
import type { ZdrojOdpovedi, ZpravaChatu } from './bibleChatApi';
import { odkazAplikace } from './odkazAplikace';

const misto = (z: ZdrojOdpovedi) => (z.tistena ? `s. ${z.tistena}` : `list ${z.pdfIndex}`);

/** Odkaz na stránku knihy ve čtečce appky. */
export function odkazNaStranuKnihy(dokumentId: string, list: number, zaklad: string = odkazAplikace()): string {
  return `${zaklad}?page=bible&sub=kniha:${dokumentId}:${list}`;
}

/** Text odpovědi bez značek Markdownu (tučné, nadpisy). */
function prostyText(text: string): string {
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function radekZdroje(z: ZdrojOdpovedi, zaklad: string): string {
  if (z.zdroj === 'web') return `[${z.n}] ${z.nazev} (web, neověřený zdroj)${z.url ? ` — ${z.url}` : ''}`;
  const odkaz = z.dokumentId && z.pdfIndex ? ` — ${odkazNaStranuKnihy(z.dokumentId, z.pdfIndex, zaklad)}` : '';
  return `[${z.n}] ${z.nazev}, ${misto(z)}${z.kapitola ? ` · ${z.kapitola}` : ''}${z.zdroj === 'preklad' ? ' (český překlad)' : ''}${odkaz}`;
}

/** Otázka, odpověď a zdroje jako text ke zkopírování nebo sdílení. */
export function textOdpovedi(
  odpoved: Pick<ZpravaChatu, 'text' | 'citace'>,
  otazka?: string | null,
  zaklad: string = odkazAplikace(),
): string {
  const casti: string[] = [];
  if (otazka?.trim()) casti.push(`Otázka: ${otazka.trim()}`);
  casti.push(prostyText(odpoved.text));
  if (odpoved.citace.length > 0) {
    casti.push(['Zdroje:', ...[...odpoved.citace].sort((a, b) => a.n - b.n).map((z) => radekZdroje(z, zaklad))].join('\n'));
  }
  casti.push('— AI sládek, Pivovar Zajíc');
  return casti.join('\n\n');
}
