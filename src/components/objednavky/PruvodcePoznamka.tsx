// 🧭 Průvodce objednávkou — poznámka k objednávce.
// ---------------------------------------------------------------------------
// Na jedné stránce leží pod souhrnem, v okně po krocích je ve kroku „kdy"
// hned za dnem a datem závozu (23. 11. 2026: „vyberu den závozu, datum,
// poznámku"). Stejné pole na obou místech, ať se chování nerozejde.
import type { KonceptObjednavky } from '../../lib/objednavkaPruvodce';
import type { ZmenaKonceptu } from './pruvodceTypy';

export function PruvodcePoznamka({ koncept, zmen }: { koncept: KonceptObjednavky; zmen: ZmenaKonceptu }) {
  return (
    <div>
      <label htmlFor="pruvodce-poznamka" className="label">Poznámka</label>
      <input
        id="pruvodce-poznamka"
        type="text"
        maxLength={500}
        autoComplete="off"
        className="input"
        value={koncept.poznamka}
        onChange={(e) => zmen((k) => ({ ...k, poznamka: e.target.value }))}
        placeholder="Nepovinné — třeba „vozí řidič Petr“"
      />
    </div>
  );
}
