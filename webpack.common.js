const path = require('path');
const buildDir = path.resolve(__dirname, 'dist');

module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    publicPath: 'auto',
    filename: 'bundle.js',
    path: buildDir,
  }
};