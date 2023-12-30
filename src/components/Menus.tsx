import * as React from 'react';
import { $, A, Hooks } from 'src';
import { ensureExists } from 'src/utils';

import './Menus.css';
import { getBrowserName } from 'src/logic/app-logic';

export function Menus() {
  return (
    <div className="menus">
      <FileMenu />
      <SongKeyMenu />
      <FileSystemSelectionMenu />
    </div>
  );
}

// The bottom and top border.
const menuBorderHeight = 2;
// Keeping this static makes the positioning below much simpler as there is no
// measurement that needs to take place. Keep the value in sync with .menusFileButton
const menuItemHeight = 41;
const menuWidth = 175;
const menuMargin = 10;

/**
 * Handle leaving the menu by hitting escape.
 */
function escapeLogic(dismiss: () => void) {
  const keyHandler = React.useRef<null | ((event: KeyboardEvent) => void)>(
    null,
  );
  React.useEffect(() => {
    keyHandler.current = (event) => {
      if (event.key === 'Escape') {
        dismiss();
      }
    };
    document.addEventListener('keydown', keyHandler.current);
    return () => {
      if (keyHandler.current) {
        document.removeEventListener('keydown', keyHandler.current);
      }
    };
  }, []);
}

/**
 * Logic for handling when a user clicks outside of the menu.
 */
function clickOutLogic(
  element: Element,
  divRef: React.RefObject<HTMLDivElement>,
  dismiss: () => void,
) {
  const clickHandler = React.useRef<null | ((event: MouseEvent) => void)>(null);

  function removeHandler() {
    if (clickHandler.current) {
      document.removeEventListener('click', clickHandler.current, true);
    }
  }

  React.useEffect(() => {
    removeHandler();
    clickHandler.current = (event) => {
      const div = ensureExists(divRef.current);
      if (!div.contains(event.target as Node | null)) {
        // We clicked outside of the menu, dismiss it.
        dismiss();
        if (element.contains(event.target as Node | null)) {
          event.stopImmediatePropagation();
        }
      }
    };
    document.addEventListener('click', clickHandler.current, true);
    return removeHandler;
  }, [element]);
}

function FileMenu() {
  const clickedFileMenu = Hooks.useSelector($.getFileMenu);
  const dispatch = Hooks.useDispatch();

  if (!clickedFileMenu) {
    return null;
  }
  const { file, element } = clickedFileMenu;

  return (
    <Menu
      key={file.path}
      clickedElement={element ?? null}
      dismiss={() => dispatch(A.dismissFileMenu())}
      buttons={[
        <button
          type="button"
          className="menusFileButton"
          key="Rename"
          onClick={() => {
            dispatch(A.startRenameFile(file.path));
          }}
        >
          <span className="icon" data-icon="pencil-fill" /> Rename
        </button>,
        // TODO
        // <button type="button" className="menusFileButton" key="Move">
        //   <span className="icon" data-icon="box-arrow-in-right" /> Move
        // </button>,
        <button
          type="button"
          className="menusFileButton"
          key="Delete"
          onClick={() => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            dispatch(A.deleteFile(file));
          }}
        >
          <span className="icon" data-icon="trash-fill" /> Delete{' '}
          {file.type === 'file' ? 'File' : 'Folder'}
        </button>,
        file.type === 'file' ? (
          <button
            type="button"
            className="menusFileButton"
            key="Download"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              dispatch(A.downloadFileForUser(file));
            }}
          >
            <span className="icon" data-icon="download" /> Download
          </button>
        ) : (
          <button
            type="button"
            className="menusFileButton"
            key="Download"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              dispatch(A.downloadFolderForUser(file));
            }}
          >
            <span className="icon" data-icon="download" /> Download Zip
          </button>
        ),
      ]}
    />
  );
}

function FileSystemSelectionMenu() {
  const button = Hooks.useSelector($.getFileSystemSelectionMenu);
  const dispatch = Hooks.useDispatch();

  if (!button) {
    return null;
  }

  return (
    <Menu
      clickedElement={button}
      dismiss={() => dispatch(A.dismissFileSystemSelectionMenu())}
      buttons={[
        <button
          type="button"
          className="menusFileButton"
          key="1"
          onClick={() => {
            dispatch(A.changeFileSystemName('dropbox'));
          }}
        >
          Dropbox
        </button>,
        <button
          type="button"
          className="menusFileButton"
          key="2"
          onClick={() => {
            dispatch(A.changeFileSystemName('indexeddb'));
          }}
        >
          {getBrowserName()}
        </button>,
      ]}
    />
  );
}

function SongKeyMenu() {
  const clickedSongKey = Hooks.useSelector($.getSongKeyMenu);
  const dispatch = Hooks.useDispatch();
  const songKey = Hooks.useSelector($.getActiveFileSongKey);
  const file = Hooks.useSelector($.getActiveFileOrNull);

  if (!clickedSongKey) {
    return null;
  }
  const path = ensureExists(file).metadata.path;

  return (
    <Menu
      clickedElement={clickedSongKey.element}
      dismiss={() => dispatch(A.dismissSongKeyMenu())}
      buttons={[
        <button
          type="button"
          className="menusFileButton"
          key="Transpose"
          onClick={() => {
            dispatch(A.transposeKey(path, ensureExists(songKey)));
          }}
        >
          Transpose
        </button>,
        // TODO
        // <button
        //   type="button"
        //   className="menusFileButton"
        //   key="Capo"
        //   onClick={() => {
        //     dispatch(A.applyCapo(path, 0));
        //   }}
        // >
        //   Apply Capo
        // </button>,
      ]}
    />
  );
}

interface MenuProps {
  clickedElement: Element;
  buttons: React.ReactNode[];
  dismiss: () => void;
}

function Menu({ clickedElement, buttons, dismiss }: MenuProps) {
  const divRef = React.useRef<HTMLDivElement>(null);

  escapeLogic(dismiss);
  clickOutLogic(clickedElement, divRef, dismiss);

  const elementRect = clickedElement.getBoundingClientRect();
  const bodyRect = document.body.getBoundingClientRect();

  const elementY1 = elementRect.top + elementRect.height / 3 - bodyRect.top;
  const elementY2 = elementRect.bottom - elementRect.height / 3 - bodyRect.top;
  const elementCenterX = elementRect.width / 2 + elementRect.left;

  let left = elementCenterX - menuWidth / 2;
  if (left < menuMargin) {
    left = menuMargin;
  } else if (left + menuWidth > bodyRect.width - menuMargin) {
    left = bodyRect.width - menuWidth - menuMargin;
  }

  let top = elementY2;
  let animationClass = 'menusFileAnimateDown';

  const { scrollTop } = document.documentElement;
  const scrollBottom = scrollTop + innerHeight;

  const menuHeight = buttons.length * menuItemHeight + menuBorderHeight;

  if (elementY2 + menuHeight + menuMargin > scrollBottom) {
    // The menu is off the bottom of the scroll space.
    top = elementY1 - menuHeight;
    animationClass = 'menusFileAnimateUp';
  }

  return (
    <div
      className={`menusFile ${animationClass}`}
      ref={divRef}
      style={{
        top,
        left,
        width: menuWidth,
      }}
    >
      {buttons}
    </div>
  );
}
