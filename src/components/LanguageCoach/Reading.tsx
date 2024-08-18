import * as React from 'react';
import './Reading.css';
import { A, $$, Hooks, T } from 'src';
import {
  dropboxErrorMessage,
  getPathFileNameNoExt,
  isElementInViewport,
  pathJoin,
} from 'src/utils';
import { File, ListFilesSkeleton } from '../ListFiles';
import { useRetainScroll } from 'src/hooks';
import { NextPrevLinks, useNextPrevSwipe } from '../NextPrev';
import { TextArea } from '../TextArea';
import { Splitter } from '../Splitter';
import { useStemNavigation, useStems } from './hooks';
import { applyClassToWords } from 'src/logic/language-tools';
import * as Router from 'react-router-dom';

export function Reading() {
  const coachPath = $$.getLanguageCoachPath();
  const path = $$.getPath();

  if (coachPath === path) {
    return (
      <div className="lcReading">
        <Add />
        <ReadingList />
      </div>
    );
  }

  return <ViewReadingFile />;
}

function ReadingList() {
  const fsName = $$.getCurrentFileSystemName();
  const listFilesCache = $$.getListFilesCache();
  const readingPath = pathJoin($$.getLanguageCoachPath(), 'reading');
  const files = listFilesCache.get(readingPath);
  const dispatch = Hooks.useDispatch();

  React.useEffect(() => {
    if (!files) {
      void dispatch(A.listFiles(readingPath));
    }
  }, [files]);

  if (!files) {
    return <ListFilesSkeleton />;
  }

  return (
    <div className="listFilesList lcReadingListFiles">
      {files.map((file) => {
        return (
          <div key={file.id} className="listFilesFile">
            <File
              file={file}
              hideExtension={true}
              linkOverride={`${fsName}/language-coach${file.path}?section=reading`}
            />
          </div>
        );
      })}
    </div>
  );
}

function Add() {
  const dispatch = Hooks.useDispatch();
  const fileSystem = $$.getCurrentFS();
  const fsName = $$.getCurrentFileSystemName();
  const path = $$.getLanguageCoachPath();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const navigate = Router.useNavigate();
  const [canSubmit, setCanSubmit] = React.useState(false);

  function addReadingMaterial(event: Event | React.FormEvent) {
    event.preventDefault();
    let title = inputRef.current?.value;
    setErrorMessage(null);
    if (!title) {
      inputRef.current?.focus();
      setErrorMessage('Please add a title for the reading material.');
      return;
    }
    title = title.replaceAll('/', '');
    title = title.replaceAll('\\', '');
    const readingPath = pathJoin(path, 'reading');
    const savePath = pathJoin(readingPath, `${title}.txt`);

    fileSystem
      .saveText(savePath, 'add', '')
      .then(() => dispatch(A.listFiles(readingPath)))
      .then(
        () => {
          console.log(
            `!!! navigate`,
            `${fsName}/language-coach${savePath}?section=reading`,
          );
          navigate(`${fsName}/language-coach${savePath}?section=reading`);
        },
        (error) => {
          console.error(error);
          setErrorMessage(dropboxErrorMessage(error));
        },
      );
  }

  function hideError() {
    setErrorMessage(null);
  }

  return (
    <form className="lcReadingAdd" onSubmit={addReadingMaterial}>
      <p>
        Add text from a book, article, or podcast transcript to begin reading.
        Language Coach will help you along the way.
      </p>
      {errorMessage ? (
        <div className="lcReadingErrorMessage">{errorMessage}</div>
      ) : null}
      <label htmlFor="lcReadingTitleInput">Title for reading material</label>
      <input
        className="lcReadingTitleInput"
        id="lcReadingTitleInput"
        ref={inputRef}
        onBlur={hideError as any}
        placeholder="Filename…"
        onKeyUp={() => {
          setCanSubmit(Boolean(inputRef.current?.value));
        }}
      />
      <button
        type="submit"
        className="lcButton lcReadingAddButton"
        onClick={addReadingMaterial}
        disabled={!canSubmit}
      >
        Add reading material
      </button>
    </form>
  );
}

