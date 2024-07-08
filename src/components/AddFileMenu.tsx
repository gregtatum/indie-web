import * as React from 'react';
import * as Router from 'react-router-dom';
import { A, T, $, Hooks } from 'src';
import { ensureExists, pathJoin } from 'src/utils';
import { useStore } from '../hooks';
import { UnhandledCaseError } from '../utils';
import { FileSystem, FileSystemError } from 'src/logic/file-system';

import { Menu, menuPortal } from './Menus';
import './AddFileMenu.css';
import { getLanguageByCode } from '../logic/languages';

const order =
  process.env.SITE === 'floppydisk'
    ? ['Folder', 'Markdown', 'ChordPro', 'Language Coach', 'Upload File']
    : ['ChordPro', 'Folder', 'Markdown', 'Upload File'];

type FileDetails =
  | {
      slug: string;
      extension: string;
      getDefaultContents: (fileName: string) => string;
      isSubmitting: boolean;
      type: 'text';
    }
  | {
      isSubmitting: boolean;
      extension: string;
      type: 'language-coach';
    }
  | {
      isSubmitting: boolean;
      type: 'folder';
    }
  | {
      isSubmitting: boolean;
      type: 'upload-file';
    };

interface AddFileMenuProps {
  path: string;
}
export function AddFileMenu(props: AddFileMenuProps) {
  const button = React.useRef<null | HTMLButtonElement>(null);
  const [fileDetails, setFileDetails] = React.useState<FileDetails | null>(
    null,
  );
  const [openGeneration, setOpenGeneration] = React.useState(0);
  const [openEventDetail, setOpenEventDetail] = React.useState(-1);
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const fsName = Hooks.useSelector($.getCurrentFileSystemName);
  const { dispatch, getState } = useStore();
  const input = React.useRef<HTMLInputElement | null>(null);
  const navigate = Router.useNavigate();
  const [error, setError] = React.useState<null | string>(null);

  React.useEffect(() => {
    if (fileDetails) {
      if (fileDetails.isSubmitting) {
        setError(null);
      } else {
        input.current?.focus();
        input.current?.setSelectionRange(0, 0);
      }
    }
  }, [fileDetails]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const inputEl = ensureExists(input.current, 'Input ref value');
    const path = pathJoin(props.path, inputEl.value);
    if (!fileDetails) {
      throw new Error('No file details when they were expected');
    }

    setFileDetails({
      ...fileDetails,
      isSubmitting: true,
    });

    switch (fileDetails.type) {
      case 'text': {
        const { getDefaultContents, slug } = fileDetails;
        fileSystem
          .saveText(path, 'add', getDefaultContents(inputEl.value))
          .then(
            (fileMetadata) => {
              // The directory listing is now stale, fetch it again.
              void dispatch(A.listFiles(props.path));
              if ($.getHideEditor(getState())) {
                dispatch(A.hideEditor(false));
              }
              navigate(pathJoin(fsName, slug, fileMetadata.path));
            },
            (error: FileSystemError) => {
              let err = error.toString();
              if (error.status() === 409) {
                err =
                  'That file already exists, please choose a different name.';
              }
              setError(err);
              setFileDetails({
                ...fileDetails,
                isSubmitting: false,
              });
            },
          );
        break;
      }
      case 'folder': {
        fileSystem.createFolder(path).then(
          (folderMetadata) => {
            // The directory listing is now stale, fetch it again.
            void dispatch(A.listFiles(props.path));
            navigate(pathJoin(fsName, 'folder', folderMetadata.path));
          },
          (error) => {
            setError(error.toString());
            setFileDetails({
              ...fileDetails,
              isSubmitting: false,
            });
          },
        );
        break;
      }
      case 'language-coach': {
        createLanguageCoach(path, fileSystem, fileDetails.code)
          .then((normalizedPath) => {
            void dispatch(A.listFiles(props.path));
            navigate(pathJoin(fsName, 'folder', normalizedPath));
          })
          .catch((error) => {
            setError(error.toString());
            setFileDetails({
              ...fileDetails,
              isSubmitting: false,
            });
          });
        break;
      }
      case 'upload-file': {
        // Do nothing.
        break;
      }
      default:
        throw new UnhandledCaseError(fileDetails, 'FileDetails');
    }
  }

  const items: Record<string, () => void> = {
    Folder() {
      setFileDetails({
        isSubmitting: false,
        type: 'folder',
      });
    },
    Markdown() {
      setFileDetails({
        slug: 'md',
        extension: 'md',
        isSubmitting: false,
        type: 'text',
        getDefaultContents: markdownDefaultContents,
      });
    },
    ChordPro() {
      setFileDetails({
        slug: 'file',
        extension: 'chopro',
        getDefaultContents: choproDefaultContents,
        type: 'text',
        isSubmitting: false,
      });
    },
    'Upload File': () => {
      // Wrap this in a raF because the menu wasn't closing otherwise.
      requestAnimationFrame(() => {
        const fileInput = document.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('multiple', 'true');
        document.body.appendChild(fileInput);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        fileInput.addEventListener('change', async () => {
          const { files } = fileInput;
          if (!files) {
            return;
          }
          for (const file of files) {
            const path = pathJoin(props.path, file.name);
            const messageGeneration = dispatch(
              A.addMessage({
                message: (
                  <>
                    Adding <code>{file.name}</code>
                  </>
                ),
              }),
            );

            try {
              await fileSystem.saveBlob(path, 'add', file);
              dispatch(
                A.addMessage({
                  message: (
                    <>
                      Added <code>{file.name}</code>
                    </>
                  ),
                  generation: messageGeneration,
                  timeout: true,
                }),
              );
              dispatch(A.listFiles(props.path)).catch((error) => {
                console.error(error);
                dispatch(
                  A.addMessage({
                    message: (
                      <>
                        Error listing files <code>{props.path}</code>
                      </>
                    ),
                    timeout: true,
                    generation: messageGeneration,
                  }),
                );
              });
            } catch (error) {
              console.error(error);
              dispatch(
                A.addMessage({
                  message: (
                    <>
                      Error saving <code>{path}</code>
                    </>
                  ),
                  timeout: true,
                  generation: messageGeneration,
                }),
              );
            }
          }
        });
        fileInput.click();
        fileInput.remove();
      });
    },
    'Language Coach': () => {
      setFileDetails({
        type: 'language-coach',
        extension: 'coach',
        code,
        isSubmitting: false,
      });
    },
  };

  let component;
  if (fileDetails) {
    const disabled = fileDetails.isSubmitting;
    component = (
      <>
        {error ? <div className="addFileMenuError">{error}</div> : null}
        <form className="addFileMenuForm" onSubmit={onSubmit}>
          <input
            type="text"
            className="addFileMenuInput"
            ref={input}
            defaultValue={
              'extension' in fileDetails ? '.' + fileDetails.extension : ''
            }
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setFileDetails(null);
              }
            }}
          />
          <input
            type="submit"
            value={getSubmitButtonValue(fileDetails)}
            className="button"
            disabled={disabled}
          />
        </form>
      </>
    );
  } else {
    component = (
      <button
        type="button"
        className="button addFileMenuButton"
        ref={button}
        onClick={(event) => {
          setOpenGeneration((generation) => generation + 1);
          setOpenEventDetail(event.detail);
        }}
      >
        Add File or Folder
      </button>
    );
  }

  return (
    <>
      {component}
      {menuPortal(
        <Menu
          clickedElement={button}
          openEventDetail={openEventDetail}
          openGeneration={openGeneration}
          buttons={order.map((buttonName) => ({
            key: buttonName,
            children: buttonName,
            onClick: items[buttonName],
          }))}
        />,
      )}
    </>
  );
}

