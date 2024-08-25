const { createCanvas, Image } = require('@napi-rs/canvas');
const { ImageMode, ImageModeUtil, OutputMode } = require('./enums');
const { buildPalette, utils, applyPalette, distance, image } = require('image-q');
const { round_half_up, str_pad, dechex } = require('./helpers');

// export interface ConverterOptions {
//     dith?: boolean;
//     cf: ImageMode;
//     outputFormat: OutputMode;
//     binaryFormat: ImageMode;
//     swapEndian: boolean;
//     outName: string;
//     useLegacyFooterOrder?: boolean;
//     use565A8alpha?: boolean;
//     overrideWidth?: number;
//     overrideHeight?: number;
// }
class Converter {
    w = 0;         /*Image width*/
    h = 0;         /*Image height*/
    raw_len = 0; /* RAW image data size */
    cf = ImageMode.CF_TRUE_COLOR;        /*Color format*/
    outputFormat
    alpha = false;     /*Add alpha byte or not*/
    chroma = false;    /*Chroma keyed?*/
    d_out;     /*Output data (result)*/
    imageData; /* Input image data */
    options;

    /*Helper variables*/
    r_act;
    b_act;
    g_act;

    r_nerr;  /*Classification error for next pixel*/
    g_nerr;
    b_nerr;

    /* Current pass being made */
    pass;


    constructor(w, h, imageData, alpha, options) {
        this.w = w;
        this.h = h;
        this.imageData = imageData;
        this.r_earr = [];  /*Classification error for next row of pixels*/
        this.g_earr = [];
        this.b_earr = [];

        if (options.dith) {
            for (var i = 0; i < this.w + 2; ++i) {
                this.r_earr[i] = 0;
                this.g_earr[i] = 0;
                this.b_earr[i] = 0;
            }
        }

        this.r_nerr = 0;  /*Classification error for next pixel*/
        this.g_nerr = 0;
        this.b_nerr = 0;
        this.pass = 0;
        this.cf = options.cf;
        this.alpha = alpha;
        this.outputFormat = options.outputFormat;
        this.options = options;
    }

    /**
     * Get the number of passes being made over an image to output it.
     */
    getNumPasses() {
        if (this.cf == ImageMode.CF_RGB565A8)
            return 2;
        else
            return 1;
    }

    async convert() {
        if (this.cf == ImageMode.CF_RAW || this.cf == ImageMode.CF_RAW_ALPHA) {
            const d_array = Array.from((this.imageData));
            this.raw_len = d_array.length;
            const indent = this.options.useLegacyFooterOrder ? "  " : "    ";
            const numValuesPerRow = this.options.useLegacyFooterOrder ? 15 : 12;
            let str = "\n" + indent + d_array.map((val, i) => "0x" + str_pad(dechex(val), 2, '0', true) + ((i % (numValuesPerRow + 1)) == numValuesPerRow ? (", \n" + indent) : ", ")).join("");
            str = str.substr(0, str.length - 2);
            return str;
        }
        var palette_size = 0, bits_per_value = 0;
        this.d_out = [];


        let oldColorFormat;
        const needsFormatSwap = this.outputFormat == OutputMode.BIN && ImageModeUtil.isTrueColor(this.cf);
        if (needsFormatSwap) {
            oldColorFormat = this.cf;
            this.cf = this.options.binaryFormat;
        }

        for (this.pass = 0; this.pass < this.getNumPasses(); this.pass++) {
            /*Convert all the pixels*/
            for (var y = 0; y < this.h; y++) {
                this.dith_reset();

                for (var x = 0; x < this.w; ++x) {
                    this.conv_px(x, y);
                }
            }
        }

        if (needsFormatSwap) {
            this.cf = oldColorFormat;
        }

        if (this.outputFormat == OutputMode.C)
            return this.format_to_c_array();
        else {
            var $content = this.d_out;
            var $cf = this.cf;
            var $lv_cf = 4;               /*Color format in LittlevGL*/
            switch ($cf) {
                case ImageMode.CF_TRUE_COLOR:
                    $lv_cf = 4; break;
                case ImageMode.CF_TRUE_COLOR_ALPHA:
                    $lv_cf = 5; break;
                case ImageMode.CF_TRUE_COLOR_CHROMA:
                    $lv_cf = 6; break;
                case ImageMode.CF_INDEXED_1_BIT:
                    $lv_cf = 7; break;
                case ImageMode.CF_INDEXED_2_BIT:
                    $lv_cf = 8; break;
                case ImageMode.CF_INDEXED_4_BIT:
                    $lv_cf = 9; break;
                case ImageMode.CF_INDEXED_8_BIT:
                    $lv_cf = 10; break;
                case ImageMode.CF_ALPHA_1_BIT:
                    $lv_cf = 11; break;
                case ImageMode.CF_ALPHA_2_BIT:
                    $lv_cf = 12; break;
                case ImageMode.CF_ALPHA_4_BIT:
                    $lv_cf = 13; break;
                case ImageMode.CF_ALPHA_8_BIT:
                    $lv_cf = 14; break;
            }

            var $header_32bit = ($lv_cf | (this.w << 10) | (this.h << 21)) >>> 0;

            var finalBinary = new Uint8Array(this.d_out.length + 4);
            finalBinary[0] = ($header_32bit & 0xFF);
            finalBinary[1] = ($header_32bit & 0xFF00) >> 8;
            finalBinary[2] = ($header_32bit & 0xFF0000) >> 16;
            finalBinary[3] = ($header_32bit & 0xFF000000) >> 24;

            for (var i = 0; i < this.d_out.length; i++) {
                finalBinary[i + 4] = this.d_out[i];

            }
            return finalBinary.buffer;
        }
    }



