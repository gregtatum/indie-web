const path = require('path');

module.exports = {
  entry: './src/index.js',
  // Settings for the webpack dev server.
  devServer: {
    contentBase: path.join(__dirname, 'build'),
    compress: true,
    port: 9000,
  },
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
  },
};
