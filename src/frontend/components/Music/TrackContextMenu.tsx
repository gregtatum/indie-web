import * as React from 'react';
import * as Router from 'react-router-dom';
import { $$, A, Hooks, $, T } from 'frontend';
import {
  getDirName,
  getPathFileName,
  getPlatformCtrlModifier,
} from 'frontend/utils';
import { Menu, MenuButton } from 'frontend/components/Menus';
import { EditTrackModal } from 'frontend/components/Music/EditTrackModal';

// Must stay in sync with menuWidth in Menus.tsx so the menu left-aligns to the cursor.
const MENU_WIDTH = 200;

export interface TrackContextMenuHandle {
  edit(trackPaths: string[], tab?: T.MusicEditTab): void;
  batchEdit(trackPaths: string[]): void;
  open(event: React.MouseEvent, trackPath: string): void;
  openForFilteredTracks(event: React.MouseEvent): void;
  play(trackPaths: string[]): void;
  showInFiles(trackPath: string): void;
  revealInFileManager(trackPath: string): void;
  deleteTracks(trackPaths: string[]): void;
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

    const batchEdit = React.useCallback(
      (trackPaths: string[]) => {
        const allTracks = $.getMusicTracks(getState());
        const firstPath =
          allTracks.find((t) => trackPaths.includes(t.path))?.path ??
          trackPaths[0];
        dispatch(A.setMusicBatchEditTrackPaths(trackPaths));
        dispatch(A.setMusicSelectedTracks([firstPath]));
      },
      [dispatch, getState],
    );

    const play = React.useCallback(
      (trackPaths: string[]) => {
        const tracks = $.getFilteredMusicTracks(getState());
        if (trackPaths.length > 1) {
          dispatch(
            A.setMusicPlaybackQueue(
              tracks.filter((t) => trackPaths.includes(t.path)),
            ),
          );
          dispatch(A.musicPlaybackLoad(trackPaths[0]));
        } else if (trackPaths.length === 1) {
          dispatch(A.setMusicPlaybackQueue(tracks));
          dispatch(A.musicPlaybackLoad(trackPaths[0]));
        }
      },
      [dispatch, getState],
    );

    const revealInFileManager = React.useCallback(
      (trackPath: string) => {
        const fs = $.getServerFSOrNull(getState());
        if (!fs) {
          return;
        }
        fs.reveal(trackPath).catch((error) => {
          console.error(error);
          dispatch(
            A.addMessage({
              message: 'Could not show the file.',
              timeout: true,
            }),
          );
        });
      },
      [dispatch, getState],
    );

    const deleteTracks = React.useCallback(
      (trackPaths: string[]) => {
        void dispatch(A.deleteMusicTracks(trackPaths));
      },
      [dispatch],
    );

    const openMenu = React.useCallback(
      (event: React.MouseEvent, trackPath: string) => {
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
      [],
    );

    React.useImperativeHandle(
      ref,
      () => ({
        edit: editTracks,
        batchEdit,
        open: openMenu,
        openForFilteredTracks(event) {
          const paths = $.getFilteredMusicTracks(getState()).map(
            (track) => track.path,
          );
          if (paths.length === 0) {
            return;
          }
          dispatch(A.setMusicSelectedTracks(paths));
          openMenu(event, paths[0]);
        },
        play,
        showInFiles,
        revealInFileManager,
        deleteTracks,
      }),
      [
        editTracks,
        batchEdit,
        openMenu,
        getState,
        dispatch,
        play,
        showInFiles,
        revealInFileManager,
        deleteTracks,
      ],
    );

    const selectedPaths = $$.getMusicSelectedTrackPaths();
    const isMultiSelect = selectedPaths.length > 1;
    const revealLabel = $$.getFileManagerRevealLabel();
    const shortcutModifier = getPlatformCtrlModifier();
    const editShortcut = `${shortcutModifier} E`;
    const batchEditShortcut = `${shortcutModifier} Shift E`;
    const showInFilesShortcut = `${shortcutModifier} Enter`;
    const revealInFileManagerShortcut = `${shortcutModifier} Shift Enter`;
    const deleteShortcut = `${shortcutModifier} Delete`;
    let deleteTargetPaths: string[] = [];
    if (isMultiSelect) {
      deleteTargetPaths = selectedPaths;
    } else if (contextTrackPath) {
      deleteTargetPaths = [contextTrackPath];
    }

    const buttons: MenuButton[] = [
      {
        key: 'play',
        children: 'Play',
        shortcut: 'Enter',
        onClick() {
          play(
            isMultiSelect
              ? selectedPaths
              : [contextTrackPath].filter((path) => path !== null),
          );
        },
      },
      ...(isMultiSelect
        ? [
            {
              key: 'edit-tracks',
              children: 'Edit',
              shortcut: editShortcut,
              onClick() {
                editTracks(selectedPaths);
              },
            } as MenuButton,
            {
              key: 'batch-edit',
              children: 'Batch Edit',
              shortcut: batchEditShortcut,
              onClick() {
                batchEdit(selectedPaths);
              },
            } as MenuButton,
          ]
        : []),
      ...(!isMultiSelect && contextTrackPath
        ? [
            {
              key: 'edit',
              children: 'Edit',
              shortcut: editShortcut,
              onClick() {
                editTracks([contextTrackPath]);
              },
            } as MenuButton,
            {
              key: 'show-in-files',
              children: 'Show in Files',
              shortcut: showInFilesShortcut,
              onClick() {
                showInFiles(contextTrackPath);
              },
            } as MenuButton,
            ...(revealLabel
              ? [
                  {
                    key: 'reveal-in-file-manager',
                    children: revealLabel,
                    shortcut: revealInFileManagerShortcut,
                    onClick() {
                      revealInFileManager(contextTrackPath);
                    },
                  } as MenuButton,
                ]
              : []),
          ]
        : []),
      ...(deleteTargetPaths.length > 0
        ? [
            {
              key: 'delete',
              children: 'Delete',
              shortcut: deleteShortcut,
              onClick() {
                deleteTracks(deleteTargetPaths);
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
