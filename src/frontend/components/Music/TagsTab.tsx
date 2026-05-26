import * as React from 'react';
import { A, Hooks } from 'frontend';
import { formatBytes } from 'frontend/utils';
import {
  id3FrameLabels,
  id3FrameTooltips,
  sortTags,
  type TagsState,
} from 'frontend/logic/music/tags';

interface Props {
  tagsState: TagsState;
}

function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function TagsTab({ tagsState }: Props) {
  const dispatch = Hooks.useDispatch();

  if (tagsState.status === 'loading') {
    return (
      <div className="editTrackModalTags">
        <div className="editTrackModalTagsLoading">Loading…</div>
      </div>
    );
  }

  if (tagsState.status === 'error') {
    return (
      <div className="editTrackModalTags">
        <div className="editTrackModalTagsLoading">Error: {tagsState.message}</div>
      </div>
    );
  }

  const { native } = tagsState.data;

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
