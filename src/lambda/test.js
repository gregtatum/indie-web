// @ts-check
const { handler } = require('./index');

/**
 * This should allow for live testing the dropbox API. It will fail unless
 * real data is provided.
 */
async function runTest() {
  const response = await handler({
    queryStringParameters: { code: 'fake-code' },
    mockedDropboxKey: 'fake-key',
    mockedDropboxSecret: 'fake-secret',
  });

  console.log('Response from test:', response);
}

runTest();
