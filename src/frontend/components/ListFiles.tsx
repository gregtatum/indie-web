import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $, $$, Hooks } from 'frontend';
import {
  debounce,
  ensureElementIsInView,
  ensureExists,
  getDirName,
  getEnv,
  getKeyboardString,
  getPathFileName,
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
  const listFilesCache = $$.getListFilesCache();
  const parsedSearch = $$.getParsedSearch();
  const fsName = $$.getCurrentFileStoreName();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const fileFocus = $$.getFileFocus();
  const focusIndex = $$.getFileFocusIndex();
  const fileSelection = $$.getFileSelection();
  const fileSelectionSet = $$.getFileSelectionSet();

  const filesBackRef = React.useRef<null | HTMLAnchorElement>(null);
  const listFilesRef = React.useRef<null | HTMLDivElement>(null);
  const listFilesListRef = React.useRef<null | HTMLDivElement>(null);
  const [isFileMenuFocused, setFileMenuFocused] = React.useState(false);
  const selectionAnchorRef = React.useRef<string | null>(null);
  const pointerTypeRef = React.useRef<string | undefined>(undefined);

  const parts = path.split('/');
  parts.pop();
  // The first part is always an empty string.
  let backPath = parts.join('/');
  if (!backPath) {
    backPath = '/';
  }
  Hooks.useUploadOnFileDrop(filesBackRef, backPath);
  Hooks.useUploadOnFileDrop(listFilesRef, path);
  const cachedFolderListing = Hooks.useCachedFolderListing();

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
      !parsedSearch &&
      listFilesCache.get(path)?.isCache === false
    ) {
      void dispatch(A.createInitialFiles());
    }
  }, [activeFileDisplayPath, files, listFilesCache, path, parsedSearch]);

  // Any time the focused file changes, don't focus the file menu.
  React.useEffect(() => {
    setFileMenuFocused(false);
  }, [fileFocus]);

  const isFocused = true;

  function handleFileSelectClick(name: string, event: React.MouseEvent) {
    if (!files) {
      return;
    }
    listFilesListRef.current?.focus({ preventScroll: true });
    if (event.metaKey || event.ctrlKey) {
      // A plain arrow-key move only updates fileFocus and leaves fileSelection
      // empty (see the ArrowUp/ArrowDown cases below), so fall back to treating
      // the focused file as the current selection, matching how it's rendered
      // as selected (see the `isSelected` computation below).
      let currentSelection = fileSelection;
      if (currentSelection.length === 0 && fileFocus) {
        currentSelection = [fileFocus];
      }
      const isSelected = currentSelection.includes(name);
      const next = isSelected
        ? currentSelection.filter((selected) => selected !== name)
        : [...currentSelection, name];
      if (!isSelected) {
        selectionAnchorRef.current = name;
      }
      dispatch(A.setFileSelection(path, next));
      return;
    }
    if (event.shiftKey) {
      const anchor = selectionAnchorRef.current ?? fileFocus ?? name;
      const anchorIndex = files.findIndex((file) => file.name === anchor);
      const targetIndex = files.findIndex((file) => file.name === name);
      if (anchorIndex === -1 || targetIndex === -1) {
        selectionAnchorRef.current = name;
        dispatch(A.setFileSelection(path, [name]));
        return;
      }
      selectionAnchorRef.current = anchor;
      const [start, end] =
        anchorIndex <= targetIndex
          ? [anchorIndex, targetIndex]
          : [targetIndex, anchorIndex];
      dispatch(
        A.setFileSelection(
          path,
          files.slice(start, end + 1).map((file) => file.name),
        ),
      );
      return;
    }
    // A plain click selects just this file.
    selectionAnchorRef.current = name;
    dispatch(A.changeFileFocus(path, name));
    dispatch(A.setFileSelection(path, [name]));
  }

  useFileNavigation(
    isFocused,
    listFilesListRef,
    isFileMenuFocused,
    setFileMenuFocused,
    selectionAnchorRef,
    pointerTypeRef,
  );

  Hooks.useTypeAheadSearch(
    listFilesListRef,
    files ? files.map((file) => file.name) : [],
    (name) => {
      dispatch(A.changeFileFocus(path, name));
    },
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
    let url: string;
    if (backPath === '/') {
      if (server?.storeType === 'music') {
        url = `/${fsSlug}/music?view=files`;
      } else {
        url = '/';
      }
    } else {
      url = `${fsSlug}/folder${backPath}`;
    }

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
          aria-multiselectable="true"
          tabIndex={0}
          aria-activedescendant={focusIndex === -1 ? '' : `file-${focusIndex}`}
          ref={listFilesListRef}
          onPointerDown={(event) => {
            pointerTypeRef.current = event.pointerType;
          }}
          onClick={(event) => {
            if (
              event.target !== event.currentTarget ||
              pointerTypeRef.current !== 'mouse'
            ) {
              return;
            }
            // Dismiss the file selection.
            selectionAnchorRef.current = null;
            if (fileSelection.length) {
              dispatch(A.setFileSelection(path, []));
            }
            if (fileFocus) {
              dispatch(A.changeFileFocus(path, ''));
            }
          }}
        >
          {files.map((file, fileIndex) => {
            const isSelected =
              fileSelectionSet.size > 0
                ? fileSelectionSet.has(file.name)
                : fileFocus === file.name;
            return (
              <File
                key={file.id}
                file={file}
                fileFocus={fileFocus}
                isCached={cachedFolderListing.has(file.path)}
                index={fileIndex}
                isSelected={isSelected}
                onSelectClick={handleFileSelectClick}
                pointerTypeRef={pointerTypeRef}
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
  fileFocus: string | undefined | null;
  isCached: boolean;
  hideExtension?: boolean;
  linkOverride?: string;
  isSelected?: boolean;
  onSelectClick?: (name: string, event: React.MouseEvent) => void;
  pointerTypeRef?: React.MutableRefObject<string | undefined>;
}

/**
 * Helper function to ensure the element is in view with appropriate offets.
 */
function keepFileInView(div: HTMLElement) {
  // In tests set an arbitrary header height since the style won't necessarily have
  // been applied.
  let headerHeight = 50;
  if (process.env.NODE_ENV !== 'test') {
    const headerHeightString =
      getComputedStyle(div).getPropertyValue('--header-height');
    headerHeight = Number(headerHeightString.trim().replace('px', ''));
    if (!(headerHeight > 0)) {
      throw new Error('Failed to parse header height: ' + headerHeightString);
    }
  }

  const { height } = div.getBoundingClientRect();
  ensureElementIsInView(div, {
    topOffset: headerHeight + height,
    bottomOffset: height,
  });
}

export function File(props: FileProps) {
  const { fileFocus, file, isCached } = props;
  const { name, path, type } = file;
  const renameFile = $$.getRenameFile();
  const fsSlug = $$.getCurrentFileStoreSlug();
  const navigate = Router.useNavigate();
  const divRef = React.useRef<null | HTMLDivElement>(null);
  const fileMenuRef = React.useRef<FileMenuHandle>(null);
  const isFolder = type === 'folder';
  const nameParts = name.split('.');
  const extension =
    nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
  let displayName: React.ReactNode = name;

  // Ensure the element is in view when navigating by keyboard.
  React.useEffect(() => {
    const div = divRef.current;
    if (fileFocus === name && div) {
      keepFileInView(div);
    }
  }, [fileFocus, name]);

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
  let title: string | undefined;

  // https://www.svgrepo.com/collection/dazzle-line-icons/
  let icon = '/svg/file.svg';
  let iconClassName = 'listFilesIcon';
  if (isCached) {
    iconClassName += ' listFilesIconCached';
    title = 'Available Offline';
  }
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
  const ariaSelected = props.isSelected ?? props.fileFocus === name;
  if (ariaSelected) {
    className += ' selected';
  }

  const id = 'file-' + props.index;

  // Disambiguate Desktop-behavior for file navigation, and Tablet/touch navigation.
  const isDesktopMouseClick = () => props.pointerTypeRef?.current === 'mouse';

  const handleLinkClick = (event: React.MouseEvent) => {
    if (!props.onSelectClick || !isDesktopMouseClick()) {
      return;
    }
    event.preventDefault();
    if (event.detail >= 2) {
      if (link) {
        navigate(link);
      }
      return;
    }
    props.onSelectClick(name, event);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (renameFile.path === path) {
      // Don't interfere with the in-progress rename input.
      return;
    }
    event.preventDefault();
    if (!props.isSelected && props.onSelectClick) {
      props.onSelectClick(name, event);
    }
    fileMenuRef.current?.open({ x: event.clientX, y: event.clientY });
  };

  const handleEmptyLinkClick = (event: React.MouseEvent) => {
    event.preventDefault();
    if (
      renameFile.path === path ||
      !props.onSelectClick ||
      !isDesktopMouseClick() ||
      event.detail >= 2
    ) {
      // Not a single desktop mouse click to select, or this row's rename
      // input/buttons (rendered inside this same anchor) should handle
      // their own clicks without our selection logic stealing focus.
      return;
    }
    props.onSelectClick(name, event);
  };

  if (link) {
    return (
      <div
        className={className}
        ref={divRef}
        id={id}
        aria-selected={ariaSelected}
        role="option"
        onContextMenu={handleContextMenu}
      >
        <Router.Link
          className="listFilesFileLink"
          to={link}
          onClick={handleLinkClick}
          // Drag/drop events can read this:
          data-file-path={path}
          tabIndex={-1}
        >
          <span className={iconClassName} title={title}>
            <img src={icon} />
          </span>
          {fileDisplayName}
        </Router.Link>
        <FileMenu ref={fileMenuRef} tabIndex={-1} file={props.file} />
      </div>
    );
  }

  return (
    <div
      className={className}
      ref={divRef}
      id={id}
      onContextMenu={handleContextMenu}
    >
      <a
        href=""
        className="listFilesFileEmpty"
        // Drag/drop events can read this:
        data-file-path={path}
        onClick={handleEmptyLinkClick}
        tabIndex={-1}
      >
        <span className={iconClassName}>
          <img src={icon} />
        </span>
        {fileDisplayName}
      </a>
      <FileMenu ref={fileMenuRef} tabIndex={-1} file={props.file} />
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
  const fileSelection = $$.getFileSelection();
  const files = $$.getSearchFilteredFiles();
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
    const newName = value.trim();
    if (!newName) {
      // Only rename if there is a real value.
      return;
    }

    // If this file is part of a multi-selection, rename the other selected
    // files at the same time, Windows Explorer-style (see A.renameFiles).
    const isMultiSelected =
      fileSelection.length > 1 && fileSelection.includes(name);
    const siblingFiles = isMultiSelected
      ? (files ?? []).filter(
          (entry) =>
            fileSelection.includes(entry.name) &&
            entry.path !== props.file.path,
        )
      : [];

    void dispatch(A.renameFiles(props.file, newName, siblingFiles));
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

interface FileMenuHandle {
  open(anchorPoint: { x: number; y: number }): void;
}

const FileMenu = React.forwardRef<
  FileMenuHandle,
  {
    file: T.FileMetadata | T.FolderMetadata;
    tabIndex?: number;
  }
>(function FileMenu(props, ref) {
  const dispatch = Hooks.useDispatch();
  const button = React.useRef<null | HTMLButtonElement>(null);
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const [anchorPoint, setAnchorPoint] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const file = props.file;
  const fileSelection = $$.getFileSelection();
  const files = $$.getSearchFilteredFiles();

  const isMultiSelected =
    fileSelection.length > 1 && fileSelection.includes(file.name);
  const selectedFiles = isMultiSelected
    ? (files ?? []).filter((entry) => fileSelection.includes(entry.name))
    : [file];

  React.useImperativeHandle(ref, () => ({
    open(point) {
      setAnchorPoint(point);
      setOpenGeneration((generation) => generation + 1);
      // Use a non-zero detail so the menu focuses itself like a mouse open,
      // rather than moving focus to the first button as keyboard opens do.
      setOpenEventDetail(1);
    },
  }));

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
          setAnchorPoint(null);
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
          anchorPoint={anchorPoint}
          buttons={[
            {
              key: 'Rename',
              children: isMultiSelected ? (
                <>
                  <span className="icon" data-icon="pencil-fill" /> Rename{' '}
                  {selectedFiles.length} Items
                </>
              ) : (
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
                void dispatch(A.deleteFiles(selectedFiles));
              },
              children: isMultiSelected ? (
                <>
                  <span className="icon" data-icon="trash-fill" /> Delete{' '}
                  {selectedFiles.length} Items
                </>
              ) : (
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
});

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
  selectionAnchorRef: React.MutableRefObject<string | null>,
  pointerTypeRef: React.MutableRefObject<string | undefined>,
) {
  const { getState, dispatch } = Hooks.useStore();
  const navigate = Router.useNavigate();

  return React.useEffect(() => {
    if (!isFocused) {
      return () => {};
    }
    function handleKeyDown(event: KeyboardEvent) {
      const state = getState();
      const path = $.getPath(state);
      const fileFocus: string | null = $.getFileFocus(state);
      const files = $.getSearchFilteredFiles(state);
      const fileFocusIndex = $.getFileFocusIndex(state);
      const fileSelection = $.getFileSelection(state);
      const key = getKeyboardString(event);

      // The file is considered focused if the active element is the document body
      // or if the current list files ref is the active element.
      const isFileFocused =
        document.activeElement === document.body ||
        document.activeElement === listFilesRef.current;

      if (!isFileFocused) {
        // The keyboard handler ran, but the list files element wasn't focused,
        // so there is no reason to run the event handlers.
        return;
      }

      // Actions to perform even if there are no files.
      switch (key) {
        case 'Meta+ArrowUp':
        case 'Alt+ArrowUp': {
          event.preventDefault();
          if (path === '/') {
            return;
          }
          const parentPath = getDirName(path);
          const folderName = getPathFileName(path);
          const fsSlug = $.getCurrentFileStoreSlug(state);
          dispatch(A.changeFileFocus(parentPath, folderName));
          dispatch(A.setFileSelection(parentPath, [folderName]));
          navigate(`/${fsSlug}/folder${parentPath}`);
          return;
        }
        default:
        // Do nothing.
      }

      if (!files) {
        // There are no files, so don't perform any navigation.
        return;
      }

      const ensureElementFocus = () => {
        if (document.activeElement === document.body) {
          if (listFilesRef.current) {
            listFilesRef.current.focus();
          }
        }
      };

      const changeFileFocus = (nextFile: string) => {
        if (nextFile !== fileFocus) {
          dispatch(A.changeFileFocus(path, nextFile));
        }
      };

      const openFile = () => {
        if (fileFocus) {
          const link: HTMLAnchorElement | undefined | null =
            listFilesRef.current?.querySelector(
              `#file-${fileFocusIndex} .listFilesFileLink`,
            );
          // This click is programmatic, not from a real pointer, so clear
          // the last pointer type to make sure it's treated as an open
          // rather than a desktop mouse click (which would only select).
          pointerTypeRef.current = undefined;
          link?.click();
        }
      };

      const setSelectionRange = (targetName: string) => {
        const anchor = selectionAnchorRef.current ?? fileFocus ?? targetName;
        const anchorIndex = files.findIndex((file) => file.name === anchor);
        const targetIndex = files.findIndex((file) => file.name === targetName);
        if (anchorIndex === -1 || targetIndex === -1) {
          selectionAnchorRef.current = targetName;
          dispatch(A.setFileSelection(path, [targetName]));
          return;
        }
        selectionAnchorRef.current = anchor;
        const [start, end] =
          anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
        dispatch(
          A.setFileSelection(
            path,
            files.slice(start, end + 1).map((file) => file.name),
          ),
        );
      };

      const clearSelection = () => {
        selectionAnchorRef.current = null;
        if (fileSelection.length) {
          dispatch(A.setFileSelection(path, []));
        }
      };

      const getSelectedFiles = () => {
        let selectionNames = fileSelection;
        if (selectionNames.length === 0) {
          selectionNames = fileFocus ? [fileFocus] : [];
        }
        return files.filter((file) => selectionNames.includes(file.name));
      };

      const getSelectedPaths = () =>
        getSelectedFiles().map((file) => file.path);

      switch (key) {
        case 'ArrowUp':
        case 'Shift+ArrowUp': {
          event.preventDefault();
          ensureElementFocus();
          if (!files.length) {
            break;
          }
          const nextFocus = fileFocus
            ? files[Math.max(0, fileFocusIndex - 1)].name
            : files[files.length - 1].name;
          changeFileFocus(nextFocus);
          if (key === 'Shift+ArrowUp') {
            setSelectionRange(nextFocus);
          } else {
            clearSelection();
          }
          break;
        }
        case 'ArrowDown':
        case 'Shift+ArrowDown': {
          event.preventDefault();
          ensureElementFocus();
          if (!files.length) {
            break;
          }
          const nextFocus = fileFocus
            ? files[Math.min(files.length - 1, fileFocusIndex + 1)].name
            : files[0].name;
          changeFileFocus(nextFocus);
          if (key === 'Shift+ArrowDown') {
            setSelectionRange(nextFocus);
          } else {
            clearSelection();
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight':
          ensureElementFocus();
          setFileMenuFocused((value) => !value);
          break;
        case 'Enter': {
          event.preventDefault();
          ensureElementFocus();

          if (isFileMenuFocused) {
            const link: HTMLAnchorElement | undefined | null =
              listFilesRef.current?.querySelector(
                `#file-${fileFocusIndex} .listFilesFileMenu`,
              );
            link?.click();
          } else {
            openFile();
          }
          break;
        }
        case 'Meta+ArrowDown': {
          ensureElementFocus();
          openFile();
          break;
        }
        case 'Meta+C':
        case 'Control+C': {
          const selectedPaths = getSelectedPaths();
          if (selectedPaths.length) {
            event.preventDefault();
            dispatch(A.setCopyFile(selectedPaths, false));
          }
          break;
        }
        case 'Meta+X':
        case 'Control+X': {
          const selectedPaths = getSelectedPaths();
          if (selectedPaths.length) {
            event.preventDefault();
            dispatch(A.setCopyFile(selectedPaths, true));
          }
          break;
        }
        case 'F2': {
          const selectedFiles = getSelectedFiles();
          if (selectedFiles.length) {
            event.preventDefault();
            const primary =
              selectedFiles.find((file) => file.name === fileFocus) ??
              selectedFiles[0];
            dispatch(A.startRenameFile(primary.path));
          }
          break;
        }
        case 'Meta+Backspace':
        case 'Meta+Delete':
        case 'Delete': {
          const selectedFiles = getSelectedFiles();
          if (selectedFiles.length) {
            event.preventDefault();
            void dispatch(A.deleteFiles(selectedFiles));
          }
          break;
        }
        case 'Meta+V':
        case 'Control+V': {
          const clipboard = $.getCopyFile(state);
          if (clipboard) {
            event.preventDefault();
            ensureElementFocus();
            void dispatch(A.pasteCopyFile(path, clipboard));
          }
          break;
        }
        case 'Meta+Alt+V':
        case 'Meta+Alt+√': {
          // Handle the macOS-specific pasting of files. The "Meta+Alt+√" is a little
          // weird, but I'm lazy and that's how the event is represented when option
          // is pressed on an English keyboard.
          const clipboard = $.getCopyFile(state);
          if (clipboard) {
            event.preventDefault();
            ensureElementFocus();
            void dispatch(
              A.pasteCopyFile(path, { paths: clipboard.paths, isCut: true }),
            );
          }
          break;
        }
        case 'Escape':
          // Blur the focus.
          event.preventDefault();
          ensureElementFocus();
          listFilesRef.current?.blur();
          setFileMenuFocused((value) => !value);
          clearSelection();
          break;
        default:
          break;
      }
    }
    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isFocused,
    isFileMenuFocused,
    listFilesRef,
    navigate,
    selectionAnchorRef,
    pointerTypeRef,
  ]);
}
