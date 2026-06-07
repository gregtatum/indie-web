import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, A, Hooks, $, T } from 'frontend';
import { getDirName, getPathFileName } from 'frontend/utils';
import { Menu, MenuButton } from 'frontend/components/Menus';
import { EditTrackModal } from 'frontend/components/Music/EditTrackModal';

// Must stay in sync with menuWidth in Menus.tsx so the menu left-aligns to the cursor.
const MENU_WIDTH = 200;

export interface TrackContextMenuHandle {
  edit(trackPaths: string[], tab?: T.MusicEditTab): void;
  open(event: React.MouseEvent, trackPath: string): void;
  showInFiles(trackPath: string): void;
}

export const TrackContextMenu = React.forwardRef<TrackContextMenuHandle>(
  function TrackContextMenu(_props, ref) {
    const dispatch = Hooks.useDispatch();
    const { getState } = Hooks.useStore();
    const navigate = Router.useNavigate();
    const [openGeneration, setOpenGeneration] = React.useState(0);
    const [openEventDetail, setOpenEventDetail] = React.useState(-1);
    const [contextTrackPath, setContextTrackPath] = React.useState<
      string | null
    >(null);
    const editTrackPath = $$.getMusicEditTrackPath();
    const anchorRef = React.useRef<HTMLElement | null>(null);

    const editTracks = React.useCallback(
      (trackPaths: string[], tab: T.MusicEditTab = 'details') => {
        const trackPath = trackPaths[0] ?? null;
        dispatch(A.setMusicEditTrackPath(trackPath));
        if (trackPath && tab !== 'details') {
          dispatch(A.setMusicEditTab(tab));
        }
      },
      [dispatch],
    );

    const showInFiles = React.useCallback(
      (trackPath: string) => {
        const state = getState();
        const fsSlug = $.getCurrentFileStoreSlug(state);
        const folderPath = getDirName(trackPath);
        const fileName = getPathFileName(trackPath);
        dispatch(A.changeFileFocus(folderPath, fileName));
        navigate(`/${fsSlug}/folder${folderPath}`);
      },
      [dispatch, getState, navigate],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        edit: editTracks,
        open(event, trackPath) {
          event.preventDefault();
          const { clientX: x, clientY: y } = event;
          anchorRef.current = {
            getBoundingClientRect: () =>
              ({
                top: y,
                bottom: y,
                left: x,
                right: x + MENU_WIDTH,
                width: MENU_WIDTH,
                height: 0,
                x,
                y,
                toJSON() {
                  return this;
                },
              }) as DOMRect,
            contains: () => false,
            focus: () => {},
          } as unknown as HTMLElement;
          setContextTrackPath(trackPath);
          setOpenGeneration((n) => n + 1);
          setOpenEventDetail(event.detail);
        },
        showInFiles,
      }),
      [editTracks, showInFiles],
    );

    const selectedPaths = $$.getMusicSelectedTrackPaths();
    const isMultiSelect = selectedPaths.length > 1;

    const buttons: MenuButton[] = [
      {
        key: 'play',
        children: isMultiSelect ? 'Play Selection' : 'Play Track',
        onClick() {
          const tracks = $.getFilteredMusicTracks(getState());
          if (isMultiSelect) {
            dispatch(
              A.setMusicPlaybackQueue(
                tracks.filter((t) => selectedPaths.includes(t.path)),
              ),
            );
            dispatch(A.musicPlaybackLoad(selectedPaths[0]));
          } else if (contextTrackPath) {
            dispatch(A.setMusicPlaybackQueue(tracks));
            dispatch(A.musicPlaybackLoad(contextTrackPath));
          }
        },
      },
      ...(isMultiSelect
        ? [
            {
              key: 'edit-selection',
              children: 'Edit Selection',
              shortcut: '⌘/Ctrl E',
              onClick() {
                editTracks(selectedPaths);
              },
            } as MenuButton,
          ]
        : []),
      ...(!isMultiSelect && contextTrackPath
        ? [
            {
              key: 'edit',
              children: 'Edit',
              shortcut: '⌘/Ctrl E',
              onClick() {
                editTracks([contextTrackPath]);
              },
            } as MenuButton,
            {
              key: 'show-in-files',
              children: 'Show in Files',
              shortcut: '⌘/Ctrl Enter',
              onClick() {
                showInFiles(contextTrackPath);
              },
            } as MenuButton,
          ]
        : []),
    ];

    return (
      <>
        {Hooks.overlayPortal(
          <Menu
            clickedElement={anchorRef}
            openEventDetail={openEventDetail}
            openGeneration={openGeneration}
            buttons={buttons}
          />,
        )}
        <EditTrackModal
          trackPath={editTrackPath}
          onClose={() => dispatch(A.setMusicEditTrackPath(null))}
        />
      </>
    );
  },
);
