const path = require('path');
const fs = require('fs');

module.exports = {
  entry: './src/slim-swagger.ts',
  target: 'node',
  module: {
    rules: [
      {
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.jsx', '.ts', '.js'],
    preferRelative: true,
  },
  output: {
    filename: 'slim-swagger.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
