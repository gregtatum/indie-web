import * as React from 'react';
import './Reading.css';
import { A, $$, Hooks, T } from 'frontend';
import {
  dropboxErrorMessage,
  getPathFileNameNoExt,
  isElementInViewport,
  pathJoin,
} from 'frontend/utils';
import { File, ListFilesSkeleton } from '../ListFiles';
import { overlayPortal, useRetainScroll } from 'frontend/hooks';
import { NextPrevLinks, useNextPrevSwipe } from '../NextPrev';
import { TextArea } from '../TextArea';
import { Splitter } from '../Splitter';
import { useHunspell, useStemNavigation, useStems } from './hooks';
import { applyClassToWords } from 'frontend/logic/language-tools';
import * as Router from 'react-router-dom';
import { TextSelectionTooltip } from '../TextSelectionTooltip';
import { EditorView, placeholder } from '@codemirror/view';
import dedent from 'dedent';

export function Reading() {
  const coachPath = $$.getLanguageCoachPath();
  const path = $$.getPath();
  const fsSlug = $$.getCurrentFileStoreSlug();

  if (coachPath === path) {
    return (
      <div className="lcReading">
        <Add />
        <ReadingList />
      </div>
    );
  }

  return <ViewReadingFile key={fsSlug + path} />;
}

interface Word {
  word: string;
  definition: string;
  partOfSpeech: string;
  gender?: string;
  exampleArticle?: string;
}

interface Response {
  translation: string;
  unknownWords: Word[];
}

interface Query {
  sentence: string;
  unknownWords: string[];
}

