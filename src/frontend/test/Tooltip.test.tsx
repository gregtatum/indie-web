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

/**
 * Renders InfoLink inside an overflow:auto panel, so the flip tests below can
 * distinguish "room within the page" from "room within the anchor's scroll panel".
 */
function renderTooltipInPanel() {
  render(
    <div data-testid="panel" style={{ overflowY: 'auto' }}>
      <InfoLink
        href="/docs/example.html"
        title="Learn more about this setting"
      />
    </div>,
  );
  return {
    panel: screen.getByTestId('panel'),
    link: screen.getByRole('link', { name: 'Info link' }),
  };
}

function makeDOMRect(overrides: Partial<DOMRect>): DOMRect {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    ...overrides,
  };
  return { ...rect, toJSON: () => rect };
}

/**
 * jsdom performs no real layout. This helper stubs getBoundingClientRect per
 * element, matched by role or class, so a test can drive the flip math directly.
 */
function mockLayout(options: {
  panelTop: number;
  anchorTop: number;
  anchorHeight?: number;
  bubbleHeight?: number;
}) {
  const { panelTop, anchorTop, anchorHeight = 20, bubbleHeight = 40 } = options;
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'panel') {
        return makeDOMRect({
          top: panelTop,
          bottom: panelTop + 300,
          left: 0,
          right: 300,
          width: 300,
          height: 300,
        });
      }
      if (this.classList.contains('tooltip')) {
        return makeDOMRect({
          top: anchorTop,
          bottom: anchorTop + anchorHeight,
          left: 40,
          right: 60,
          width: 20,
          height: anchorHeight,
        });
      }
      if (this.getAttribute('role') === 'tooltip') {
        return makeDOMRect({ width: 100, height: bubbleHeight });
      }
      // Anything else falls back to a plain document.body-sized rect.
      return makeDOMRect({
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
      });
    });
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

describe('Tooltip flipping to avoid occlusion in a scroll panel', () => {
  it('positions the bubble above the anchor when there is room in its scroll panel', () => {
    const { link } = renderTooltipInPanel();
    mockLayout({ panelTop: 100, anchorTop: 400 });
    fireEvent.mouseOver(link);

    const bubble = screen.getByRole('tooltip');
    expect(parseFloat(bubble.style.top)).toBeLessThan(400);
    expect(bubble.classList.contains('flipped')).toBe(false);
  });

  it('flips the bubble below the anchor when it is near the top of its scroll panel', () => {
    const { link } = renderTooltipInPanel();
    mockLayout({ panelTop: 100, anchorTop: 105, anchorHeight: 20 });
    fireEvent.mouseOver(link);

    const bubble = screen.getByRole('tooltip');
    expect(parseFloat(bubble.style.top)).toBeGreaterThan(105 + 20);
    // The arrow needs to move to the bubble's top edge and point up when flipped,
    // otherwise it's left pointing away from the anchor it's supposed to indicate.
    expect(bubble.classList.contains('flipped')).toBe(true);
  });

  it('does not flip just because the anchor is near the top of the page, if its scroll panel has room', () => {
    // panelTop is far above the anchor, so there's plenty of room above the anchor
    // within its own scroll panel, even though the anchor itself sits close to
    // the top of the (mocked) 600px-tall page.
    const { link } = renderTooltipInPanel();
    mockLayout({ panelTop: -1000, anchorTop: 30 });
    fireEvent.mouseOver(link);

    const top = parseFloat(screen.getByRole('tooltip').style.top);
    expect(top).toBeLessThan(30);
  });

  it('re-flips live as scrolling moves the anchor toward and away from its panel edge', () => {
    const { link, panel } = renderTooltipInPanel();
    mockLayout({ panelTop: 100, anchorTop: 400 });
    fireEvent.mouseOver(link);
    let bubble = screen.getByRole('tooltip');
    expect(parseFloat(bubble.style.top)).toBeLessThan(400);
    expect(bubble.classList.contains('flipped')).toBe(false);

    mockLayout({ panelTop: 100, anchorTop: 105 });
    fireEvent.scroll(panel);
    bubble = screen.getByRole('tooltip');
    expect(parseFloat(bubble.style.top)).toBeGreaterThan(105 + 20);
    expect(bubble.classList.contains('flipped')).toBe(true);

    mockLayout({ panelTop: 100, anchorTop: 400 });
    fireEvent.scroll(panel);
    bubble = screen.getByRole('tooltip');
    expect(parseFloat(bubble.style.top)).toBeLessThan(400);
    expect(bubble.classList.contains('flipped')).toBe(false);
  });

  it('stops repositioning once the tooltip has closed', () => {
    const { link, panel } = renderTooltipInPanel();
    mockLayout({ panelTop: 100, anchorTop: 400 });
    fireEvent.mouseOver(link);
    fireEvent.mouseOut(link);
    expect(screen.queryByRole('tooltip')).toBeNull();

    mockLayout({ panelTop: 100, anchorTop: 105 });
    // This scroll should be a no-op: there's no open tooltip to reposition, and the
    // listener should have been torn down when the tooltip closed.
    fireEvent.scroll(panel);

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tooltip clip boundary without a scroll panel', () => {
  it('flips against the real viewport top, not a drifted document.body/documentElement rect', () => {
    // document.body/documentElement's rect can drift far from 0 while the page is
    // scrolled, so the clip boundary must fall back to the real viewport top (0)
    // rather than that rect, or the tooltip fails to flip and renders off-screen.
    const { link } = renderTooltip();
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('tooltip')) {
          return makeDOMRect({
            top: 25,
            bottom: 45,
            left: 40,
            right: 60,
            width: 20,
            height: 20,
          });
        }
        if (this.getAttribute('role') === 'tooltip') {
          return makeDOMRect({ width: 240, height: 66 });
        }
        return makeDOMRect({
          top: -325,
          left: 0,
          right: 889,
          bottom: 633,
          width: 889,
          height: 958,
        });
      });

    fireEvent.mouseOver(link);

    const top = parseFloat(screen.getByRole('tooltip').style.top);
    expect(top).toBeGreaterThan(45); // flipped below the anchor, not above it
  });
});
