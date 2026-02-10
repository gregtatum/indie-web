import { Dropbox } from 'dropbox';
import { setDropboxAccessToken } from 'frontend/store/actions/plain';
import { getStore } from 'frontend/store/store-instance';
import { getEnv, getNumberProp, getStringProp } from 'frontend/utils';
import * as T from 'frontend/@types';

const dropboxClientId = getEnv('DROPBOX_CLIENT_ID');

function isAuthError(error: any): boolean {
  if (error?.status === 401) {
    return true;
  }
  const errorTag = error?.error?.error?.['.tag'];
  if (errorTag === 'invalid_access_token') {
    return true;
  }
  const summary = error?.error?.error_summary;
  if (typeof summary === 'string') {
    return (
      summary.includes('invalid_access_token') ||
      summary.includes('expired_access_token')
    );
  }
  return false;
}

export function createDropboxClient(oauth: T.DropboxOauth): Dropbox {
  let dropbox = new Dropbox({ accessToken: oauth.accessToken });
  let refreshPromise: Promise<void> | null = null;

  function refreshAccessToken(): Promise<void> {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      const response = await fetch(
        'https://www.dropbox.com/oauth2/token' +
          '?' +
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: dropboxClientId,
            refresh_token: oauth.refreshToken,
          }).toString(),
        { method: 'POST' },
      );
      if (response.status !== 200) {
        throw new Error(
          `Dropbox refresh token failed with status ${response.status}`,
        );
      }
      const text = await response.text();
      const json: unknown = JSON.parse(text);
      const accessToken = getStringProp(json, 'access_token');
      const expiresIn = getNumberProp(json, 'expires_in');
      if (!accessToken || !expiresIn) {
        throw new Error('Dropbox refresh token response was missing data.');
      }
      dropbox = new Dropbox({ accessToken });
      const store = getStore();
      store?.dispatch(
        setDropboxAccessToken(accessToken, expiresIn, oauth.refreshToken),
      );
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  const fakeDropbox: Record<string, any> = {};
  for (const key in dropbox) {
    fakeDropbox[key] = (...args: any[]) => {
      const style = 'color: #006DFF; font-weight: bold';
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[dropbox] calling %c"${key}"`, style, ...args);
      }

      const callRequest = () => (dropbox as any)[key](...args);
      return new Promise((resolve, reject) => {
        callRequest().then(
          (response: any) => {
            if (process.env.NODE_ENV !== 'test') {
              console.log(`[dropbox] response %c"${key}"`, style, response);
            }
            resolve(response);
          },
          async (error: any) => {
            if (process.env.NODE_ENV !== 'test') {
              console.log(`[dropbox] error %c"${key}"`, style, args, error);
            }
            if (process.env.NODE_ENV === 'test' || !isAuthError(error)) {
              reject(error);
              return;
            }
            try {
              await refreshAccessToken();
              const response = await callRequest();
              if (process.env.NODE_ENV !== 'test') {
                console.log(`[dropbox] response %c"${key}"`, style, response);
              }
              resolve(response);
            } catch (refreshError) {
              reject(refreshError);
            }
          },
        );
      });
    };
  }

  return fakeDropbox as any;
}
