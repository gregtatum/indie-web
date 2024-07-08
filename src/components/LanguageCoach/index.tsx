import * as React from 'react';
import { A, $, Hooks } from 'src';
import { pathJoin } from 'src/utils';

export function LanguageCoach() {
  const path = Hooks.useSelector($.getLanguageCoachPath);
  const dataOrNull = Hooks.useSelector($.getLanguageCoachDataOrNull);
  const fileSystem = Hooks.useSelector($.getCurrentFS);
  const dispatch = Hooks.useDispatch();

  React.useEffect(() => {
    if (!dataOrNull) {
      fileSystem.loadText(pathJoin(path, 'words.json')).then(
        (text) => {
          try {
            const data = JSON.parse(text.text);
            dispatch(A.loadLanguageData(data));
          } catch (error) {}
        },
        (error) => {
          console.error(error);
          dispatch(
            A.addMessage({
              message: (
                <>Failed to load language data, a new file will be made.</>
              ),
              timeout: true,
            }),
          );
        },
      );
    }
  }, [dataOrNull]);

  return <div>Language Coach {path}</div>;
}
