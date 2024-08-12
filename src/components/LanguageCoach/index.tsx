import * as React from 'react';
import { A, T, $, Hooks } from 'src';
import { pathJoin, UnhandledCaseError } from 'src/utils';
import { Learned } from './Learned';
import { HomePage } from './HomePage';
import { MostUsed } from './MostUsed';
import { LCHeader } from './LCHeader';
import './index.css';

export function LanguageCoach() {
  const path = Hooks.useSelector($.getLanguageCoachPath);
  const dataOrNull = Hooks.useSelector($.getLanguageCoachDataOrNull);
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const dispatch = Hooks.useDispatch();

  React.useEffect(() => {
    if (!dataOrNull) {
      let cachedHash = '';
      let fileSystemTextReceived = false;

      // Attempt to pull it from the cache quickly.
      fileSystem.cache
        ?.loadText(pathJoin(path, 'words.json'))
        .then((text) => {
          if (fileSystemTextReceived) {
            // The cache lost the race.
            return;
          }
          cachedHash = text.metadata.hash;
          console.log('Loading from the indexeddb');
          const data = JSON.parse(text.text);
          dispatch(A.loadLanguageData(data));
        })
        .catch(console.error);

      // Kick off the potentially slower request that can go over the network.
      fileSystem.loadText(pathJoin(path, 'words.json')).then(
        (text) => {
          try {
            if (cachedHash === text.metadata.hash) {
              return;
            }
            fileSystemTextReceived = true;
            console.log('Loading from dropbox');
            const data = JSON.parse(text.text);
            dispatch(A.loadLanguageData(data));
          } catch (error) {
            console.error(error);
          }
        },
        (error) => {
          console.error(error);
          dispatch(
            A.addMessage({
              message: <>Failed to load language data.</>,
              timeout: true,
            }),
          );
        },
      );
    }
  }, [dataOrNull]);

  if (!dataOrNull) {
    return 'Loading Language Coach data';
  }
  return (
    <DataSync key={path} data={dataOrNull}>
      <div className="language-coach">
        <LCHeader />
        <Sections />
      </div>
    </DataSync>
  );
}

function Sections() {
  const section = Hooks.useSelector($.getLanguageCoachSection);
  switch (section) {
    case 'home':
      return <HomePage />;
    case 'most-used':
      return <MostUsed />;
    case 'learned':
      return <Learned />;
    default:
      throw new UnhandledCaseError(section, 'Unhandled view');
  }
}

/**
 * Syncs the data based off of a time out.
 */
function DataSync(props: {
  key: string;
  data: T.LanguagCoachDataState;
  children: any;
}) {
  const { data, children } = props;

  const dispatch = Hooks.useDispatch();

  // These can be used in the effect freely to manage state in the effect.
  const timeoutId = React.useRef<number>(-1);
  const unloadHandler = React.useRef<null | (() => string)>();
  const savePromise = React.useRef<Promise<unknown>>(Promise.resolve());
  const unloadMessageGeneration = React.useRef<null | number>(null);
  const firstLoad = React.useRef<boolean>(true);

  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const fullPath = pathJoin(
    Hooks.useSelector($.getLanguageCoachPath),
    'words.json',
  );

  const { language, learnedStems, ignoredStems } = data;
  const invalidations = [
    language,
    learnedStems,
    ignoredStems,
    fileSystem,
    fullPath,
  ];
  console.log(`!!! invalidations`, invalidations);

  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    clearTimeout(timeoutId.current);

    if (!unloadHandler.current) {
      unloadHandler.current = () => {
        unloadMessageGeneration.current = dispatch(
          A.addMessage({
            message: (
              <>
                Saving <code>{fullPath}</code>
              </>
            ),
          }),
        );
        return 'There is a pending language coach save, are you sure you want to leave?';
      };
      window.addEventListener('beforeunload', unloadHandler.current);
    }

    async function saveLanguageCoatchData() {
      try {
        // If there is a previous save attempt, wait for it to be settled.
        await savePromise.current.catch(() => {});

        const serializedData: T.LanguageDataV1 = {
          description: 'The data store for the language coach',
          lastSaved: Date.now(),
          language,
          version: 1,
          learnedStems: [...learnedStems],
          ignoredStems: [...ignoredStems],
        };

        // Kick off the save.
        savePromise.current = fileSystem.saveText(
          fullPath,
          'overwrite',
          JSON.stringify(serializedData, null, 2),
        );

        await savePromise.current;

        if (unloadMessageGeneration.current !== null) {
          // We finished saving after a user tried to leave the page.
          dispatch(
            A.addMessage({
              message: (
                <>
                  Finished saving <code>{fullPath}</code>. Feel free to close
                  the tab.
                </>
              ),
              generation: unloadMessageGeneration.current,
            }),
          );
        }
      } catch (error) {
        // The save failed, notify the user.
        console.error(error);
        dispatch(
          A.addMessage({
            message: (
              <>
                Unable to save <code>{fullPath}</code>
              </>
            ),
          }),
        );
      }

      if (unloadHandler.current) {
        window.removeEventListener('beforeunload', unloadHandler.current);
        unloadHandler.current = null;
      }
      unloadMessageGeneration.current = null;
    }

    timeoutId.current = setTimeout(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      saveLanguageCoatchData,
      5000,
    ) as unknown as number;
  }, invalidations);

  return children;
}
