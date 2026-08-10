import * as React from 'react';
import { type Hunspell } from 'hunspell-wasm';
import { type default as OpenAI } from 'openai';
import { $$, A, Hooks, T } from 'frontend';
import { computeStems } from 'frontend/logic/language-tools';
import { isElementInViewport } from 'frontend/utils';

export function useHunspell() {
  const languageCode = $$.getLanguageCode();
  const [hunspell, setHunspell] = React.useState<Hunspell | undefined>();

  React.useEffect(() => {
    // TODO - Implement proper async behavior here and error handling.
    (async () => {
      const [{ createHunspellFromStrings }, affResponse, dicResponse] =
        await Promise.all([
          import(/* webpackChunkName: "hunspell" */ 'hunspell-wasm'),
          fetch(`dictionaries/${languageCode}/index.aff`),
          fetch(`dictionaries/${languageCode}/index.dic`),
        ]);
      const affixes = await affResponse.text();
      const dictionary = await dicResponse.text();

      console.log(`Hunspell loaded for "${languageCode}".`);
      setHunspell(await createHunspellFromStrings(affixes, dictionary));
    })().catch((error) => console.error(error));
  }, [languageCode]);

  return hunspell;
}

/**
 * Lazily loads the OpenAI SDK and creates a client once an API key is available.
 */
export function useOpenAI(apiKey: string | null): OpenAI | undefined {
  const [openAI, setOpenAI] = React.useState<OpenAI | undefined>();

  React.useEffect(() => {
    if (!apiKey) {
      setOpenAI(undefined);
      return undefined;
    }
    let canceled = false;
    import(/* webpackChunkName: "openai" */ 'openai')
      .then(({ default: OpenAI }) => {
        if (canceled) {
          return;
        }
        // An OAuth flow here would be nice.
        // https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
        const dangerouslyAllowBrowser = true;
        setOpenAI(new OpenAI({ apiKey, dangerouslyAllowBrowser }));
      })
      .catch((error) => console.error(error));
    return () => {
      canceled = true;
    };
  }, [apiKey]);

  return openAI;
}

/**
 * Compute stems for the input text.
 */
export function useStems(text: string): T.Stem[] | null {
  const hunspell = useHunspell();
  const [stems, setStems] = React.useState<T.Stem[] | null>(null);
  React.useEffect(() => {
    if (text && hunspell) {
      // Remove commented out lines.
      const filteredText = text
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n');

      setStems(computeStems(hunspell, filteredText));
    }
  }, [text, hunspell]);
  return stems;
}

export function useStemNavigation(
  stemsContainer: React.RefObject<HTMLDivElement>,
) {
  const dispatch = Hooks.useDispatch();
  Hooks.useListener(stemsContainer, 'focus', [], () => {
    dispatch(A.setAreStemsActive(true));
  });
  Hooks.useListener(stemsContainer, 'blur', [], () => {
    dispatch(A.setAreStemsActive(false));
  });

  Hooks.useListener(stemsContainer, 'keydown', [], (event) => {
    let stemIndex;
    const keyboardEvent = event as KeyboardEvent;

    switch (keyboardEvent.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Prevent scrolling.
        event.preventDefault();
        break;
      default:
    }

    switch (keyboardEvent.key) {
      case 'j':
      case 'ArrowDown':
        stemIndex = dispatch(A.selectNextStem(1));
        break;
      case 'k':
      case 'ArrowUp':
        stemIndex = dispatch(A.selectNextStem(-1));
        break;
      case 'i':
        dispatch(A.ignoreSelectedStem());
        break;
      case 'l':
        dispatch(A.learnSelectedStem());
        break;
      case 'ArrowLeft':
        dispatch(A.nextSentence(-1));
        break;
      case 'ArrowRight':
        dispatch(A.nextSentence(1));
        break;
      case 'z':
        if (
          (keyboardEvent.ctrlKey || keyboardEvent.metaKey) &&
          !keyboardEvent.shiftKey
        ) {
          dispatch(A.applyUndo());
        }
        break;
      default:
      // Do nothing.
    }
    if (stemIndex !== undefined) {
      const selector = `[data-stem-index="${stemIndex}"]`;
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Could not find stem element from ${selector}`);
      }

      if (!isElementInViewport(element)) {
        element.scrollIntoView();
      }
    }
  });
}
