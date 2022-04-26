import * as React from 'react';
import * as Redux from 'react-redux';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';
import * as Router from 'react-router-dom';

import './ListFiles.css';

export function ListFiles() {
  const dispatch = Redux.useDispatch();
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const request = Redux.useSelector($.getListFilesCache).get(path);

  React.useEffect(() => {
    document.title = path;
    dispatch(A.changeView('list-files'));
  }, []);

  React.useEffect(() => {
    if (!request) {
      dispatch(A.listFiles(path));
    }
  }, [request]);

  switch (request?.type) {
    case 'list-files-received': {
      let parent = null;
      if (path !== '/') {
        const parts = path.split('/');
        parts.pop();
        parent = (
          <div className="listFilesFile">
            <Router.Link to={`/folder${parts.join()}`}>
              <span className="listFilesIcon">↩</span>
              ..
            </Router.Link>
          </div>
        );
      }
      return (
        <div className="listFiles">
          {parent}
          {request.value.map((entry) => {
            const { name, id, path_lower } = entry;
            const isFolder = entry['.tag'] === 'folder';
            const isChordPro = !isFolder && name.endsWith('.chopro');
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
                  <Router.Link to={`/folder${path_lower}`}>
                    <span className="listFilesIcon">{icon}</span>
                    {name}
                  </Router.Link>
                );
              } else if (isChordPro) {
                link = (
                  <Router.Link to={`/file${path_lower}`}>
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
      );
    }
    case 'list-files-failed':
      return <div className="listFilesFailed"></div>;
    case 'list-files-requested':
    default:
      return <div className="listFilesRequested"></div>;
  }
}
