import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $, Hooks } from 'src';
import { debounce, ensureExists, getEnv, imageExtensions } from 'src/utils';
import { useRetainScroll, useStore } from '../hooks';
import { UnhandledCaseError, isChordProExtension } from '../utils';
import { FileSystemError } from 'src/logic/file-system';
import { getFileSystemDisplayName } from 'src/logic/app-logic';

import './ListFiles.css';
import { Menu, menuPortal } from './Menus';

export function ListFiles() {
  useRetainScroll();
  const path = Hooks.useSelector($.getPath);
  const activeFileDisplayPath = Hooks.useSelector($.getActiveFileDisplayPath);
  const dispatch = Hooks.useDispatch();
  const files = Hooks.useSelector($.getSearchFilteredFiles);
  const error = Hooks.useSelector($.getListFilesErrors).get(path);
  const parsedSearch = Hooks.useSelector($.getParsedSearch);
  const fileSystemName = Hooks.useSelector($.getCurrentFileSystemName);

  React.useEffect(() => {
    if (path === '/') {
      document.title = getEnv('SITE_DISPLAY_NAME');
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
    if (
      activeFileDisplayPath === '/' &&
      files &&
      files.length === 0 &&
      !parsedSearch
    ) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      dispatch(A.createInitialFiles());
    }
  }, [activeFileDisplayPath, files]);

  if (!files) {
    if (error) {
      return (
        <div className="appViewError">
          <p>
            Unable to list the {getFileSystemDisplayName(fileSystemName)} files.
          </p>
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

  return (
    <>
      <div className="listFiles" data-testid="list-files">
        <div className="listFilesFilter">
          {parent}
          <Search />
        </div>
        <div className="listFilesList">
          {files.map((file) => {
            return (
              <div key={file.id} className="listFilesFile">
                <File dropboxFile={file} />
              </div>
            );
          })}
          <CreateFileButton
            path={path}
            slug="file"
            extension="chopro"
            getDefaultContents={choproDefaultContents}
          >
            Create ChordPro File
          </CreateFileButton>
          <CreateFileButton
            path={path}
            slug="md"
            extension="md"
            getDefaultContents={markdownDefaultContents}
          >
            Create Markdown File
          </CreateFileButton>
        </div>
      </div>
    </>
  );
}

function choproDefaultContents(fileName: string): string {
  const title = fileName.replace(/\.chopro$/, '');
  let contents = `{title: ${title}}\n{subtitle: Unknown}`;
  const match = /^(.*) - (.*).*$/.exec(title);
  if (match) {
    contents = `{title: ${match[1]}}\n{subtitle: ${match[2]}}`;
  }
  return contents;
}

function markdownDefaultContents(fileName: string): string {
  const title = fileName.replace(/\.md$/, '');
  return `# ${title}\n`;
}

function CreateFileButton(props: {
  path: string;
  slug: string;
  extension: string;
  getDefaultContents: (fileName: string) => string;
  children: any;
}) {
  type Phase = 'not-editing' | 'editing' | 'submitting';
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const fsName = Hooks.useSelector($.getCurrentFileSystemName);
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

    setPhase('submitting');
    fileSystem
      .saveText(path, 'add', props.getDefaultContents(inputEl.value))
      .then(
        (fileMetadata) => {
          // The directory listing is now stale, fetch it again.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          dispatch(A.listFiles(props.path));
          if ($.getHideEditor(getState())) {
            dispatch(A.hideEditor(false));
          }
          navigate(`${fsName}/${props.slug}${fileMetadata.path}`);
        },
        (error: FileSystemError) => {
          let err = error.toString();
          if (error.status() === 409) {
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
            defaultValue={'.' + props.extension}
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
      {props.children}
    </button>
  );
}

function File(props: { dropboxFile: T.FileMetadata | T.FolderMetadata }) {
  const renameFile = Hooks.useSelector($.getRenameFile);
  const fsName = Hooks.useSelector($.getCurrentFileSystemName);

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
  const isChordPro = !isFolder && isChordProExtension(extension);
  const isPDF = !isFolder && extension === 'pdf';
  const isImage = !isFolder && imageExtensions.has(extension);
  const isMarkdown = !isFolder && extension === 'md';

  let icon = '📄';
  if (isFolder) {
    icon = '📁';
  } else if (isChordPro) {
    icon = '🎵';
  }

  let link = null;
  if (isFolder) {
    link = `/${fsName}/folder${path}`;
  }

  if (isChordPro) {
    link = `/${fsName}/file${path}`;
  }

  if (isPDF) {
    link = `/${fsName}/pdf${path}`;
  }

  if (isImage) {
    link = `/${fsName}/image${path}`;
  }

  if (isMarkdown) {
    link = `/${fsName}/md${path}`;
    icon = '📕';
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
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const file = props.dropboxFile;

  return (
    <>
      <button
        type="button"
        aria-label="File Menu"
        className="listFilesFileMenu"
        ref={button}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        <span className="listFilesFileMenuIcon" />
      </button>
      {menuPortal(
        <Menu
          clickedElement={button}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          buttons={[
            {
              key: 'Rename',
              children: (
                <>
                  <span className="icon" data-icon="pencil-fill" /> Rename
                </>
              ),
              onClick() {
                dispatch(A.startRenameFile(file.path));
              },
            },
            // {
            //   // TODO
            //   key: 'Move',
            //   onClick() {},
            //   text: (<><span className="icon" data-icon="box-arrow-in-right" /> Move</>)
            // },
            {
              key: 'Delete',
              onClick() {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                dispatch(A.deleteFile(file));
              },
              children: (
                <>
                  <span className="icon" data-icon="trash-fill" /> Delete{' '}
                  {file.type === 'file' ? 'File' : 'Folder'}
                </>
              ),
            },
            file.type === 'file'
              ? {
                  key: 'Download',
                  onClick() {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    dispatch(A.downloadFileForUser(file));
                  },
                  children: (
                    <>
                      <span className="icon" data-icon="download" /> Download
                    </>
                  ),
                }
              : {
                  key: 'Download',
                  onClick() {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    dispatch(A.downloadFolderForUser(file));
                  },
                  children: (
                    <>
                      <span className="icon" data-icon="download" /> Download
                      Zip
                    </>
                  ),
                },
          ]}
        />,
      )}
    </>
  );
}

function Search() {
  const dispatch = Hooks.useDispatch();
  const searchString = Hooks.useSelector($.getSearchString);
  const wait = 100;

  const onChange = React.useMemo(() => {
    return debounce((event: React.ChangeEvent<HTMLInputElement>) => {
      dispatch(A.setSearchString(event.target.value.toLowerCase()));
    }, wait);
  }, []);

  return (
    <input
      className="listFilesFilterInput"
      type="text"
      defaultValue={searchString}
      placeholder="Search"
      onChange={onChange}
    />
  );
}
