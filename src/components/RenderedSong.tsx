import * as React from 'react';
import * as Redux from 'react-redux';
import * as $ from 'src/store/selectors';

import './RenderedSong.css';

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
      {lines.map((line) => {
        switch (line.type) {
          case 'line':
            return null;
            return <div>{line.text}</div>;
          case 'section':
            return <h3>{line.text}</h3>;
          default:
            return null;
        }
      })}
    </div>
  );
}
