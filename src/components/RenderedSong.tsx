import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $, T } from 'src';

import './RenderedSong.css';
import { UnhandledCaseError } from 'src/utils';

export function RenderedSong() {
  const path = Redux.useSelector($.getPath);
  const displayPath = Redux.useSelector($.getActiveFileDisplayPath);
  const fileKey = Redux.useSelector($.getActiveFileSongKey);
  const hideEditor = Redux.useSelector($.getHideEditor);
  const { directives, lines } = Redux.useSelector($.getActiveFileParsed);
  const dispatch = Redux.useDispatch();
  React.useEffect(() => {
    document.addEventListener('touchstart', (event) => {
      console.log({ event, target: event.target });
    });
  }, []);

  const parts = displayPath.split('/');
  let fileName = parts[parts.length - 1].replace('.chopro', '');
  if (fileName.endsWith('.chopro')) {
    fileName = fileName.slice(0, fileName.length - '.chopro'.length);
  }

  return (
    <div className="renderedSong" key={path}>
      <div className="renderedSongHeader">
        <div className="renderedSongHeaderTitle">
          <h1>{directives.title ?? fileName}</h1>
          {directives.subtitle ? <h2>{directives.subtitle}</h2> : null}
        </div>
        <div className="renderedSongHeaderDetails">
          {fileKey ? (
            <div className="renderedSongHeaderRow">Key: {fileKey}</div>
          ) : null}
          {hideEditor ? (
            <button
              className="renderedSongEdit"
              type="button"
              onClick={() => dispatch(A.hideEditor(false))}
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>
      {lines.map((line, lineIndex) => {
        const lineKey = getLineTypeKey(line, lineIndex);
        switch (line.type) {
          case 'line': {
            return (
              <div
                className={`renderedSongLine renderedSongLine-${line.content}`}
                key={lineKey}
              >
                {line.spans.map((span, spanIndex) => {
                  return span.type === 'text' ? (
                    <span
                      className="renderedSongLineText"
                      key={`${span.text}-${spanIndex}`}
                    >
                      {span.text}
                    </span>
                  ) : (
                    <span
                      className="renderedSongLineChord"
                      key={`${span.chord.text}-${spanIndex}`}
                    >
                      {span.chord.text}
                    </span>
                  );
                  return <div />;
                })}
              </div>
            );
          }
          case 'section':
            return (
              <h3 className="renderedSongSection" key={lineKey}>
                {line.text}
              </h3>
            );
          case 'space':
            return <div className="renderedSongSpace" key={lineKey} />;
          default:
            return null;
        }
      })}
      <div className="renderedSongEndPadding" />
    </div>
  );
}

function getLineTypeKey(line: T.LineType, index: number): string {
  switch (line.type) {
    case 'section':
      return 'section' + index + line.text;
    case 'space':
      return 'space' + index;
    case 'line': {
      let key = 'line' + index;
      for (const span of line.spans) {
        switch (span.type) {
          case 'text':
            key += span.text;
            break;
          case 'chord':
            key += span.chord;
            break;
          default:
            throw new UnhandledCaseError(span, 'TextOrChord');
        }
      }
      return key;
    }
    default:
      throw new UnhandledCaseError(line, 'LineType');
  }
}
