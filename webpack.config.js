// @ts-check
const { DefinePlugin } = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

const path = require('path');

if (process.env.SITE === 'floppydisk') {
  require('dotenv').config({ path: './.env.floppydisk' });
} else {
  require('dotenv').config({ path: './.env.browserchords' });
}

/**
 * @type {import("webpack").Configuration}
 */
const config = {
  entry: './src/index.tsx',
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      crypto: path.resolve(__dirname, 'src/logic/empty-mock'),
      util: path.resolve(__dirname, 'src/logic/empty-mock'),
    },
  },
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[fullhash].bundle.js',
    chunkFilename: '[id].[fullhash].bundle.js',
    publicPath: '/',
  },
  performance: { hints: false },
  module: {
    rules: [
      {
        test: /\.(js|ts|tsx)$/i,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
      {
        test: /\.css$/i,
        exclude: /node_modules/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: process.env.SITE_DISPLAY_NAME,
      template: 'src/index.html',
      minify: false,
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'data' }],
    }),
  ],
};

if (process.env.NODE_ENV === 'development') {
  config.mode = 'development';
}

if (!config.plugins) {
  // Satisfy TypeScript.
  throw new Error('No plugins');
}

if (process.env.NODE_ENV === 'production') {
  config.mode = 'production';

  config.plugins.push(
    new WorkboxPlugin.GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
    }),
  );
}

config.plugins.push(
  new DefinePlugin({
    'process.env': JSON.stringify(process.env),
  }),
);

module.exports = config;
