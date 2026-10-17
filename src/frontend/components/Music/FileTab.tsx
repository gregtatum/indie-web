import * as React from 'react';
import { A, Hooks } from 'frontend';
import { formatBytes } from 'frontend/utils';
import type { TrackAudioInfo } from 'shared/@types/shared';
import {
  id3FrameLabels,
  id3FrameTooltips,
  sortTags,
  type TrackTagsLoadState,
} from 'frontend/logic/music/metadata';

interface Props {
  tagsState: TrackTagsLoadState;
  location: React.ReactNode;
}

function formatContainer(container: string): string {
  if (container.startsWith('M4A') || container.startsWith('mp4')) {
    return 'MPEG-4 (M4A)';
  }
  if (container === 'MPEG') {
    return 'MPEG audio';
  }
  return container;
}

function formatSampleRate(hertz: number): string {
  return `${Number((hertz / 1000).toFixed(1))} kHz`;
}

function formatChannels(channels: number): string {
  if (channels === 1) {
    return 'Mono';
  }
  if (channels === 2) {
    return 'Stereo';
  }
  return `${channels} channels`;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
  }
  return `${minutes}:${secs}`;
}

function FileDetails({
  location,
  audio,
}: {
  location: React.ReactNode;
  audio: TrackAudioInfo | undefined;
}) {
  const rows: Array<[string, React.ReactNode]> = [];
  if (location) {
    rows.push(['Path', location]);
  }
  if (audio) {
    if (audio.container) {
      rows.push(['Container', formatContainer(audio.container)]);
    }
    if (audio.codec) {
      rows.push(['Codec', audio.codec]);
    }
    if (audio.sampleRate) {
      rows.push(['Sample rate', formatSampleRate(audio.sampleRate)]);
    }
    if (audio.channels) {
      rows.push(['Channels', formatChannels(audio.channels)]);
    }
    if (audio.duration) {
      rows.push(['Duration', formatDuration(audio.duration)]);
    }
    rows.push(['Size', formatBytes(audio.size)]);
    if (audio.bitrate) {
      rows.push(['Bitrate', `${Math.round(audio.bitrate / 1000)} kbps`]);
    }
  }

  return (
    <table className="editTrackModalFileTable">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function base64ByteLength(base64: string): number {
  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }
  return (base64.length / 4) * 3 - padding;
}

export function FileTab({ tagsState, location }: Props) {
  const dispatch = Hooks.useDispatch();

  let audio: TrackAudioInfo | undefined;
  let tags: React.ReactNode;
  if (tagsState.status === 'loading') {
    tags = <div className="editTrackModalTagsLoading">Loading…</div>;
  } else if (tagsState.status === 'error') {
    tags = (
      <div className="editTrackModalTagsLoading">
        Error: {tagsState.message}
      </div>
    );
  } else {
    const { blocks } = tagsState.data;
    audio = tagsState.data.audio;
    if (
      blocks.length === 0 ||
      blocks.every((block) => block.tags.length === 0)
    ) {
      tags = <div className="editTrackModalTagsLoading">No tags found</div>;
    } else {
      tags = blocks.map(({ format, tags }) =>
        tags.length === 0 ? null : (
          <div key={format}>
            <div className="editTrackModalTagsFormat">{format}</div>
            <div className="editTrackModalGrid">
              {sortTags(tags).map(({ id, value, binary }, i) => {
                const label =
                  id3FrameLabels[id as keyof typeof id3FrameLabels] ?? id;
                const tooltip =
                  id3FrameTooltips[id as keyof typeof id3FrameTooltips];
                const title = tooltip ? `${id} – ${tooltip}` : id;
                return (
                  <div key={i} className="editTrackModalRow">
                    <span className="editTrackModalLabel" title={title}>
                      {label}
                    </span>
                    {binary !== undefined ? (
                      <div className="editTrackModalTagBinaryCell">
                        <input
                          className="editTrackModalInput editTrackModalInput-readonly editTrackModalInput-binary"
                          value={value}
                          title={title}
                          readOnly
                        />
                        <button
                          className="button editTrackModalTagLogButton"
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
                        className="editTrackModalInput editTrackModalInput-readonly"
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
      );
    }
  }

  return (
    <div className="editTrackModalTags">
      {(location || audio) && (
        <div>
          <div className="editTrackModalTagsFormat">File</div>
          <FileDetails location={location} audio={audio} />
        </div>
      )}
      {tags}
    </div>
  );
}
