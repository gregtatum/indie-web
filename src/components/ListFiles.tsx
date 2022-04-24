import * as React from 'react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { type files } from 'dropbox';
import * as $ from 'src/store/selectors';

import './ListFiles.css';

export function ListFiles() {
  const dropbox = useSelector($.getDropbox);
  const [error, setError] = useState();
  const [entries, setEntries] =
    useState<
      Array<files.FileMetadataReference | files.FolderMetadataReference>
    >();

  useEffect(() => {
    console.log(
      dropbox
        .filesListFolder({ path: '' })
        .then((response) => {
          const entries = [];
          for (const entry of response.result.entries) {
            if (entry['.tag'] === 'file' || entry['.tag'] === 'folder') {
              entries.push(entry);
            }
          }
          setEntries(entries);
        })
        .catch((...args) => {
          console.log(args);
          const [error] = args;
          setError(error?.message ?? error?.toString() ?? 'There was an error');
        }),
    );
  }, []);

  if (error) {
    return error;
  }

  if (entries) {
    return (
      <div className="listFiles">
        {entries.map(({ name, id }) => {
          return (
            <div className="listFiles" key={id}>
              Name: {name}
            </div>
          );
        })}
      </div>
    );
  }

  return <div className="listFiles">Your files</div>;
}