function ReadingList() {
  const fsSlug = $$.getCurrentFileStoreSlug();
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

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="listFilesList lcReadingListFiles">
      {files.map((file, index) => {
        return (
          <div key={file.id} className="listFilesFile">
            <File
              file={file}
              hideExtension={true}
              isCached={false} // This isn't wired in, so just set it to false.
              linkOverride={`${fsSlug}/language-coach${file.path}?section=reading`}
              index={index}
              fileFocus={undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

function Add() {
  const dispatch = Hooks.useDispatch();
  const fileStore = $$.getCurrentFS();
  const fsSlug = $$.getCurrentFileStoreSlug();
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

    fileStore
      .saveText(savePath, 'add', '')
      .then(() => dispatch(A.listFiles(readingPath)))
      .then(
        () => {
          dispatch(A.hideEditor(false));
          navigate(`${fsSlug}/language-coach${savePath}?section=reading`);
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
  const editorOnly = $$.getEditorOnly();
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
      <div className="splitterSolo lcReadingSolo" ref={swipeDiv}>
        <RenderedReading />
      </div>
    );
  }

  const textArea = (
    <TextArea
      path={path}
      textFile={textFile}
      editorExtensions={[
        EditorView.lineWrapping,
        placeholder(
          'Paste your reading here… Mark sentences with a # if they are in English.',
        ),
      ]}
      autoSave={true}
    />
  );

  if (editorOnly) {
    return (
      <div className="splitterSolo" ref={swipeDiv}>
        {textArea}
      </div>
    );
  }

  return (
    <Splitter
      className="splitterSplit"
      start={textArea}
      end={<RenderedReading />}
      persistLocalStorage="lcReadingSplitterOffset"
    />
  );
}

function RenderedReading() {
  const text = $$.getActiveFileText();
  const languageCode = $$.getLanguageCode();
  const languageDisplayName = $$.getLanguageDisplayName();
  const unknownStems = $$.getUnknownStems();
  const selectedStemIndex = $$.getSelectedStemIndex();
  const hideEditor = $$.getHideEditor();
  const areStemsActive = $$.getAreStemsActive();
  const language = $$.getLanguageCode();
  const selectedSentence = $$.getSelectedSentence();
  const learnedOrIgnored = $$.getLearnedAndIgnoredStems();
  const openAI = $$.getOpenAIOrNull();

  const dispatch = Hooks.useDispatch();
  const container = React.useRef<null | HTMLDivElement>(null);
  const [showHelp, setShowHelp] = React.useState<boolean>(false);
  const textDivRef = React.useRef<null | HTMLDivElement>(null);
  const [selectionHolder, setSelectionHolder] = React.useState<{
    selection: null | Selection;
  }>({ selection: null });
  const overlayRef = React.useRef<null | HTMLDivElement>(null);
  const hunspell = useHunspell();
  const sentenceSegmenter = React.useMemo(
    () => new Intl.Segmenter(language, { granularity: 'sentence' }),
    [],
  );
  const wordSegmenter = React.useMemo(
    () => new Intl.Segmenter(language, { granularity: 'word' }),
    [],
  );
  const [aiResponse, setAiResponse] = React.useState<Response | null>(null);
  const aiResponseGeneration = React.useRef<number>(0);

  // The `Selection` object is shared between `getSelection` calls, so put it in
  // a "holder" object to properly trigger re-renders.
  const setSelection = (selection: Selection | null) =>
    setSelectionHolder({ selection });
  const { selection } = selectionHolder;
  const selectionText = selection?.toString();

  Hooks.useSelectionChange(
    textDivRef,
    setSelection,
    // Don't create selections on the paragraph.
    (node) => !node?.parentElement?.closest('.lcReadingCommentedParagraph'),
  );

  React.useEffect(() => {
    if (!selectionText) {
      return;
    }
    setAiResponse(null);
    if (!openAI || !hunspell) {
      return;
    }

    const unknownWords: Map<string, string> = new Map();
    const isNumber = /^\d+$/;
    for (const { segment } of wordSegmenter.segment(selectionText)) {
      const stemmedWord = (hunspell?.stem(segment)[0] ?? segment).toLowerCase();
      if (
        segment.trim() &&
        !learnedOrIgnored.has(stemmedWord) &&
        !segment.match(isNumber)
      ) {
        unknownWords.set(segment.toLowerCase(), segment);
      }
    }

    const maxCodeUnits = 500;
    let sentence = selectionText;
    if (selectionText.length > maxCodeUnits) {
      let lastIndex = 0;
      for (const { index } of wordSegmenter.segment(selectionText)) {
        if (index > maxCodeUnits) {
          break;
        }
        lastIndex = index;
      }
      if (lastIndex === 0) {
        // Send something if the index is 0.
        lastIndex = maxCodeUnits;
      }
      sentence = selectionText.slice(0, lastIndex);
    }

    const query: Query = {
      sentence,
      unknownWords: [...unknownWords.values()].slice(0, 5),
    };

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[openai] querying"`, query);
    }
    // Responses can come back out of order.
    aiResponseGeneration.current++;
    const generation = aiResponseGeneration.current;

    openAI.chat.completions
      .create({
        messages: [
          {
            role: 'system',
            content: dedent`
              You are a ${languageDisplayName} to English translation bot that responds only
              in JSON with a Response. The user sends questions as a Query.

              interface Word {
                word: string,
                definition: string,
                partOfSpeech: string,
                // If this is a gendered language, include the gender here.
                gender?: string,
                // If the word is a noun, include an example article in ${languageDisplayName}.
                // For example in Spanish, "la", "las", "el". Adapt for the current language.
                // The article should agree in gender and plural for the \`word\`
                exampleArticle?: string,
              }

              interface Response {
                translation: string,
                unknownWords: Word[]
              }

              interface Query {
                sentence: string,
                unknownWords: string[]
              }
            `,
          },
          {
            role: 'user',
            content: JSON.stringify(query),
          },
        ],
        model: 'gpt-4o-mini',
      })
      .then(
        (response) => {
          if (generation !== aiResponseGeneration.current) {
            console.log('[openai] response out of order, ignoring');
            return;
          }
          console.log(
            '[openai] response',
            response.choices[0].message.content,
            response,
          );
          try {
            const data: Response = JSON.parse(
              response.choices[0].message.content!,
            );
            setAiResponse(data);
          } catch (error) {
            console.error(error);
          }
        },
        (error) => {
          console.log(` error`, error);
        },
      );
  }, [selectionText, openAI, languageDisplayName, learnedOrIgnored]);

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

  const title = getPathFileNameNoExt($$.getPath());
  const selectedStem =
    selectedStemIndex === null || !unknownStems
      ? null
      : unknownStems[selectedStemIndex];

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
      <Help showHelp={showHelp} setShowHelp={setShowHelp} />
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
          <div lang={languageCode} ref={textDivRef}>
            {paragraphs.map((paragraph, i) => {
              const key = i + paragraph;

              paragraph = paragraph.trim();
              if (
                paragraph.startsWith('http://') ||
                paragraph.startsWith('https://')
              ) {
                return (
                  <p key={key}>
                    <a href={paragraph}>{paragraph}</a>
                  </p>
                );
              }

              if (paragraph.startsWith('#')) {
                return (
                  <p key={key} className="lcReadingCommentedParagraph">
                    {paragraph.slice(1)}
                  </p>
                );
              }

              if (!selectedStem || !areStemsActive || !selectedSentence) {
                return <p key={key}>{paragraph}</p>;
              }
              const nodes = [];

              for (const { segment } of sentenceSegmenter.segment(paragraph)) {
                let node: React.ReactNode = applyClassToWords(
                  segment,
                  selectedStem.tokens,
                  'lcReadingHovered',
                );
                if (segment.includes(selectedSentence)) {
                  node = (
                    <span key={key} className="lcReadingSelectedSentence">
                      {node}{' '}
                    </span>
                  );
                }
                nodes.push(node);
              }

              return <p key={key}>{nodes}</p>;
            })}
          </div>
        </div>
        {hideEditor ? <Stems /> : null}
        {selection?.toString()
          ? overlayPortal(
              <TextSelectionTooltip
                selection={selection}
                overlayRef={overlayRef}
                dismiss={() => {
                  setSelection(null);
                }}
              >
                <div className="lcReadingOverlay" ref={overlayRef}>
                  {aiResponse ? (
                    <AIResponse
                      response={aiResponse}
                      unknownStems={unknownStems}
                      hunspell={hunspell}
                    />
                  ) : (
                    <>
                      <b>Translating: </b>
                      {selection.toString()}
                    </>
                  )}
                </div>
              </TextSelectionTooltip>,
              selectionText,
            )
          : null}
      </div>
    </>
  );
}

function AIResponse(props: {
  response: Response;
  unknownStems: T.Stem[] | null;
  hunspell: ReturnType<typeof useHunspell>;
}) {
  const { unknownStems, hunspell } = props;
  const { translation, unknownWords } = props.response;
  const dispatch = Hooks.useDispatch();

  return (
    <>
      <div className="lcReadingTranslation">{translation}</div>
      {unknownWords.map(
        ({ word, definition, partOfSpeech, gender, exampleArticle }, i) => {
          let buttons;
          if (hunspell && unknownStems) {
            const stem = unknownStems.find((unknown) =>
              unknown.tokens.find((token) => token === word),
            );

            if (stem) {
              buttons = (
                <>
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
                </>
              );
            }
          }
          return (
            <div key={word + i} className="lcReadingOverlayUnknownWord">
              <div className="lcReadingWordSection">
                <div className="lcReadingWord">
                  {exampleArticle ? (
                    <span className="lcReadingWordArticle">
                      ({exampleArticle}){' '}
                    </span>
                  ) : null}
                  <span className="lcReadingWordWord">{word} </span>
                  <span className="lcReadingWordPOS">{partOfSpeech} </span>
                  {gender ? (
                    <span className="lcReadingWordGender">{gender} </span>
                  ) : null}
                </div>
                <div className="lcReadingTooltipButtons">{buttons}</div>
              </div>
              <div className="lcReadingDefinition">{definition}</div>
            </div>
          );
        },
      )}
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
              <StemRow
                stem={stem}
                key={stem.stem + stemIndex}
                stemIndex={stemIndex}
                selectedStemIndex={selectedStemIndex}
                stemsContainer={stemsContainer}
                languageCode={languageCode}
              />
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

interface HelpProps {
  showHelp: boolean;
  setShowHelp: (showHelp: boolean) => unknown;
}

function Help({ showHelp, setShowHelp }: HelpProps) {
  if (!showHelp) {
    return null;
  }

  return (
    <div className="lcReadingTop">
      <p>
        A study list is generated whenever you add reading material. This makes
        it easy to prioritize your language learning by learning the most common
        words in some text. For instance, if you are reading a blog post about a
        winery, the terms for wine making will probably show up on the top of
        the list. Even after a short time studying the words, it can be easy to
        then ready the content.
      </p>
      <h2>Keyboard Shortcuts</h2>
      <p>
        You can build up your known words very quickly using keyboard shortcuts
        with the study list. Marking a word as learned adds it to your vocab
        list so that you can see your progress on your language learning
        journey. Marking a word as ignored hides the word. This is useful for
        invented words, or proper nouns.
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
        word, such as the verb ending or the pluralization. This way variations
        of words are grouped around the same root.
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
  );
}
