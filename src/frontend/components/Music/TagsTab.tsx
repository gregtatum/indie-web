import * as React from 'react';
import type { TrackTagsResponse } from 'shared/@types/shared';

interface Props {
  trackPath: string;
  serverUrl: string;
}

type State =
  | { status: 'loading' }
  | { status: 'loaded'; data: TrackTagsResponse }
  | { status: 'error'; message: string };

export function TagsTab({ trackPath, serverUrl }: Props) {
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

  console.log(`!!! native`, native);

  return (
    <div className="editTrackModalTags">
      {native.map(({ format, tags }) =>
        tags.length === 0 ? null : (
          <div key={format}>
            <div className="editTrackModalTagsFormat">{format}</div>
            {tags.map(({ id, value }, i) => (
              <div key={i} className="editTrackModalTagRow">
                <input
                  className="editTrackModalTagInput editTrackModalTagInput-key"
                  value={id}
                  readOnly
                />
                <input
                  className={`editTrackModalTagInput${value === '[binary]' ? ' editTrackModalTagInput-binary' : ''}`}
                  value={value}
                  readOnly
                />
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
