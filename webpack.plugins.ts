import type IForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
const Dotenv = require("dotenv-webpack");
const CopyPlugin = require("copy-webpack-plugin");

const isDevelopment = process.env.NODE_ENV !== 'production';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

export const plugins = isDevelopment ? [
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  new Dotenv(),
  new CopyPlugin({
    patterns: [{ from: "images", to: "images" }],
  }),
] : [
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  new CopyPlugin({
    patterns: [{ from: "images", to: "images" }],
  }),
]
