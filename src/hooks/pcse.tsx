import * as React from 'react';
import { getEnv } from 'src/utils';

/**
 * This file consolidates some of the PCSE process of generating and persisting the
 * codeVerifier and codeChallenge.
 */

interface Codes {
  codeVerifier: string;
  codeChallenge: string;
}
let _codes: null | Codes = null;

/**
 * Convert ArrayBuffers to strings for API calls.
 */
class BufferSerializer {
  view: DataView;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  /**
   * Converts an array buffer into a hex string, e.g. "c44dd043fc7d2ff1d313"
   */
  toHexString(): string {
    let result = '';
    for (let i = 0; i < this.view.byteLength; i++) {
      const byteStr = this.view.getUint8(i).toString(16);
      if (byteStr.length === 1) {
        result += '0';
      }
      result += byteStr;
    }
    return result;
  }

  /**
   * Converts an array buffer into base64 encoding.
   */
  toBase64(): string {
    let binary = '';
    for (let i = 0; i < this.view.byteLength; i++) {
      binary += String.fromCharCode(this.view.getUint8(i));
    }
    return window
      .btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

async function sha256Base64(string: string): Promise<string> {
  if (process.env.NODE_ENV === 'test') {
    return 'fakebase64';
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(string);
  const buffer = await window.crypto.subtle.digest('SHA-256', data);
  return new BufferSerializer(buffer).toBase64();
}

function generateRandomString(): string {
  const array = new Uint8Array(32);
  if (process.env.NODE_ENV !== 'test') {
    window.crypto.getRandomValues(array);
  }
  return new BufferSerializer(array.buffer).toHexString();
}

async function getCodes(): Promise<Codes> {
  if (!_codes) {
    const codeVerifier = generateRandomString();
    const codeChallenge = await sha256Base64(codeVerifier);
    _codes = { codeVerifier, codeChallenge };
  }

  return _codes;
}

/**
 * When doing the PKCE exchange, the code verifier needs to be persisted to localStorage.
 */
function persistCodeVerifier(event: {
  preventDefault: Event['preventDefault'];
}) {
  if (_codes === null) {
    event.preventDefault();
    console.error(
      'This is unlikely, but the race to have the codes ready failed, so just' +
        'ignore the click event.',
    );
    return;
  }
  window.localStorage.setItem('dropboxCodeVerifier', _codes.codeVerifier);
}

export function getRedirectUri() {
  const uri = window.location.origin;
  return uri + '/login';
}

let _authorizeUrl: string | null = null;
function getDropboxAuthorizeUrl(codeChallenge: string) {
  if (!_authorizeUrl) {
    _authorizeUrl =
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      'https://www.dropbox.com/oauth2/authorize?' +
      new URLSearchParams({
        response_type: `code`,
        code_challenge_method: `S256`,
        client_id: getEnv('DROPBOX_CLIENT_ID'),
        code_challenge: codeChallenge,
        redirect_uri: getRedirectUri(),
        token_access_type: 'offline',
      }).toString();
  }
  return _authorizeUrl;
}

export function useCodeVerifier() {
  const [authorizationUrl, setAuthorizationUrl] = React.useState<string>('');
  React.useEffect(() => {
    (async () => {
      const { codeChallenge } = await getCodes();
      const url = getDropboxAuthorizeUrl(codeChallenge);
      setAuthorizationUrl(url);
    })().catch((error) => {
      console.error('Error getting dropbox authorization url:', error);
    });
  }, []);
  return { persistCodeVerifier, authorizationUrl };
}
