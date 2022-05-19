import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $ } from 'src';
import { RenderedSong } from './RenderedSong';
import { TextArea } from './TextArea';

import './ViewChopro.css';
import { ensureExists, maybeGetProperty } from 'src/utils';
import { UnlinkDropbox } from './LinkDropbox';

export function ViewChopro() {
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getPath);
  const request = Redux.useSelector($.getDownloadFileCache).get(path);
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);
  const hideEditor = Redux.useSelector($.getHideEditor);

  React.useEffect(() => {
    if (songTitle) {
      document.title = '🎵 ' + songTitle;
    } else {
      if (path.startsWith('/')) {
        document.title = '🎵 ' + path.slice(1);
      } else {
        document.title = '🎵 ' + path;
      }
    }
  }, [path, songTitle]);

  React.useEffect(() => {
    if (!request) {
      dispatch(A.downloadFile(path));
    }
  }, [request]);

  switch (request?.type) {
    case 'download-file-received': {
      if (request.value.error) {
        console.error(request.value.error);
        return (
          <div>
            There was an error:
            {maybeGetProperty(request.value.error, 'message')}
          </div>
        );
      }
      const text = ensureExists(request.value.text, 'text');
      if (hideEditor) {
        return (
          <div className="viewChoproSolo">
            <RenderedSong />
          </div>
        );
      }
      return (
        <Splitter
          className="viewChoproSplit"
          start={<TextArea path={path} text={text} originalRequest={request} />}
          end={<RenderedSong />}
          persistLocalStorage="viewChoproSplitterOffset"
        />
      );
    }
    case 'download-file-failed': {
      return (
        <div className="viewChoproError">
          <div>
            <p>Unable to access DropBox account.</p>
            <UnlinkDropbox />
          </div>
        </div>
      );
    }
    case 'download-file-requested':
    default:
      return <div className="viewChoproMessage">Requesting file.</div>;
  }
}

interface SplitterProps {
  className: string;
  start: React.ReactNode;
  end: React.ReactNode;
  persistLocalStorage?: string;
}

function Splitter(props: SplitterProps) {
  const { start, end, className, persistLocalStorage } = props;
  const container = React.useRef<HTMLDivElement>(null);
  const isDragging = Redux.useSelector($.getIsDraggingSplitter);
  const dispatch = Redux.useDispatch();
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
    window.localStorage.setItem(persistLocalStorage, '' + offsetX);
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
    width: splitterWidth + 'px',
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
