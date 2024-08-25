import * as React from 'react';
import { type Hunspell, loadModule } from 'hunspell-asm';
import { $$, A, Hooks, T } from 'src';
import { computeStems } from 'src/logic/language-tools';
import { isElementInViewport } from 'src/utils';

export function useHunspell() {
  const languageCode = $$.getLanguageCode();
  const [hunspell, setHunspell] = React.useState<Hunspell | undefined>();

  React.useEffect(() => {
    // TODO - Implement proper async behavior here and error handling.
    (async () => {
      const affResponse = await fetch(`dictionaries/${languageCode}/index.aff`);
      const dicResponse = await fetch(`dictionaries/${languageCode}/index.dic`);
      const affBuffer = new Uint8Array(await affResponse.arrayBuffer());
      const dicBuffer = new Uint8Array(await dicResponse.arrayBuffer());

      const hunspellFactory = await loadModule();

      const affFile = hunspellFactory.mountBuffer(
        affBuffer,
        `${languageCode}.aff`,
      );
      const dictFile = hunspellFactory.mountBuffer(
        dicBuffer,
        `${languageCode}.dic`,
      );

      console.log(`Hunspell loaded for "${languageCode}".`);
      setHunspell(hunspellFactory.create(affFile, dictFile));
    })().catch((error) => console.error(error));
  }, [languageCode]);

  return hunspell;
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
