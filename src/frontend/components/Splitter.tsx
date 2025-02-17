import * as React from 'react';
import { A, $$, Hooks } from 'frontend';
import './Splitter.css';

interface SplitterProps {
  className: string;
  start: React.ReactNode;
  end: React.ReactNode;
  persistLocalStorage?: string;
}

export function Splitter(props: SplitterProps) {
  const { start, end, className, persistLocalStorage } = props;
  const container = React.useRef<HTMLDivElement>(null);
  const isDragging = $$.getIsDraggingSplitter();
  const dispatch = Hooks.useDispatch();
  const touchId = React.useRef<null | number>(null);

  let initialOffset = 0;
  if (persistLocalStorage) {
    const string = window.localStorage.getItem(persistLocalStorage);
    if (string) {
      const number = Number(string);
      if (!Number.isNaN(number)) {
        initialOffset = number;
      }
    }
  }
  const [offsetX, setOffsetX] = React.useState(initialOffset);

  // Store the offsetX in a ref so it can be passed to the ResizeObserver.
  const offsetXRef = React.useRef(offsetX);
  offsetXRef.current = offsetX;
  const minSpace = 10;
  const splitterWidth = 3;
  const splitterPadding = 6;

  if (persistLocalStorage) {
    window.localStorage.setItem(persistLocalStorage, String(offsetX));
  }

  if (className.includes(' ')) {
    throw new Error('Splitter only allows class names with no spaces.');
  }

  function keepOffsetInBounds(rect: DOMRect, offX: number): number {
    offX = Math.max(-(rect.width / 2) + minSpace, offX);
    offX = Math.min(rect.width / 2 - minSpace, offX);
    return offX;
  }

  React.useEffect(() => {
    const { current } = container;
    if (!current) {
      return () => {};
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const offsetX = offsetXRef.current;
      for (const entry of entries) {
        const offX = keepOffsetInBounds(entry.contentRect, offsetX);
        if (offX !== offsetX) {
          setOffsetX(offX);
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
      handleMove(event.pageX);
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
      handleMove(touch.pageX);
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

  function handleMove(pageX: number) {
    const { current } = container;
    if (!current) {
      return;
    }
    const rect = current.getBoundingClientRect();
    const offX = rect.width / 2 + rect.x - pageX;
    setOffsetX(keepOffsetInBounds(rect, offX));
  }
  function handleUp() {
    dispatch(A.draggingSplitter(false));
    window.document.body.style.cursor = '';
  }

  const startStyle = { width: `calc(50% - ${offsetX}px)` };
  const endStyle = { width: `calc(50% + ${offsetX}px)` };
  const middleStyle = {
    left: `calc(50% - ${splitterWidth / 2 + splitterPadding + offsetX}px)`,
    width: String(splitterWidth) + 'px',
    padding: `0 ${splitterPadding}px`,
  };

  return (
    <div className={className} ref={container}>
      <div className={className + 'Start'} style={startStyle}>
        {start}
      </div>
      <div
        className={className + 'Middle ' + (isDragging ? 'dragging' : '')}
        style={middleStyle}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div className={className + 'MiddleVisible'} />
      </div>
      <div className={className + 'End'} style={endStyle}>
        {end}
      </div>
    </div>
  );
}
