import type { Image } from "@napi-rs/canvas";
import { CODES, HALF, ImageMode, OutputMode } from "./types";
import type { Device } from "./device";
import { convertImageBlob } from "./converter";
import { splitUint16 } from "./helpers";

export const uploadImage = async (dev: Device, code: CODES, half: HALF, image: Image, w: number, h: number) => {
  let buffer: Uint8Array[] = [];
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
  // remove first 4 bytes that are nonsense
  if (typeof convertedImage == "string" || !convertedImage) return;
  const convertImageFix = convertedImage.slice(4);
  const imageBytesArray = new Uint8Array(convertImageFix);
  // console.log(imageBytesArray)
  for (let i = 0; i < imageBytesArray.length; i += 26) {
    var x = i / 26;
    buffer[x] = new Uint8Array([...splitUint16(x), ...imageBytesArray.slice(i, i + 26)]);
    setTimeout(dev.write, x, code, half, buffer[x]);
  }
};