    static imagemode_to_enum_name($cf) {
        switch ($cf) {
            case ImageMode.CF_TRUE_COLOR:
            case ImageMode.CF_TRUE_COLOR_ALPHA:
            case ImageMode.CF_RAW_ALPHA:
            case ImageMode.CF_RGB565A8:
                return "LV_IMG_" + ImageMode[$cf];
            case ImageMode.CF_TRUE_COLOR_CHROMA:
                return "LV_IMG_CF_TRUE_COLOR_CHROMA_KEYED";
            case ImageMode.CF_RAW_CHROMA: /* and CF_RAW due to it having the same value */
                return "LV_IMG_CF_RAW_CHROMA_KEYED";
            case ImageMode.CF_ALPHA_1_BIT:
            case ImageMode.CF_ALPHA_2_BIT:
            case ImageMode.CF_ALPHA_4_BIT:
            case ImageMode.CF_ALPHA_8_BIT:
            case ImageMode.CF_INDEXED_1_BIT:
            case ImageMode.CF_INDEXED_2_BIT:
            case ImageMode.CF_INDEXED_4_BIT:
            case ImageMode.CF_INDEXED_8_BIT:
                return "LV_IMG_" + ImageMode[$cf].replace("_BIT", "BIT");
            default:
                throw new Error("unexpected color format " + $cf);
        }
    }

    conv_px(x, y) {
        function array_push(arr, v) {
            arr.push(v);
        }
        function isset(val) {
            return typeof val != 'undefined' && val != undefined;
        }
        const startIndex = ((y * this.w) + x) * 4;
        let a;
        if (this.alpha) {
            a = this.imageData[startIndex + 3];
        } else {
            a = 0xff;
        }
        const r = this.imageData[startIndex];
        const g = this.imageData[startIndex + 1];
        const b = this.imageData[startIndex + 2];

        const c = this.imageData[((y * this.w) + x)];

        if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565
            || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP
            || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8332
            || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8888
            || this.cf == ImageMode.CF_RGB565A8) {
            /* Populate r_act, g_act, b_act */
            this.dith_next(r, g, b, x);
        }

