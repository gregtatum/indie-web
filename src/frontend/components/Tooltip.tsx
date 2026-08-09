import * as React from 'react';
import * as Hooks from 'frontend/hooks';
import { ensureExists } from 'frontend/utils';
import './Tooltip.css';

interface TooltipProps {
  text: string;
  children: any;
}

const tooltipMargin = 10;

declare global {
  interface Window {
    /**
     * Debug flag for inspecting the tooltip's CSS.
     */
    gDisableAutoHide: boolean;
  }
}

/**
 * Find the parent element that clips layout.
 */
function getClippingParentTop(element: HTMLElement): number {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node.getBoundingClientRect().top;
    }
    node = node.parentElement;
  }
  return 0;
}

/**
 * Wraps children with a tooltip bubble shown above them on hover or focus.
 * Render via the overlayPortal.
 */
export function Tooltip(props: TooltipProps) {
  React.useEffect(() => {
    window.gDisableAutoHide ??= false;
  }, []);

  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const bubbleRef = React.useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState<null | {
    top: number;
    left: number;
    arrowLeft: number;
    flipped: boolean;
  }>(null);

  const open = () => setIsOpen(true);
  const close = () => {
    if (window.gDisableAutoHide) {
      return;
    }
    setIsOpen(false);
    setPosition(null);
  };

  const updatePosition = React.useCallback(() => {
    const anchor = ensureExists(anchorRef.current, 'There is no anchorRef');
    const bubble = ensureExists(bubbleRef.current, 'There is no bubbleRef');

    // The bubble is `position: fixed`, so top/left are plain viewport coordinates.
    const anchorRect = anchor.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const clipTop = getClippingParentTop(anchor);

    let left = anchorRect.left + anchorRect.width / 2 - bubbleRect.width / 2;
    if (left < tooltipMargin) {
      left = tooltipMargin;
    } else if (left + bubbleRect.width > window.innerWidth - tooltipMargin) {
      left = window.innerWidth - bubbleRect.width - tooltipMargin;
    }

    let top = anchorRect.top - bubbleRect.height - 10;
    const flipped =
      anchorRect.top - clipTop < bubbleRect.height + 10 + tooltipMargin;
    if (flipped) {
      // Not enough room above within the anchor's visible clip region, flip below.
      top = anchorRect.bottom + 10;
    }

    // Point the arrow at the anchor's center, clamped so it stays within the
    // bubble's rounded corners even when the bubble itself got clamped to the
    // edge of the screen.
    const arrowMargin = 10;
    let arrowLeft = anchorRect.left + anchorRect.width / 2 - left;
    arrowLeft = Math.min(
      Math.max(arrowLeft, arrowMargin),
      bubbleRect.width - arrowMargin,
    );

    setPosition({ top, left, arrowLeft, flipped });
  }, []);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  React.useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    // Scroll events don't bubble, so this listener runs in the capture phase to
    // detect scrolling inside a nested panel, not just on the window itself.
    window.addEventListener('scroll', updatePosition, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  function renderBubble() {
    const classNames = ['tooltipBubble'];
    if (position) {
      classNames.push('visible');
    }
    if (position?.flipped) {
      classNames.push('flipped');
    }
    return (
      <span
        className={classNames.join(' ')}
        role="tooltip"
        ref={bubbleRef}
        style={
          {
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            '--arrow-left': `${position?.arrowLeft ?? 0}px`,
          } as React.CSSProperties
        }
      >
        {props.text}
      </span>
    );
  }

  return (
    <span
      className="tooltip"
      ref={anchorRef}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {props.children}
      {isOpen ? Hooks.overlayPortal(renderBubble()) : null}
    </span>
  );
}
