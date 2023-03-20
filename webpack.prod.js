const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CopyPlugin = require("copy-webpack-plugin");
const buildDir = path.resolve(__dirname, 'docs');

module.exports = merge(common, {
  plugins: [
    new CopyPlugin({
      patterns: [
        // For easy deployment on gh-pages (index.html under docs)
        { from: "./dist", to: "../docs" }
      ],
    }),
  ],
});