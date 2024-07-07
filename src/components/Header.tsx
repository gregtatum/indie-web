import * as React from 'react';
import * as Router from 'react-router-dom';
import { $, A, Hooks } from 'src';
import { assertType, isAppSettingScrollTop } from 'src/utils';
import { getBrowserName, getFileSystemDisplayName } from 'src/logic/app-logic';
import './Header.css';
import { Menu, MenuButton, menuPortal } from './Menus';

export function Header() {
  const view = Hooks.useSelector($.getView);
  const path = Hooks.useSelector($.getActiveFileDisplayPath);
  const [shouldHideHeader, setShouldHideHeader] = React.useState(false);
  const key = (view ?? '') + path;

  const headerStyle: React.CSSProperties = {};
  if (shouldHideHeader) {
    headerStyle.transform = 'translateY(var(--header-transform-y))';
  }

  React.useEffect(function trackScrolling() {
    const { scrollingElement } = document;
    if (!scrollingElement) {
      return () => {};
    }
    let headerPadding: number;
    {
      const headerPaddingStr =
        getComputedStyle(scrollingElement).getPropertyValue('--header-padding');
      if (!headerPaddingStr) {
        throw new Error('Expected to find a headerPadding style');
      }
      headerPaddingStr.replace('px', '');
      headerPadding = parseInt(headerPaddingStr, 10) * 0.5;
    }

    let _prevScroll = 0;
    let _shouldHideHeader = false;

    const onScroll = () => {
      if (isAppSettingScrollTop()) {
        // The app is setting the scrollTop.
        // Note: This doesn't always trigger on navigation events for some reason.
        setShouldHideHeader(false);
        return;
      }
      const { scrollTop } = scrollingElement;
      const dx = scrollTop - _prevScroll;
      _prevScroll = scrollTop;
      if (scrollTop === 0) {
        _shouldHideHeader = false;
        setShouldHideHeader(false);
      } else if (dx > 0) {
        // Scrolling down;
        if (scrollTop > headerPadding && !_shouldHideHeader) {
          _shouldHideHeader = true;
          setShouldHideHeader(true);
        }
      } else {
        // Scrolling up.
        if (
          // iPad registers scrolling when it drags past the end of the document.
          // Ensure the header doesn't come back when that happens.
          scrollingElement.scrollHeight - scrollTop > window.innerHeight &&
          _shouldHideHeader
        ) {
          _shouldHideHeader = false;
          setShouldHideHeader(false);
        }
      }
    };

    document.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll);
    };
  }, []);

  let isOpen;
  let title;
  switch (view) {
    case 'settings':
      isOpen = true;
      title = (
        <Path path="/" key={key} title="⚙️ Settings" hideSiteName={true} />
      );
      break;
    case 'privacy':
      isOpen = true;
      title = (
        <Path
          path="/"
          key={key}
          title="👀 Privacy Policy and Usage"
          hideSiteName={true}
        />
      );
      break;
    case 'view-file':
    case 'view-pdf':
    case 'view-image':
    case 'view-markdown':
    case 'language-coach':
      isOpen = false;
      title = <Path key={key} path={path} />;
      break;
    case 'list-files':
      if (location.pathname !== '/folder' && location.pathname !== '/') {
        isOpen = false;
        title = <Path key={key} path={path} />;
        break;
      }
    // fallthrough
    case null:
    default:
      isOpen = true;
      assertType<'list-files' | null>(view);
      title = (
        <div className="headerTitle" key={key}>
          <FileSystemSelection />
        </div>
      );
      break;
  }

  return (
    <div className="header" style={headerStyle}>
      <SiteName isOpen={isOpen} />
      <div className="headerStart">{title}</div>
      <div className="headerEnd">
        <SaveFileButton />
        <RequestFullScreen />
        <SettingsButton />
      </div>
    </div>
  );
}

function goFullScreen() {
  const element = document.querySelector('[data-fullscreen]');
  if (!element) {
    console.error('No [data-fullscreen] was found.');
    return;
  }
  if (element.requestFullscreen) {
    element.requestFullscreen().catch((error) => {
      console.error('Failed to go fullscreen', error);
    });
  }
  if ((element as any).webkitRequestFullscreen) {
    (element as any).webkitRequestFullscreen().catch((error: any) => {
      console.error('Failed to go fullscreen', error);
    });
  }
}

function fullScreenEventHandler(event: KeyboardEvent) {
  if (
    event.key === 'f' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    goFullScreen();
  }
}

function RequestFullScreen() {
  const canGoFullScreen = Hooks.useSelector($.canGoFullScreen);
  React.useEffect(() => {
    if (canGoFullScreen) {
      document.addEventListener('keyup', fullScreenEventHandler);
    } else {
      document.removeEventListener('keyup', fullScreenEventHandler);
    }
    return () => {
      document.removeEventListener('keyup', fullScreenEventHandler);
    };
  }, [canGoFullScreen]);

  if (!canGoFullScreen) {
    return null;
  }

  return (
    <button type="button" className="button" onClick={goFullScreen}>
      Fullscreen
    </button>
  );
}

