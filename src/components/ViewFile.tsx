import * as React from 'react';
import * as Redux from 'react-redux';
import * as $ from 'src/store/selectors';
import * as A from 'src/store/actions';
import * as Router from 'react-router-dom';
import { RenderedSong } from './RenderedSong';

import './ViewFile.css';
import { ensureExists, maybeGetProperty } from 'src/utils';

export function ViewFile() {
  const dispatch = Redux.useDispatch();
  const params = Router.useParams();
  const path = '/' + (params['*'] ?? '');
  const request = Redux.useSelector($.getDownloadFileCache).get(path);

  React.useEffect(() => {
    document.title = path;
    dispatch(A.changeActiveFile(path));
  }, []);

  React.useEffect(() => {
    if (!request) {
      dispatch(A.downloadFile(path));
    }
  }, [request]);

  switch (request?.type) {
    case 'download-file-received': {
      if (request.value.error) {
        console.error(request.value.error);
        return (
          <div>
            There was an error:
            {maybeGetProperty(request.value.error, 'message')}
          </div>
        );
      }
      const text = ensureExists(request.value.text, 'text');
      console.log(`!!! download file received`);
      return (
        <div className="viewFileSplit">
          <div className="viewFileStart">
            <TextArea text={text} />
          </div>
          <div className="viewFileEnd">
            <RenderedSong />
          </div>
        </div>
      );
    }
    case 'download-file-failed':
      return <div className="viewFileRequested">Failed to download file</div>;
    case 'download-file-requested':
    default:
      return <div className="viewFileRequested">Requesting file.</div>;
  }
}

function TextArea(props: { text: string }) {
  return (
    <textarea
      spellCheck="false"
      className="viewFileTextArea"
      defaultValue={props.text}
    ></textarea>
  );
}
