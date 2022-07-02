import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $ } from 'src';

import './ViewImage.css';
import { UnhandledCaseError } from 'src/utils';
import { usePromiseSelector, useRetainScroll } from './hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewImage() {
  useRetainScroll();
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getPath);
  const blob = Redux.useSelector($.getDownloadBlobCache).get(path);
  const error = Redux.useSelector($.getDownloadFileErrors).get(path);
  const songTitle = Redux.useSelector($.getActiveFileSongTitleOrNull);

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
  const image = usePromiseSelector($.getActiveImage);
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  switch (image.type) {
    case 'fulfilled':
      if (!image.value) {
        return <div className="viewImageLoading">Error loading PDF.</div>;
      }
      return (
        <div className="viewImage" data-fullscreen ref={swipeDiv}>
          <NextPrevLinks />
          <div className="viewImageWidth">
            <img src={image.value} />
          </div>
        </div>
      );
    case 'pending':
      return <div className="viewImageLoading">Loading PDF.</div>;
    case 'rejected':
      return <div className="viewImageLoading">Error loading PDF.</div>;
    default:
      throw new UnhandledCaseError(image, 'promise');
  }
}
