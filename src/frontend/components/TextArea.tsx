import {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type EditorStateConfig } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  type Command,
  ViewUpdate,
  scrollPastEnd,
} from '@codemirror/view';
import * as React from 'react';
import { $$, T, A } from 'frontend';
import { ensureExists, throttle1 } from 'frontend/utils';
import * as Hooks from 'frontend/hooks';

import './TextArea.css';

/**
 * Prose-oriented syntax highlighting: the structural marks (#, **, >, -, links)
 * carry the one violet accent, everything else stays near-neutral so the source
 * reads like text rather than code.
 */
const proseHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: '#111' },
  { tag: tags.strong, fontWeight: '700', color: '#111' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: '#8a8a8a' },
  { tag: tags.monospace, color: '#8250df' },
  { tag: tags.quote, color: '#666' },
  { tag: tags.comment, color: '#999', fontStyle: 'italic' },
  { tag: tags.labelName, color: '#8a8a8a' },
  {
    tag: [tags.processingInstruction, tags.contentSeparator],
    color: 'var(--accent)',
  },
]);

export function TextAreaHeader(props: {
  onHideEditor?: () => void;
  children?: React.ReactNode;
}) {
  const dispatch = Hooks.useDispatch();
  const editorOnly = $$.getEditorOnly();
  const onHideEditor =
    props.onHideEditor ?? (() => dispatch(A.hideEditor(true)));
  const onToggleEditorOnly = () => dispatch(A.setEditorOnly(!editorOnly));
  const toggleAriaLabel = editorOnly
    ? 'Show the split view'
    : 'Hide the split view';

  return (
    <div className="textAreaHeader">
      <div className="textAreaHeaderContent">{props.children}</div>
      <button
        className={`textAreaHeaderToggle${
          editorOnly ? ' textAreaHeaderToggleEditorOnly' : ''
        }`}
        type="button"
        aria-label={toggleAriaLabel}
        title={toggleAriaLabel}
        onClick={onToggleEditorOnly}
      />
      <button
        className="textAreaHeaderDismiss"
        type="button"
        aria-label="Hide the editor"
        title="Hide the editor"
        onClick={onHideEditor}
      />
    </div>
  );
}

export function TextArea(props: {
  path: string;
  textFile: T.DownloadedTextFile;
  language?: any;
  editorExtensions?: EditorStateConfig['extensions'];
  autoSave?: boolean;
  enableAutocomplete?: boolean;
  header?: React.ReactNode;
}) {
  const isDragging = $$.getIsDraggingSplitter();
  const modifiedText = $$.getModifiedText();
  const textGeneration = React.useRef(0);
  const codeMirrorRef = React.useRef<null | HTMLDivElement>(null);
  const editorStateConfig = React.useRef<null | EditorStateConfig>(null);
  const [editor, setEditor] = React.useState<null | EditorView>(null);

  // Retain a ref for the editor for when the component is cleaned up.
  const editorRef = React.useRef<null | EditorView>(editor);
  editorRef.current = editor;

  const dispatch = Hooks.useDispatch();
  function onChange([newText, path]: [string, string]) {
    dispatch(A.modifyActiveFile(newText, path, false));
  }
  const flush = React.useRef<(() => void) | null>(null);
  const throttledOnChange = React.useMemo(
    () => throttle1(onChange, flush, 500),
    [],
  );

  const saveFile: Command = (view: EditorView) => {
    const text = view.state.doc.toString();
    dispatch(A.saveTextFile(props.path, text)).catch(() => {
      // The error is handled in the action.
    });
    // Return true so that no other event handlers fire.
    return true;
  };

  // Handle auto-saving on close.
  const { autoSave } = props;
  React.useEffect(() => {
    return () => {
      const editor = editorRef.current;
      if (autoSave && editor) {
        const text = editor.state.doc.toString();
        // The error is handled in the action.
        void dispatch(A.saveTextFile(props.path, text));
      }
    };
  }, [autoSave]);

  React.useEffect(() => {
    if (!codeMirrorRef.current) {
      throw new Error('Expected a current code mirror ref.');
    }
    editorStateConfig.current = {
      doc: modifiedText.text || props.textFile.text,
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...(props.enableAutocomplete ? completionKeymap : []),
          {
            key: 'Mod-s',
            run: saveFile,
            preventDefault: true,
            stopPropagation: true,
          },
        ]),

        drawSelection(),
        dropCursor(),
        ...(props.enableAutocomplete ? [autocompletion()] : []),
        EditorState.allowMultipleSelections.of(true),
        syntaxHighlighting(proseHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle, {
          fallback: true,
        }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        scrollPastEnd(),
        ...(props.language ? [props.language()] : []),
        EditorView.updateListener.of((viewUpdate: ViewUpdate) => {
          if (viewUpdate.docChanged) {
            throttledOnChange([viewUpdate.state.doc.toString(), props.path]);
          }
        }),
        // Extensions doesn't have an iterable property, so coerce to any.
        ...((props.editorExtensions as any) ?? []),
      ],
    };

    const state = EditorState.create(editorStateConfig.current);
    const editor = new EditorView({
      parent: codeMirrorRef.current,
      state: state,
    });

    setEditor(editor);
  }, []);

  React.useEffect(() => {
    return () => {
      if (flush.current) {
        // Flush any pending debouncing events.
        flush.current();
      }
    };
  }, []);

  // If the text gets modified by the Redux store, then the textarea value will need to
  // be updated. If the textarea is modified by the user, then do not update the textarea.
  // This update is signaled by the generation value in the modified text.
  React.useEffect(() => {
    if (
      textGeneration.current !== modifiedText.generation &&
      editor &&
      modifiedText.text
    ) {
      textGeneration.current = modifiedText.generation;
      editor.setState(
        EditorState.create({
          ...ensureExists(editorStateConfig.current),
          doc: modifiedText.text,
        }),
      );
    }
  }, [modifiedText, editor]);

  const style: React.CSSProperties = {};
  if (isDragging) {
    style.overflow = 'hidden';
  }

  return (
    <div className="textArea" key={props.path}>
      <TextAreaHeader>{props.header}</TextAreaHeader>
      <div
        className="textAreaMount"
        data-testid="textAreaMount"
        ref={codeMirrorRef}
      />
    </div>
  );
}
