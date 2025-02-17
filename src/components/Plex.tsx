import * as React from 'react';
import './Plex.css';
import { Hooks, A, $$ } from 'src';

interface PlexAlbum {
  title: string;
  artist: string;
  key: string;
  thumb?: string;
}

async function getAlbumsFromPlexServer(
  serverUrl: string,
  token: string,
): Promise<PlexAlbum[]> {
  try {
    // Fetch library sections
    const sectionsResponse = await fetch(`${serverUrl}/library/sections`, {
      headers: {
        'X-Plex-Token': token,
      },
    });

    if (!sectionsResponse.ok) {
      throw new Error(
        `Failed to fetch library sections: ${sectionsResponse.statusText}`,
      );
    }
    const text = await sectionsResponse.text();
    console.log(`!!! text`, text);

    const sectionsData = await sectionsResponse.json();

    // Locate the music library section
    const musicSection = sectionsData.MediaContainer.Directory.find(
      (section: any) => section.type === 'artist',
    );
    if (!musicSection) {
      throw new Error('No music library found on the server.');
    }

    // Fetch albums from the music library section
    const albumsResponse = await fetch(
      `${serverUrl}/library/sections/${musicSection.key}/all?type=9`,
      {
        headers: {
          'X-Plex-Token': token,
        },
      },
    );

    if (!albumsResponse.ok) {
      throw new Error(`Failed to fetch albums: ${albumsResponse.statusText}`);
    }

    const albumsData = await albumsResponse.json();

    // Map the results to a list of albums
    const albums = albumsData.MediaContainer.Metadata.map((album: any) => ({
      title: album.title,
      artist: album.parentTitle,
      key: album.key,
      thumb: album.thumb
        ? `${serverUrl}${album.thumb}?X-Plex-Token=${token}`
        : undefined,
    }));

    return albums;
  } catch (error) {
    console.error('Error fetching albums:', error);
    throw error;
  }
}

export function Plex() {
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const file = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);

  React.useEffect(() => {
    if (path) {
      document.title = path;
    } else {
      const parts = path.split('/');
      const file = parts[parts.length - 1];
      document.title = file.replace(/\.plex$/, '');
    }
  }, [path, path]);

  React.useEffect(() => {
    if (!file) {
      void dispatch(A.downloadFile(path));
    }
  }, [file]);

  if (!file) {
    if (error) {
      return <div className="status">There was an error: {error}</div>;
    }
    return <div className="status">Downloading…</div>;
  }

  const server = 'http://100.116.148.70:32400';
  getAlbumsFromPlexServer(server, '').then(
    (albums) => {
      console.log(`!!! albums`, albums);
    },
    (error) => console.error(error),
  );

  return <div className="plex">Plex {file?.text}</div>;
}
