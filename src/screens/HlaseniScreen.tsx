// 📢 Hlášení — vyhlášení zprávy, kterou musí každý odklepnout.
// ---------------------------------------------------------------------------
// Do teď se k tomu chodilo tlačítkem „Spravovat Hlášení" schovaným v rohu
// Skladu. S hlášením přitom Sklad nemá nic společného a kdo ho hledal, musel
// vědět, že je zrovna tam (majitel: „přejmenuj na Hlášení a dej to jako
// samostatnou dlaždici").
//
// Obrazovka jen obaluje AnnouncementManagerModal, aby existovala JEDNA
// implementace: tlačítko ve Skladu zůstává (odtud se to léta dělalo) a
// otevírá tentýž obsah.
import { AnnouncementManagerModal } from '../components/AnnouncementManagerModal';
import type { Page } from '../components/Layout';

export default function HlaseniScreen({ setPage }: { setPage?: (p: Page) => void } = {}) {
  // Zavření na samostatné obrazovce znamená „odejít", ne „schovat okno" —
  // vrací se na plochu, odkud se sem klepá z dlaždice.
  return <AnnouncementManagerModal onClose={() => setPage?.('home')} />;
}
