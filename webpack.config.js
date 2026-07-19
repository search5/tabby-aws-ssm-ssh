const path = require('path')
const webpack = require('webpack')

module.exports = {
    target: 'node',
    entry: path.resolve(__dirname, 'src/index.ts'),
    mode: 'production',
    devtool: false,
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        libraryTarget: 'umd',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.node$/,
                use: 'node-loader',
            },
        ],
    },
    plugins: [
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1,
        }),
        // Optional native modules — handled gracefully at runtime by ws/ssh2
        new webpack.IgnorePlugin({ resourceRegExp: /^(cpu-features|sshcrypto|bufferutil|utf-8-validate)$/ }),
    ],
    externals: [
        ({ request }, callback) => {
            if (/^(@angular\/|tabby-|rxjs|@ng-bootstrap|zone\.js)/.test(request)) {
                return callback(null, `commonjs ${request}`)
            }
            callback()
        },
    ],
}
