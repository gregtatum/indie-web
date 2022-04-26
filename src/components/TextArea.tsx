import * as React from 'react';
import * as A from 'src/store/actions';
import * as Redux from 'react-redux';
import { throttle1 } from 'src/utils';

export function TextArea(props: { path: string; text: string }) {
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

  return (
    <textarea
      spellCheck="false"
      className="viewFileTextArea"
      defaultValue={props.text}
      onChange={(event) => throttledOnChange(event.target.value)}
    ></textarea>
  );
}
