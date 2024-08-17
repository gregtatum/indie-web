import * as T from 'src/@types';
import { createSelector } from 'reselect';
import { State } from 'src/@types';
import { dangerousSelector } from '.';

export function getLanguageCoach(state: State) {
  return state.languageCoach;
}

export function getLanguageCoachDataOrNull(state: State) {
  return getLanguageCoach(state).data;
}

export function getLanguageCoachPath(state: State) {
  return getLanguageCoach(state).path;
}

export function getLanguageCoachSection(state: State) {
  return getLanguageCoach(state).section;
}

export const getLanguageCoachData = dangerousSelector(
  getLanguageCoachDataOrNull,
  'The language coach data has not been downloaded.',
);

export function getStems(state: State) {
  return getLanguageCoachData(state).stems;
}

export function getSelectedStemIndex(state: State) {
  return getLanguageCoachData(state).selectedStem;
}

export function getIgnoredStems(state: State) {
  return getLanguageCoachData(state).ignoredStems;
}

export function getLearnedStems(state: State) {
  return getLanguageCoachData(state).learnedStems;
}

export function getUndoList(state: State) {
  return getLanguageCoachData(state).undoList;
}

export function getLanguage(state: State) {
  return getLanguageCoachData(state).language;
}

export function getLanguageCode(state: State) {
  return getLanguage(state).code;
}

export function getSelectedSentences(state: State) {
  return getLanguageCoachData(state).selectedSentences;
}

export function getDisplayLanguage(state: State) {
  return getLanguage(state).code;
}

export function getLastReadingPath(state: State) {
  return getLanguageCoachData(state).lastReadingPath;
}

export function getAreStemsActive(state: State) {
  return getLanguageCoachData(state).areStemsActive;
}

export function getSelectedStem(state: State) {
  const stemIndex = getSelectedStemIndex(state);
  const stems = getUnknownStems(state);
  if (stemIndex !== null && stems) {
    return stems[stemIndex];
  }
  return null;
}

export const getLearnedAndIgnoredStems = createSelector(
  getLearnedStems,
  getIgnoredStems,
  (learned, ignored) => {
    const combined = new Set(learned);
    for (const word of ignored) {
      combined.add(word);
    }
    return combined;
  },
);

export const getUnknownStems = createSelector(
  getStems,
  getLearnedAndIgnoredStems,
  (stems, ignored): T.Stem[] | null => {
    if (!stems) {
      return null;
    }
    const unknownStems = stems.filter((stem) => !ignored.has(stem.stem));
    // Limit to 1000 words.
    return unknownStems.length > 1000
      ? unknownStems.slice(0, 1000)
      : unknownStems;
  },
);

export const getSortedLearnedStems = createSelector(
  getLearnedStems,
  getLanguageCode,
  (stemsSet, languageCode): string[] => {
    const stems = [...stemsSet];
    stems.sort((a, b) => a.localeCompare(b, languageCode));
    return stems;
  },
);
