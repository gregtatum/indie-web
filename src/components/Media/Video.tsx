import * as React from 'react';
import { $, T, Hooks } from 'src';

type Props = {
  path: string;
  line: { type: 'video'; lineIndex: number; src: string; mimetype: string };
};

const EMPTY_MEDIA = '/blank.mp4';

export function MediaVideo({
  path,
  line,
  ...props
}: React.AudioHTMLAttributes<HTMLAudioElement> & Props) {
  type AudioRef = React.MutableRefObject<HTMLAudioElement | null>;
  type VideoRef = React.MutableRefObject<HTMLVideoElement | null>;
  const mediaRef: AudioRef | VideoRef = React.useRef(null);
  const dropbox = Hooks.useSelector($.getDropbox);
  const [is404, setIs404] = React.useState<boolean>(false);
  const [objectUrl, setObjectUrl] = React.useState<string>(EMPTY_MEDIA);
  const objectUrlRef = React.useRef(objectUrl);

  // Set the object url to a ref so it can be used in event handlers.
  React.useEffect(() => {
    objectUrlRef.current = objectUrl;
  }, [objectUrl]);

  const [isPlayRequested, setIsPlayRequested] = React.useState(false);

  // When play is requested, download the file from Dropbox and play it.
  React.useEffect(() => {
    if (!path || !isPlayRequested) {
      return () => {};
    }
    let url: string;

    // Download the file from Dropbox.
    void (async () => {
      try {
        const response = (await dropbox.filesDownload({
          path,
        })) as T.FilesDownloadResponse;
        if (!mediaRef.current) {
          return;
        }

        // The file has been downloaded, use it in this component.
        let blob = response.result.fileBlob;
        if (blob.type === 'application/octet-stream') {
          // The mimetype was not properly sent.
          blob = blob.slice(0, blob.size, line.mimetype);
        }

        url = URL.createObjectURL(blob);
        mediaRef.current.src = url;
        setObjectUrl(url);
        requestAnimationFrame(() => {
          mediaRef.current?.play().catch(() => {});
        });
      } catch (error) {
        console.error('<DropboxMedia /> error:', error);
        setIs404(true);
      }
    })();

    // Clean-up the generated object URL.
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [dropbox, path, isPlayRequested]);

  function handlePlay(
    event: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>,
  ) {
    if (mediaRef.current && objectUrlRef.current === EMPTY_MEDIA) {
      event.preventDefault();
      mediaRef.current.pause();
      setIsPlayRequested(true);
    }
  }

  if (is404) {
    return <div className="mediaMissing">Missing video file: {path}</div>;
  }

  return (
    <video
      className="mediaVideo"
      ref={mediaRef as VideoRef}
      onError={(event) => {
        console.error((event.target as HTMLVideoElement).error);
      }}
      controls
      {...props}
      onPlay={handlePlay}
      src="/blank.mp4"
    ></video>
  );
}
