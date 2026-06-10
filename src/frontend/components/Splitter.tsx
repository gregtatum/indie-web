import * as React from 'react';
import { A, $$, Hooks } from 'frontend';
import { localStorageEntries } from 'frontend/logic/local-storage';
import './Splitter.css';

interface SplitterProps {
  className: string;
  start: React.ReactNode;
  end: React.ReactNode;
  persistLocalStorage?: string;
  direction?: 'horizontal' | 'vertical';
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
  } = props;
  const container = React.useRef<HTMLDivElement>(null);
  const isDragging = $$.getIsDraggingSplitter();
  const dispatch = Hooks.useDispatch();
  const touchId = React.useRef<null | number>(null);
  const isVertical = direction === 'vertical';

  let initialOffset = 0;
  if (persistLocalStorage) {
    const number = localStorageEntries
      .splitterOffset(persistLocalStorage)
      .read();
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
    localStorageEntries.splitterOffset(persistLocalStorage).write(offset);
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

    function onMouseUp() {
      handleUp();
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    function onMouseMove(event: MouseEvent) {
      event.preventDefault();
      handleMove(isVertical ? event.pageY : event.pageX);
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
    touchId.current = event.changedTouches[0].identifier;

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
      handleMove(isVertical ? touch.pageY : touch.pageX);
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

  function handleMove(pos: number) {
    const { current } = container;
    if (!current) {
      return;
    }
    const rect = current.getBoundingClientRect();
    const size = isVertical ? rect.height : rect.width;
    const origin = isVertical ? rect.y : rect.x;
    const off = size / 2 + origin - pos;
    setOffset(keepOffsetInBounds(rect, off));
  }

  function handleUp() {
    dispatch(A.draggingSplitter(false));
    window.document.body.style.cursor = '';
  }

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
    <div className={className} data-direction={direction} ref={container}>
      <div className={className + 'Start'} style={startStyle}>
        {start}
      </div>
      <div
        className={`${className}Middle splitterMiddle${isDragging ? ' dragging' : ''}`}
        style={middleStyle}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className={`${className}MiddleVisible splitterMiddleVisible`} />
      </div>
      <div className={className + 'End'} style={endStyle}>
        {end}
      </div>
    </div>
  );
}
