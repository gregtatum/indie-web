import * as React from 'react';
import { A, $, Hooks } from 'src';

import './ViewMarkdown.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewMarkdown() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const textFile = Hooks.useSelector($.getDownloadFileCache).get(path);
  const error = Hooks.useSelector($.getDownloadFileErrors).get(path);
  const songTitle = Hooks.useSelector($.getActiveFileSongTitleOrNull);

  React.useEffect(() => {
    if (songTitle) {
      document.title = songTitle;
    } else {
      const parts = path.split('/');
      const file = parts[parts.length - 1];
      document.title = file.replace(/\.\w+$/, '');
    }
  }, [path, songTitle]);

  React.useEffect(() => {
    if (textFile === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  if (textFile === undefined) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv} data-testid="viewChopro">
          <NextPrevLinks />
          {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv} data-testid="viewChopro">
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }

  return <Markdown />;
}

function Markdown() {
  const text = Hooks.useSelector($.getActiveFileText);
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  if (text) {
    return (
      <div className="viewMarkdown" data-fullscreen ref={swipeDiv}>
        <NextPrevLinks />
        <div className="viewMarkdownWidth">{text}</div>
      </div>
    );
  }
  return <div className="status">Loading image.</div>;
}
