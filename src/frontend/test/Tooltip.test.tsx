import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { InfoLink } from 'frontend/components/InfoLink';

function renderTooltip() {
  const title = 'Learn more about this setting';
  render(<InfoLink href="/docs/example.html" title={title} />);
  return {
    link: screen.getByRole('link', { name: 'Info link' }),
    title,
  };
}

afterEach(() => {
  // The component only sets this default if it's undefined, so leaving a prior
  // test's override in place would leak into whichever test runs next.
  delete (window as any).gDisableAutoHide;
});

describe('Tooltip', () => {
  it('is not shown by default', () => {
    renderTooltip();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the tooltip text on hover', () => {
    const { link, title } = renderTooltip();
    fireEvent.mouseOver(link);
    expect(screen.getByRole('tooltip').textContent).toBe(title);
  });

  it('hides the tooltip when the pointer leaves', () => {
    const { link } = renderTooltip();
    fireEvent.mouseOver(link);
    screen.getByRole('tooltip');
    fireEvent.mouseOut(link);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the tooltip text on focus', () => {
    const { link, title } = renderTooltip();
    fireEvent.focus(link);
    expect(screen.getByRole('tooltip').textContent).toBe(title);
  });

  it('hides the tooltip on blur', () => {
    const { link } = renderTooltip();
    fireEvent.focus(link);
    screen.getByRole('tooltip');
    fireEvent.blur(link);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('stays open through mouseOut/blur while gDisableAutoHide is set', () => {
    const { link } = renderTooltip();
    window.gDisableAutoHide = true;
    fireEvent.mouseOver(link);
    fireEvent.mouseOut(link);
    fireEvent.blur(link);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('renders the bubble into the overlay portal, not inside the link', () => {
    const { link } = renderTooltip();
    fireEvent.mouseOver(link);
    const bubble = screen.getByRole('tooltip');
    const overlayContainer = document.querySelector('#overlayContainer');
    expect(overlayContainer?.contains(bubble)).toBe(true);
    expect(link.contains(bubble)).toBe(false);
  });
});
