import * as React from 'react';
import * as Redux from 'react-redux';
import * as Router from 'react-router-dom';
import { A, T, $ } from 'src';
import { ensureExists, getStringProp, imageExtensions } from 'src/utils';
import { useRetainScroll, useStore } from './hooks';

Router.useNavigationType;

import './ListFiles.css';
import { UnhandledCaseError } from '../utils';

export function ListFiles() {
  useRetainScroll();
  const path = Redux.useSelector($.getPath);
  const activeFileDisplayPath = Redux.useSelector($.getActiveFileDisplayPath);
  const dispatch = Redux.useDispatch();
  const request = Redux.useSelector($.getListFilesCache).get(path);

  React.useEffect(() => {
    if (path === '/') {
      document.title = 'Browser Chords';
    } else {
      if (path.startsWith('/')) {
        document.title = (activeFileDisplayPath || path).slice(1);
      } else {
        document.title = activeFileDisplayPath || path;
      }
    }
  }, [activeFileDisplayPath]);

  React.useEffect(() => {
    if (!request) {
      dispatch(A.listFiles(path));
    }
  }, [request]);

  // Create the initial files if needed.
  React.useEffect(() => {
    if (
      activeFileDisplayPath === '/' &&
      request?.type === 'list-files-received' &&
      request.value.length === 0
    ) {
      dispatch(A.createInitialFiles());
    }
  }, [activeFileDisplayPath, request]);

  const [filter, setFilter] = React.useState<string>('');

  switch (request?.type) {
    case 'list-files-received': {
      let parent = null;
      if (path !== '/') {
        const parts = path.split('/');
        parts.pop();
        parent = (
          <Router.Link
            className="listFilesBack"
            to={`/folder${parts.join('/')}`}
            aria-label="Back"
          >
            ←
          </Router.Link>
        );
      }
      // Remove any dot files.
      const visibleFiles = request.value.filter(
        (entry) => entry.name[0] !== '.',
      );

      return (
        <>
          <div className="listFiles">
            <div className="listFilesFilter">
              {parent}
              <input
                className="listFilesFilterInput"
                type="text"
                placeholder="Filter files"
                onChange={(event) => {
                  setFilter(event.target.value.toLowerCase());
                }}
              />
            </div>
            <div className="listFilesList">
              {visibleFiles
                .filter((file) =>
                  filter ? file.name.toLowerCase().includes(filter) : true,
                )
                .map((file) => {
                  return (
                    <div key={file.id} className="listFilesFile">
                      <File dropboxFile={file} />
                    </div>
                  );
                })}
              <CreateChordProButton path={path} />
            </div>
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
  const { dispatch, getState } = useStore();
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
    let contents = `{title: ${title}}\n{subtitle: Unknown}`;
    const match = /^(.*) - (.*).*$/.exec(title);
    if (match) {
      contents = `{title: ${match[1]}}\n{subtitle: ${match[2]}}`;
    }
    dropbox
      .filesUpload({
        path,
        contents,
        mode: {
          '.tag': 'add',
        },
      })
      .then(
        (response) => {
          // The directory listing is now stale, fetch it again.
          dispatch(A.listFiles(props.path));
          if ($.getHideEditor(getState())) {
            dispatch(A.hideEditor(false));
          }
          navigate('file' + (response.result.path_display ?? path));
        },
        (error) => {
          let err =
            getStringProp(error, 'message') ?? 'There was a Dropbox API error';
          if (error?.status === 409) {
            err = 'That file already exists, please choose a different name.';
          }
          setError(err);
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

function File(props: { dropboxFile: T.FileMetadata | T.FolderMetadata }) {
  const { name, path } = props.dropboxFile;
  const isFolder = props.dropboxFile.type === 'folder';
  const nameParts = name.split('.');
  const extension =
    nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
  let displayName: React.ReactNode = name;
  if (extension) {
    displayName = (
      <>
        {nameParts.slice(0, -1).join('.')}.
        <span className="listFilesExtension">
          {nameParts[nameParts.length - 1]}
        </span>
      </>
    );
  }
  const isChordPro = !isFolder && extension === 'chopro';
  const isPDF = !isFolder && extension === 'pdf';
  const isImage = !isFolder && imageExtensions.has(extension);

  let icon = '📄';
  if (isFolder) {
    icon = '📁';
  } else if (isChordPro) {
    icon = '🎵';
  }

  if (path) {
    if (isFolder) {
      return (
        <Router.Link className="listFilesFileLink" to={`/folder${path}`}>
          <span className="listFilesIcon">{icon}</span>
          {displayName}
        </Router.Link>
      );
    }

    if (isChordPro) {
      return (
        <Router.Link className="listFilesFileLink" to={`/file${path}`}>
          <span className="listFilesIcon">{icon}</span>
          {displayName}
        </Router.Link>
      );
    }

    if (isPDF) {
      return (
        <Router.Link className="listFilesFileLink" to={`/pdf${path}`}>
          <span className="listFilesIcon">{icon}</span>
          {displayName}
        </Router.Link>
      );
    }

    if (isImage) {
      return (
        <Router.Link className="listFilesFileLink" to={`/image${path}`}>
          <span className="listFilesIcon">{icon}</span>
          {displayName}
        </Router.Link>
      );
    }
  }

  return (
    <div className="listFilesFileEmpty">
      <span className="listFilesIcon">{icon}</span>
      {displayName}
    </div>
  );
}