export function ViewReadingFile() {
  useRetainScroll();
  const dispatch = Hooks.useDispatch();
  const path = $$.getPath();
  const textFile = $$.getDownloadFileCache().get(path);
  const error = $$.getDownloadFileErrors().get(path);
  const hideEditor = $$.getHideEditor();
  const swipeDiv = React.useRef(null);
  useNextPrevSwipe(swipeDiv);

  React.useEffect(() => {
    document.title = getPathFileNameNoExt(path);
  }, [path]);

  React.useEffect(() => {
    if (textFile === undefined) {
      void dispatch(A.downloadFile(path));
    }
  }, [textFile]);

  if (textFile === undefined) {
    if (error) {
      return (
        <div className="status" ref={swipeDiv}>
          <NextPrevLinks />
          {error}
        </div>
      );
    }
    return (
      <div className="status" ref={swipeDiv}>
        <NextPrevLinks />
        Downloading…
      </div>
    );
  }

  if (hideEditor) {
    return (
      <div className="splitterSolo lcReadingSolo" ref={swipeDiv} key={path}>
        <RenderedReading />
      </div>
    );
  }

  return (
    <Splitter
      className="splitterSplit"
      start={<TextArea path={path} textFile={textFile} />}
      end={<RenderedReading />}
      persistLocalStorage="lcReadingSplitterOffset"
    />
  );
}

function RenderedReading() {
  const text = $$.getActiveFileText();
  const title = getPathFileNameNoExt($$.getPath());
  const hideEditor = $$.getHideEditor();
  const areStemsActive = $$.getAreStemsActive();
  const dispatch = Hooks.useDispatch();
  const language = $$.getLanguageCode();
  const container = React.useRef<null | HTMLDivElement>(null);
  const [showHelp, setShowHelp] = React.useState<boolean>(false);

  const unknownStems = $$.getUnknownStems();
  const selectedStemIndex = $$.getSelectedStemIndex();
  const selectedStem =
    selectedStemIndex === null || !unknownStems
      ? null
      : unknownStems[selectedStemIndex];

  const selectedSentence = $$.getSelectedSentence();
  const segmenter = React.useMemo(
    () => new Intl.Segmenter(language, { granularity: 'sentence' }),
    [],
  );

  const paragraphs = React.useMemo(() => {
    const paragraphs: string[] = [];
    let nextParagraph = '';
    for (let line of text.split('\n')) {
      line = line.trim();

      if (line) {
        if (nextParagraph) {
          nextParagraph += ' ';
        }
        nextParagraph += line;
      } else {
        paragraphs.push(nextParagraph);
        nextParagraph = '';
      }
    }
    if (nextParagraph) {
      paragraphs.push(nextParagraph);
    }
    return paragraphs;
  }, [text]);

  React.useEffect(() => {
    if (!selectedSentence || !container.current) {
      return;
    }
    const element = container.current.querySelector(
      '.lcReadingSelectedSentence',
    );
    if (element && !isElementInViewport(element)) {
      element.scrollIntoView();
    }
  }, [selectedSentence]);

  return (
    <>
      {showHelp ? (
        <div className="lcReadingTop">
          <p>
            A study list is generated whenever you add reading material. This
            makes it easy to prioritize your language learning by learning the
            most common words in some text. For instance, if you are reading a
            blog post about a winery, the terms for wine making will probably
            show up on the top of the list. Even after a short time studying the
            words, it can be easy to then ready the content.
          </p>
          <h2>Keyboard Shortcuts</h2>
          <p>
            You can build up your known words very quickly using keyboard
            shortcuts with the study list. Marking a word as learned adds it to
            your vocab list so that you can see your progress on your language
            learning journey. Marking a word as ignored hides the word. This is
            useful for invented words, or proper nouns.
          </p>
          <p className="lcStudyListCodes">
            <code>k</code>, <code>↑</code> - Move the selected row up.
            <br />
            <code>j</code>, <code>↓</code> - Move the selected row down.
            <br />
            <code>l</code> - Mark a word as learned.
            <br />
            <code>i</code> - Mark a word as ignored.
            <br />
            <code>ctrl + z</code> - Undo the action.
            <br />
            <code>←</code>, <code>→</code> - Change the selected sentence
            <br />
          </p>
          <h2>Word Roots</h2>
          <p>
            Words are grouped by their word roots, which may remove part of the
            word, such as the verb ending or the pluralization. This way
            variations of words are grouped around the same root.
          </p>
          <p>
            <button
              type="button"
              className="inline-button"
              onClick={() => setShowHelp(false)}
            >
              Hide help
            </button>
          </p>
        </div>
      ) : null}
      <div className="lcReadingContainer" ref={container}>
        <div className="lcReadingLeft">
          <div className="lcReadingStickyHeader">
            {hideEditor ? (
              <div className="lcReadingStickyHeaderRow">
                <button
                  className="button"
                  type="button"
                  onClick={() => void setShowHelp((prevValue) => !prevValue)}
                >
                  Help
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => dispatch(A.hideEditor(false))}
                >
                  Edit
                </button>
              </div>
            ) : null}
          </div>
          <h1>{title}</h1>
          {paragraphs.map((paragraph) => {
            if (!selectedStem || !areStemsActive || !selectedSentence) {
              return <p key={paragraph}>{paragraph}</p>;
            }
            const nodes = [];

            for (const { segment } of segmenter.segment(paragraph)) {
              let node: React.ReactNode = applyClassToWords(
                segment,
                selectedStem.tokens,
                'lcReadingHovered',
              );
              if (segment.includes(selectedSentence)) {
                node = (
                  <span className="lcReadingSelectedSentence">{node} </span>
                );
              }
              nodes.push(node);
            }

            return <p key={paragraph}>{nodes}</p>;
          })}
        </div>
        {hideEditor ? <Stems /> : null}
      </div>
    </>
  );
}

