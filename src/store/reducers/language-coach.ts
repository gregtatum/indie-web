import * as T from 'src/@types';
import { combineReducers } from 'redux';
import { getLanguageByCode } from 'src/logic/languages';

function path(state = '', action: T.Action): string {
  switch (action.type) {
    case 'view-language-coach':
      return action.path;
    default:
      return state;
  }
}

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

function selectedStem(
  state: null | number = 3,
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

function ignoredStems(
  state: Set<string> = new Set(),
  action: T.Action,
): Set<string> {
  switch (action.type) {
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
    case 'load-language-data':
      return new Set(action.languageData.ignoredStems);
    case 'view-language-coach':
      return new Set();
    default:
      return state;
  }
}

function learnedStems(
  state: Set<string> = new Set(),
  action: T.Action,
): Set<string> {
  switch (action.type) {
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
    case 'load-language-data':
      return new Set(action.languageData.learnedStems);
    case 'update-learned-words': {
      const { words } = action;
      return words;
    }
    case 'change-language':
      throw new Error('TODO');
    default:
      return state;
  }
}

function language(
  state: T.Language = getLanguageByCode('es'),
  action: T.Action,
) {
  switch (action.type) {
    case 'change-language': {
      return getLanguageByCode(action.code);
    }
    default:
      return state;
  }
}

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

export const languageCoachReducer = combineReducers({
  path,
  ignoredStems,
  language,
  learnedStems,
  selectedSentences,
  selectedStem,
  stems,
  undoList,
});
