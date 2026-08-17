// Domovská obrazovka appky — dlaždicový launcher přes celou plochu, výchozí
// stránka po přihlášení. Samotný obsah Skladu (a všech ostatních sekcí)
// zůstává beze změny, jen se do něj chodí přes tuhle obrazovku.
import type { Page } from '../components/Layout';
import { AppLauncher } from '../components/AppLauncher';

export default function HomeScreen({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="h-full">
      <AppLauncher setPage={setPage} />
    </div>
  );
}
