import * as React from 'react';
import './Reading.css';
import { A, $$, Hooks, T } from 'src';
import { dropboxErrorMessage, getPathFileNameNoExt, pathJoin } from 'src/utils';
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
  } else {
    return <ViewReadingFile />;
  }
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

  const unknownStems = $$.getUnknownStems();
  const selectedStemIndex = $$.getSelectedStemIndex();
  const selectedStem =
    selectedStemIndex === null || !unknownStems
      ? null
      : unknownStems[selectedStemIndex];

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

  return (
    <>
      <div className="lcReadingContainer">
        <div className="lcReadingLeft">
          <div className="lcReadingStickyHeader">
            {hideEditor ? (
              <button
                className="button"
                type="button"
                onClick={() => dispatch(A.hideEditor(false))}
              >
                Edit
              </button>
            ) : null}
          </div>
          <h1>{title}</h1>
          {paragraphs.map((paragraph) => {
            if (!selectedStem || !areStemsActive) {
              return <p key={paragraph}>{paragraph}</p>;
            }
            return (
              <p key={paragraph}>
                {applyClassToWords(
                  paragraph,
                  selectedStem.tokens,
                  'lcReadingHovered',
                )}
              </p>
            );
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