        if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP) {
            const c16 = ((this.r_act) << 8) | ((this.g_act) << 3) | ((this.b_act) >> 3);	//RGR565
            array_push(this.d_out, (c16 >> 8) & 0xFF);
            array_push(this.d_out, c16 & 0xFF);
            if (this.alpha) array_push(this.d_out, a);
        }
    }

    dith_reset() {
        if (this.options.dith) {
            this.r_nerr = 0;
            this.g_nerr = 0;
            this.b_nerr = 0;
        }
    }

    dith_next(r, g, b, x) {

        if (this.options.dith) {
            this.r_act = r + this.r_nerr + this.r_earr[x + 1];
            this.r_earr[x + 1] = 0;

            this.g_act = g + this.g_nerr + this.g_earr[x + 1];
            this.g_earr[x + 1] = 0;

            this.b_act = b + this.b_nerr + this.b_earr[x + 1];
            this.b_earr[x + 1] = 0;

            if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565 || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP) {
                this.r_act = this.classify_pixel(this.r_act, 5);
                this.g_act = this.classify_pixel(this.g_act, 6);
                this.b_act = this.classify_pixel(this.b_act, 5);

                if (this.r_act > 0xF8) this.r_act = 0xF8;
                if (this.g_act > 0xFC) this.g_act = 0xFC;
                if (this.b_act > 0xF8) this.b_act = 0xF8;

            }

            this.r_nerr = r - this.r_act;
            this.g_nerr = g - this.g_act;
            this.b_nerr = b - this.b_act;

            this.r_nerr = round_half_up((7 * this.r_nerr) / 16);
            this.g_nerr = round_half_up((7 * this.g_nerr) / 16);
            this.b_nerr = round_half_up((7 * this.b_nerr) / 16);

            this.r_earr[x] += round_half_up((3 * this.r_nerr) / 16);
            this.g_earr[x] += round_half_up((3 * this.g_nerr) / 16);
            this.b_earr[x] += round_half_up((3 * this.b_nerr) / 16);

            this.r_earr[x + 1] += round_half_up((5 * this.r_nerr) / 16);
            this.g_earr[x + 1] += round_half_up((5 * this.g_nerr) / 16);
            this.b_earr[x + 1] += round_half_up((5 * this.b_nerr) / 16);

            this.r_earr[x + 2] += round_half_up(this.r_nerr / 16);
            this.g_earr[x + 2] += round_half_up(this.g_nerr / 16);
            this.b_earr[x + 2] += round_half_up(this.b_nerr / 16);
        }
        else {
            if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565 || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP || this.cf == ImageMode.CF_RGB565A8) {
                this.r_act = this.classify_pixel(r, 5);
                this.g_act = this.classify_pixel(g, 6);
                this.b_act = this.classify_pixel(b, 5);

                if (this.r_act > 0xF8) this.r_act = 0xF8;
                if (this.g_act > 0xFC) this.g_act = 0xFC;
                if (this.b_act > 0xF8) this.b_act = 0xF8;

            }
        }
    }

    classify_pixel(value, bits) {
        const tmp = 1 << (8 - bits);
        let val = Math.round(value / tmp) * tmp;
        if (val < 0) val = 0;
        return val;
    }
    format_to_c_array() {

        let c_array = "";
        var i = 0;
        let y_end = this.h;
        let x_end = this.w;

        if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8332) {
            c_array += "\n#if LV_COLOR_DEPTH == 1 || LV_COLOR_DEPTH == 8";
            if (!this.alpha) c_array += "\n  /*Pixel format: Red: 3 bit, Green: 3 bit, Blue: 2 bit*/";
            else c_array += "\n  /*Pixel format: Alpha 8 bit, Red: 3 bit, Green: 3 bit, Blue: 2 bit*/";
        } else if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565) {
            c_array += "\n#if LV_COLOR_DEPTH == 16 && LV_COLOR_16_SWAP == 0";
            if (!this.alpha) c_array += "\n  /*Pixel format: Red: 5 bit, Green: 6 bit, Blue: 5 bit*/";
            else c_array += "\n  /*Pixel format: Alpha 8 bit, Red: 5 bit, Green: 6 bit, Blue: 5 bit*/";
        } else if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP) {
            c_array += "\n#if LV_COLOR_DEPTH == 16 && LV_COLOR_16_SWAP != 0";
            if (!this.alpha) c_array += "\n  /*Pixel format: Red: 5 bit, Green: 6 bit, Blue: 5 bit BUT the 2 bytes are swapped*/";
            else c_array += "\n  /*Pixel format: Alpha 8 bit, Red: 5 bit, Green: 6 bit, Blue: 5 bit  BUT the 2  color bytes are swapped*/";
        } else if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8888) {
            c_array += "\n#if LV_COLOR_DEPTH == 32";
            if (!this.alpha) c_array += "\n  /*Pixel format: Fix 0xFF: 8 bit, Red: 8 bit, Green: 8 bit, Blue: 8 bit*/";
            else "\n  /*Pixel format: Alpha 8 bit, Red: 8 bit, Green: 8 bit, Blue: 8 bit*/";
        } else if (this.cf == ImageMode.CF_INDEXED_1_BIT) {
            c_array += "\n";
            for (var p = 0; p < 2; p++) {
                c_array += "  0x" + str_pad(dechex(this.d_out[p * 4 + 0]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 1]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 2]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 3]), 2, '0', true) + ", ";
                c_array += `\t/*Color of index ${p}*/\n`;
            }

            i = p * 4;
        }
        else if (this.cf == ImageMode.CF_INDEXED_2_BIT) {
            c_array += "\n";
            for (p = 0; p < 4; p++) {
                c_array += "  0x" + str_pad(dechex(this.d_out[p * 4 + 0]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 1]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 2]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 3]), 2, '0', true) + ", ";
                c_array += `\t/*Color of index ${p}*/\n`;
            }

            i = p * 4;
        }
        else if (this.cf == ImageMode.CF_INDEXED_4_BIT) {
            c_array += "\n";
            for (p = 0; p < 16; p++) {
                c_array += "  0x" + str_pad(dechex(this.d_out[p * 4 + 0]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 1]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 2]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 3]), 2, '0', true) + ", ";
                c_array += `\t/*Color of index ${p}*/\n`;
            }

            i = p * 4;
        }
        else if (this.cf == ImageMode.CF_INDEXED_8_BIT) {
            c_array += "\n";
            for (p = 0; p < 256; p++) {
                c_array += "  0x" + str_pad(dechex(this.d_out[p * 4 + 0]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 1]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 2]), 2, '0', true) + ", ";
                c_array += "0x" + str_pad(dechex(this.d_out[p * 4 + 3]), 2, '0', true) + ", ";
                c_array += `\t/*Color of index ${p}*/\n`;
            }

            i = p * 4;
        }
        else if (this.cf == ImageMode.CF_RAW_ALPHA || this.cf == ImageMode.CF_RAW_CHROMA) {
            y_end = 1;
            x_end = this.d_out.length;
            i = 1;
        } else if (this.cf == ImageMode.CF_ALPHA_1_BIT
            || this.cf == ImageMode.CF_ALPHA_2_BIT
            || this.cf == ImageMode.CF_ALPHA_4_BIT
            || this.cf == ImageMode.CF_ALPHA_8_BIT
            || this.cf == ImageMode.CF_RGB565A8) {
            /* No special handling required */
        } else
            throw new Error("Unhandled color format: " + ImageMode[this.cf]);


        for (var y = 0; y < y_end; y++) {
            c_array += "\n  ";
            for (var x = 0; x < x_end; x++) {
                /* Note: some accesses to d_out may be out of bounds */
                if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8332) {
                    c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", "; i++;
                    if (this.alpha) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        i++;
                    }
                }
                else if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565 || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP || this.cf == ImageMode.CF_RGB565A8) {
                    if (this.options.swapEndian) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 1]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                    } else {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 1]), 2, '0', true) + ", ";
                    }
                    i += 2;
                    if (this.cf != ImageMode.CF_RGB565A8 && this.alpha) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        i++;
                    }
                }
                else if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8888) {
                    if (this.options.swapEndian) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 2]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 1]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                    } else {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 1]), 2, '0', true) + ", ";
                        c_array += "0x" + str_pad(dechex(this.d_out[i + 2]), 2, '0', true) + ", ";
                    }
                    c_array += "0x" + str_pad(dechex(this.d_out[i + 3]), 2, '0', true) + ", ";

                    i += 4;
                }
                else if (this.cf == ImageMode.CF_ALPHA_1_BIT || this.cf == ImageMode.CF_INDEXED_1_BIT) {
                    if ((x & 0x7) == 0) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        i++;
                    }
                }
                else if (this.cf == ImageMode.CF_ALPHA_2_BIT || this.cf == ImageMode.CF_INDEXED_2_BIT) {
                    if ((x & 0x3) == 0) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        i++;
                    }
                }
                else if (this.cf == ImageMode.CF_ALPHA_4_BIT || this.cf == ImageMode.CF_INDEXED_4_BIT) {
                    if ((x & 0x1) == 0) {
                        c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                        i++;
                    }
                }
                else if (this.cf == ImageMode.CF_ALPHA_8_BIT || this.cf == ImageMode.CF_INDEXED_8_BIT) {
                    c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                    i++;
                }
                else if (this.cf == ImageMode.CF_RAW_ALPHA || this.cf == ImageMode.CF_RAW_CHROMA) {
                    c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                    if (i != 0 && ((i % 16) == 0)) c_array += "\n  ";
                    i++;
                } else
                    throw new Error("Unhandled color format: " + ImageMode[this.cf]);
            }
        }

        if (this.cf == ImageMode.CF_RGB565A8) {
            c_array += "\n  /*alpha channel*/\n  ";
            for (var y = 0; y < y_end; y++) {
                for (var x = 0; x < x_end; x++) {
                    c_array += "0x" + str_pad(dechex(this.d_out[i]), 2, '0', true) + ", ";
                    i++;
                }
                c_array += "\n  ";
            }
        }

        if (this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8332 || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565 || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP || this.cf == ImageMode.ICF_TRUE_COLOR_ARGB8888) {
            c_array += "\n#endif";
        }
        return c_array;

    }
}


