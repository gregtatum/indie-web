import * as React from 'react';
import { $, T, A, Hooks } from 'src';
import { ensureExists } from 'src/utils';

import './Menus.css';

export function Menus() {
  return (
    <div className="menus">
      <FileMenu />
    </div>
  );
}

// The bottom and top border.
const menuBorderHeight = 2;
// Keeping this static makes the positioning below much more simple as there is no
// measurement that needs to take place. Keep the value in sync with .menusFileButton
const menuItemHeight = 41;
const menuWidth = 175;
const menuMargin = 10;

function fileEscapeLogic(clickedFileMenu: T.ClickedFileMenu | null) {
  const dispatch = Hooks.useDispatch();
  const keyHandler = React.useRef<null | ((event: KeyboardEvent) => void)>(
    null,
  );
  function removeKeyHandler() {
    if (keyHandler.current) {
      document.removeEventListener('keydown', keyHandler.current);
    }
  }

  React.useEffect(() => {
    if (clickedFileMenu) {
      keyHandler.current = (event) => {
        if (event.key === 'Escape') {
          dispatch(A.dismissFileMenu());
        }
      };
      document.addEventListener('keydown', keyHandler.current);
    } else {
      removeKeyHandler();
    }
    return removeKeyHandler;
  }, [clickedFileMenu]);
}

function clickOutLogic(
  clickedFileMenu: T.ClickedFileMenu | null,
  divRef: React.RefObject<HTMLDivElement>,
) {
  const dispatch = Hooks.useDispatch();
  const clickHandler = React.useRef<null | ((event: MouseEvent) => void)>(null);
  function removeKeyHandler() {
    if (clickHandler.current) {
      document.removeEventListener('click', clickHandler.current, true);
    }
  }

  React.useEffect(() => {
    if (clickedFileMenu) {
      clickHandler.current = (event) => {
        const div = ensureExists(divRef.current);
        if (!div.contains(event.target as Node | null)) {
          // We clicked outside of the menu, dismiss it.
          dispatch(A.dismissFileMenu());
          if (clickedFileMenu?.element.contains(event.target as Node | null)) {
            event.stopImmediatePropagation();
          }
        }
      };
      document.addEventListener('click', clickHandler.current, true);
    } else {
      removeKeyHandler();
    }
    return removeKeyHandler;
  }, [clickedFileMenu]);
}

function FileMenu() {
  const clickedFileMenu = Hooks.useSelector($.getFileMenu);
  const divRef = React.useRef<HTMLDivElement>(null);
  const dispatch = Hooks.useDispatch();

  fileEscapeLogic(clickedFileMenu);
  clickOutLogic(clickedFileMenu, divRef);

  if (clickedFileMenu === null) {
    return null;
  }

  const { file, element } = clickedFileMenu;
  const elementRect = element.getBoundingClientRect();
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

  const buttons = [
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
    <button type="button" className="menusFileButton" key="Move">
      <span className="icon" data-icon="box-arrow-in-right" /> Move
    </button>,
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
  ];

  const { scrollTop } = document.documentElement;
  const scrollBottom = scrollTop + innerHeight;

  const menuHeight = buttons.length * menuItemHeight + menuBorderHeight;

  let top = elementY2;
  let animationClass = 'menusFileAnimateDown';

  if (elementY2 + menuHeight + menuMargin > scrollBottom) {
    // The menu is off the bottom of the scroll space.
    top = elementY1 - menuHeight;
    animationClass = 'menusFileAnimateUp';
  }

  return (
    <div
      key={file.path}
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
