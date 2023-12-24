import * as React from 'react';
import { $, T, A } from 'src';
import { throttle1 } from 'src/utils';
import * as Hooks from 'src/hooks';

import './TextArea.css';

export function TextArea(props: {
  path: string;
  textFile: T.DownloadedTextFile;
}) {
  const isDragging = Hooks.useSelector($.getIsDraggingSplitter);
  const modifiedText = Hooks.useSelector($.getModifiedText);
  const textGeneration = React.useRef(0);
  const textAreaRef = React.useRef<null | HTMLTextAreaElement>(null);

  const dispatch = Hooks.useDispatch();
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

  // If the text gets modified by the Redux store, then the textarea value will need to
  // be updated. If the textarea is modified by the user, then do not update the textarea.
  // This update is signaled by the generation value in the modified text.
  React.useEffect(() => {
    if (
      textGeneration.current !== modifiedText.generation &&
      textAreaRef.current &&
      modifiedText.text
    ) {
      textGeneration.current = modifiedText.generation;
      textAreaRef.current.value = modifiedText.text;
    }
  }, [modifiedText]);

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
        defaultValue={props.textFile.text}
        onChange={(event) => throttledOnChange(event.target.value)}
        style={style}
        ref={textAreaRef}
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onKeyDown={async (event) => {
          const { metaKey, ctrlKey, code, target } = event;
          if ((metaKey || ctrlKey) && code === 'KeyS') {
            event.preventDefault();
            const text = (target as HTMLTextAreaElement).value;
            await dispatch(A.saveTextFile(props.path, text));
            if (text === (target as HTMLTextAreaElement).value) {
              // Invalidate the modified state.
            }
          }
        }}
      ></textarea>
    </div>
  );
}
