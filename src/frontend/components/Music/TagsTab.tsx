import * as React from 'react';
import { A, Hooks } from 'frontend';
import { formatBytes } from 'frontend/utils';
import {
  id3FrameLabels,
  id3FrameTooltips,
  sortTags,
} from 'frontend/logic/music/tags';
import type { TrackTagsResponse } from 'shared/@types/shared';

interface Props {
  trackPath: string;
  serverUrl: string;
}

type State =
  | { status: 'loading' }
  | { status: 'loaded'; data: TrackTagsResponse }
  | { status: 'error'; message: string };

function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}


export function TagsTab({ trackPath, serverUrl }: Props) {
  const dispatch = Hooks.useDispatch();
  const [state, setState] = React.useState<State>({ status: 'loading' });

  React.useEffect(() => {
    setState({ status: 'loading' });
    let cancelled = false;
    fetch(`${serverUrl}/music/track-tags?path=${encodeURIComponent(trackPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<TrackTagsResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'loaded', data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [trackPath, serverUrl]);

  if (state.status === 'loading') {
    return (
      <div className="editTrackModalTags">
        <div className="editTrackModalTagsLoading">Loading…</div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="editTrackModalTags">
        <div className="editTrackModalTagsLoading">Error: {state.message}</div>
      </div>
    );
  }

  const { native } = state.data;

  if (native.length === 0 || native.every((block) => block.tags.length === 0)) {
    return (
      <div className="editTrackModalTags">
        <div className="editTrackModalTagsLoading">No tags found</div>
      </div>
    );
  }

  return (
    <div className="editTrackModalTags">
      {native.map(({ format, tags }) =>
        tags.length === 0 ? null : (
          <div key={format}>
            <div className="editTrackModalTagsFormat">{format}</div>
            <div className="editTrackModalTagsBlock">
            {sortTags(tags).map(({ id, value, binary }, i) => {
              const label =
                id3FrameLabels[id as keyof typeof id3FrameLabels] ?? id;
              const tooltip =
                id3FrameTooltips[id as keyof typeof id3FrameTooltips];
              const title = tooltip ? `${id} – ${tooltip}` : id;
              return (
                <div key={i} className="editTrackModalTagRow">
                  <span className="editTrackModalTagLabel" title={title}>
                    {label}
                  </span>
                  {binary !== undefined ? (
                    <div className="editTrackModalTagBinaryCell">
                      <input
                        className="editTrackModalTagInput editTrackModalTagInput-binary"
                        value={value}
                        title={title}
                        readOnly
                      />
                      <button
                        className="editTrackModalTagLogButton"
                        onClick={() => {
                          const bytes = Uint8Array.from(atob(binary), (c) =>
                            c.charCodeAt(0),
                          );
                          console.log(
                            `[Tags] ${format} / ${id}:`,
                            bytes.buffer,
                          );
                          dispatch(
                            A.addMessage({
                              message: `Logged ${id} to console (${formatBytes(bytes.byteLength)})`,
                              timeout: true,
                            }),
                          );
                        }}
                      >
                        {formatBytes(base64ByteLength(binary))}
                      </button>
                    </div>
                  ) : (
                    <input
                      className="editTrackModalTagInput"
                      value={value}
                      readOnly
                    />
                  )}
                </div>
              );
            })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
