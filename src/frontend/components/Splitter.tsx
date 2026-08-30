import * as React from 'react';
import { A, $$, Hooks } from 'frontend';
import { persistedState } from 'frontend/logic/persisted-state';
import './Splitter.css';

interface SplitterBaseProps {
  className: string;
  start: React.ReactNode;
  end: React.ReactNode;
  persistLocalStorage?: string;
  direction?: 'horizontal' | 'vertical';
  /** Initial offset from center (px) used when nothing is persisted yet. */
  defaultOffset?: number;
}

interface SplitterConstraint {
  /** Which pane `minSize` / `maxSize` bound. */
  pane: 'start' | 'end';
  /** Smallest size (px) the named pane may shrink to when dragged. */
  minSize?: number;
  /** Largest size (px) the named pane may grow to when dragged. */
  maxSize?: number;
}

interface SplitterProps extends SplitterBaseProps {
  /**
   * Optionally bound one pane's size. Naming a single `pane` means the limits
   * can't contradict each other, so there's no wrong way to pass them.
   */
  constrain?: SplitterConstraint;
}

const splitterWidth = 3;
const splitterPadding = 6;

const verticalStartStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  width: '100%',
  top: 0,
};

const verticalEndStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  width: '100%',
  bottom: 0,
};

const verticalMiddleStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  width: '100%',
  height: `${splitterWidth}px`,
  padding: `${splitterPadding}px 0`,
};

const horizontalStartStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  left: 0,
};

const horizontalEndStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  right: 0,
};

const horizontalMiddleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  width: `${splitterWidth}px`,
  padding: `0 ${splitterPadding}px`,
};

