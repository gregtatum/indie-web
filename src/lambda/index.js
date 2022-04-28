// @ts-check

/**
 * @param {{
 *   queryStringParameters?: { code?: string; };
 *   mockedDropboxKey?: string;
 *   mockedDropboxSecret?: string;
 * }} event
 */
exports.handler = async (event) => {
  /* eslint-disable */
  const https = require('https');

  const key = process.env.DROPBOX_KEY || event.mockedDropboxKey;
  const secret = process.env.DROPBOX_SECRET || event.mockedDropboxSecret;
  if (!key) {
    throw new Error("Dropbox key required.");
  }
  if (!secret) {
    throw new Error("Dropbox secret required");
  }
  const authorization = `Basic ` + Buffer.from(`${key}:${secret}`).toString(`base64`);
  const code = event.queryStringParameters?.code;

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify("A \"code\" query parameter is required."),
    }
  }

  // curl https://api.dropbox.com/oauth2/token \
  //  -d code=<AUTHORIZATION_CODE> \
  //  -d grant_type=authorization_code \
  //  -d redirect_uri=<REDIRECT_URI> \
  //  -u <APP_KEY>:<APP_SECRET>

  const data = createParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: "http://localhost:1234/login"
  });

  const options = {
    hostname: 'api.dropboxapi.com',
    port: 443,
    path: '/oauth2/token',
    method: 'POST',
    headers: {
      'Authorization': authorization,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': data.length
    }
  };

  /**
   * @param {{[key: string]: string}} args
   */
  function createParams(args) {
    const u = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      u.set(key, value);
    }
    return u.toString()
  }

  let body;
  try {
    body = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        console.log(`Dropbox response: ${res.statusCode}`);

        res.on('data', (responseData) => {
          console.log('Dropbox data received.');
          if (res.statusCode === 200) {
            resolve(responseData.toString());
          } else {
            reject(responseData.toString());
          }
        });
      });

      req.write(data);

      req.on('error', (error) => {
        console.error("Dropbox request failed", error);
        reject(JSON.stringify(error.toString()));
      });

      req.end();
    });
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify(error),
    }
  }

  // {
  //   "access_token": "...",
  //   "token_type": "bearer",
  //   "expires_in": 14400,
  //   "scope": "account_info.read ...",
  //   "uid": "12345",
  //   "account_id": "dbid:..."
  // }
  return {
      statusCode: 200,
      body,
  };
};
