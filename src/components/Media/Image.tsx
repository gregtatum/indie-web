import * as React from 'react';
import { $, Hooks } from 'src';
import { downloadImage } from 'src/logic/download-image';

interface Props {
  folderPath: string;
  line: { src: string };
}

export function MediaImage({ folderPath, line: { src } }: Props) {
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const [objectUrl, setObjectUrl] = React.useState<string>('');
  const [is404, setIs404] = React.useState<boolean>(false);
  const generationRef = React.useRef(0);
  const db = Hooks.useSelector($.getOfflineDB);

  React.useEffect(() => {
    return () => {
      generationRef.current++;
    };
  });

  React.useEffect(() => {
    if (!src) {
      return;
    }
    downloadImage(fileSystem, db, folderPath, src)
      .then((objectURL) => {
        setObjectUrl(objectURL);
      })
      .catch(() => {
        setIs404(true);
      });
  }, [fileSystem, src]);

  if (is404) {
    return (
      <img className="missing-image" alt={`Missing Image: "${src}"`}></img>
    );
  }

  return <img className="mediaImage" src={objectUrl} />;
}
