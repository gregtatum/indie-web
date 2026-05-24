import * as React from 'react';
import { $$, A, Hooks, $ } from 'frontend';
import { Menu, MenuButton } from 'frontend/components/Menus';

// Must stay in sync with menuWidth in Menus.tsx so the menu left-aligns to the cursor.
const MENU_WIDTH = 200;

export interface TrackContextMenuHandle {
  open(event: React.MouseEvent, trackPath: string): void;
}

export const TrackContextMenu = React.forwardRef<TrackContextMenuHandle>(
  function TrackContextMenu(_props, ref) {
    const dispatch = Hooks.useDispatch();
    const { getState } = Hooks.useStore();
    const [openGeneration, setOpenGeneration] = React.useState(0);
    const [openEventDetail, setOpenEventDetail] = React.useState(-1);
    const [contextTrackPath, setContextTrackPath] = React.useState<
      string | null
    >(null);
    const anchorRef = React.useRef<HTMLElement | null>(null);

    React.useImperativeHandle(ref, () => ({
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
    }));

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
    ];

    return Hooks.overlayPortal(
      <Menu
        clickedElement={anchorRef}
        openEventDetail={openEventDetail}
        openGeneration={openGeneration}
        buttons={buttons}
      />,
    );
  },
);
