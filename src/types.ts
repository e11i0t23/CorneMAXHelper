export interface ConverterOptions {
  dith: boolean;
  cf: ImageMode;
  outputFormat: OutputMode;
  binaryFormat: ImageMode;
  swapEndian: boolean;
  outName: string;
  useLegacyFooterOrder: boolean;
  use565A8alpha: boolean;
  overrideWidth: number;
  overrideHeight: number;
}

export enum CODES {
  SCREEN = 0x00,
  TIME = 0x01,
  CPU = 0x02,
  GPU = 0x03,
  RAM = 0x04,
  PROGRESS = 0x05,
  NOW_PLAYING = 0x06,
  IMAGE = 0x07,
  IMG_FULLSIZE = 0x08,
}

export enum HALF {
  MASTER = 0x00,
  SLAVE = 0x01,
}

export enum OutputMode {
  C,
  BIN,
}

export enum ImageMode {
  /*Helper ARGB formats. Used internally*/
  ICF_TRUE_COLOR_ARGB8332 = 0,
  ICF_TRUE_COLOR_ARGB8565,
  ICF_TRUE_COLOR_ARGB8565_RBSWAP,
  ICF_TRUE_COLOR_ARGB8888,
  CF_ALPHA_1_BIT,
  CF_ALPHA_2_BIT,
  CF_ALPHA_4_BIT,
  CF_ALPHA_8_BIT,
  CF_INDEXED_1_BIT,
  CF_INDEXED_2_BIT,
  CF_INDEXED_4_BIT,
  CF_INDEXED_8_BIT,
  CF_RAW,
  CF_RAW_CHROMA,
  CF_RAW_ALPHA,

  /*Helper formats if C arrays contains all true color formats (used in "download")*/
  CF_TRUE_COLOR,
  CF_TRUE_COLOR_ALPHA,
  CF_TRUE_COLOR_CHROMA,
  CF_RGB565A8,
}

export interface ConfigStore {
  accessToken: string | null;
  refreshToken: string | null;
}

export type ModuleSync = {
  f: Function;
  args: any[];
  freq: number;
};

export type ScreenSync = {
  id: number;
  name: string;
  code: 0x00 | 0x01 | 0x02 | 0x03;
  modules: Function[];
  frequency: number;
};

export type Half = {
  screen: number;
  intervalIDs: any[];
};
