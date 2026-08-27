import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('odškrtávání úkolů', () => {
  it('klepnutí na štítek nahlásí přepnutí na hotovo', () => {
    const zaznam: unknown[] = [];
    render(
      <UkolyObjednavky
        poznamka="ještě vyzvednout sudy"
        orderId="obj-1"
        hotove={new Set()}
        onPrepni={(id, klic, hotovo) => zaznam.push([id, klic, hotovo])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Vyzvednout prázdné sudy/ }));
    expect(zaznam).toEqual([['obj-1', 'sudy', true]]);
  });

  it('u hotového úkolu klepnutí odškrtnutí zruší', () => {
    const zaznam: unknown[] = [];
    render(
      <UkolyObjednavky
        poznamka="ještě vyzvednout sudy"
        orderId="obj-1"
        hotove={new Set(['obj-1:sudy'])}
        onPrepni={(id, klic, hotovo) => zaznam.push([id, klic, hotovo])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Vyzvednout prázdné sudy/ }));
    expect(zaznam).toEqual([['obj-1', 'sudy', false]]);
  });

  it('bez id objednávky se štítek nedá odškrtnout', () => {
    render(<UkolyObjednavky poznamka="ještě vyzvednout sudy" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hotový úkol zmizí ze souhrnu dne', () => {
    const { container } = render(
      <UkolyDne
        objednavky={[{ id: 'obj-1', note: 'vyzvednout sudy', place_name: 'Bar U Sadu' }]}
        hotove={new Set(['obj-1:sudy'])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
