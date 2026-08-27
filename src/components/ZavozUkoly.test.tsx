import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UkolyObjednavky, UkolyDne } from './ZavozUkoly';

describe('UkolyObjednavky', () => {
  it('ukáže štítek u objednávky, kde se mají vyzvednout sudy', () => {
    render(<UkolyObjednavky poznamka="ještě vyzvednout sudy" />);
    expect(screen.getByText('Vyzvednout prázdné sudy')).toBeInTheDocument();
  });

  it('u obyčejné poznámky nevykreslí nic', () => {
    const { container } = render(<UkolyObjednavky poznamka="zavoz v patek" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('bez poznámky nevykreslí nic', () => {
    const { container } = render(<UkolyObjednavky poznamka={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('UkolyDne', () => {
  it('shrne úkoly dne a řekne u koho', () => {
    render(
      <UkolyDne
        objednavky={[
          { note: 'ještě vyzvednout sudy', place_name: 'Bar U Sadu' },
          { note: 'podtácky', place_name: 'Hospoda Na Rohu' },
          { note: null, place_name: 'Prodejna' },
        ]}
      />,
    );
    expect(screen.getByText('Nezapomeňte k tomuhle dni')).toBeInTheDocument();
    expect(screen.getByText('Vyzvednout prázdné sudy')).toBeInTheDocument();
    expect(screen.getByText('— Bar U Sadu')).toBeInTheDocument();
    expect(screen.getByText('Naložit podtácky')).toBeInTheDocument();
  });

  it('když k dnu žádný úkol není, pruh se vůbec neukáže', () => {
    const { container } = render(
      <UkolyDne objednavky={[{ note: '2x50 12sv', place_name: 'Prodejna' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