export function Splitter(props: SplitterProps) {
  const {
    start,
    end,
    className,
    persistLocalStorage,
    direction = 'horizontal',
    defaultOffset = 0,
    constrain,
  } = props;
  const container = React.useRef<HTMLDivElement>(null);
  const middleVisible = React.useRef<HTMLDivElement>(null);
  const isDragging = $$.getIsDraggingSplitter();
  // Whether *this* splitter is the one being dragged. The global `isDragging`
  // above is shared by every splitter (TextArea relies on it), so it can't
  // drive this instance's hover/drag indicator.
  const [isDraggingThis, setIsDraggingThis] = React.useState(false);
  const dispatch = Hooks.useDispatch();
  const touchId = React.useRef<null | number>(null);
  const isVertical = direction === 'vertical';

  let initialOffset = defaultOffset;
  if (persistLocalStorage) {
    const number = persistedState.splitterOffset(persistLocalStorage).read();
    if (number !== null) {
      initialOffset = number;
    }
  }
  const [offset, setOffset] = React.useState(initialOffset);

  // Store the offset in a ref so it can be passed to the ResizeObserver.
  const offsetRef = React.useRef(offset);
  offsetRef.current = offset;
  const minSpace = 10;

  if (persistLocalStorage) {
    persistedState.splitterOffset(persistLocalStorage).write(offset);
  }

  if (className.includes(' ')) {
    throw new Error('Splitter only allows class names with no spaces.');
  }

  function keepOffsetInBounds(
    rect: DOMRect | { width: number; height: number },
    off: number,
  ): number {
    const size = isVertical ? rect.height : rect.width;
    off = Math.max(-(size / 2) + minSpace, off);
    off = Math.min(size / 2 - minSpace, off);
    // The start pane spans `size / 2 - off` and the end pane `size / 2 + off`,
    // so each size limit on the constrained pane becomes an offset limit.
    if (constrain) {
      const { pane, minSize, maxSize } = constrain;
      if (pane === 'start') {
        if (maxSize !== undefined) {
          off = Math.max(size / 2 - maxSize, off);
        }
        if (minSize !== undefined) {
          off = Math.min(size / 2 - minSize, off);
        }
      } else {
        if (maxSize !== undefined) {
          off = Math.min(maxSize - size / 2, off);
        }
        if (minSize !== undefined) {
          off = Math.max(minSize - size / 2, off);
        }
      }
    }
    return off;
  }

  React.useEffect(() => {
    const { current } = container;
    if (!current) {
      return () => {};
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const currentOffset = offsetRef.current;
      for (const entry of entries) {
        const off = keepOffsetInBounds(entry.contentRect, currentOffset);
        if (off !== currentOffset) {
          setOffset(off);
        }
      }
    });

    resizeObserver.observe(current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    dispatch(A.draggingSplitter(true));
    setIsDraggingThis(true);

    function onMouseUp() {
      handleUp();
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    function onMouseMove(event: MouseEvent) {
      event.preventDefault();
      handleMove(
        isVertical ? event.pageY : event.pageX,
        isVertical ? event.pageX : event.pageY,
      );
    }
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
  };

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (touchId.current !== null) {
      return;
    }
    event.preventDefault();
    dispatch(A.draggingSplitter(true));
    setIsDraggingThis(true);
    const startTouch = event.changedTouches[0];
    touchId.current = startTouch.identifier;
    if (container.current) {
      // Land the indicator on the touch point immediately, no glide-in.
      slideVisibleIndicator(
        container.current.getBoundingClientRect(),
        isVertical ? startTouch.pageX : startTouch.pageY,
        true,
      );
    }

    function onTouchEnd() {
      touchId.current = null;
      handleUp();
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchmove', onTouchMove);
      document.body.removeEventListener('touchmove', preventDocScroll);
    }

    function onTouchMove(event: TouchEvent) {
      let touch;
      for (let i = 0; i < event.touches.length; i++) {
        if (event.touches[i].identifier === touchId.current) {
          touch = event.touches[i];
        }
      }
      if (!touch) {
        console.error('Touch event:', { event, identifier: touchId.current });
        throw new Error('Expected to find a touch from the identifier');
      }
      event.preventDefault();
      handleMove(
        isVertical ? touch.pageY : touch.pageX,
        isVertical ? touch.pageX : touch.pageY,
      );
    }
    function preventDocScroll(event: TouchEvent) {
      event.preventDefault();
    }
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchmove', onTouchMove);
    document.body.addEventListener('touchmove', preventDocScroll, {
      passive: false,
    });
  };

  function handleMove(pos: number, crossPos?: number) {
    const { current } = container;
    if (!current) {
      return;
    }
    const rect = current.getBoundingClientRect();
    const size = isVertical ? rect.height : rect.width;
    const origin = isVertical ? rect.y : rect.x;
    const off = size / 2 + origin - pos;
    setOffset(keepOffsetInBounds(rect, off));
    if (crossPos !== undefined) {
      slideVisibleIndicator(rect, crossPos);
    }
  }

  function handleUp() {
    dispatch(A.draggingSplitter(false));
    setIsDraggingThis(false);
    window.document.body.style.cursor = '';
  }

  function slideVisibleIndicator(rect: DOMRect, pointer: number, snap = false) {
    const pill = middleVisible.current;
    if (!pill) {
      return;
    }
    const crossSize = isVertical ? rect.width : rect.height;
    const crossOrigin = isVertical ? rect.x : rect.y;
    const pillLength = isVertical ? pill.offsetWidth : pill.offsetHeight;
    const limit = Math.max(0, (crossSize - pillLength) / 2);
    const fromCenter = pointer - crossOrigin - crossSize / 2;
    const clamped = Math.max(-limit, Math.min(limit, fromCenter));
    if (snap) {
      pill.style.transition = 'none';
    }
    pill.style.transform = isVertical
      ? `translateX(${clamped}px)`
      : `translateY(${clamped}px)`;
    if (snap) {
      pill.getBoundingClientRect(); // Force the jump to commit transition-free.
      pill.style.transition = '';
    }
  }

  // `snap` on the first event of a hover so the pill lands on the pointer
  // instantly; later moves glide via the CSS transition.
  function hoverTrack(event: React.MouseEvent<HTMLDivElement>, snap: boolean) {
    if (isDraggingThis) {
      // The window-level drag listener is already driving the indicator.
      return;
    }
    const { current } = container;
    if (current) {
      slideVisibleIndicator(
        current.getBoundingClientRect(),
        isVertical ? event.pageX : event.pageY,
        snap,
      );
    }
  }

  const onMiddleHoverEnter: React.MouseEventHandler<HTMLDivElement> = (event) =>
    hoverTrack(event, true);
  const onMiddleHoverMove: React.MouseEventHandler<HTMLDivElement> = (event) =>
    hoverTrack(event, false);

  let startStyle: React.CSSProperties;
  let endStyle: React.CSSProperties;
  let middleStyle: React.CSSProperties;
  const midPos = `calc(50% - ${splitterWidth / 2 + splitterPadding + offset}px)`;

  if (isVertical) {
    startStyle = { ...verticalStartStyle, height: `calc(50% - ${offset}px)` };
    endStyle = { ...verticalEndStyle, height: `calc(50% + ${offset}px)` };
    middleStyle = { ...verticalMiddleStyle, top: midPos };
  } else {
    startStyle = { ...horizontalStartStyle, width: `calc(50% - ${offset}px)` };
    endStyle = { ...horizontalEndStyle, width: `calc(50% + ${offset}px)` };
    middleStyle = { ...horizontalMiddleStyle, left: midPos };
  }

  return (
    <div
      className={className}
      data-direction={direction}
      data-dragging={isDragging || undefined}
      ref={container}
    >
      <div className={className + 'Start'} style={startStyle}>
        {start}
      </div>
      <div
        className={`${className}Middle splitterMiddle${isDraggingThis ? ' dragging' : ''}`}
        style={middleStyle}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onMouseEnter={onMiddleHoverEnter}
        onMouseMove={onMiddleHoverMove}
      >
        <div
          ref={middleVisible}
          className={`${className}MiddleVisible splitterMiddleVisible`}
        />
      </div>
      <div className={className + 'End'} style={endStyle}>
        {end}
      </div>
    </div>
  );
}
