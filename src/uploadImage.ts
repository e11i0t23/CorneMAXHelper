import type { Image } from "@napi-rs/canvas";
import { CODES, HALF, ImageMode, OutputMode } from "./types";
import type { Device } from "./device";
import { convertImageBlob } from "./converter";
import { splitUint16 } from "./helpers";

import log from "electron-log/node"

log.errorHandler.startCatching()

const CHUNK_SIZE = 26;

/**
 * Uploads an image to the keyboard
 *
 * @async
 * @param {Device} dev - The device to upload the image to
 * @param {CODES} code - The command code to use for uploading the image
 * @param {HALF} half - The half of the keyboard to upload the image to
 * @param {Image} image - The image to upload
 * @param {number} w - The width of the image
 * @param {number} h -  The height of the image
 * @returns {Promise<boolean>} - Whether the image was uploaded successfully
 */
export const uploadImage = async (dev: Device, code: CODES, half: HALF, image: Image, w: number, h: number): Promise<boolean> => {
  log.info(`Initilising image upload to ${half}, w:${w}, h:${h}`)
  let buffer: Uint8Array[] = [];
  // converts the image to an lvgl compatible format
  const convertedImage = await convertImageBlob(image, {
    dith: false,
    cf: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
    outputFormat: OutputMode.BIN,
    binaryFormat: ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
    swapEndian: false,
    outName: "image",
    useLegacyFooterOrder: false,
    use565A8alpha: false,
    overrideWidth: w,
    overrideHeight: h,
  });
  // ensure the image is a Buffer
  if (typeof convertedImage == "string" || !convertedImage) return false;
  // remove first 4 bytes that are nonsense (fixes misalgigned image)
  const convertImageFix = convertedImage.slice(4);
  // split the image into 26 byte chunks and send them to the keyboard staggered
  const imageBytesArray = new Uint8Array(convertImageFix);
  for (let i = 0; i < imageBytesArray.length; i += CHUNK_SIZE) {
    var x = i / CHUNK_SIZE;
    buffer[x] = new Uint8Array([...splitUint16(x), ...imageBytesArray.slice(i, i + CHUNK_SIZE)]);
    setTimeout(dev.write, x, code, half, buffer[x]);
  }
  return true;
};
