import * as React from 'react';
import { A, $$, Hooks } from 'src';

import './ViewImage.css';
import { useRetainScroll } from '../hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewImage() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const blob = $$.getDownloadBlobCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  Hooks.useFileAsDocumentTitle();

  React.useEffect(() => {
    if (!blob) {
      void dispatch(A.downloadBlob(path));
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
  const image = $$.getActiveImageOrNull();
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
