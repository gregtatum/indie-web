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
  }>(null);

  const open = () => setIsOpen(true);
  const close = () => {
    if (window.gDisableAutoHide) {
      return;
    }
    setIsOpen(false);
    setPosition(null);
  };

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    const anchor = ensureExists(anchorRef.current, 'There is no anchorRef');
    const bubble = ensureExists(bubbleRef.current, 'There is no bubbleRef');

    const anchorRect = anchor.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const docRect = document.body.getBoundingClientRect();

    let left =
      anchorRect.left - docRect.left + anchorRect.width / 2 - bubbleRect.width / 2;
    if (left < tooltipMargin) {
      left = tooltipMargin;
    } else if (left + bubbleRect.width > docRect.width - tooltipMargin) {
      left = docRect.width - bubbleRect.width - tooltipMargin;
    }

    let top = anchorRect.top - docRect.top - bubbleRect.height - 10;
    if (top < tooltipMargin) {
      // Not enough room above, flip below the anchor.
      top = anchorRect.bottom - docRect.top + 10;
    }

    setPosition({ top, left });
  }, [isOpen]);

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
      {isOpen
        ? Hooks.overlayPortal(
            <span
              className={`tooltipBubble ${position ? 'visible' : ''}`}
              role="tooltip"
              ref={bubbleRef}
              style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
            >
              {props.text}
            </span>,
          )
        : null}
    </span>
  );
}
