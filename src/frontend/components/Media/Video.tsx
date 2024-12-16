import * as React from 'react';
import { Hooks } from 'frontend';

type Props = {
  folderPath: string;
  line: { type: 'video'; lineIndex: number; src: string; mimetype: string };
};

const EMPTY_MEDIA = '/blank.mp4';
function getEmptyMediaUrl() {
  return EMPTY_MEDIA;
}

export function MediaVideo({
  folderPath,
  line,
  ...props
}: React.AudioHTMLAttributes<HTMLAudioElement> & Props) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const { play, is404, path, src } = Hooks.useMedia(
    folderPath,
    line,
    videoRef,
    getEmptyMediaUrl,
  );

  if (is404) {
    return <div className="mediaMissing">Missing video file: {path}</div>;
  }

  return (
    <video
      className="mediaVideo"
      ref={videoRef}
      onError={(event) => {
        console.error((event.target as HTMLVideoElement).error);
      }}
      controls
      {...props}
      onPlay={play}
      src={src}
    ></video>
  );
}
