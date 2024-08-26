import {readFileSync, writeFileSync} from "fs"
import path from "path"
import {safeStorage} from "electron"
import type { ImageMode, Config } from "./types";

// Converter Helpers
/**
 * Rounds equivalently to PHP_ROUND_HALF_UP in PHP.
 * @param n input number
 * @returns rounded result
 */
export function round_half_up(n:number) {
    if (n < 0) {
        /* Ugly hack that makes sure -1.5 rounds to -2 */
        n -= 0.0000001;
    }
    return Math.round(n);
}

export function str_pad(str:string, n:number, padding:string, left:boolean) {
    if (left) {
        return str.padStart(n, padding);
    } else
        return str.padEnd(n, padding);
}

export function dechex(n:number) {
    if (n == undefined) n = 0;
    return n.toString(16);
}

export class ImageModeUtil {
    static isTrueColor(mode: ImageMode) {
        console.log(mode)
        // if (typeof mode != 'string')
        //     mode = ImageMode[mode];
        // return mode.startsWith("CF_TRUE_COLOR");
        return mode >= 15 && mode <= 16;
    }
}
const BINARY_FORMAT_PREFIX = "ICF_TRUE_COLOR_";

// Tray Helpers

export const loadConfigFile = async (userData: string) => {
    const filestring = await readFileSync(path.join(userData, "config.json"))
    if (!filestring) return {accessToken: null, refreshToken:null} as Config
    if (!safeStorage.isEncryptionAvailable()) return JSON.parse(filestring.toString()) as Config
    const unencrypted = safeStorage.decryptString(filestring)
    return JSON.parse(unencrypted) as Config
}

export const saveNewConfig = async (userData: string, config: Config) => {
    var configString: string | Buffer  = JSON.stringify(config)
    if (safeStorage.isEncryptionAvailable()) configString = safeStorage.encryptString(configString)
    writeFileSync(path.join(userData, "config.json"), configString)
}
