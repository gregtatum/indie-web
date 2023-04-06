import * as React from 'react';
import { $, T, Hooks } from 'src';
import { fixupFileMetadata } from 'src/logic/offline-db';
import { pathJoin } from 'src/utils';

const imageCache: Record<string, string> = Object.create(null);

interface Props {
  folderPath: string;
  line: { src: string };
}

export function MediaImage({ folderPath, line }: Props) {
  const src =
    line.src[0] === '/'
      ? // This is an absolute path.
        line.src
      : // This is a relative path.
        pathJoin(folderPath, line.src);

  const dropbox = Hooks.useSelector($.getDropbox);
  const [objectUrl, setObjectUrl] = React.useState<string>('');
  const [is404, setIs404] = React.useState<boolean>(false);
  const generationRef = React.useRef(0);
  const { getState } = Hooks.useStore();

  React.useEffect(() => {
    return () => {
      generationRef.current++;
    };
  });

  React.useEffect(() => {
    if (!src) {
      return;
    }

    if (imageCache[src]) {
      setObjectUrl(imageCache[src]);
      return;
    }
    const generation = ++generationRef.current;
    const db = $.getOfflineDB(getState());

    const handleBlob = (blob: Blob) => {
      if (generation !== generationRef.current) {
        return;
      }

      imageCache[src] = URL.createObjectURL(blob);
      setObjectUrl(imageCache[src]);
    };

    (async () => {
      if (db) {
        try {
          const file = await db.getFile(src);
          if (file?.type === 'blob') {
            handleBlob(file.blob);
          }
        } catch (error) {
          console.error('Error with indexeddb', error);
        }
      }

      dropbox
        .filesDownload({ path: src })
        .then(async ({ result }) => {
          const blob: Blob = (result as T.BlobFileMetadata).fileBlob;
          handleBlob(blob);
          if (db) {
            const metadata = fixupFileMetadata(result);
            await db.addBlobFile(metadata, blob);
          }
        })
        .catch((error) => {
          console.error('<DropboxImage /> error:', error);
          setIs404(true);
        });
    })().catch((error) => {
      console.error('DropboxImage had async error', error);
    });
  }, [dropbox, src]);

  if (is404) {
    return (
      <img
        className="missing-image"
        alt={'Missing Image: ' + (src ?? '')}
      ></img>
    );
  }

  return <img className="mediaImage" src={objectUrl} />;
}
