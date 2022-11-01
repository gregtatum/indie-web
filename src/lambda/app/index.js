// @ts-check
const fs = require('fs');
const path = require('path');

/**
 * @param {{
 *   queryStringParameters?: { code?: string; };
 *   mockedAccessPoint?: string;
 * }} event
 */
// eslint-disable-next-line @typescript-eslint/require-await
exports.handler = async (event) => {
  try {
    const root = event.mockedAccessPoint ?? '/tmp';
    const filePath = path.join(root, 'test.txt');
    fs.writeFileSync(filePath, 'Hello World');

    return {
      statusCode: 200,
      body: 'Read file: ' + fs.readFileSync(filePath, 'utf8'),
    };
  } catch (error) {
    return {
      statusCode: 500,
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      body: 'Failed to read file: ' + error,
    };
  }
};
