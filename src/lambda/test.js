// @ts-check
const { handler } = require('./app/index');

/**
 * This should allow for live testing the dropbox API. It will fail unless
 * real data is provided.
 */
async function runTest() {
  const response = await handler({
    queryStringParameters: {},
    mockedAccessPoint: __dirname,
  });

  console.log('Response from test:', response);
}

runTest().catch((error) => console.error('Failed to run test', error));
