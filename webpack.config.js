// @ts-check
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import WorkboxPlugin from 'workbox-webpack-plugin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

if (process.env.SITE === 'floppydisk') {
  dotenv.config({ path: './.env.floppydisk' });
} else if (process.env.SITE === 'browserchords') {
  dotenv.config({ path: './.env.browserchords' });
} else {
  throw new Error(
    'The SITE environment must be set to either "floppydisk" or "browserchords"',
  );
}

/**
 * @type {import("webpack").Configuration}
 */
export const config = {
  entry: './src/frontend/index.tsx',
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      frontend: path.resolve(rootDir, 'src/frontend'),
      shared: path.resolve(rootDir, 'src/shared'),
      server: path.resolve(rootDir, 'src/server'),
    },
    fallback: { crypto: false, util: false },
  },
  output: {
    path: path.join(rootDir, 'dist'),
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
      template: 'src/frontend/index.html',
      minify: false,
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'data/common' }, { from: 'data/' + process.env.SITE }],
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
  new webpack.DefinePlugin({
    'process.env': JSON.stringify(process.env),
  }),
);
