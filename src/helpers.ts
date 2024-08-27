import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { safeStorage } from "electron";
import type { ImageMode, ConfigStore } from "./types";

// Converter Helpers
/**
 * Rounds equivalently to PHP_ROUND_HALF_UP in PHP.
 *
 * @param {number} n - input number
 * @returns {number} - rounded result
 */
export function round_half_up(n: number) {
  if (n < 0) {
    /* Ugly hack that makes sure -1.5 rounds to -2 */
    n -= 0.0000001;
  }
  return Math.round(n);
}

/**
 * Pads a string to a certain length with another string
 *
 * @param {string} str - The string to pad
 * @param {number} n - The length to pad the string to
 * @param {string} padding - The string to pad the original string with
 * @param {boolean} left - Whether to pad the left or right side of the string
 * @returns {string} - The padded string
 */
export function str_pad(str: string, n: number, padding: string, left: boolean) {
  if (left) {
    return str.padStart(n, padding);
  } else return str.padEnd(n, padding);
}

/**
 * Converts a number to a hexadecimal string
 *
 * @param {number} n - The number to convert to hexadecimal
 * @returns {string} - The hexadecimal string
 */
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

/**
 * Splits a uint16 value into two uint8 values
 *
 * @export
 * @param {number} value - The uint16 value to split
 * @returns {number[]}
 */
export function splitUint16(value: number) {
  // Ensure the value is within the range of uint16
  const uint16Value = value & 0xffff;

  // Split the uint16 value into two uint8 values
  const highByte = (uint16Value >> 8) & 0xff; // High byte (most significant 8 bits)
  const lowByte = uint16Value & 0xff; // Low byte (least significant 8 bits)
  // console.log(value, uint16Value, highByte, lowByte)
  return [highByte, lowByte];
}

/**
 * Converts a string to a Uint8Array
 *
 * @param str
 * @returns {Uint8Array}
 */
export function string2bytes(str: string): Uint8Array {
  let utf8Encode = new TextEncoder();
  return utf8Encode.encode(str);
}

// Tray Helpers

/**
 * Configuration class for storing user data
 *
 * @export
 * @class Config
 * @typedef {Config}
 */
export class Config {
  config: ConfigStore;
  userData: string;

  /**
   * @constructor
   * @param userData - The path to the user data directory
   */
  constructor(userData: string) {
    this.userData = userData;
    this.loadConfigFile();
  }

  /**
   * Load the config file from the user data directory
   *
   * @returns {Promise<void>}
   */
  loadConfigFile = async () => {
    try {
      // Load the config file
      const filestring = await readFileSync(path.join(this.userData, "config.json"));
      // If the file is empty, set the config to null
      if (!filestring) this.config = { accessToken: null, refreshToken: null };
      // If encryption is not available, parse the config file
      if (!safeStorage.isEncryptionAvailable()) this.config = JSON.parse(filestring.toString());
      // If encryption is available, decrypt the file and parse the config
      const unencrypted = safeStorage.decryptString(filestring);
      this.config = JSON.parse(unencrypted);
    } catch (e) {
      this.config = { accessToken: null, refreshToken: null };
    }
  };

  /**
   * Update the config file with the new config
   *
   * @param config - The new config to write to the file
   * @returns {Promise<void>}
   */
  updateConfig = async (config: ConfigStore) => {
    this.config = config;
    var configString: string | Buffer = JSON.stringify(config);
    // if encryption is available, encrypt the config string before writing it to the file
    if (safeStorage.isEncryptionAvailable()) configString = safeStorage.encryptString(configString);
    writeFileSync(path.join(this.userData, "config.json"), configString);
  };
}
