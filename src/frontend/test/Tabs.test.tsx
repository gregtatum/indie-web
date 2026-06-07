import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { act, useState } from 'react';
import { Tabs } from 'frontend/components/Tabs';

const TABS = [
  { id: 'details', label: 'Details', panel: <div>Details panel</div> },
  { id: 'artwork', label: 'Artwork', panel: <div>Artwork panel</div> },
  { id: 'id3', label: 'ID3', panel: <div>ID3 panel</div> },
];

const TABS_WITH_DISABLED_ID3 = [
  { id: 'details', label: 'Details', panel: <div>Details panel</div> },
  { id: 'artwork', label: 'Artwork', panel: <div>Artwork panel</div> },
  {
    id: 'id3',
    label: 'ID3',
    disabled: true,
    panel: <div>ID3 panel</div>,
  },
];

function ControlledTabs({ initial = 'details' }: { initial?: string }) {
  const [activeTab, setActiveTab] = useState(initial);
  return <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />;
}

function ControlledTabsWithDisabledId3({
  initial = 'details',
}: {
  initial?: string;
}) {
  const [activeTab, setActiveTab] = useState(initial);
  return (
    <Tabs
      tabs={TABS_WITH_DISABLED_ID3}
      activeTab={activeTab}
      onChange={setActiveTab}
    />
  );
}

/**
 * These tests mount Tabs in isolation rather than through a full app route. That's
 * appropriate here because Tabs is a self-contained, reusable component with no
 * store or router dependencies — testing it directly keeps setup minimal and keeps
 * coverage focused on the component's own contract.
 */
describe('Tabs', () => {
  it('renders all tab buttons', () => {
    render(<ControlledTabs />);
    expect(screen.getByRole('tab', { name: 'Details' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Artwork' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'ID3' })).toBeTruthy();
  });

  it('marks only the active tab as selected', () => {
    render(<ControlledTabs initial="artwork" />);
    expect(
      screen
        .getByRole('tab', { name: 'Artwork' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('false');
    expect(
      screen.getByRole('tab', { name: 'ID3' }).getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('only the active tab is in the tab order', () => {
    render(<ControlledTabs initial="artwork" />);
    expect(
      screen.getByRole('tab', { name: 'Artwork' }).getAttribute('tabIndex'),
    ).toBe('0');
    expect(
      screen.getByRole('tab', { name: 'Details' }).getAttribute('tabIndex'),
    ).toBe('-1');
    expect(
      screen.getByRole('tab', { name: 'ID3' }).getAttribute('tabIndex'),
    ).toBe('-1');
  });

  it('clicking a tab makes it active', () => {
    render(<ControlledTabs />);
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'ID3' }));
    });
    expect(
      screen.getByRole('tab', { name: 'ID3' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('ArrowRight moves to the next tab', () => {
    render(<ControlledTabs initial="details" />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    });
    expect(
      screen
        .getByRole('tab', { name: 'Artwork' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowLeft moves to the previous tab', () => {
    render(<ControlledTabs initial="artwork" />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    });
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowRight wraps from the last tab to the first', () => {
    render(<ControlledTabs initial="id3" />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    });
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowLeft wraps from the first tab to the last', () => {
    render(<ControlledTabs initial="details" />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    });
    expect(
      screen.getByRole('tab', { name: 'ID3' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('renders the active panel content', () => {
    render(<ControlledTabs initial="artwork" />);
    expect(screen.getByText('Artwork panel')).toBeTruthy();
  });

  it('does not activate a disabled tab when clicked', () => {
    render(<ControlledTabsWithDisabledId3 />);
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'ID3' }));
    });
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.getByRole('tab', { name: 'ID3' }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('skips disabled tabs during keyboard navigation', () => {
    render(<ControlledTabsWithDisabledId3 initial="artwork" />);
    act(() => {
      fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    });
    expect(
      screen
        .getByRole('tab', { name: 'Details' })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });
});
