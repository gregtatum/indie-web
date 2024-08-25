import * as React from 'react';
import { A, Hooks, $$ } from 'src';

import './HomePage.css';

// https://webflow.com/templates/html/apps-app-website-template
export function HomePage() {
  const apiKeyRef = React.useRef<null | HTMLInputElement>(null);
  const [showChatCredentials, setShowChatCredentials] =
    React.useState<boolean>(false);
  const dispatch = Hooks.useDispatch();
  const initialApiKey = $$.getOpenAIApiKey();

  return (
    <div className="lcHomepageWrapper">
      <div className="lcHomepage">
        <h1 className="lcHomepageHeader">Language Coach</h1>
        <p className="lcHomepageParagraph">
          Use the Language Coach tools to help learn another language. You can
          add reading materials, and generate study lists. Add words to
          &ldquo;Learned Words&rdquo; to track your progress.
        </p>
        <div>
          <h3>Chat Assistant Credentials</h3>
          <p>
            Optionally add chat bot credentials for additional AI features. This
            feature will likely incur API expenses to run.
          </p>
          {showChatCredentials ? (
            <>
              <p>
                <b>Warning:</b> Using an API key in the browser is not the most
                secure approach, since if an attacker gets access to it, they
                will have read/write access to your account. This project is a
                front-end only application and there does not appear to be a
                more secure OAuth flow available at this time. This
                configuration is not a{' '}
                <a href="https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety">
                  recommend pattern
                </a>
                .
              </p>
              <form className="lcHomepageChatbotCredentials">
                <label htmlFor="lcHomepageOrganizationId">
                  OpenAI API Key
                  <a
                    className="lcButton"
                    target="_blank"
                    rel="noreferrer"
                    href="https://platform.openai.com/api-keys"
                  >
                    found here
                  </a>
                </label>
                <input
                  type="text"
                  id="lcHomepageSecretKey"
                  placeholder="sk-proj-H-XXXXX..."
                  ref={apiKeyRef}
                  defaultValue={initialApiKey ?? ''}
                />
                <button
                  type="submit"
                  className="lcButton"
                  onClick={(event) => {
                    event.preventDefault();
                    const apiKey = apiKeyRef.current?.value;
                    if (apiKey) {
                      dispatch(A.setOpenAIApiKey(apiKey));
                    }
                  }}
                >
                  Add Credentials
                </button>
              </form>
            </>
          ) : (
            <button
              type="button"
              className="lcButton"
              onClick={() => void setShowChatCredentials(true)}
            >
              Add Credentials
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
