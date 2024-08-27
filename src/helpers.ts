import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { safeStorage } from "electron";
import type { ImageMode, ConfigStore } from "./types";

// Converter Helpers
/**
 * Rounds equivalently to PHP_ROUND_HALF_UP in PHP.
 * @param n input number
 * @returns rounded result
 */
export function round_half_up(n: number) {
  if (n < 0) {
    /* Ugly hack that makes sure -1.5 rounds to -2 */
    n -= 0.0000001;
  }
  return Math.round(n);
}

export function str_pad(str: string, n: number, padding: string, left: boolean) {
  if (left) {
    return str.padStart(n, padding);
  } else return str.padEnd(n, padding);
}

export function dechex(n: number) {
  if (n == undefined) n = 0;
  return n.toString(16);
}

export class ImageModeUtil {
  static isTrueColor(mode: ImageMode) {
    // if (typeof mode != 'string')
    //     mode = ImageMode[mode];
    // return mode.startsWith("CF_TRUE_COLOR");
    return mode >= 15 && mode <= 16;
  }
}
const BINARY_FORMAT_PREFIX = "ICF_TRUE_COLOR_";

export function splitUint16(value: number) {
  // Ensure the value is within the range of uint16
  const uint16Value = value & 0xffff;

  // Split the uint16 value into two uint8 values
  const highByte = (uint16Value >> 8) & 0xff; // High byte (most significant 8 bits)
  const lowByte = uint16Value & 0xff; // Low byte (least significant 8 bits)
  // console.log(value, uint16Value, highByte, lowByte)
  return [highByte, lowByte];
}

export function string2bytes(str: string) {
  let utf8Encode = new TextEncoder();
  return utf8Encode.encode(str);
}

// Tray Helpers

export class Config {
  config: ConfigStore;
  userData: string;
  constructor(userData: string) {
    this.userData = userData;
    this.loadConfigFile();
  }

  loadConfigFile = async () => {
    try {
      const filestring = await readFileSync(path.join(this.userData, "config.json"));
      if (!filestring) this.config = { accessToken: null, refreshToken: null };
      if (!safeStorage.isEncryptionAvailable()) this.config = JSON.parse(filestring.toString());
      const unencrypted = safeStorage.decryptString(filestring);
      this.config = JSON.parse(unencrypted);
    } catch (e) {
      this.config = { accessToken: null, refreshToken: null };
    }
  };

  updateConfig = async (config: ConfigStore) => {
    this.config = config;
    var configString: string | Buffer = JSON.stringify(config);
    if (safeStorage.isEncryptionAvailable()) configString = safeStorage.encryptString(configString);
    writeFileSync(path.join(this.userData, "config.json"), configString);
  };
}
