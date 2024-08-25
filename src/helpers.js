const {readFileSync, writeFileSync} = require("fs")
const path = require("path")
const {safeStorage} = require("electron")

// Converter Helpers
/**
 * Rounds equivalently to PHP_ROUND_HALF_UP in PHP.
 * @param n input number
 * @returns rounded result
 */
function round_half_up(n) {
    if (n < 0) {
        /* Ugly hack that makes sure -1.5 rounds to -2 */
        n -= 0.0000001;
    }
    return Math.round(n);
}

function str_pad(str, n, padding, left) {
    if (left) {
        return str.padStart(n, padding);
    } else
        return str.padEnd(n, padding);
}

function dechex(n) {
    if (n == undefined) n = 0;
    return n.toString(16);
}

// Tray Helpers

const loadConfigFile = async (userData) => {
    const filestring = await readFileSync(path.join(userData, "config.json"))
    if (!filestring) return {accessToken: null, refreshToken:null}
    if (!safeStorage.isEncryptionAvailable()) return JSON.parse(filestring)
    const unencrypted = safeStorage.decryptString(filestring)
    return JSON.parse(unencrypted)
}

const saveNewConfig = async (userData, config) => {
    var configString = JSON.stringify(config)
    if (safeStorage.isEncryptionAvailable()) configString = safeStorage.encryptString(configString)
    writeFileSync(path.join(userData, "config.json"), configString)
}

module.exports = { round_half_up, str_pad, dechex, loadConfigFile, saveNewConfig };