const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const buildDir = path.resolve(__dirname, 'dist');


module.exports = merge(common, {
  mode: 'development',
  devServer: {
    historyApiFallback: {
      index: buildDir
    },
    static: {
        directory: buildDir,
      }
    ,
  }
});