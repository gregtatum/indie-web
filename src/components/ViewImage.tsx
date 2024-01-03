import * as React from 'react';
import { A, $, Hooks } from 'src';

import './ViewImage.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewImage() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const blob = Hooks.useSelector($.getDownloadBlobCache).get(path);
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
    if (!blob) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.downloadBlob(path));
    }
  }, [blob]);

  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  if (!blob) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv}>
          <NextPrevLinks />
          There was an error: {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv}>
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }
  return <LoadImage />;
}

function LoadImage() {
  const image = Hooks.useSelector($.getActiveImageOrNull);
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  if (image) {
    return (
      <div className="viewImage" data-fullscreen ref={swipeDiv}>
        <NextPrevLinks />
        <img src={image} />
      </div>
    );
  }
  return <div className="status">Loading image.</div>;
}
