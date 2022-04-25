import * as React from 'react';
import * as Redux from 'react-redux';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';
import * as Router from 'react-router-dom';
import { RenderedSong } from './RenderedSong';

import './ViewFile.css';
import { ensureExists, maybeGetProperty } from 'src/utils';

export function ViewFile() {
  const dispatch = Redux.useDispatch();
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const request = Redux.useSelector($.getDownloadFileCache).get(path);

  React.useEffect(() => {
    document.title = path;
    dispatch(A.changeActiveFile(path));
  }, []);

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
      return (
        <Splitter
          className="viewFileSplit"
          start={<TextArea text={text} />}
          end={<RenderedSong />}
          persistLocalStorage={'viewFileSplitterOffset'}
        />
      );
    }
    case 'download-file-failed':
      return <div className="viewFileRequested">Failed to download file</div>;
    case 'download-file-requested':
    default:
      return <div className="viewFileRequested">Requesting file.</div>;
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
  const [isDragging, setIsDragging] = React.useState(false);

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
  const splitterPadding = 3;

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
    setIsDragging(true);

    function onMouseUp() {
      setIsDragging(false);
      window.document.body.style.cursor = '';
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    function onMouseMove(event: MouseEvent) {
      event.preventDefault();
      const { current } = container;
      if (!current) {
        return;
      }
      const rect = current.getBoundingClientRect();
      const offX = rect.width / 2 + rect.x - event.pageX;
      setOffsetX(keepOffsetInBounds(rect, offX));
    }
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
  };

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
      >
        <div className={className + 'MiddleVisible'} />
      </div>
      <div className={className + 'End'} style={endStyle}>
        {end}
      </div>
    </div>
  );
}

function TextArea(props: { text: string }) {
  return (
    <textarea
      spellCheck="false"
      className="viewFileTextArea"
      defaultValue={props.text}
    ></textarea>
  );
}
