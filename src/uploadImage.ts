import type { Image } from "@napi-rs/canvas";
import { loadImage, createCanvas, ImageData } from "@napi-rs/canvas";
import { CODES, HALF, ImageMode, OutputMode } from "./types";
import type { Device } from "./device";
import { convertImageBlob } from "./converter";
import { splitUint16 } from "./helpers";
import {dialog} from "electron"
import { GifCodec, GifFrame, GifUtil, Gif } from "gifwrap";
import { readFileSync } from "fs";

import log from "electron-log/node"

log.errorHandler.startCatching()

const CHUNK_SIZE = 25;

 /**
* Upload a custom image from system to device that will fill the entire area (w: 80, h: 160)
*
* @async
* @param {number} half - The half of the keyboard to upload the image to
* @returns {Promise<boolean>} - Whether the image was uploaded successfully
*/
export const uploadCustomImage = async (dev: Device, half: number): Promise<boolean> => {
  const OF = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif"] }] });
  if (OF.canceled) return false;
  if (OF.filePaths.length == 0) return false;
  const path = OF.filePaths[0]
  if (path.slice(-3) == "gif") {
    const data = await readFileSync(path)
    const gif = await (new GifCodec()).decodeGif(data);
    return await uploadCustomGifImage(dev, half, gif)
  } else {    
    const image = await loadImage(path);
    return await uploadImage(dev, CODES.IMG_FULLSIZE, half, image, 80, 160);
  }


};

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
export const uploadImage = async (dev: Device, code: CODES, half: HALF, image: Image|Uint8Array, w: number, h: number, gif: boolean = false): Promise<boolean> => {
  log.info(`Initilising image upload to ${half}, w:${w}, h:${h}`)
  let buffer: Uint8Array[] = [];
  // converts the image to an lvgl compatible format
  const convertedImage = await convertImageBlob(image, {
    dith: false,
    cf: gif ? ImageMode.CF_RAW : ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
    outputFormat: OutputMode.BIN,
    binaryFormat:  gif ? ImageMode.CF_RAW : ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
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
  const convertImageFix = gif ? convertedImage : convertedImage.slice(4);
  // split the image into 26 byte chunks and send them to the keyboard staggered
  const imageBytesArray = new Uint8Array(convertImageFix);
  dev.write(CODES.STATUS, half, new Uint8Array([code,  0x00]))
  for (let i = 0; i < imageBytesArray.length; i += CHUNK_SIZE) {
    var x = i / CHUNK_SIZE;
    var bytes = imageBytesArray.slice(i, i + CHUNK_SIZE)
    var len = bytes.length
    buffer[x] = new Uint8Array([...splitUint16(x), len, ...bytes]);
    setTimeout(dev.write, x, code, half, buffer[x]);
  }
  setTimeout(dev.write, (imageBytesArray.length/CHUNK_SIZE)+200, CODES.STATUS, half, new Uint8Array([code, 0x01, ...splitUint16(convertImageFix.byteLength)]))
  return true;
};

export const uploadCustomGifImage = async (dev: Device, half: number, gif: Gif): Promise<boolean> => {
  const W = 80
  const H = 100

  const gw = gif.width
  const gh = gif.height

  
  // First Convert the gif to be made of flat images not composites e.g. the image displayed is the image to show not a stacked image
  const canvas = createCanvas(gif.width, gif.height);
  const ctx = canvas.getContext('2d');

  // Prep Maths For Resizing
  const scale = Math.min(W/gw, H/gh)
  // Calculate the new width and height for the image
  const scaledWidth = gw * scale;
  const scaledHeight = gh * scale;
  // Calculate the offset to center the image in the canvas
  const offsetX = (W - scaledWidth) / 2;
  const offsetY = (H - scaledHeight) / 2;

  var flatFrames = []
  //hacky fix because of how the canvas implmentation sets ImageData
  interface FixedImageData extends ImageData {
    colorSpace: PredefinedColorSpace;
  }

  for (let i = 0; i < gif.frames.length; i++) {
    const frame = gif.frames[i];

    // Composite the current frame on top of the canvas
    const frameImageData = new ImageData(
      new Uint8ClampedArray(frame.bitmap.data),
      frame.bitmap.width,
      frame.bitmap.height
    ) as unknown as FixedImageData;
    // Composite the current frame onto a tempory canvas so that we can merge it into our canvas (putImageData removes the other layers)
    const tempCanvas = createCanvas(frame.bitmap.width, frame.bitmap.height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(frameImageData, 0, 0);

    // Draw the current frame on top of the existing canvas
    ctx.drawImage(tempCanvas, frame.xOffset, frame.yOffset);

    // Resize the Frame to the desired size and push to the flat frames array
    const resizedCanvas = createCanvas(W, H);
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(canvas, offsetX, offsetY, scaledWidth, scaledHeight);

    let frameBMP = resizedCtx.getImageData(0,0,W,H)
    const flattenedFrame = new GifFrame({width:W, height:H, data: Buffer.from(frameBMP.data)},{delayCentisecs:frame.delayCentisecs});
    flatFrames.push(flattenedFrame);
  }

  // Calculate the step to pick frames so that we only keep 20 max
  const totalFrames = gif.frames.length;
  const maxFrames = 20;
  const frameStep = Math.ceil(totalFrames / maxFrames);
  // Select frames to keep and adjust delays
  const selectedFrames = [];
  for (let i = 0; i < totalFrames; i += frameStep) {
    const frame = flatFrames[i];
    // Adjust the delay proportionally to account for skipped frames
    frame.delayCentisecs *= frameStep;
    selectedFrames.push(frame);
  }

  // Limit Colours
  GifUtil.quantizeDekker(selectedFrames, 16)
  
  // Encode the new GIF
  const resizedGif = new GifCodec();
  const resizedGifBuffer = await resizedGif.encodeGif(selectedFrames, {
    loops: gif.loops
  });
  const image = new Uint8Array(resizedGifBuffer.buffer)
  // Push gif to display via the image converter
  dev.updateScreen(4, half)
  return await uploadImage(dev, CODES.IMG_GIF, half, image, W, H, true);
};