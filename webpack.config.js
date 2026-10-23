const path = require('path')

module.exports = {
  mode: 'production',
  entry: {
    storefront: './src/storefront.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    // Not "Hellotext": the storefront loads the real Hellotext.js, which owns
    // window.Hellotext. Always a window global, never UMD, because the snippet
    // calls it by name and UMD skips the global on pages that run RequireJS.
    library: {
      name: 'HellotextLegacyCMS',
      type: 'window',
      export: 'default',
    },
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: [/node_modules/],
        use: [{ loader: 'babel-loader' }],
      },
    ],
  },
}
