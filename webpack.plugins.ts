import type IForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
const Dotenv = require("dotenv-webpack");
const CopyPlugin = require("copy-webpack-plugin");
import {DefinePlugin} from "webpack"

const isDevelopment = process.env.NODE_ENV !== 'production';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const productionDefines = {
  DEVELOPMENT: JSON.stringify(isDevelopment),
  CLIENT_ID: JSON.stringify(process.env.CLIENT_ID)
}

const developmentDefines = {
  DEVELOPMENT: JSON.stringify(isDevelopment)
}

const commonPlugins = [
  new ForkTsCheckerWebpackPlugin({
    logger: "webpack-infrastructure",
  }),
  new CopyPlugin({
    patterns: [{ from: "images", to: "images" }],
  }),
  new DefinePlugin(isDevelopment ? developmentDefines : productionDefines),
]

const productionPlugins: any[] = []

const developmentPlugins: any[] = [
  new Dotenv(),
]

export const plugins = isDevelopment
  ? [...commonPlugins, ...developmentPlugins]
  : [...commonPlugins, ...productionPlugins]