function Stems() {
  const text = $$.getActiveFileText();
  const languageCode = $$.getLanguageCode();
  const stemsContainer = React.useRef<HTMLDivElement | null>(null);
  const dispatch = Hooks.useDispatch();
  const unknownStems = $$.getUnknownStems();
  const selectedStemIndex = $$.getSelectedStemIndex();

  useStemNavigation(stemsContainer);

  const stems = useStems(text);

  React.useEffect(() => {
    if (stems) {
      dispatch(A.stemFrequencyAnalysis(stems));
    }
  }, [stems]);

  return (
    <div className="lcReadingStems" tabIndex={0} ref={stemsContainer}>
      <h2>Study List</h2>
      <div className="lcReadingStemsScroll">
        {unknownStems
          ? unknownStems.map((stem, stemIndex) => (
              <>
                <StemRow
                  stem={stem}
                  key={stemIndex}
                  stemIndex={stemIndex}
                  selectedStemIndex={selectedStemIndex}
                  stemsContainer={stemsContainer}
                  languageCode={languageCode}
                />
              </>
            ))
          : null}
      </div>
    </div>
  );
}

interface StemRowProps {
  stem: T.Stem;
  stemIndex: number;
  selectedStemIndex: number | null;
  stemsContainer: React.RefObject<HTMLDivElement | null>;
  languageCode: string;
}
function StemRow({
  stem,
  selectedStemIndex,
  stemIndex,
  stemsContainer,
  languageCode,
}: StemRowProps) {
  const dispatch = Hooks.useDispatch();
  const isSelected = selectedStemIndex === stemIndex;

  let className = 'lcReadingStemsRow';
  if (isSelected) {
    className += ' selected';
  }

  return (
    <div
      className={className}
      onClick={() => {
        dispatch(A.selectStem(stemIndex));
        stemsContainer.current?.focus();
      }}
      aria-selected={isSelected}
      data-stem-index={stemIndex}
    >
      <div lang={languageCode} title={`Stem: ${stem.stem}`}>
        {stem.tokens.join(', ')}{' '}
      </div>
      <div className="lcReadingStemCount">
        <span>{stem.frequency}</span>
      </div>
      <div className="lcReadingButtons">
        <button
          type="button"
          className="lcReadingButton button"
          onClick={() => dispatch(A.learnStem(stem.stem))}
        >
          learn
        </button>
        <button
          type="button"
          className="lcReadingButton button"
          onClick={() => dispatch(A.ignoreStem(stem.stem))}
        >
          ignore
        </button>
      </div>
    </div>
  );
}
