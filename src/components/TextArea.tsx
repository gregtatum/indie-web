import * as React from 'react';
import * as Redux from 'react-redux';
import { $, T, A } from 'src';
import { throttle1 } from 'src/utils';

import './TextArea.css';

export function TextArea(props: {
  path: string;
  text: string;
  originalRequest: T.APICalls.DownloadFile;
}) {
  const isDragging = Redux.useSelector($.getIsDraggingSplitter);
  const dispatch = Redux.useDispatch();
  function onChange(newText: string) {
    dispatch(A.modifyActiveFile(newText));
  }
  const flush = React.useRef<(() => void) | null>(null);
  const throttledOnChange = React.useMemo(
    () => throttle1(onChange, flush, 500),
    [],
  );

  React.useEffect(() => {
    return () => {
      if (flush.current) {
        // Flush any pending debouncing events.
        flush.current();
      }
    };
  }, []);

  const style: React.CSSProperties = {};
  if (isDragging) {
    style.overflow = 'hidden';
  }

  return (
    <div className="textArea" key={props.path}>
      <button
        className="textAreaDismiss"
        type="button"
        aria-label="Hide Editor"
        onClick={() => dispatch(A.hideEditor(true))}
      ></button>
      <textarea
        spellCheck="false"
        className="textAreaTextArea"
        defaultValue={props.text}
        onChange={(event) => throttledOnChange(event.target.value)}
        style={style}
        onKeyDown={async (event) => {
          const { metaKey, ctrlKey, code, target } = event;
          if ((metaKey || ctrlKey) && code === 'KeyS') {
            event.preventDefault();
            const text = (target as HTMLTextAreaElement).value;
            await dispatch(A.saveFile(props.path, text, props.originalRequest));
            if (text === (target as HTMLTextAreaElement).value) {
              // Invalidate the modified state.
            }
          }
        }}
      ></textarea>
    </div>
  );
}
