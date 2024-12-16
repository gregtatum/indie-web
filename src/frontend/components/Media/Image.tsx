import * as React from 'react';
import { $$ } from 'frontend';
import { downloadImage } from 'frontend/logic/download-image';

interface Props {
  folderPath: string;
  line: { src: string };
}

export function MediaImage({ folderPath, line: { src } }: Props) {
  const fileSystem = $$.getCurrentFS();
  const [objectUrl, setObjectUrl] = React.useState<string>('');
  const [is404, setIs404] = React.useState<boolean>(false);
  const generationRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      generationRef.current++;
    };
  });

  React.useEffect(() => {
    if (!src) {
      return;
    }
    downloadImage(fileSystem, folderPath, src)
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