function isNotRaw(options) {
    return options.cf != ImageMode.CF_RAW && options.cf != ImageMode.CF_RAW_ALPHA; /* && options.cf != ImageMode.CF_RAW_CHROMA; */
}

async function convertImageBlob(img, options) {
    function isImage(img, options) {
        return isNotRaw(options);
    }
    let c_res_array;
    let bin_res_blob;
    const out_name = options.outName;
    const outputFormat = options.outputFormat;
    let c_creator;
    if (isImage(img, options)) {
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height).data;

        const alpha = (options.cf == ImageMode.CF_TRUE_COLOR_ALPHA
            || options.cf == ImageMode.CF_ALPHA_1_BIT
            || options.cf == ImageMode.CF_ALPHA_2_BIT
            || options.cf == ImageMode.CF_ALPHA_4_BIT
            || options.cf == ImageMode.CF_ALPHA_8_BIT
            || options.cf == ImageMode.CF_RGB565A8);
        c_creator = new Converter(img.width, img.height, imageData, alpha, options);

        if (options.outputFormat == OutputMode.C) {
            if (options.cf == ImageMode.CF_TRUE_COLOR || options.cf == ImageMode.CF_TRUE_COLOR_ALPHA || options.cf == ImageMode.CF_TRUE_COLOR_CHROMA) {
                const arrayList = await Promise.all([
                    ImageMode.ICF_TRUE_COLOR_ARGB8332,
                    ImageMode.ICF_TRUE_COLOR_ARGB8565,
                    ImageMode.ICF_TRUE_COLOR_ARGB8565_RBSWAP,
                    ImageMode.ICF_TRUE_COLOR_ARGB8888
                ].map(cf => new Converter(img.width, img.height, imageData, alpha, Object.assign({}, options, { cf })).convert()));
                c_res_array = arrayList.join("");
            } else
                c_res_array = await c_creator.convert();
        } else {
            const binaryConv = new Converter(img.width, img.height, imageData, alpha, options);
            bin_res_blob = await binaryConv.convert();
        }
    } else {
        c_creator = new Converter(options.overrideWidth ?? 0, options.overrideHeight ?? 0, img, options.cf == ImageMode.CF_RAW_ALPHA, options);
        if (options.outputFormat == OutputMode.C)
            c_res_array = await c_creator.convert();
        else
            bin_res_blob = await c_creator.convert();
    }


    if (outputFormat == OutputMode.BIN) 
        return bin_res_blob;
    else
        return c_res_array;
}

module.exports = { convertImageBlob, Converter };