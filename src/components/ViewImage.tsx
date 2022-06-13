import * as React from 'react';
import * as Redux from 'react-redux';
import { A, $ } from 'src';

import './ViewImage.css';
import { maybeGetProperty, UnhandledCaseError } from 'src/utils';
import { UnlinkDropbox } from './LinkDropbox';
import { usePromiseSelector, useRetainScroll } from './hooks';
import { NextPrevLinks, useNextPrevSwipe } from './NextPrev';

export function ViewImage() {
  useRetainScroll();
  const dispatch = Redux.useDispatch();
  const path = Redux.useSelector($.getPath);
  const request = Redux.useSelector($.getDownloadBlobCache).get(path);
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
    if (!request) {
      dispatch(A.downloadBlob(path));
    }
  }, [request]);

  switch (request?.type) {
    case 'download-blob-received': {
      if (request.value.error) {
        console.error(request.value.error);
        return (
          <div className="status">
            There was an error:
            {maybeGetProperty(request.value.error, 'message')}
          </div>
        );
      }
      return <LoadImage />;
    }
    case 'download-blob-failed': {
      return (
        <div className="status">
          <div>
            <p>Unable to access DropBox account.</p>
            <UnlinkDropbox />
          </div>
        </div>
      );
    }
    case 'download-blob-requested':
    default:
      return <div className="status">Downloading…</div>;
  }
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
