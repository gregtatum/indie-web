import * as React from 'react';
import { $$, T, A } from 'frontend';
import { ensureExists, throttle1 } from 'frontend/utils';
import * as Hooks from 'frontend/hooks';

import {
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  Command,
  ViewUpdate,
  scrollPastEnd,
} from '@codemirror/view';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';

import { EditorView } from 'codemirror';

import './TextArea.css';
import { EditorState, EditorStateConfig } from '@codemirror/state';

export function TextArea(props: {
  path: string;
  textFile: T.DownloadedTextFile;
  language?: any;
  editorExtensions?: EditorStateConfig['extensions'];
  autoSave?: boolean;
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
          {
            key: 'Mod-s',
            run: saveFile,
            preventDefault: true,
            stopPropagation: true,
          },
        ]),

        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
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
      <button
        className="textAreaDismiss"
        type="button"
        aria-label="Hide Editor"
        onClick={() => dispatch(A.hideEditor(true))}
      ></button>
      <div
        className="textAreaMount"
        data-testid="textAreaMount"
        ref={codeMirrorRef}
      />
    </div>
  );
}
