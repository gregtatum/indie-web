import * as React from 'react';
import * as Redux from 'react-redux';
import * as $ from 'src/store/selectors';
import * as T from 'src/@types';

import './RenderedSong.css';
import { UnhandledCaseError } from 'src/utils';

export function RenderedSong() {
  const fileKey = Redux.useSelector($.getSongKey);
  const { directives, lines } = Redux.useSelector($.getParsedFile);

  // useEffect

  return (
    <div className="renderedSong">
      <div className="renderedSongHeader">
        <div className="renderedSongHeaderTitle">
          <h1>{directives.title ?? 'Untitled'}</h1>
          {directives.subtitle ? <h2>{directives.subtitle}</h2> : null}
        </div>
        <div className="renderedSongHeaderDetails">
          {fileKey ? (
            <div className="renderedSongHeaderRow">Key: {fileKey}</div>
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
          default:
            return null;
        }
      })}
    </div>
  );
}

function getLineTypeKey(line: T.LineType, index: number): string {
  switch (line.type) {
    case 'section':
      return index + line.text;
    case 'line': {
      let key = '' + index;
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
