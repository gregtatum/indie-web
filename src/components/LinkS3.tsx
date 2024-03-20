import * as React from 'react';
import { A, $, Hooks } from 'src';

import { MainView } from './App';

export function LinkS3(props: { children: any }) {
  const credentials = Hooks.useSelector($.getS3CredentialsOrNull);
  const regionRef = React.useRef<null | HTMLInputElement>(null);
  const accessKeyIdRef = React.useRef<null | HTMLInputElement>(null);
  const secretAccessKeyRef = React.useRef<null | HTMLInputElement>(null);
  const dispatch = Hooks.useDispatch();

  if (credentials) {
    return props.children;
  }
  return (
    <MainView>
      <div className="linkView">
        <div className="linkViewContent">
          <div className="linkViewDescription">
            <h1 className="linkViewH1">Store Files in an S3 Bucket</h1>
            <h2 className="linkViewH2">Take your files across devices</h2>
            <p>
              Manage your files, notes, sheet music, and images in an S3 Bucket.
              Access and edit them directly in the browser, from anywhere.
            </p>
            <p>
              Privacy is important. See the{' '}
              <a href="/privacy">privacy policy</a> for more details. The source
              code is on{' '}
              <a href="https://github.com/gregtatum/browser-chords">GitHub</a>.
            </p>
          </div>
          <div>
            <h2>S3 Credentials</h2>
            <p>
              <a href="https://s3.console.aws.amazon.com/s3/bucket/create">
                Create a bucket
              </a>{' '}
              that has a{' '}
              <a href="https://us-east-1.console.aws.amazon.com/iam/home#/groups">
                user group
              </a>{' '}
              with read/write access. The credentials will be stored as
              plaintext in the browser&rsquo;s local storage.
            </p>
            <form className="linkViewForm">
              <label htmlFor="s3Region">Region</label>
              <input
                type="text"
                id="s3Region"
                ref={regionRef}
                autoComplete="off"
                placeholder="us-east-1"
              />
              <label htmlFor="s3AccessKeyId">Access Key ID</label>
              <input
                type="text"
                id="s3AccessKeyId"
                ref={accessKeyIdRef}
                autoComplete="off"
                placeholder="AKIAIOSFODNN7EXAMPLE"
              />
              <label htmlFor="s3SecretAccessKey">Secret Access Key</label>
              <input
                type="text"
                id="s3SecretAccessKey"
                ref={secretAccessKeyRef}
                autoComplete="off"
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              />
              <button
                className="linkViewConnect"
                type="submit"
                onClick={(event) => {
                  event.preventDefault();
                  const region = regionRef.current?.value;
                  const accessKeyId = accessKeyIdRef.current?.value;
                  const secretAccessKey = secretAccessKeyRef.current?.value;
                  if (accessKeyId && secretAccessKey && region) {
                    dispatch(
                      A.setS3Credentials(region, accessKeyId, secretAccessKey),
                    );
                  }
                }}
              >
                Connect S3 Bucket
              </button>
            </form>
          </div>
        </div>
      </div>
    </MainView>
  );
}
