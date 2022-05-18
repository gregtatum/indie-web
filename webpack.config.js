// @ts-check
/* global require, module, __dirname, process */
const { DefinePlugin } = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

const path = require('path');

/**
 * @type {import("webpack").Configuration}
 */
const config = {
  entry: './src/index.tsx',
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      crypto: path.resolve(__dirname, 'src/logic/crypto-mock'),
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
      title: 'Browser Chords',
      template: 'src/index.html',
      minify: false,
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'data' }],
    }),
  ],
};

if (process.env.NODE_ENV === 'development') {
  require('dotenv').config({ path: './.env.local' });
  config.mode = 'development';
}

if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: './.env' });
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
