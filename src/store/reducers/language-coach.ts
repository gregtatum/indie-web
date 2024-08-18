import * as T from 'src/@types';
import { combineReducers } from 'redux';

/**
 * This is the path to the language coach, which may be different from the current file.
 *
 * /French.coach/reading/Blog.txt?section=reading
 * ^^^^^^^^^^^^^
 */
function path(state = '', action: T.Action): string {
  switch (action.type) {
    case 'view-language-coach':
      return action.coachPath;
    default:
      return state;
  }
}

/**
 * The stems after a frequency analysis.
 */
function stems(
  state: T.Stem[] | null = null,
  action: T.Action,
): T.Stem[] | null {
  switch (action.type) {
    case 'stem-frequency-analysis':
      return action.stems;
    default:
      return state;
  }
}

/**
 * The currently selected stem in a frequency analysis.
 */
function selectedStem(
  state: null | number = null,
  action: T.Action,
): null | number {
  switch (action.type) {
    case 'select-stem':
      return action.stemIndex;
    case 'stem-frequency-analysis':
      return null;
    default:
      return state;
  }
}

/**
 * The stems to be ignored in a frequency analysis. These can be proper names or
 * non-word things like acronyms, or non-sensical stems.
 */
function ignoredStems(
  state: Set<string> = new Set(),
  action: T.Action,
): Set<string> {
  switch (action.type) {
    case 'load-language-data':
      return new Set(action.languageData.ignoredStems);
    case 'ignore-stem': {
      const { stem } = action;
      const stems = new Set(state);
      stems.add(stem);
      return stems;
    }
    case 'undo-ignore-stem': {
      const { stem } = action;
      const stems = new Set(state);
      stems.delete(stem);
      return stems;
    }
    case 'update-ignored-words': {
      const { words } = action;
      return words;
    }
    default:
      return state;
  }
}

/**
 * This is the set of learned stems.
 */
function learnedStems(
  state: Set<string> = new Set(),
  action: T.Action,
): Set<string> {
  switch (action.type) {
    case 'load-language-data':
      return new Set(action.languageData.learnedStems);
    case 'learn-stem': {
      const { stem } = action;
      const stems = new Set(state);
      stems.add(stem);
      return stems;
    }
    case 'undo-learn-stem': {
      const { stem } = action;
      const stems = new Set(state);
      stems.delete(stem);
      return stems;
    }
    case 'update-learned-words': {
      const { words } = action;
      return words;
    }
    default:
      return state;
  }
}

/**
 * The language that is being studied.
 */
function language(state: T.Language, action: T.Action): T.Language {
  switch (action.type) {
    case 'load-language-data':
      return action.languageData.language;
    default:
      if (action.type.startsWith('@@redux')) {
        // This is an internal action, ignore it.
        return state ?? null;
      }
      if (!state) {
        throw new Error('Expected there to be an initiated language');
      }
      return state;
  }
}

/**
 * The undo history for the stem analysis and learning words.
 */
function undoList(state: T.Action[] = [], action: T.Action): T.Action[] {
  switch (action.type) {
    case 'learn-stem':
    case 'ignore-stem': {
      return [...state, action];
    }
    case 'view-language-coach':
    case 'load-language-data':
      return [];
    case 'undo-learn-stem':
    case 'undo-ignore-stem': {
      const newState = state.slice();
      newState.pop();
      return newState;
    }
    default:
      return state;
  }
}

/**
 * The currently selected sentence in the frequency analysis.
 */
function selectedSentences(
  state: Map<string, number> = new Map(),
  action: T.Action,
): Map<string, number> {
  switch (action.type) {
    case 'stem-frequency-analysis':
      return new Map();
    case 'next-sentence': {
      const { stem, direction } = action;
      const currentIndex = state.get(stem.stem) ?? 0;
      const sentencesLength = stem.sentences.length;
      const newState = new Map(state);
      const nextIndex =
        (sentencesLength + currentIndex + direction) % sentencesLength;
      newState.set(stem.stem, nextIndex);
      return newState;
    }
    default:
      return state;
  }
}

function setLanguageCoachSection(
  state: T.LanguageCoachSection = 'home',
  action: T.Action,
): T.LanguageCoachSection {
  switch (action.type) {
    case 'set-language-coach-section':
      return action.section;
    default:
      return state;
  }
}

function lastReadingPath(
  state: string | null = null,
  action: T.Action,
): string | null {
  switch (action.type) {
    case 'view-language-coach':
      if (action.coachPath !== action.path) {
        return action.path;
      }
      return state;
    case 'set-language-coach-section':
      if (action.section === 'reading' && action.coachPath === action.path) {
        // We're at the reading main page.
        return null;
      }
      return state;
    default:
      return state;
  }
}

function areStemsActive(state = false, action: T.Action): boolean {
  switch (action.type) {
    case 'set-are-stems-active':
      return action.isActive;
    default:
      return state;
  }
}

const dataReducer = combineReducers({
  ignoredStems,
  language,
  learnedStems,
  selectedSentences,
  selectedStem,
  stems,
  undoList,
  lastReadingPath,
  areStemsActive,
});

export type LanguagCoachDataState = ReturnType<typeof dataReducer>;

/**
 * Wrap the data reducer, to only run it if the data is actually available.
 */
function dataOrNullReducer(
  state: LanguagCoachDataState | null = null,
  action: T.Action,
): LanguagCoachDataState | null {
  if (action.type === 'load-language-data') {
    // Initiate the reducer.
    return dataReducer(undefined, action);
  }
  if (!state) {
    return null;
  }
  if (action.type === 'view-language-coach' && action.invalidateOldData) {
    return null;
  }

  return dataReducer(state, action);
}

export const languageCoachReducer = combineReducers({
  path,
  data: dataOrNullReducer,
  section: setLanguageCoachSection,
});