function choproDefaultContents(fileName: string): string {
  const title = fileName.replace(/\.chopro$/, '');
  let contents = `{title: ${title}}\n{subtitle: Unknown}`;
  const match = /^(.*) - (.*).*$/.exec(title);
  if (match) {
    contents = `{title: ${match[1]}}\n{subtitle: ${match[2]}}`;
  }
  return contents;
}

function markdownDefaultContents(fileName: string): string {
  const title = fileName.replace(/\.md$/, '');
  return `# ${title}\n`;
}

function getSubmitButtonValue(fileDetails: FileDetails): string {
  switch (fileDetails.type) {
    case 'text': {
      const { isSubmitting, slug } = fileDetails;
      if (isSubmitting) {
        return 'Submitting…';
      }
      if (slug === 'md') {
        return 'Add Markdown File';
      }
      if (slug === 'file') {
        return 'Add ChordPro File';
      }
      throw new Error('Unknown file type.');
    }
    case 'folder': {
      return fileDetails.isSubmitting ? 'Adding Folder…' : 'Add Folder';
    }
    case 'language-coach': {
      return fileDetails.isSubmitting
        ? 'Adding Language Coach…'
        : 'Add Language';
    }
    case 'upload-file':
      throw new Error('Upload file does not have a submit button.');
    default:
      throw new UnhandledCaseError(fileDetails, 'FileDetails');
  }
}

async function createLanguageCoach(
  path: string,
  fileSystem: FileSystem,
  code: string,
): Promise<string> {
  if (!path.endsWith('.coach')) {
    throw new Error('The Language Coach must end in .coach');
  }
  const folderMetadata = await fileSystem.createFolder(path);
  const normalizedPath = folderMetadata.path;
  const data: T.LanguageDataV1 = {
    description: 'The data store for the language coach',
    lastSaved: Date.now(),
    language: getLanguageByCode(code),
    version: 1,
    learnedStems: [],
    ignoredStems: [],
  };
  await fileSystem.saveText(
    pathJoin(normalizedPath, 'words.json'),
    'overwrite',
    JSON.stringify(data),
  );

  return normalizedPath;
}
