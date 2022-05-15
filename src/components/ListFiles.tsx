import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { A, $ } from 'src';
import { useRetainScroll } from './hooks';

Router.useNavigationType;

import './ListFiles.css';

export function ListFiles() {
  const path = Redux.useSelector($.getPath);
  const activeFileDisplayPath = Redux.useSelector($.getActiveFileDisplayPath);
  const dispatch = Redux.useDispatch();
  const request = Redux.useSelector($.getListFilesCache).get(path);
  const scrollRef = useRetainScroll(
    request?.type ?? 'none' + window.location.href,
  );

  React.useEffect(() => {
    if (path === '/') {
      document.title = '🎵 Browser Chords';
    } else {
      if (path.startsWith('/')) {
        document.title = '📁 ' + (activeFileDisplayPath || path).slice(1);
      } else {
        document.title = '📁 ' + (activeFileDisplayPath || path);
      }
    }
    dispatch(A.keepAwake(false));
  }, [activeFileDisplayPath]);

  React.useEffect(() => {
    if (!request) {
      dispatch(A.listFiles(path));
    }
  }, [request]);

  function clickFile() {
    dispatch(A.keepAwake(true));
  }

  switch (request?.type) {
    case 'list-files-received': {
      let parent = null;
      if (path !== '/') {
        const parts = path.split('/');
        parts.pop();
        parent = (
          <div className="listFilesFile">
            <Router.Link
              className="listFilesFileLink"
              to={`/folder${parts.join()}`}
            >
              <span className="listFilesIcon">↩</span>
              ..
            </Router.Link>
          </div>
        );
      }
      return (
        <>
          <div className="listFiles" ref={scrollRef}>
            {parent}
            {request.value.map((entry) => {
              const { name, id, path_lower } = entry;
              const isFolder = entry['.tag'] === 'folder';
              const isChordPro = !isFolder && name.endsWith('.chopro');
              const isPDF = !isFolder && name.endsWith('.pdf');
              let icon = '📄';
              if (isFolder) {
                icon = '📁';
              } else if (isChordPro) {
                icon = '🎵';
              }
              let link = (
                <div className="listFilesFileEmpty">
                  <span className="listFilesIcon">{icon}</span>
                  {name}
                </div>
              );
              if (path_lower) {
                if (isFolder) {
                  link = (
                    <Router.Link
                      className="listFilesFileLink"
                      to={`/folder${path_lower}`}
                    >
                      <span className="listFilesIcon">{icon}</span>
                      {name}
                    </Router.Link>
                  );
                } else if (isChordPro) {
                  link = (
                    <Router.Link
                      className="listFilesFileLink"
                      to={`/file${path_lower}`}
                      onClick={clickFile}
                    >
                      <span className="listFilesIcon">{icon}</span>
                      {name}
                    </Router.Link>
                  );
                } else if (isPDF) {
                  link = (
                    <Router.Link
                      className="listFilesFileLink"
                      to={`/pdf${path_lower}`}
                      onClick={clickFile}
                    >
                      <span className="listFilesIcon">{icon}</span>
                      {name}
                    </Router.Link>
                  );
                }
              }

              return (
                <div className="listFilesFile" key={id}>
                  {link}
                </div>
              );
            })}
          </div>
        </>
      );
    }
    case 'list-files-failed':
      return (
        <div className="appViewError">
          <p>Unable to list the Dropbox files.</p>
          {typeof request.error === 'string' ? <p>{request.error}</p> : null}
        </div>
      );
    case 'list-files-requested':
    default:
      return (
        <div className="listFilesBlocks">
          <div className="listFilesFileBlock"></div>
          <div className="listFilesFileBlock"></div>
          <div className="listFilesFileBlock"></div>
          <div className="listFilesFileBlock"></div>
          <div className="listFilesFileBlock"></div>
        </div>
      );
  }
}
