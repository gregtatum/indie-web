import * as React from 'react';
import { A, $$, Hooks } from 'frontend';

import './Messages.css';

/**
 * A layer that will display a temporary message to the user.
 *
 * dispatch(
 *   addMessage({
 *     message: <>Failed to download <code>{file.name}</code></>,
 *     generation: messageGeneration,
 *     timeout: true,
 *   })
 * );
 */
export function Messages() {
  const dispatch = Hooks.useDispatch();
  const messages = $$.getMessages();

  React.useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        dispatch(A.dismissAllMessages());
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
    };
  }, []);

  return Hooks.overlayPortal(
    <div className="messages">
      {messages.map(({ message, generation, progress }) => (
        <div className="messagesMessage" key={generation}>
          {progress ? (
            <div className="messagesProgressBody" role="status">
              <span className="messagesMessageText">{message}</span>
              <div
                className="messagesProgressBar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.loaded}
              >
                <div
                  className="messagesProgressFill"
                  style={{
                    width: `${progress.total === 0 ? 0 : (progress.loaded / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <span className="messagesMessageText">{message}</span>
          )}
          <button
            type="button"
            className="messagesDismissButton"
            onClick={() => {
              dispatch(A.dismissMessage(generation));
            }}
            aria-label="Dismiss"
          >
            <img src="/svg/xmark.svg" alt="" />
          </button>
        </div>
      ))}
    </div>,
  );
}
