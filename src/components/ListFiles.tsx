import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { A, $ } from 'src';
import { ensureExists, getStringProp } from 'src/utils';
import { useRetainScroll } from './hooks';

Router.useNavigationType;

import './ListFiles.css';
import { UnhandledCaseError } from '../utils';

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
              to={`/folder${parts.join('/')}`}
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
            <CreateChordProButton path={path} />
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

function CreateChordProButton(props: { path: string }) {
  type Phase = 'not-editing' | 'editing' | 'submitting';
  const dropbox = Redux.useSelector($.getDropbox);
  const [phase, setPhase] = React.useState<Phase>('not-editing');
  const input = React.useRef<HTMLInputElement | null>(null);
  const navigate = Router.useNavigate();
  const [error, setError] = React.useState<null | string>(null);

  React.useEffect(() => {
    switch (phase) {
      case 'editing':
        input.current?.focus();
        input.current?.setSelectionRange(0, 0);
        break;
      case 'not-editing':
      case 'submitting':
        setError(null);
        break;
      default:
        throw new UnhandledCaseError(phase, 'Phase');
    }
  }, [phase]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const inputEl = ensureExists(input.current, 'Input ref value');
    let path = props.path;
    if (path[path.length - 1] !== '/') {
      path += '/';
    }
    path += inputEl.value;
    const title = inputEl.value.replace(/\.chopro$/, '');
    setPhase('submitting');
    dropbox
      .filesUpload({
        path,
        contents: `{title: ${title}}\n{subtitle: Unknown}`,
        mode: {
          '.tag': 'add',
        },
      })
      .then(
        (response) => {
          navigate('file' + (response.result.path_display ?? path));
        },
        (error) => {
          setError(
            getStringProp(error, 'message') ?? 'There was a Dropbox API error',
          );
        },
      );
  }

  if (phase === 'editing' || phase === 'submitting') {
    const disabled = phase === 'submitting';
    return (
      <>
        {error ? <div className="listFilesCreateError">{error}</div> : null}
        <form className="listFilesCreateEditor" onSubmit={onSubmit}>
          <input
            type="text"
            className="listFilesCreateEditorInput"
            ref={input}
            defaultValue=".chopro"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPhase('not-editing');
              }
            }}
          />
          <input
            type="submit"
            value={phase === 'submitting' ? 'Submitting' : 'Create'}
            className="button"
            disabled={disabled}
          />
        </form>
      </>
    );
  }

  return (
    <button
      type="button"
      className="button listFilesCreate"
      onClick={() => setPhase('editing')}
    >
      Create ChordPro File
    </button>
  );
}
