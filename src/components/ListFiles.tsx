import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $, Hooks } from 'src';
import { ensureExists, getStringProp, imageExtensions } from 'src/utils';
import { useRetainScroll, useStore } from '../hooks';

Router.useNavigationType;

import './ListFiles.css';
import { UnhandledCaseError } from '../utils';

export function ListFiles() {
  useRetainScroll();
  const path = Hooks.useSelector($.getPath);
  const activeFileDisplayPath = Hooks.useSelector($.getActiveFileDisplayPath);
  const dispatch = Hooks.useDispatch();
  const files = Hooks.useSelector($.getListFilesCache).get(path);
  const error = Hooks.useSelector($.getListFilesErrors).get(path);

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
    if (!files) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.listFiles(path));
    }
  }, [files]);

  // Create the initial files if needed.
  React.useEffect(() => {
    if (activeFileDisplayPath === '/' && files && files.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.createInitialFiles());
    }
  }, [activeFileDisplayPath, files]);

  const [filter, setFilter] = React.useState<string>('');

  if (!files) {
    if (error) {
      return (
        <div className="appViewError">
          <p>Unable to list the Dropbox files.</p>
          {error}
        </div>
      );
    }

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
  const visibleFiles = files.filter((entry) => entry.name[0] !== '.');

  return (
    <>
      <div className="listFiles" data-testid="list-files">
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

function CreateChordProButton(props: { path: string }) {
  type Phase = 'not-editing' | 'editing' | 'submitting';
  const dropbox = Hooks.useSelector($.getDropbox);
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
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          dispatch(A.listFiles(props.path));
          if ($.getHideEditor(getState())) {
            dispatch(A.hideEditor(false));
          }
          navigate('file' + (response.result.path_display ?? path));
        },
        (error) => {
          let err =
            getStringProp(error, 'message') ?? 'There was a Dropbox API error';
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
  const renameFile = Hooks.useSelector($.getRenameFile);

  const { name, path, type } = props.dropboxFile;
  const isFolder = type === 'folder';
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

  let link = null;
  if (isFolder) {
    link = `/folder${path}`;
  }

  if (isChordPro) {
    link = `/file${path}`;
  }

  if (isPDF) {
    link = `/pdf${path}`;
  }

  if (isImage) {
    link = `/image${path}`;
  }

  let fileDisplayName: React.ReactNode;
  if (renameFile.path === path) {
    link = null;
    fileDisplayName = (
      <RenameFile dropboxFile={props.dropboxFile} state={renameFile} />
    );
  } else {
    fileDisplayName = (
      <span className="listFileDisplayName">{displayName}</span>
    );
  }

  if (link) {
    return (
      <>
        <Router.Link className="listFilesFileLink" to={link}>
          <span className="listFilesIcon">{icon}</span>
          {fileDisplayName}
        </Router.Link>
        <FileMenu dropboxFile={props.dropboxFile} />
      </>
    );
  }

  return (
    <>
      <div className="listFilesFileEmpty">
        <span className="listFilesIcon">{icon}</span>
        {fileDisplayName}
      </div>
      <FileMenu dropboxFile={props.dropboxFile} />
    </>
  );
}

function RenameFile(props: {
  dropboxFile: T.FileMetadata | T.FolderMetadata;
  state: T.RenameFileState;
}) {
  const dispatch = Hooks.useDispatch();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const name = props.dropboxFile.name;
  function input() {
    return ensureExists(inputRef.current, 'Could not find input from ref.');
  }
  React.useEffect(() => {
    let length = name.length;
    const nameParts = name.split('.');
    if (nameParts.length > 1) {
      length = nameParts.slice(0, -1).join('.').length;
    }

    input().focus();
    input().setSelectionRange(0, length);
  }, []);

  function rename() {
    const { value } = input();
    if (!value.trim()) {
      // Only rename if there is a real value.
      return;
    }
    const fromPath = props.dropboxFile.path;

    const pathParts = fromPath.split('/');
    pathParts.pop();
    pathParts.push(value);
    const toPath = pathParts.join('/');

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    dispatch(A.moveFile(fromPath, toPath));
  }

  function cancel() {
    dispatch(A.stopRenameFile());
  }

  const disabled = props.state.phase === 'sending';

  return (
    <span className="listFileRename">
      <input
        className="listFileRenameInput"
        type="text"
        ref={inputRef}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancel();
          }
          if (event.key === 'Enter') {
            rename();
          }
        }}
        defaultValue={name}
      />
      <button
        type="button"
        className="button button-primary"
        onClick={rename}
        disabled={disabled}
      >
        Rename
      </button>
      <button
        type="button"
        className="button"
        onClick={cancel}
        disabled={disabled}
      >
        Cancel
      </button>
    </span>
  );
}

function FileMenu(props: { dropboxFile: T.FileMetadata | T.FolderMetadata }) {
  const dispatch = Hooks.useDispatch();
  const button = React.useRef<null | HTMLButtonElement>(null);

  return (
    <button
      type="button"
      aria-label="File Menu"
      className="listFilesFileMenu"
      ref={button}
      onClick={() => {
        dispatch(
          A.viewFileMenu({
            file: props.dropboxFile,
            element: ensureExists(button.current),
          }),
        );
      }}
    >
      <span className="listFilesFileMenuIcon" />
    </button>
  );
}