function SettingsButton() {
  const view = Hooks.useSelector($.getView);
  if (view === 'settings') {
    return null;
  }
  return (
    <a href="/settings" className="button headerSettings">
      Settings
    </a>
  );
}

function FileSystemSelection() {
  const name = Hooks.useSelector($.getCurrentFileSystemName);
  const dispatch = Hooks.useDispatch();
  const button = React.useRef<null | HTMLButtonElement>(null);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const buttons = React.useMemo<MenuButton[]>(
    () => [
      {
        key: 'browser',
        onClick: () => void dispatch(A.changeFileSystem('browser')),
        children: getBrowserName(),
      },
      {
        key: 'dropbox',
        onClick: () => void dispatch(A.changeFileSystem('dropbox')),
        children: 'Dropbox',
      },
    ],
    [],
  );

  return (
    <>
      <button
        type="button"
        className="headerFileSystemSelection"
        ref={button}
        title="Change the file system source"
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        {getFileSystemDisplayName(name)}
      </button>
      {menuPortal(
        <Menu
          clickedElement={button}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          buttons={buttons}
        />,
      )}
    </>
  );
}

function SaveFileButton() {
  const text = Hooks.useSelector($.getActiveFileTextOrNull);
  const dispatch = Hooks.useDispatch();
  const path = Hooks.useSelector($.getPath);
  const request = Hooks.useSelector($.getDownloadFileCache).get(path);
  const isModified = Hooks.useSelector($.getIsActiveFileModified);

  if (!isModified || text === null || !request) {
    return null;
  }

  return (
    <button
      className="button headerSaveFile"
      onClick={() => {
        dispatch(A.saveTextFile(path, text)).catch((error) => {
          console.error('Failed to save file', error);
        });
      }}
    >
      Save
    </button>
  );
}

function Path({
  path,
  title,
  hideSiteName,
}: {
  path: string;
  title?: any;
  hideSiteName?: boolean;
}) {
  const songTitle = Hooks.useSelector($.getActiveFileSongTitleOrNull);
  const fsName = Hooks.useSelector($.getCurrentFileSystemName);
  const breadcrumbs = [];
  let pathGrow = '';
  const parts = path.split('/');
  const fileName = parts.pop();
  for (const part of parts) {
    if (breadcrumbs.length === 0) {
      breadcrumbs.push(
        <Router.Link key="/" to="/">
          Home
        </Router.Link>,
      );
    } else {
      pathGrow += '/' + part;
      breadcrumbs.push(
        <span key={pathGrow + '»'}>»</span>,
        <Router.Link key={pathGrow} to={`/${fsName}/folder${pathGrow}`}>
          {part}
        </Router.Link>,
      );
    }
  }
  const backParts = path.split('/');
  backParts.pop();

  return (
    <>
      <div className="headerPath headerPathFull" key={'full' + path}>
        <SiteName isOpen={!hideSiteName && !(songTitle ?? fileName)} />
        <FileSystemSelection key="fileSystem" />
        <span>»</span>
        {breadcrumbs}
        <span>»</span>
        {songTitle ?? fileName ? (
          <span title={fileName}>{songTitle ?? fileName}</span>
        ) : null}
        {title ? <span>{title}</span> : null}
      </div>
      <div className="headerPath headerPathMobile" key={'mobile' + path}>
        <Router.Link
          to={`/${fsName}/folder${backParts.join('/')}`}
          className="headerPathBack"
          aria-label="back"
        ></Router.Link>
      </div>
    </>
  );
}

interface SlideInProps {
  isOpen: boolean;
  skipAnimation?: boolean;
  children: any;
}

function SlideIn({ isOpen, skipAnimation, children }: SlideInProps) {
  const contentsRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number>(0);

  React.useEffect(() => {
    const { current } = contentsRef;
    if (!current) {
      return;
    }
    const rect = current.getBoundingClientRect();
    setWidth(rect.width);
  }, [contentsRef]);

  const className = skipAnimation
    ? 'headerSlideIn'
    : 'headerSlideIn headerSlideInAnimate';

  return (
    <div className={className} style={{ width: isOpen ? width : 0 }}>
      <div className="headerSlideInContents" ref={contentsRef}>
        {children}
      </div>
    </div>
  );
}

let wasAnimated = false;
function SiteName(props: { isOpen: boolean }) {
  const [skipAnimation, setSkipAnimation] = React.useState(!wasAnimated);

  React.useEffect(() => {
    if (wasAnimated) {
      setSkipAnimation(false);
    }
    wasAnimated = true;
  }, [props.isOpen]);

  if (process.env.SITE === 'floppydisk') {
    return (
      <div className="headerSiteName">
        <SlideIn isOpen={props.isOpen} skipAnimation={skipAnimation}>
          <span>💾 </span>
          <span className="headerSiteNameTitle">
            FloppyDisk<span className="headerSiteNameSuffix">.link</span>
          </span>
        </SlideIn>
      </div>
    );
  } else {
    return (
      <div className="headerSiteName">
        <SlideIn isOpen={props.isOpen} skipAnimation={skipAnimation}>
          <div className="headerTitleSlideIn">
            <span>🎵 </span>
            <span className="headerSiteNameTitle">Browser Chords</span>
          </div>
        </SlideIn>
      </div>
    );
  }
}
