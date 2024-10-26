import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $$, Hooks } from 'src';
import { debounce, ensureExists, getEnv, imageExtensions } from 'src/utils';
import { overlayPortal, useRetainScroll } from '../hooks';
import { isChordProExtension } from '../utils';
import { getFileSystemDisplayName } from 'src/logic/app-logic';

import './ListFiles.css';
import { Menu } from './Menus';
import { AddFileMenu } from './AddFileMenu';

export function ListFiles() {
  useRetainScroll();
  const path = $$.getPath();
  const activeFileDisplayPath = $$.getActiveFileDisplayPath();
  const dispatch = Hooks.useDispatch();
  const files = $$.getSearchFilteredFiles();
  const error = $$.getListFilesErrors().get(path);
  const parsedSearch = $$.getParsedSearch();
  const fileSystemName = $$.getCurrentFileSystemName();
  const filesBackRef = React.useRef<null | HTMLAnchorElement>(null);

  const parts = path.split('/');
  parts.pop();
  // The first part is always an empty string.
  const backPath = parts.join('/');
  Hooks.useUploadOnFileDrop(filesBackRef, backPath);

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
      void dispatch(A.listFiles(path));
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
      void dispatch(A.createInitialFiles());
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

    return <ListFilesSkeleton />;
  }

  let parent = null;
  if (path !== '/') {
    const url = backPath === '/' ? '/' : `${fileSystemName}/folder${backPath}`;

    parent = (
      <Router.Link
        className="listFilesBack"
        to={url}
        aria-label="Back"
        ref={filesBackRef}
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
            return <File key={file.id} file={file} />;
          })}
          <AddFileMenu path={path} />
        </div>
      </div>
    </>
  );
}

export function ListFilesSkeleton() {
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

interface FileProps {
  file: T.FileMetadata | T.FolderMetadata;
  hideExtension?: boolean;
  linkOverride?: string;
}

export function File(props: FileProps) {
  const renameFile = $$.getRenameFile();
  const fsName = $$.getCurrentFileSystemName();
  const divRef = React.useRef<null | HTMLDivElement>(null);
  const { name, path, type } = props.file;
  const isFolder = type === 'folder';
  const nameParts = name.split('.');
  const extension =
    nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
  let displayName: React.ReactNode = name;

  if (isFolder) {
    Hooks.useUploadOnFileDrop(divRef, path);
  }

  if (extension) {
    if (props.hideExtension) {
      displayName = nameParts.slice(0, -1).join('.');
    } else {
      displayName = (
        <>
          {nameParts.slice(0, -1).join('.')}.
          <span className="listFilesExtension">
            {nameParts[nameParts.length - 1]}
          </span>
        </>
      );
    }
  }
  const isChordPro = !isFolder && isChordProExtension(extension);
  const isVexTab = !isFolder && extension === 'vextab';
  const isPDF = !isFolder && extension === 'pdf';
  const isImage = !isFolder && imageExtensions.has(extension);
  const isMarkdown = !isFolder && extension === 'md';
  const isLanguageCoach = isFolder && extension === 'coach';

  let icon = '📄';
  if (isFolder) {
    icon = '📁';
  } else if (isChordPro || isVexTab) {
    icon = '🎵';
  }

  let link = null;
  if (isFolder) {
    link = `/${fsName}/folder${path}`;
  }

  if (isChordPro) {
    link = `/${fsName}/file${path}`;
  }

  if (isVexTab) {
    link = `/${fsName}/vextab${path}`;
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

  if (isLanguageCoach) {
    link = `/${fsName}/language-coach${path}`;
    icon = '🧳';
  }

  if (props.linkOverride) {
    link = props.linkOverride;
  }

  let fileDisplayName: React.ReactNode;
  if (renameFile.path === path) {
    link = null;
    fileDisplayName = <RenameFile file={props.file} state={renameFile} />;
  } else {
    fileDisplayName = (
      <span className="listFileDisplayName">{displayName}</span>
    );
  }

  if (link) {
    return (
      <div className="listFilesFile" ref={divRef}>
        <Router.Link
          className="listFilesFileLink"
          to={link}
          // Drag/drop events can read this:
          data-file-path={path}
        >
          <span className="listFilesIcon">{icon}</span>
          {fileDisplayName}
        </Router.Link>
        <FileMenu file={props.file} />
      </div>
    );
  }

  return (
    <div className="listFilesFile" ref={divRef}>
      <a
        href=""
        className="listFilesFileEmpty"
        // Drag/drop events can read this:
        data-file-path={path}
        onClick={(event) => void event.preventDefault()}
      >
        <span className="listFilesIcon">{icon}</span>
        {fileDisplayName}
      </a>
      <FileMenu file={props.file} />
    </div>
  );
}

function RenameFile(props: {
  file: T.FileMetadata | T.FolderMetadata;
  state: T.RenameFileState;
}) {
  const dispatch = Hooks.useDispatch();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const name = props.file.name;
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
    const fromPath = props.file.path;

    const pathParts = fromPath.split('/');
    pathParts.pop();
    pathParts.push(value);
    const toPath = pathParts.join('/');

    void dispatch(A.moveFile(fromPath, toPath));
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

function FileMenu(props: { file: T.FileMetadata | T.FolderMetadata }) {
  const dispatch = Hooks.useDispatch();
  const button = React.useRef<null | HTMLButtonElement>(null);
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const file = props.file;

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
      {overlayPortal(
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
                void dispatch(A.deleteFile(file));
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
                    void dispatch(A.downloadFileForUser(file));
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
                    void dispatch(A.downloadFolderForUser(file));
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
  const searchString = $$.getSearchString();
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
