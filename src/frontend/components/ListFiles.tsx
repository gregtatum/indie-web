import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $, $$, Hooks } from 'frontend';
import {
  debounce,
  ensureExists,
  getEnv,
  imageExtensions,
  isChordProExtension,
} from 'frontend/utils';
import { getFileStoreDisplayName } from 'frontend/logic/app-logic';

import './ListFiles.css';
import { Menu } from './Menus';
import { AddFileMenu } from './AddFileMenu';

export function ListFiles() {
  Hooks.useRetainScroll();
  const path = $$.getPath();
  const server = $$.getCurrentServerOrNull();
  const activeFileDisplayPath = $$.getActiveFileDisplayPath();
  const dispatch = Hooks.useDispatch();
  const files = $$.getSearchFilteredFiles();
  const error = $$.getListFilesErrors().get(path);
  const parsedSearch = $$.getParsedSearch();
  const fsName = $$.getCurrentFileStoreName();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const fileFocus = $$.getFileFocus()[path];
  const filesBackRef = React.useRef<null | HTMLAnchorElement>(null);
  const listFilesRef = React.useRef<null | HTMLDivElement>(null);
  const listFilesListRef = React.useRef<null | HTMLDivElement>(null);
  const focusIndex = files?.findIndex((file) => file.name === fileFocus) ?? -1;
  const [isFileMenuFocused, setFileMenuFocused] = React.useState(false);

  const parts = path.split('/');
  parts.pop();
  // The first part is always an empty string.
  let backPath = parts.join('/');
  if (!backPath) {
    backPath = '/';
  }
  Hooks.useUploadOnFileDrop(filesBackRef, backPath);
  Hooks.useUploadOnFileDrop(listFilesRef, path);

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

  // Any time the focused file changes, don't focus the file menu.
  React.useEffect(() => {
    setFileMenuFocused(false);
  }, [fileFocus]);

  const isFocused = true;

  useFileNavigation(
    isFocused,
    listFilesListRef,
    isFileMenuFocused,
    setFileMenuFocused,
  );

  if (!files) {
    if (error) {
      return (
        <div className="appViewError">
          <p>
            Unable to list the {getFileStoreDisplayName(fsName, server)} files.
          </p>
          {error}
        </div>
      );
    }

    return <ListFilesSkeleton />;
  }

  let parent = null;
  if (path !== '/') {
    const url = backPath === '/' ? '/' : `${fsSlug}/folder${backPath}`;

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

  let listFilesListClassName = 'listFilesList';
  if (isFileMenuFocused) {
    listFilesListClassName += ' file-menu-focused';
  }

  return (
    <>
      <div className="listFiles" data-testid="list-files" ref={listFilesRef}>
        <div className="listFilesFilter">
          {parent}
          <Search />
        </div>
        <div
          className={listFilesListClassName}
          role="listbox"
          tabIndex={0}
          aria-activedescendant={focusIndex === -1 ? '' : `file-${focusIndex}`}
          ref={listFilesListRef}
        >
          {files.map((file, fileIndex) => {
            return (
              <File
                key={file.id}
                file={file}
                fileFocus={fileFocus}
                index={fileIndex}
              />
            );
          })}
        </div>
        <div className="listFilesFooter">
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
  index: number;
  fileFocus: string | undefined;
  hideExtension?: boolean;
  linkOverride?: string;
}

export function File(props: FileProps) {
  const { name, path, type } = props.file;
  const renameFile = $$.getRenameFile();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const divRef = React.useRef<null | HTMLDivElement>(null);
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
  const isPDF = !isFolder && extension === 'pdf';
  const isImage = !isFolder && imageExtensions.has(extension);
  const isMarkdown = !isFolder && extension === 'md';
  const isLanguageCoach = isFolder && extension === 'coach';

  // https://www.svgrepo.com/collection/dazzle-line-icons/
  let icon = '/svg/file.svg';
  let iconClassName = 'listFilesIcon';
  if (isFolder) {
    icon = '/svg/folder.svg';
    if (!isLanguageCoach) {
      iconClassName += ' listFilesFolder';
    }
  } else if (isChordPro) {
    icon = '/svg/music.svg';
  }

  let link = null;
  if (isFolder) {
    link = `/${fsSlug}/folder${path}`;
  }

  if (isChordPro) {
    link = `/${fsSlug}/file${path}`;
  }

  if (isPDF) {
    link = `/${fsSlug}/pdf${path}`;
  }

  if (isImage) {
    link = `/${fsSlug}/image${path}`;
    icon = '/svg/image-square.svg';
  }

  if (isMarkdown) {
    link = `/${fsSlug}/md${path}`;
    icon = '/svg/file-alt.svg';
  }

  if (isLanguageCoach) {
    link = `/${fsSlug}/language-coach${path}`;
    icon = '/svg/translate.svg';
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

  let className = 'listFilesFile';
  if (props.fileFocus === name) {
    className += ' selected';
  }

  const id = 'file-' + props.index;

  if (link) {
    return (
      <div className={className} ref={divRef} id={id}>
        <Router.Link
          className="listFilesFileLink"
          to={link}
          // Drag/drop events can read this:
          data-file-path={path}
          tabIndex={-1}
        >
          <span className={iconClassName}>
            <img src={icon} />
          </span>
          {fileDisplayName}
        </Router.Link>
        <FileMenu tabIndex={-1} file={props.file} />
      </div>
    );
  }

  return (
    <div className={className} ref={divRef} id={id}>
      <a
        href=""
        className="listFilesFileEmpty"
        // Drag/drop events can read this:
        data-file-path={path}
        onClick={(event) => void event.preventDefault()}
        tabIndex={-1}
      >
        <span className={iconClassName}>
          <img src={icon} />
        </span>
        {fileDisplayName}
      </a>
      <FileMenu tabIndex={-1} file={props.file} />
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

function FileMenu(props: {
  file: T.FileMetadata | T.FolderMetadata;
  tabIndex?: number;
}) {
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
        tabIndex={props.tabIndex}
        ref={button}
        onFocus={() => {
          // If the button is manually focused, put it back on the list element.
          button.current?.closest<HTMLElement>('.listFilesList')?.focus();
        }}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        <span className="listFilesFileMenuIcon" />
      </button>
      {Hooks.overlayPortal(
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

function useFileNavigation(
  isFocused: boolean,
  listFilesRef: React.MutableRefObject<HTMLDivElement | null>,
  isFileMenuFocused: boolean,
  setFileMenuFocused: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const { getState, dispatch } = Hooks.useStore();

  return React.useEffect(() => {
    if (!isFocused) {
      return () => {};
    }
    function handleKeyDown(event: KeyboardEvent) {
      const state = getState();
      const path = $.getPath(state);
      const fileFocus: string | null = $.getFileFocus(state)[path] ?? null;
      const files = $.getSearchFilteredFiles(state);
      const index = files?.findIndex((file) => file.name === fileFocus) ?? -1;

      if (!files) {
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (document.activeElement === document.body) {
          if (listFilesRef.current) {
            listFilesRef.current.focus();
          }
        }
      }

      const changeFileFocus = (nextFile: string) => {
        if (nextFile !== fileFocus) {
          dispatch(A.changeFileFocus(path, nextFile));
        }
      };

      if (document.activeElement !== listFilesRef.current) {
        return;
      }

      switch (event.key) {
        case 'ArrowUp': {
          event.preventDefault();
          if (!fileFocus) {
            if (!files.length) {
              break;
            }
            changeFileFocus(files[files.length - 1].name);
            break;
          }
          if (index === -1) {
            throw new Error('Unexpected index.');
          }
          changeFileFocus(files[Math.max(0, index - 1)].name);
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          if (!fileFocus) {
            if (!files.length) {
              break;
            }
            changeFileFocus(files[0].name);
            break;
          }
          if (index === -1) {
            throw new Error('Unexpected index.');
          }
          changeFileFocus(files[Math.min(files.length - 1, index + 1)].name);
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
          setFileMenuFocused((value) => !value);
          break;
        case 'Enter': {
          event.preventDefault();

          if (isFileMenuFocused) {
            const link: HTMLAnchorElement | undefined | null =
              listFilesRef.current?.querySelector(
                `#file-${index} .listFilesFileMenu`,
              );
            link?.click();
          } else {
            if (fileFocus) {
              const link: HTMLAnchorElement | undefined | null =
                listFilesRef.current?.querySelector(
                  `#file-${index} .listFilesFileLink`,
                );
              link?.click();
            }
          }
          break;
        }
        case 'Escape':
          event.preventDefault();
          listFilesRef.current?.blur();
          setFileMenuFocused((value) => !value);
          break;
        default:
          break;
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused, isFileMenuFocused, listFilesRef]);
}
